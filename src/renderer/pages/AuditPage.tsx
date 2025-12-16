import React, { useEffect, useMemo, useState } from "react";

type RecordRow = any;
type AuditFinding = { type: string; severity: "high" | "medium" | "low"; description: string; records: RecordRow[] };

export default function AuditPage() {
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [loading, setLoading] = useState({ data: true, audit: false });

  useEffect(() => {
    async function loadData() {
      setLoading((s) => ({ ...s, data: true }));
      try {
        const cacheId = sessionStorage.getItem("cacheId");
        if (!cacheId) {
          alert("No cacheId found — upload and cluster first.");
          setLoading((s) => ({ ...s, data: false }));
          return;
        }
        const res = await (window as any).electronAPI.cacheGet(cacheId);
        if (!res.ok) throw new Error(res.error || "Failed to load cache");
        const data = res.data || {};
        const clusters = data.clusters || [];
        const normalized = clusters.map((c: any) => (c.records ? c : { records: c.Records || c.records }));
        const clusteredRecords = normalized.flatMap((c: any) => c.records || []);
        setRows(clusteredRecords);

        if (data.auditFindings) {
          setFindings(data.auditFindings);
        } else {
          // auto-run audit
          runAudit(cacheId as string);
        }
      } catch (err: any) {
        alert("Error loading cache: " + String(err));
      } finally {
        setLoading((s) => ({ ...s, data: false }));
      }
    }
    loadData();
  }, []);

  async function runAudit(cacheId: string) {
    setLoading((s) => ({ ...s, audit: true }));
    try {
      const res = await (window as any).electronAPI.runAudit(cacheId);
      if (!res.ok) throw new Error(res.error || "Audit failed");
      setFindings(res.findings || []);
      alert(`Audit complete — ${res.findings?.length || 0} findings`);
    } catch (err: any) {
      alert("Audit error: " + String(err));
    } finally {
      setLoading((s) => ({ ...s, audit: false }));
    }
  }

  const groupedFindings = useMemo(() => {
    const groups: Record<string, { record: RecordRow; issues: { type: string; description: string; severity: string }[] }> = {};
    for (const f of findings) {
      for (const r of f.records) {
        const key = r._internalId || String(r.nationalId || "");
        if (!groups[key]) groups[key] = { record: r, issues: [] };
        groups[key].issues.push({ type: f.type, description: f.description, severity: f.severity });
      }
    }
    return Object.values(groups);
  }, [findings]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const f of findings) {
      c[f.type] = (c[f.type] || 0) + 1;
    }
    return c;
  }, [findings]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Data Integrity Audit</h2>

      <div className="mb-4">
        <button className="btn mr-2" onClick={() => {
          const cacheId = sessionStorage.getItem("cacheId");
          if (cacheId) runAudit(cacheId);
          else alert("No cacheId found");
        }} disabled={loading.audit || loading.data || rows.length === 0}>
          {loading.audit ? "Running…" : (findings.length ? "Re-run Audit" : "Run Audit")}
        </button>
      </div>

      {loading.data ? <div>Loading data…</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div className="border p-3 rounded">
              <div className="text-sm">Records</div>
              <div className="text-2xl font-bold">{rows.length}</div>
            </div>
            <div className="border p-3 rounded">
              <div className="text-sm">Findings</div>
              <div className="text-2xl font-bold">{findings.length}</div>
            </div>
            <div className="border p-3 rounded">
              <div className="text-sm">Unique Records with Issues</div>
              <div className="text-2xl font-bold">{groupedFindings.length}</div>
            </div>
            <div className="border p-3 rounded">
              <div className="text-sm">Top Finding</div>
              <div className="text-2xl font-bold">{findings[0]?.type || "—"}</div>
            </div>
          </div>

          {findings.length > 0 ? (
            <div className="space-y-4">
              {groupedFindings.map((g, i) => (
                <div key={i} className="border rounded p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-semibold">{g.record.womanName || g.record._internalId}</div>
                      <div className="text-sm text-muted-foreground">{g.record.husbandName}</div>
                    </div>
                    <div className="text-sm">
                      {g.issues.map((iss, idx) => <span key={idx} className="inline-block ml-2 px-2 py-1 text-xs border rounded">{iss.type}</span>)}
                    </div>
                  </div>
                  <div className="mt-2 text-sm">
                    <ul className="list-disc pl-5">
                      {g.issues.map((iss, idx) => <li key={idx}><strong>{iss.type}</strong>: {iss.description}</li>)}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border p-6 rounded text-center">No findings yet. Run the audit to generate results.</div>
          )}
        </>
      )}
    </div>
  );
}
