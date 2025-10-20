// /core/runtimes/pythonAdapter.js
/**
 * Purpose: Provides the runtime adapter for Python 3.
 * This file is imported by the main process (e.g., index.js) and
 * registered with the runtimeManager.
 *
 * Conforms to Batch 2 of MASTER_BUILD_GUIDE.md.
 */

export default {
  /**
   * The unique identifier for this runtime.
   */
  id: 'python',

  /**
   * The user-facing name for this runtime.
   */
  label: 'Python 3',

  /**
   * Detects if a file is runnable by this adapter.
   * @param {string} fileName - The name of the file.
   * @returns {boolean} True if the file is a Python file.
   */
  detect: (fileName) => {
    if (!fileName) return false;
    return fileName.endsWith('.py');
  },
  
  /**
   * The command to execute.
   * 'sandbox.js' will use this to spawn a child process.
   * * // VERIFY_BEFORE_COMMIT: This assumes 'python3' is available
   * // in the system's PATH. The guide (Sec 9.3) shows 'python3 -c',
   * // so we will use 'python3'.
   */
  command: 'python3',

  /**
   * The arguments for the command.
   * '-c' tells Python to execute the string that follows.
   * 'CODE_PLACEHOLDER' is the special string 'sandbox.js'
   * knows to replace with the user's actual code.
   */
  args: ['-c', 'CODE_PLACEHOLDER'],
};