import React from "react";
import { createRoot } from "react-dom/client";
import AIPanel from "./AIPanel";
import ErrorBoundary from "../ErrorBoundary";

const root = createRoot(document.getElementById("root")!);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AIPanel />
    </ErrorBoundary>
  </React.StrictMode>
);
