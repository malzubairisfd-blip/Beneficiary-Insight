import path from "path";

/**
 * Return correct worker file path in dev and packaged app.
 * Usage:
 *   const workerFile = getWorkerPath("dist-electron", "worker", "matcher.js");
 *
 * IMPORTANT:
 * - Ensure your electron-builder config uses "asar": true and "asarUnpack"
 *   includes the same relative path (e.g. "dist-electron/worker/**").
 */
export function getWorkerPath(...segments: string[]) {
  // Development: compiled output (dist-electron)
  if (process.env.NODE_ENV === "development") {
    return path.join(__dirname, ...segments);
  }

  // Packaged: files unpacked to resources/app.asar.unpacked
  const resourcesPath = process.resourcesPath || process.env.PORTABLE_EXECUTABLE_DIR || "";
  return path.join(resourcesPath, "app.asar.unpacked", ...segments);
}
