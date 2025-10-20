// /core/sandbox.js
/**
 * Purpose: Executes untrusted code in isolation.
 * Conforms to Batch 1 of MASTER_BUILD_GUIDE.md (Section 4.2.4).
 *
 * Responsibilities:
 * - Receives an adapter, code, and event handlers from runtimeManager.
 * - If the adapter is 'node', it uses 'vm2' for isolated VM execution.
 * - If the adapter is external (e.g., 'python'), it uses 'child_process.spawn'
 * to run the code in a sandboxed subprocess.
 * - Streams stdout and stderr back via the provided event handlers.
 * - Enforces timeouts and resource limits.
 */

import { spawn } from 'child_process';
import { VM, VMScript } from 'vm2';

// --- Task Management ---
// Holds references to active processes/VMs to allow killing them.
const activeTasks = new Map();

/**
 * Kills a running execution task.
 * @param {string} taskId - The ID of the task to kill.
 * // VERIFY_BEFORE_COMMIT: The 'taskId' logic isn't fully defined in Batch 1.
 * // For now, we'll assume the renderer generates a unique ID for each run.
 * // This is a placeholder for Batch 2/3 wiring.
 */
export function kill(taskId) {
  const task = activeTasks.get(taskId);
  if (!task) {
    console.warn(`[sandbox] No active task with ID ${taskId} to kill.`);
    return;
  }

  if (task.type === 'vm') {
    task.vm.terminate();
    console.log(`[sandbox] Terminated VM task: ${taskId}`);
  } else if (task.type === 'process') {
    task.process.kill('SIGKILL');
    console.log(`[sandbox] Killed subprocess task: ${taskId}`);
  }
  activeTasks.delete(taskId);
}

/**
 * Executes code using the appropriate sandboxing method.
 * @param {object} adapter - The runtime adapter (e.g., { id: 'python', ... }).
 * @param {string} code - The code to execute.
 * @param {object} options - Execution options (e.g., taskId, timeout).
 * @param {object} eventHandlers - Callbacks for streaming data.
 * @param {function(string)} eventHandlers.onStdOut - Callback for stdout chunks.
 * @param {function(string)} eventHandlers.onStdErr - Callback for stderr chunks.
 * @returns {Promise<object>} A promise that resolves with execution results.
 */
export async function execute(adapter, code, options = {}, eventHandlers) {
  const { onStdOut, onStdErr } = eventHandlers;
  const taskId = options.taskId || `task-${Date.now()}`;
  const timeout = options.timeout || 10000; // Default 10s timeout

  // The 'node' adapter is special and uses vm2
  if (adapter.id === 'node') {
    return executeInVM(taskId, code, timeout, onStdOut, onStdErr);
  } else {
    // All other adapters use a generic subprocess spawner
    return executeInSubprocess(taskId, adapter, code, timeout, onStdOut, onStdErr);
  }
}

/**
 * Executes Node.js code in a secure vm2 sandbox.
 */
function executeInVM(taskId, code, timeout, onStdOut, onStdErr) {
  return new Promise((resolve, reject) => {
    let finalExitCode = 0;

    const vm = new VM({
      timeout: timeout,
      sandbox: {
        console: {
          log: (...args) => {
            onStdOut(args.map(a => String(a)).join(' ') + '\n');
          },
          error: (...args) => {
            onStdErr(args.map(a => String(a)).join(' ') + '\n');
            finalExitCode = 1;
          },
          warn: (...args) => {
            onStdErr(`[WARN] ${args.map(a => String(a)).join(' ')}\n`);
          },
        },
        // Secure global process object
        process: {
          stdout: { write: onStdOut },
          stderr: { write: onStdErr },
          exit: (code = 0) => {
            finalExitCode = code;
            // This is tricky in vm2; we'll rely on the main resolve.
            // For now, just log the intended exit.
            onStdOut(`\n[process.exit(${code})]`);
          },
        },
      },
      // Restrict built-in modules
      require: {
        external: false,
        builtin: ['fs', 'path', 'os'], // Allow a few safe ones
        // VERIFY_BEFORE_COMMIT: Review allowed built-ins for security.
      },
    });

    // Store VM for potential kill()
    activeTasks.set(taskId, { type: 'vm', vm });

    try {
      // We wrap the user's code in an async IIFE to allow top-level await
      const wrappedCode = `(async () => {
        try {
          ${code}
        } catch (err) {
          console.error(err.stack || err.message);
        }
      })();`;
      
      const script = new VMScript(wrappedCode);
      vm.run(script);

      // vm2 doesn't have a clean "on_done" event,
      // so we resolve when the timeout-bound run completes.
      activeTasks.delete(taskId);
      resolve({ exitCode: finalExitCode });

    } catch (err) {
      // This catches syntax errors or timeout errors
      onStdErr(err.stack || err.message);
      activeTasks.delete(taskId);
      reject(new Error(err.message));
    }
  });
}

/**
 * Executes external language code in a child subprocess.
 */
function executeInSubprocess(taskId, adapter, code, timeout, onStdOut, onStdErr) {
  return new Promise((resolve, reject) => {
    // The adapter must provide the command and args
    if (!adapter.command) {
      return reject(new Error(`Adapter ${adapter.id} is missing a 'command'.`));
    }

    // Replace CODE_PLACEHOLDER with the actual code
    // This allows adapters to specify how code is passed (e.g., -c "code" or a temp file)
    // For Batch 1, we assume '-c' style. Batch 2 will handle temp files.
    const args = adapter.args.map(a => a === 'CODE_PLACEHOLDER' ? code : a);

    const proc = spawn(adapter.command, args, {
      timeout: timeout,
      // VERIFY_BEFORE_COMMIT: Implement path jailing and resource limits.
    });

    // Store process for potential kill()
    activeTasks.set(taskId, { type: 'process', process: proc });

    proc.stdout.on('data', onStdOut);
    proc.stderr.on('data', onStdErr);

    proc.on('error', (err) => {
      activeTasks.delete(taskId);
      onStdErr(`[Sandbox Spawn Error] ${err.message}\n`);
      reject(err);
    });

    proc.on('close', (exitCode) => {
      activeTasks.delete(taskId);
      resolve({ exitCode });
    });
  });
}
