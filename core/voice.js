// /core/voice.js
/**
 * Purpose: Voice control layer for AI commands.
 * Manages access to the Web Speech API (via the renderer) and
 * forwards transcriptions to the main process for action.
 *
 * Conforms to Batch 5 of MASTER_BUILD_GUIDE.md (Section 4.2.8).
 *
 * [CORRECTION]: This version now correctly listens for 'voice:start'
 * and 'voice:stop' commands initiated by the renderer (e.g.,
 * from the CommandPalette or a UI button).
 */

import { ipcMain } from 'electron';

let mainWindow = null;

/**
 * Informs the voice service which window to use for
 * accessing the Web Speech API.
 * @param {Electron.BrowserWindow} win The main application window.
 */
export function setMainWindow(win) {
  mainWindow = win;
}

/**
 * Sends a command to the renderer to activate the
 * Web Speech API.
 */
function startVoiceRecognition() {
  if (!mainWindow) {
    console.error('[voice] Cannot start: MainWindow is not set.');
    return;
  }
  console.log('[voice] Sending "voice:start-recognition" to renderer...');
  mainWindow.webContents.send('voice:start-recognition');
}

/**
 * Sends a command to the renderer to stop the
 * Web Speech API.
 */
function stopVoiceRecognition() {
  if (!mainWindow) {
    console.error('[voice] Cannot stop: MainWindow is not set.');
    return;
  }
  console.log('[voice] Sending "voice:stop-recognition" to renderer...');
  mainWindow.webContents.send('voice:stop-recognition');
}

/**
 * Initializes IPC listeners for the voice service.
 * This runs in the main process.
 */
export function initializeVoiceService() {
  // [NEW] Listen for the renderer to request a voice session
  ipcMain.on('voice:start', () => {
    console.log('[voice] Received "voice:start" from renderer.');
    startVoiceRecognition();
  });

  // [NEW] Listen for the renderer to request stopping a session
  ipcMain.on('voice:stop', () => {
    console.log('[voice] Received "voice:stop" from renderer.');
    stopVoiceRecognition();
  });

  // Listen for the final transcribed text from the renderer
  ipcMain.on('voice:result', (event, transcript) => {
    console.log(`[voice] Received transcript: ${transcript}`);
    
    // VERIFY_BEFORE_COMMIT: Route this transcript to CommandPalette
    // or AIContext. For Batch 5, we'll just log it.
    // In a future batch, this would emit an event like:
    // commandPalette.execute(transcript) or ai.generate(transcript)
    
    // We can also send the transcript back to the UI for display
    if (mainWindow) {
      mainWindow.webContents.send('voice:final-transcript', transcript);
    }
  });

  // Listen for errors from the renderer's speech API
  ipcMain.on('voice:error', (event, errorMsg) => {
    console.error(`[voice] Speech API error: ${errorMsg}`);
  });
}