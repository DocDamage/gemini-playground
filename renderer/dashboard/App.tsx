import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { RuntimeProvider } from "../context/RuntimeContext";
import { useAuth } from "../context/AuthContext";
import CommandPalette from "./CommandPalette";
import DashboardSidebar, { DashboardView } from "./DashboardSidebar";
import RuntimeSelector from "./RuntimeSelector";
import CanvasPane from "./CanvasPane";
import BrowserPane from "./BrowserPane";
import ReportsPane from "./ReportsPane";
import FileBrowser from "./FileBrowser";
import AssetDrawer from "./AssetDrawer";
import AIFeedbackPanel from "./AIFeedbackPanel";
import DiffViewer from "./DiffViewer";

const MainContent: React.FC<{ view: DashboardView }> = ({ view }) => {
  switch (view) {
    case "canvas":
      return <CanvasPane />;
    case "browser":
      return <BrowserPane />;
    case "reports":
      return <ReportsPane />;
    case "files":
      return <FileBrowser />;
    default:
      return <CanvasPane />;
  }
};

const App: React.FC = () => {
  const { user, isGuest, online, backend, signInFirebase, signOut, loading } =
    useAuth();
  const [activeView, setActiveView] = useState<DashboardView>("canvas");

  return (
    <RuntimeProvider>
      <div className="flex h-screen w-screen bg-bg text-text-main">
        <CommandPalette />
        <DashboardSidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="relative flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-border bg-panel px-4 py-2 shadow-sm">
            <RuntimeSelector />
            {!loading && (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-text-muted">
                  {isGuest ? "Guest" : user?.displayName || "User"}
                </span>
                {isGuest ? (
                  <Button size="sm" variant="outline" onClick={signInFirebase}>
                    Sign In
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={signOut}>
                    Sign Out
                  </Button>
                )}
              </div>
            )}
          </header>

          <section className="flex-1 overflow-hidden bg-bg p-4">
            <MainContent view={activeView} />
          </section>

          <footer className="flex justify-between border-t border-border bg-panel px-4 py-1 text-xs text-text-muted">
            <span>
              Connected as {isGuest ? "Guest" : user?.email || "Anonymous"} (
              {backend})
            </span>
            <span className={online ? "text-success" : "text-error"}>
              {online ? "Online" : "Offline"}
            </span>
          </footer>

          <AssetDrawer />
          <AIFeedbackPanel />
          <DiffViewer />
        </main>
      </div>
    </RuntimeProvider>
  );
};

export default App;
