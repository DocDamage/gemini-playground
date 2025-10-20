// /core/runtimes/nodeAdapter.js
/**
 * Purpose: Provides the runtime adapter for Node.js.
 * This file is imported by the main process (e.g., index.js) and
 * registered with the runtimeManager.
 *
 * Conforms to Batch 2 of MASTER_BUILD_GUIDE.md.
 */

export default {
  /**
   * The unique identifier for this runtime.
   * NOTE: 'node' is a special ID. As per sandbox.js in Batch 1,
   * this ID triggers execution in the 'vm2' sandbox instead
   * of a subprocess.
   */
  id: 'node',

  /**
   * The user-facing name for this runtime.
   */
  label: 'Node.js',

  /**
   * Detects if a file is runnable by this adapter.
   * @param {string} fileName - The name of the file.
   * @returns {boolean} True if the file is a JavaScript file.
   */
  detect: (fileName) => {
    if (!fileName) return false;
    return fileName.endsWith('.js') || fileName.endsWith('.mjs') || fileName.endsWith('.cjs');
  },
  
  /**
   * The command to execute (fallback).
   * NOTE: This is not used by default, as 'sandbox.js'
   * intercepts 'id: "node"' and uses vm2. It's
   * included for consistency and potential future use.
   */
  command: 'node',

  /**
   * The arguments for the command (fallback).
   * '-e' executes the following string.
   */
  args: ['-e', 'CODE_PLACEHOLDER'],
};