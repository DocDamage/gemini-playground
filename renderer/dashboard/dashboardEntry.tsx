import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "../index.css";

// Optional: basic dark-mode sync (respects user system theme)
if (
  window.matchMedia &&
  window.matchMedia("(prefers-color-scheme: dark)").matches
) {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

// Mount the app cleanly
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
