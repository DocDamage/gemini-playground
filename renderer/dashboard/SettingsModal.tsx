import React from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "../context/SettingsContext";

/**
 * Minimal settings modal placeholder.
 * Restores a non-corrupted component so the renderer can compile.
 */
interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ open, onClose }) => {
  const { aiPersona, setAiPersona } = useSettings();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[480px] rounded-xl bg-panel p-6 shadow-xl text-text-main">
        <header className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>

        <section className="space-y-2">
          <label htmlFor="ai-persona" className="text-sm font-medium">
            AI Persona
          </label>
          <textarea
            id="ai-persona"
            className="h-32 w-full rounded border border-border bg-surface p-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={aiPersona}
            onChange={(event) => setAiPersona(event.target.value)}
          />
          <p className="text-xs text-text-muted">
            Customize how the assistant responds across the workspace.
          </p>
        </section>
      </div>
    </div>
  );
};

export default SettingsModal;
