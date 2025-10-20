// /core/runtimeManager.js
/**
 * Purpose: Central hub for multi-language code execution.
 * * Responsibilities:
 * - Registers available runtime adapters (Node, Python, etc.).
 * - Receives execution requests.
 * - Delegates execution to sandbox.js with the correct adapter.
 * - Emits IPC events to the renderer with execution status and output.
 * - Logs runtime telemetry.
 * * Conforms to Batch 1 of MASTER_BUILD_GUIDE.md (Section 4.2.3).
 */

import * as sandbox from './sandbox.js';
import { logRuntimeEvent } from './audit.js'; // Will be updated in Batch 1

// This map will hold the registered runtime adapter objects.
// Adapters are { id, label, exec, detect }
const runtimes = new Map();

// We need a reference to the main browser window to send IPC events.
// This will be set by the main process (index.js or main.js) on startup.
let mainWindow = null;

/**
 * Sets the main BrowserWindow instance for IPC communication.
 * @param {Electron.BrowserWindow} win - The main application window.
 */
export function setMainWindow(win) {
  mainWindow = win;
}

/**
 * Registers a new runtime adapter.
 * This will be called by adapter files in /core/runtimes/ (in Batch 2)
 * and can also be used by plugins.
 * @param {string} lang - The language identifier (e.g., 'python', 'node').
 * @param {object} adapter - The adapter object conforming to the spec.
 */
export function registerRuntime(lang, adapter) {
  if (runtimes.has(lang)) {
    console.warn(`[runtimeManager] Overwriting existing runtime adapter for: ${lang}`);
  }
  runtimes.set(lang, adapter);
  console.log(`[runtimeManager] Registered runtime: ${adapter.label}`);
}

/**
 * Lists all registered runtimes.
 * @returns {Array<object>} A list of runtime adapter objects.
 */
export function listRuntimes() {
  return Array.from(runtimes.values());
}

/**
 * Central function to run code.
 * This is called by an IPC listener in the main process.
 * It streams output back to the renderer via IPC events.
 * @param {string} code - The code string to execute.
 * @param {object} opts - Execution options.
 * @param {string} opts.lang - The language to use (e.g., 'python').
 * @returns {Promise<void>}
 */
export async function run(code, opts = {}) {
  const { lang } = opts;

  if (!mainWindow) {
    console.error('[runtimeManager] Cannot run code. MainWindow is not set.');
    return;
  }

  const adapter = runtimes.get(lang);
  if (!adapter) {
    const errorMsg = `No runtime adapter registered for language: "${lang}"`;
    console.error(`[runtimeManager] ${errorMsg}`);
    mainWindow.webContents.send('runtime:error', { error: errorMsg });
    return;
  }

  const start = Date.now();
  let stdoutBuffer = '';
  let stderrBuffer = '';

  // Emit start event
  mainWindow.webContents.send('runtime:start', { lang });

  try {
    // Delegate to the sandbox for isolated execution.
    // The sandbox will call the adapter's exec function.
    // We pass event handlers to stream data back.
    const result = await sandbox.execute(adapter, code, opts, {
      onStdOut: (data) => {
        const chunk = data.toString();
        stdoutBuffer += chunk;
        mainWindow.webContents.send('runtime:stdout', { chunk });
      },
      onStdErr: (data) => {
        const chunk = data.toString();
        stderrBuffer += chunk;
        mainWindow.webContents.send('runtime:stderr', { chunk });
      },
    });

    // Execution finished successfully
    const duration = Date.now() - start;
    logRuntimeEvent(lang, duration, true, null);
    mainWindow.webContents.send('runtime:done', {
      lang,
      duration,
      stdout: stdoutBuffer,
      stderr: stderrBuffer,
      exitCode: result.exitCode,
      ...result,
    });

  } catch (error) {
    // Execution failed
    const duration = Date.now() - start;
    const errorMsg = error.message || 'Unknown execution error';
    logRuntimeEvent(lang, duration, false, errorMsg);
    
    // Ensure stderr buffer includes the error message if it wasn't captured
    if (!stderrBuffer.includes(errorMsg)) {
      stderrBuffer += `\n[Sandbox Error] ${errorMsg}`;
    }

    mainWindow.webContents.send('runtime:error', {
      error: errorMsg,
      stdout: stdoutBuffer,
      stderr: stderrBuffer,
    });
    
    mainWindow.webContents.send('runtime:done', {
      lang,
      duration,
      stdout: stdoutBuffer,
      stderr: stderrBuffer,
      error: errorMsg,
      exitCode: error.exitCode || 1,
    });
  }
}
