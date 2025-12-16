import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  openExcel: () => ipcRenderer.invoke("dialog:openExcel"),
  clusterData: (payload: any) => ipcRenderer.invoke("worker:cluster", payload),
  exportReport: (report: any) => ipcRenderer.invoke("export:report", report),
  aiAnalyze: (payload: any) => ipcRenderer.invoke("ai:analyze", payload),

  // cache handlers
  cacheSave: (cacheId: string, payload: any) => ipcRenderer.invoke("cache:save", { cacheId, payload }),
  cacheGet: (cacheId: string) => ipcRenderer.invoke("cache:get", { cacheId }),

  // pairwise and audit
  pairwiseAnalyze: (records: any[]) => ipcRenderer.invoke("pairwise:analyze", { records }),
  runAudit: (cacheId: string) => ipcRenderer.invoke("audit:run", { cacheId }),

  // export
  generateExport: (cacheId: string) => ipcRenderer.invoke("export:generate", { cacheId }),

  // settings
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSave: (settings: any) => ipcRenderer.invoke("settings:save", { settings }),

  // subscribe to progress events (worker and pairwise)
  onWorkerProgress: (cb: (ev: any, msg: any) => void) => {
    ipcRenderer.on("worker:progress", (ev, msg) => cb(ev, msg));
  },
  onPairwiseProgress: (cb: (ev: any, msg: any) => void) => {
    ipcRenderer.on("pairwise:progress", (ev, msg) => cb(ev, msg));
  },
});
