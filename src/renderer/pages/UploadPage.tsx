import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

declare global {
  interface Window {
    electronAPI: {
      openExcel: () => Promise<{ path: string; data: string } | null>;
      clusterData: (payload: any) => Promise<any>;
      exportReport: (report: any) => Promise<any>;
      aiAnalyze: (payload: any) => Promise<any>;
      cacheSave: (cacheId: string, payload: any) => Promise<any>;
      cacheGet: (cacheId: string) => Promise<any>;
      pairwiseAnalyze: (records: any[]) => Promise<any>;
      runAudit: (cacheId: string) => Promise<any>;
      generateExport: (cacheId: string) => Promise<any>;
      settingsGet: () => Promise<any>;
      settingsSave: (settings: any) => Promise<any>;
      onWorkerProgress: (cb: (ev: any, msg: any) => void) => void;
      onPairwiseProgress: (cb: (ev: any, msg: any) => void) => void;
    };
  }
}

type Mapping = {
  womanName: string;
  husbandName: string;
  nationalId: string;
  phone: string;
  village: string;
  subdistrict: string;
  children: string;
  beneficiaryId?: string;
};

const MAPPING_FIELDS: (keyof Mapping)[] = [
  "womanName",
  "husbandName",
  "nationalId",
  "phone",
  "village",
  "subdistrict",
  "children",
  "beneficiaryId",
];
const REQUIRED_MAPPING_FIELDS: (keyof Mapping)[] = ["womanName", "husbandName", "nationalId", "phone", "village", "subdistrict", "children"];

