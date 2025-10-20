// /renderer/dashboard/RuntimeSelector.tsx
/**
 * Purpose: Dropdown menu for selecting the code execution runtime.
 *
 * Conforms to Batch 3 of MASTER_BUILD_GUIDE.md (Section 4.5).
 */

import React, { useState } from 'react';
// import { useRuntime } from '../context/RuntimeContext'; // Create in Batch 3

/**
 * Placeholder runtime type.
 * This will be replaced by the type from RuntimeContext.
 */
interface Runtime {
  id: string;
  label: string;
}

// Placeholder data until RuntimeContext is wired.
// Based on the adapters from Batch 2.
const MOCK_RUNTIMES: Runtime[] = [
  { id: 'node', label: 'Node.js' },
  { id: 'python', label: 'Python 3' },
];

/**
 * A dropdown component to select the active runtime.
 */
export const RuntimeSelector: React.FC = () => {
  // const { availableRuntimes, selectedRuntime, selectRuntime } = useRuntime();
  
  // Using mock state for Batch 3
  const [selectedRuntime, setSelectedRuntime] = useState<string>('node');
  const availableRuntimes = MOCK_RUNTIMES;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    // selectRuntime(e.target.value);
    setSelectedRuntime(e.target.value);
  };

  return (
    <div className="runtime-selector-wrapper">
      <select
        value={selectedRuntime}
        onChange={handleChange}
        className="runtime-select bg-panel border border-border rounded-md px-3 py-1 text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-primary"
        aria-label="Select Runtime"
      >
        {availableRuntimes.map((runtime) => (
          <option key={runtime.id} value={runtime.id}>
            {runtime.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default RuntimeSelector;