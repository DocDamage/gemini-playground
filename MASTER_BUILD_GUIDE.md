15 | Handoff Summary (2025-10-20)

15.1 Environment & Tooling

- Tooling bump: `electron@38.3.0`, `vite@7.1.10`, `esbuild@0.25.0`, `@vitejs/plugin-react@5`. ESLint upgraded to flat-config with `@typescript-eslint`, and `dompurify` is pinned to `^3.2.4` via overrides. The event bus now relies on `mitt` (installed).
- `npm audit` now only flags the upstream `vm2` sandbox escape (no fix yet). Re-run audit before shipping; consider alternative sandboxes when a patched release arrives.

15.2 Codebase Updates

- Restored a working `FileBrowser` pane (`renderer/dashboard/FileBrowser.tsx`) and pared back `renderer/dashboard/App.tsx` to the cohesive layout without the previously broken voice UI.
- Added a dedicated `preload/pluginBridge.js`, required it from `preload/fileBridge.js`, and extended `main.js` to expose plugin IPC (`plugin:list`, `plugin:reload`, `plugin:install`, history/restore) plus real directory/stat handlers for the file bridge.
- Reimplemented `renderer/context/ProjectsContext.tsx` as a minimal local-storage provider pending Firebase/GitHub sync wiring; replaced the corrupted `SettingsModal.tsx` with a light-weight persona editor so the build compiles.
- Introduced a placeholder handoff-friendly `renderer/dashboard/SettingsModal.tsx`, updated `renderer/dashboard/LiveEditor.tsx` with safer sound handling, and repaired preload drag handling (`preload/dragPreload.js`) with proper cleanup.
- Scaffolded lightweight, motion-friendly `Button` and `Card` primitives under `renderer/components/ui/` so dashboard panels compile against the expected API surface.
- Replaced the Firebase integration with an offline stub (`core/firebase.js`) so the renderer build no longer depends on the Firebase SDK by default.

15.3 Build & Lint Status

- `npm run lint` passes with the new configuration; empty catch blocks are allowed only for explicit recovery paths.
- `npm run build` now fails because `core/github.js` pulls in `node-fetch`, which depends on Node-only modules during the Vite build (`node:util`'s promisify); guard the GitHub client for the renderer bundle or swap to a browser-friendly fetch.

15.4 Immediate Follow-Ups

1. Stub or browser-gate the GitHub module so Vite no longer bundles `node-fetch` (e.g., dynamic import inside Electron only, or swap to native `fetch`).
2. Once the GitHub dependency is handled, rerun `npm run build`, then `npm run dist` for a packaging smoke test.
3. Revisit the voice controls removed from `App.tsx` if speech input remains a requirement -- introduce a typed SpeechRecognition helper to avoid the earlier runtime errors.
4. Monitor `vm2` releases; upgrade when a patched version is available and remove the override note from this guide.

15.5 Quick Start For Next Contributor

```
npm install
npm run lint
# TODO: relocate electron dependency for packaging
npm run build
npm run dist   # optional packaging check
```

All major dependencies, lint rules, and preload/main wiring are now documented. Resolve the electron packaging dependency issue next, then resume feature work (plugin command registry, Firebase/GitHub project sync, voice UX) once the build is green.