export default function UploadPage() {
  const [columns, setColumns] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    womanName: "",
    husbandName: "",
    nationalId: "",
    phone: "",
    village: "",
    subdistrict: "",
    children: "",
    beneficiaryId: "",
  });
  const [isMappingComplete, setIsMappingComplete] = useState(false);
  const [workerStatus, setWorkerStatus] = useState<string>("idle");
  const [clusters, setClusters] = useState<any[]>([]);
  const rawRowsRef = useRef<any[]>([]);
  const [fileReadProgress, setFileReadProgress] = useState(0);
  const [progressInfo, setProgressInfo] = useState<{ status: string; progress: number; completed?: number; total?: number }>({ status: "idle", progress: 0 });

  useEffect(() => {
    const allRequiredMapped = REQUIRED_MAPPING_FIELDS.every((f) => !!mapping[f]);
    setIsMappingComplete(allRequiredMapped);
  }, [mapping]);

  useEffect(() => {
    // subscribe to worker progress forwarded from main (if any)
    try {
      window.electronAPI.onWorkerProgress((_, msg) => {
        if (!msg) return;
        setProgressInfo({ status: msg.status || "working", progress: msg.progress ?? 0, completed: msg.completed, total: msg.total });
        setWorkerStatus(msg.status || "working");
      });
    } catch {
      // ignore if not available
    }
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setWorkerStatus("idle");
    setClusters([]);
    setFileReadProgress(0);

    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const percentage = (ev.loaded / ev.total) * 100;
        setFileReadProgress(percentage);
      }
    };
    reader.onload = (ev) => {
      const buffer = ev.target?.result;
      const wb = XLSX.read(buffer as ArrayBuffer, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
      rawRowsRef.current = json;
      setColumns(Object.keys(json[0] || {}));
      setFileReadProgress(100);
    };
    reader.readAsArrayBuffer(f);
  }

  function handleMappingChange(field: keyof Mapping, value: string) {
    setMapping((m) => ({ ...m, [field]: value }));
  }

  async function startClustering() {
    if (!rawRowsRef.current.length) {
      alert("Upload data first");
      return;
    }
    if (!isMappingComplete) {
      alert("Mapping incomplete");
      return;
    }
    setWorkerStatus("processing");
    setProgressInfo({ status: "processing", progress: 1 });

    // Build mapped rows based on mapping
    const mappedRows = rawRowsRef.current.map((orig: any, idx: number) => {
      const mapped: any = { ...orig, _internalId: orig._internalId || "row_" + idx };
      for (const key of MAPPING_FIELDS) {
        const col = mapping[key];
        if (col && orig[col] !== undefined) mapped[key] = orig[col];
      }
      // Ensure children is in array form
      if (mapped.children && typeof mapped.children === "string") {
        mapped.children = mapped.children.split(/[;,|،]/).map((s: string) => s.trim()).filter(Boolean);
      }
      return mapped;
    });

    try {
      // Send entire payload to main (worker will run in main process worker thread)
      const payload = {
        records: mappedRows,
        mapping,
        options: {}, // fetch from local settings if you have them
      };

      // clusterData returns the worker's messages combined in a final structure
      const res = await window.electronAPI.clusterData(payload);

      // If main forwards progress messages instead of returning final object,
      // clusterData might simply return when done. We handle both shapes.
      if (res && res.success) {
        setClusters(res.clusters || []);
        setWorkerStatus("done");
        setProgressInfo({ status: "done", progress: 100 });
        // Save to cache on main
        const cacheId = "cache-" + Date.now() + "-" + Math.random().toString(36).slice(2,9);
        await window.electronAPI.cacheSave(cacheId, { rows: res.rows, clusters: res.clusters });
        sessionStorage.setItem("cacheId", cacheId);
        sessionStorage.setItem("cacheTimestamp", Date.now().toString());
        // Notify user
        alert(`Clustering complete: ${((res.clusters || []).length)} clusters found — saved as ${cacheId}`);
      } else if (res && res.type === "progress") {
        setWorkerStatus(res.status || "processing");
      } else {
        setWorkerStatus("error");
        alert("Clustering failed: " + (res?.error || "unknown"));
      }
    } catch (err: any) {
      console.error(err);
      setWorkerStatus("error");
      alert("Clustering error: " + String(err));
    }
  }

  async function handleExportReport() {
    // Use the generateExport flow that saves Excel using main process
    const cacheId = sessionStorage.getItem("cacheId");
    if (!cacheId) {
      alert("No cache found. Run clustering first.");
      return;
    }
    setWorkerStatus("exporting");
    try {
      const res = await window.electronAPI.generateExport(cacheId);
      if (res && res.ok) {
        alert("Export saved to: " + res.path);
      } else {
        alert("Export failed: " + (res?.error || "unknown"));
      }
    } catch (err: any) {
      alert("Export error: " + String(err));
    } finally {
      setWorkerStatus("done");
    }
  }

  const formattedStatus = () => {
    const s = progressInfo.status || "idle";
    let statusText = s.replace(/-/g, " ");
    statusText = statusText.charAt(0).toUpperCase() + statusText.slice(1);
    if (progressInfo.completed !== undefined && progressInfo.total) {
      return `Status: ${statusText} (${progressInfo.completed}/${progressInfo.total})`;
    }
    return `Status: ${statusText}`;
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Upload File</h2>

      <div className="mb-4">
        <input id="file-upload" type="file" onChange={handleFileChange} accept=".xlsx,.xls,.csv" />
        {file && <div className="mt-2">Loaded file: {file.name} — {rawRowsRef.current.length} rows</div>}
        {fileReadProgress > 0 && fileReadProgress < 100 && <div className="mt-2">Reading: {Math.round(fileReadProgress)}%</div>}
      </div>

      {columns.length > 0 && (
        <div className="mb-4">
          <h3 className="font-medium">Map Columns</h3>
          <div className="grid grid-cols-2 gap-4 mt-2">
            {MAPPING_FIELDS.map((field) => (
              <div key={field} className="border p-3 rounded">
                <label className="block font-semibold mb-1">{field}</label>
                <select value={mapping[field] || ""} onChange={(e) => handleMappingChange(field as keyof Mapping, e.target.value)}>
                  <option value="">-- select column --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-6">
        <button className="btn mr-2" onClick={startClustering} disabled={workerStatus === "processing"}>
          {workerStatus === "processing" ? "Processing…" : "Start Clustering"}
        </button>
        <button className="btn" onClick={handleExportReport} disabled={workerStatus === "processing" || !sessionStorage.getItem("cacheId")}>
          Export Report
        </button>
      </div>

      {(workerStatus !== "idle" && workerStatus !== "done") && (
        <div className="space-y-2 mt-4">
          <div className="flex justify-between items-center text-sm font-medium text-muted-foreground">
            <span>{formattedStatus()}</span>
            <span>{Math.round(progressInfo.progress)}%</span>
          </div>
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
            <div className="absolute h-full bg-blue-600" style={{ width: `${progressInfo.progress}%` }} />
          </div>
        </div>
      )}

      {workerStatus === "done" && clusters.length > 0 && (
        <div>
          <h3 className="text-lg font-medium">Results</h3>
          <div className="mt-2">
            <div>Total records: {rawRowsRef.current.length}</div>
            <div>Clusters: {clusters.length}</div>
            <div>Clustered records: {clusters.flatMap((c) => c.records).length}</div>
          </div>

          <div className="mt-4 space-y-3">
            {clusters.map((c: any, idx: number) => (
              <details key={idx} className="p-3 border rounded">
                <summary>Cluster {idx + 1} — {c.records.length} items</summary>
                <pre className="mt-2 max-h-48 overflow-auto text-xs">{JSON.stringify(c, null, 2)}</pre>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
    }
