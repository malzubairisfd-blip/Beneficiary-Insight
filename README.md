```markdown
# Beneficiary Insights — Electron (Offline EXE) Edition

This project is a desktop Electron app with React + TypeScript + Tailwind. It supports reading Excel files, running offline fuzzy matching/clustering in a worker thread, and exporting reports. Packaging uses `electron-builder` to create a portable .exe.

Quick start:
1. npm install
2. npm run dev   (for development)
3. npm run build
4. npm run dist  (creates a single portable exe via electron-builder)

Notes:
- Worker threads must be accessible by path when packaged. The project sets "asarUnpack" for dist-electron/worker/**.
- Preload exposes a secure electronAPI used by the renderer.
- The main worker file is electron/worker/matcher.ts — compile it to dist-electron/worker/matcher.js in your build step.
```
