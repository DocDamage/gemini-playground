// /renderer/dashboard/DashboardSidebar.tsx
/**
 * Purpose: The main 60px icon-only navigation sidebar.
 * This component controls which main view (Pane) is active.
 *
 * Conforms to Batch 8 and Spec 7.4 / 7.9.
 */

import React from 'react';
import {
  Code2,
  Globe,
  BarChart3,
  Files,
  BrainCircuit,
  Settings,
  Puzzle,
} from 'lucide-react';

// Define the possible views the sidebar can control
export type DashboardView =
  | 'canvas'
  | 'browser'
  | 'reports'
  | 'files'
  | 'ai'
  | 'plugins'
  | 'settings';

interface DashboardSidebarProps {
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
}

/**
 * A reusable icon button for the sidebar.
 */
const SidebarButton: React.FC<{
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      title={label}
      // Use the .icon-button class from components.css (Batch 8, Part 1)
      className={`icon-button w-12 h-12 flex items-center justify-center
        ${isActive ? 'active' : ''}
      `}
    >
      <Icon className="w-6 h-6" />
    </button>
  );
};

/**
 * The main sidebar component.
 */
export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  activeView,
  onViewChange,
}) => {
  return (
    <aside
      className="w-[60px] h-screen bg-panel border-r border-border
      flex flex-col items-center py-4 gap-4"
    >
      {/* Top section: Main views */}
      <div className="flex flex-col gap-2">
        <SidebarButton
          label="Code Canvas (Alt+1)"
          icon={Code2}
          isActive={activeView === 'canvas'}
          onClick={() => onViewChange('canvas')}
        />
        <SidebarButton
          label="Browser (Alt+2)"
          icon={Globe}
          isActive={activeView === 'browser'}
          onClick={() => onViewChange('browser')}
        />
        <SidebarButton
          label="Reports (Alt+3)"
          icon={BarChart3}
          isActive={activeView === 'reports'}
          onClick={() => onViewChange('reports')}
        />
        <SidebarButton
          label="Files (Alt+4)"
          icon={Files}
          isActive={activeView === 'files'}
          onClick={() => onViewChange('files')}
        />
        <SidebarButton
          label="AI Panel (Alt+5)"
          icon={BrainCircuit}
          isActive={activeView === 'ai'}
          onClick={() => onViewChange('ai')}
        />
        <SidebarButton
          label="Plugins (Alt+6)"
          icon={Puzzle}
          isActive={activeView === 'plugins'}
          onClick={() => onViewChange('plugins')}
        />
      </div>

      {/* Bottom (spacer) */}
      <div className="flex-grow"></div>

      {/* Settings */}
      <div className="flex flex-col gap-2">
        <SidebarButton
          label="Settings (Alt+S)"
          icon={Settings}
          isActive={activeView === 'settings'}
          onClick={() => onViewChange('settings')}
        />
      </div>
    </aside>
  );
};

export default DashboardSidebar;