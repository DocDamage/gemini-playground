import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface CodeContextType {
  html: string;
  css: string;
  js: string;
  setHtml: (val: string) => void;
  setCss: (val: string) => void;
  setJs: (val: string) => void;
  aiStreaming: boolean;
  setAiStreaming: (val: boolean) => void;
  resetAll: () => void;
}

const CodeContext = createContext<CodeContextType | undefined>(undefined);

export const CodeProvider = ({ children }: { children: ReactNode }) => {
  const [html, setHtml] = useState<string>("");
  const [css, setCss] = useState<string>("");
  const [js, setJs] = useState<string>("");

  const [aiStreaming, setAiStreaming] = useState<boolean>(false);

  const resetAll = useCallback(() => {
    setHtml("");
    setCss("");
    setJs("");
  }, []);

  return (
    <CodeContext.Provider
      value={{
        html,
        css,
        js,
        setHtml,
        setCss,
        setJs,
        aiStreaming,
        setAiStreaming,
        resetAll,
      }}
    >
      {children}
    </CodeContext.Provider>
  );
};

export const useCode = (): CodeContextType => {
  const ctx = useContext(CodeContext);
  if (!ctx) {
    throw new Error("useCode must be used inside a CodeProvider");
  }
  return ctx;
};
