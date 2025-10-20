/**
 * renderer/context/SettingsContext.tsx
 *
 * Centralized settings store for preferences.
 *
 * BATCH 4 MODIFICATION: Added webSettings.
 * FEATURE 1 (AI Persona): Added aiPersona state.
 */

import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  ReactNode,
  useCallback,
} from "react";

// Shape for web preferences (Batch 4)
interface WebSettings {
  domainWhitelist: string[];
  cacheTTL: number; // Time-to-live in milliseconds
}

// Shape of the context
interface SettingsContextType {
  soundEnabled: boolean;
  soundVolume: number;
  webSettings: WebSettings;
  aiPersona: string; // [NEW] Feature 1
  toggleSound: () => void;
  setVolume: (v: number) => void;
  setPreference: (key: string, value: any) => void;
  getPreference: (key: string) => any;
  setWebSetting: (key: keyof WebSettings, value: any) => void;
  setAiPersona: (persona: string) => void; // [NEW] Feature 1
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// Default web settings (Batch 4)
const DEFAULT_WEB_SETTINGS: WebSettings = {
  domainWhitelist: [
    'api.github.com',
    'gist.github.com',
    'api.openai.com',
    'generativelanguage.googleapis.com',
    'stackoverflow.com',
    'npmjs.com',
    'pypi.org',
    'localhost',
    '127.0.0.1',
  ],
  cacheTTL: 5 * 60 * 1000, // 5 minutes
};

// Default AI Persona
const DEFAULT_AI_PERSONA = "You are a helpful AI coding assistant.";

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundVolume, setSoundVolume] = useState(0.5);
  const [prefs, setPrefs] = useState<Record<string, any>>({});
  const [webSettings, setWebSettings] = useState<WebSettings>(DEFAULT_WEB_SETTINGS);
  const [aiPersona, setAiPersona] = useState<string>(DEFAULT_AI_PERSONA); // [NEW] Feature 1 state

  /** Load from localStorage once */
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("gemini_settings") || "{}");
      if (typeof stored.soundEnabled === "boolean") setSoundEnabled(stored.soundEnabled);
      if (typeof stored.soundVolume === "number") setSoundVolume(stored.soundVolume);
      if (stored.webSettings) {
        setWebSettings({ ...DEFAULT_WEB_SETTINGS, ...stored.webSettings });
      }
      // [NEW] Feature 1: Load AI persona or use default
      if (typeof stored.aiPersona === "string") {
        setAiPersona(stored.aiPersona);
      } else {
        setAiPersona(DEFAULT_AI_PERSONA); // Ensure it defaults if not found
      }

      setPrefs(stored); // Keep storing other prefs too
    } catch {
      console.warn("[SettingsContext] Failed to parse settings.");
    }
  }, []);

  /** Persist to localStorage */
  useEffect(() => {
    // [CHANGED] Add aiPersona to persistence
    const updated = { ...prefs, soundEnabled, soundVolume, webSettings, aiPersona };
    localStorage.setItem("gemini_settings", JSON.stringify(updated));
  }, [prefs, soundEnabled, soundVolume, webSettings, aiPersona]); // Add aiPersona dependency

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => !prev);
  }, []);

  const setVolume = useCallback((v: number) => {
    const val = Math.max(0, Math.min(1, v));
    setSoundVolume(val);
  }, []);

  const setPreference = useCallback((key: string, value: any) => {
    // Avoid overwriting core settings managed by dedicated state
    if (['soundEnabled', 'soundVolume', 'webSettings', 'aiPersona'].includes(key)) {
      console.warn(`[SettingsContext] Use dedicated setters for '${key}', not setPreference.`);
      return;
    }
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const getPreference = useCallback((key: string) => {
    // Prioritize dedicated state over generic prefs
    if (key === 'soundEnabled') return soundEnabled;
    if (key === 'soundVolume') return soundVolume;
    if (key === 'webSettings') return webSettings;
    if (key === 'aiPersona') return aiPersona;
    return prefs[key];
  }, [prefs, soundEnabled, soundVolume, webSettings, aiPersona]); // Add dependencies

  const setWebSetting = useCallback((key: keyof WebSettings, value: any) => {
    setWebSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  // [NEW] Feature 1: Function to update AI persona
  const setAiPersonaCallback = useCallback((persona: string) => {
    setAiPersona(persona);
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        soundEnabled,
        soundVolume,
        webSettings,
        aiPersona, // [NEW] Feature 1
        toggleSound,
        setVolume,
        setPreference,
        getPreference,
        setWebSetting,
        setAiPersona: setAiPersonaCallback, // [NEW] Feature 1
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
};