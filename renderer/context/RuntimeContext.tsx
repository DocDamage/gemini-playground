// /renderer/context/RuntimeContext.tsx
/**
 * Purpose: Holds all state for code execution.
 *
 * FEATURE 3 (Debugging):
 * - Added 'stderrOutput' state to reliably store the full stderr
 * when status becomes 'error'.
 * - Updated 'runtime:error' and 'runtime:done' listeners to populate
 * this new state.
 * - Exposed 'stderrOutput' via the context.
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { LogEntry } from '../dashboard/ConsoleFeed'; // Assumes ConsoleFeed is built

// Define the shape of a runtime adapter (for the UI)
interface RuntimeAdapter {
  id: string;
  label: string;
}

// Define the execution status
type RuntimeStatus = 'idle' | 'running' | 'error';

// Define the shape of the context's state
interface RuntimeState {
  status: RuntimeStatus;
  logs: LogEntry[];
  output: string | object | null; // Represents final stdout
  error: string | null; // Represents the summary error message
  stderrOutput: string | null; // [NEW] Feature 3: Full stderr content on error
  selectedRuntime: string;
  availableRuntimes: RuntimeAdapter[];
  code: string;
}

// Define what the context will provide
interface RuntimeContextType extends RuntimeState {
  runCode: () => void;
  stopCode: () => void;
  selectRuntime: (runtimeId: string) => void;
  clearLogs: () => void;
  setCode: (code: string) => void;
}

// 1. Create the Context
const RuntimeContext = createContext<RuntimeContextType | null>(null);

// Placeholder data until we load from main process
const MOCK_RUNTIMES: RuntimeAdapter[] = [
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python 3' },
];

let currentTaskId = `task-${Date.now()}`;

// 2. Create the Provider Component
export const RuntimeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<RuntimeStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([
    { type: 'system', message: 'RuntimeContext initialized. Ready.' },
  ]);
  const [output, setOutput] = useState<string | object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stderrOutput, setStderrOutput] = useState<string | null>(null); // [NEW] Feature 3 state
  const [availableRuntimes] = useState<RuntimeAdapter[]>(MOCK_RUNTIMES);
  const [selectedRuntime, setSelectedRuntime] = useState<string>('node');
  const [code, setCode] = useState<string>(
    '// Welcome to Gemini Playground\n\nfunction hello() {\n  console.log("Hello, from Node.js!");\n}\n\nhello();'
  );

  // 3. IPC Event Listeners
  useEffect(() => {
    const listeners: (() => void)[] = [];

    const addLog = (entry: Omit<LogEntry, 'timestamp'>) => {
      const timestamp = new Date().toISOString();
      setLogs((prevLogs) => [...prevLogs, { ...entry, timestamp }]);
    };

    listeners.push(
      window.runtimeBridge.on('runtime:start', () => {
        setStatus('running');
        setLogs([]); // Clear logs on new run
        setOutput(null);
        setError(null);
        setStderrOutput(null); // [NEW] Feature 3: Clear stderr on start
        addLog({ type: 'system', message: `Execution started (${selectedRuntime})...` });
      })
    );

    listeners.push(
      window.runtimeBridge.on('runtime:stdout', ({ chunk }) => {
        addLog({ type: 'stdout', message: chunk });
      })
    );

    listeners.push(
      window.runtimeBridge.on('runtime:stderr', ({ chunk }) => {
        addLog({ type: 'stderr', message: chunk });
        // [NEW] Feature 3: Append to stderrOutput as chunks arrive during error state?
        // Or wait for final stderr? Let's wait for final stderr for simplicity now.
      })
    );

    listeners.push(
      window.runtimeBridge.on('runtime:error', ({ error: errorMsg, stderr }) => {
        setStatus('error');
        setError(errorMsg);
        setStderrOutput(stderr || errorMsg || null); // [NEW] Feature 3: Store full stderr
        const message = stderr || errorMsg; // Log message remains the same
        if (message) {
          addLog({ type: 'error', message });
        }
      })
    );

    listeners.push(
      window.runtimeBridge.on('runtime:done', (result) => {
        // [MODIFIED] Feature 3: Store stderr if this event signals the error
        if (result.error) {
          setStatus('error');
          setError(result.error); // Update error summary if available here
          setStderrOutput(result.stderr || result.error || null); // Store full stderr
        } else {
          setStatus('idle');
          // Clear error states if the run succeeded
          setError(null);
          setStderrOutput(null);
        }
        setOutput(result.stdout || null); // Set final stdout regardless of success
        
        // Log final status
        addLog({
          type: 'system',
          message: `Execution finished in ${result.duration}ms. Exit code: ${
            result.exitCode || 0
          }. ${result.error ? `Error: ${result.error}` : ''}`,
        });
      })
    );

    return () => {
      listeners.forEach((removeListener) => removeListener());
    };
  // Removed selectedRuntime dependency as listeners don't directly depend on it
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 4. Action Functions
  const runCode = useCallback(() => {
    if (status === 'running') {
      console.warn('Cannot run code while another execution is in progress.');
      return;
    }
    currentTaskId = `task-${Date.now()}`;
    window.fileBridge.runtimeRun(selectedRuntime, code, currentTaskId);
  }, [selectedRuntime, status, code]);

  const stopCode = useCallback(() => {
    if (status !== 'running') return;
    window.fileBridge.runtimeKill(currentTaskId);
    setStatus('idle');
    setLogs((prev) => [
      ...prev,
      { type: 'system', message: 'Execution cancelled by user.' },
    ]);
  }, [status]);

  const selectRuntime = useCallback((runtimeId: string) => {
    setSelectedRuntime(runtimeId);
    if (runtimeId === 'python') {
      setCode('def hello():\n  print("Hello, from Python!")\n\nhello()');
    } else {
      setCode('function hello() {\n  console.log("Hello, from Node.js!");\n}\n\nhello();');
    }
    setLogs((prev) => [
      ...prev,
      { type: 'system', message: `Runtime switched to ${runtimeId}.` },
    ]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // 5. Provide State and Actions
  const value: RuntimeContextType = {
    status,
    logs,
    output,
    error,
    stderrOutput, // [NEW] Feature 3
    selectedRuntime,
    availableRuntimes,
    code,
    setCode,
    runCode,
    stopCode,
    selectRuntime,
    clearLogs,
  };

  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
};

// 6. Custom Hook
export const useRuntime = (): RuntimeContextType => {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error('useRuntime must be used within a RuntimeProvider');
  }
  return context;
};