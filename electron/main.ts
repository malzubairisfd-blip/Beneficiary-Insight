import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "path";
import fs from "fs/promises";
import { Worker } from "worker_threads";
import { writeReport } from "./utils/excel-writer";
import { ensureCacheDir, readCacheFile, writeCacheFile } from "./utils/cache";
import { runAuditOnClusters } from "./utils/audit";
import { generateWorkbookBufferFromCache } from "./utils/exporter";
import { readSettingsFile, writeSettingsFile } from "./utils/settings";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "../preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === "development") {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist-renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await ensureCacheDir();
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

/* -------------------------
   File open & report export (simple rows)
   ------------------------- */
ipcMain.handle("dialog:openExcel", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Excel", extensions: ["xlsx", "xls", "csv"] }],
  });
  if (canceled || filePaths.length === 0) return null;
  const buff = await fs.readFile(filePaths[0]);
  return { path: filePaths[0], data: buff.toString("base64") };
});

ipcMain.handle("export:report", async (_e, report) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: "Save Report",
    defaultPath: "beneficiary_report.xlsx",
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
  });
  if (canceled || !filePath) return { success: false };
  await writeReport(filePath, report);
  return { success: true, path: filePath };
});

/* -------------------------
   Clustering (spawns worker thread)
   ------------------------- */
ipcMain.handle("worker:cluster", async (_e, payload) => {
  return new Promise((resolve, reject) => {
    // Worker file path should be inside dist-electron/worker/matcher.js
    const workerFile = path.join(__dirname, "worker", "matcher.js");
    const worker = new Worker(workerFile, {
      workerData: payload,
    });

    // forward worker progress messages to renderer if window exists
    worker.on("message", (msg) => {
      if (mainWindow && msg && msg.type) {
        mainWindow.webContents.send("worker:progress", msg);
      }
      // if final 'done' received, resolve with payload too
      if (msg && msg.type === "done") {
        resolve({ success: true, ...msg.payload });
      }
    });

    worker.on("error", (err) => {
      reject({ success: false, error: String(err) });
    });

    worker.on("exit", (code) => {
      if (code !== 0) console.warn("Worker stopped with code", code);
    });
  });
});

/* -------------------------
   Cache: save / load cluster results
   ------------------------- */
ipcMain.handle("cache:save", async (_e, { cacheId, payload }) => {
  try {
    if (!cacheId) throw new Error("cacheId required");
    await writeCacheFile(cacheId, payload);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("cache:get", async (_e, { cacheId }) => {
  try {
    if (!cacheId) throw new Error("cacheId required");
    const data = await readCacheFile(cacheId);
    return { ok: true, data };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
});

/* -------------------------
   Pairwise: analyze a cluster (helper)
   ------------------------- */
ipcMain.handle("pairwise:analyze", async (_e, { records }) => {
  try {
    return new Promise((resolve, reject) => {
      const workerFile = path.join(__dirname, "worker", "matcher.js");
      const worker = new Worker(workerFile, {
        workerData: { records, pairwiseOnly: true },
      });

      worker.on("message", (msg) => {
        if (msg && msg.type === "pairwise-result") {
          resolve({ ok: true, pairs: msg.pairs });
        } else if (msg && msg.type === "progress") {
          mainWindow?.webContents.send("pairwise:progress", msg);
        } else if (msg && msg.type === "done") {
          resolve({ ok: true, pairs: msg.pairs || [] });
        }
      });

      worker.on("error", (err) => reject({ ok: false, error: String(err) }));
      worker.on("exit", (code) => {
        if (code !== 0) console.warn("Pairwise worker exit code", code);
      });
    });
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
});

/* -------------------------
   Audit: run offline audit rules and persist findings
   ------------------------- */
ipcMain.handle("audit:run", async (_e, { cacheId }) => {
  try {
    if (!cacheId) throw new Error("cacheId required");
    const cache = await readCacheFile(cacheId);
    if (!cache || !Array.isArray(cache.clusters)) {
      throw new Error("No clusters found in cache");
    }
    const clusters = cache.clusters;
    const findings = runAuditOnClusters(clusters);

    const newCache = { ...cache, auditFindings: findings };
    await writeCacheFile(cacheId, newCache);

    return { ok: true, findings };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
});

/* -------------------------
   Settings: read / write settings.json in userData
   ------------------------- */
ipcMain.handle("settings:get", async () => {
  try {
    const settings = await readSettingsFile();
    return { ok: true, settings };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("settings:save", async (_e, { settings }) => {
  try {
    await writeSettingsFile(settings);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
});

/* -------------------------
   Export: generate enriched Excel workbook and save via dialog
   ------------------------- */
ipcMain.handle("export:generate", async (_e, { cacheId }) => {
  try {
    if (!cacheId) throw new Error("cacheId required");
    // build workbook buffer from cache
    const buffer = await generateWorkbookBufferFromCache(cacheId);

    // show save dialog
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save Beneficiary Report",
      defaultPath: `beneficiary-report-${Date.now()}.xlsx`,
      filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
    });
    if (canceled || !filePath) return { ok: false, error: "Save cancelled" };

    await fs.writeFile(filePath, buffer);
    return { ok: true, path: filePath };
  } catch (err: any) {
    return { ok: false, error: String(err) };
  }
});
