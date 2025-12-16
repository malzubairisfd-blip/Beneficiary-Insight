import React, { useCallback, useEffect, useMemo, useState } from "react";

type RecordRow = any;
type Cluster = {
  records: RecordRow[];
  reasons?: string[];
  avgWomanNameScore?: number;
  avgHusbandNameScore?: number;
  avgFinalScore?: number;
  confidence?: number;
};

export default function ReviewPage() {
  const [allClusters, setAllClusters] = useState<Cluster[]>([]);
  const [filteredClusters, setFilteredClusters] = useState<Cluster[]>([]);
  const [selectedCluster, setSelectedCluster] = useState<RecordRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(9);

  const handleCalculateScores = useCallback(async (clustersToScore: Cluster[]) => {
    if (!clustersToScore.length) return;
    setCalculating(true);
    try {
      // For each cluster, call main process pairwiseAnalyze
      const updated = await Promise.all(clustersToScore.map(async (cluster) => {
        try {
          const res = await (window as any).electronAPI.pairwiseAnalyze(cluster.records || []);
          if (!res || !res.ok) return cluster;
          const pairs = res.pairs || [];
          if (!pairs.length) {
            return { ...cluster, avgWomanNameScore: 0, avgHusbandNameScore: 0, avgFinalScore: 0, confidence: 0 };
          }
          const womanNameScores = pairs.map((p: any) => p.breakdown?.firstNameScore ?? 0);
          const husbandNameScores = pairs.map((p: any) => p.breakdown?.husbandScore ?? 0);
          const avgWomanNameScore = womanNameScores.reduce((a: number, b: number) => a + b, 0) / womanNameScores.length;
          const avgHusbandNameScore = husbandNameScores.reduce((a: number, b: number) => a + b, 0) / husbandNameScores.length;
          const avgFinalScore = (avgWomanNameScore + avgHusbandNameScore) / 2;
          const confidence = Math.round(((avgFinalScore || 0) * 100));
          return { ...cluster, avgWomanNameScore, avgHusbandNameScore, avgFinalScore, confidence };
        } catch {
          return cluster;
        }
      }));
      setAllClusters(updated);
    } finally {
      setCalculating(false);
    }
  }, []);

  useEffect(() => {
    async function loadFromCache() {
      setLoading(true);
      try {
        const cacheId = sessionStorage.getItem("cacheId");
        if (!cacheId) {
          alert("No cacheId found — upload and cluster first.");
          setLoading(false);
          return;
        }
        const res = await (window as any).electronAPI.cacheGet(cacheId);
        if (!res.ok) throw new Error(res.error || "Failed to read cache");
        const data = res.data || {};
        const clusters = data.clusters || [];
        // normalize keys from old web format (Records vs records)
        const normalized = clusters.map((c: any) => {
          if (c.records) return c;
          if (c.Records) return { ...c, records: c.Records };
          return { records: c };
        });
        setAllClusters(normalized);
        setFilteredClusters(normalized);
      } catch (err: any) {
        alert("Error loading cache: " + String(err));
      } finally {
        setLoading(false);
      }
    }
    loadFromCache();
  }, []);

  useEffect(() => {
    if (allClusters.length > 0) {
      handleCalculateScores(allClusters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClusters]);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredClusters(allClusters);
      return;
    }
    const s = search.toLowerCase();
    const filtered = allClusters.filter((cluster) =>
      (cluster.records || []).some((r: any) =>
        String(r.womanName || "").toLowerCase().includes(s) ||
        String(r.husbandName || "").toLowerCase().includes(s) ||
        String(r.phone || "").toLowerCase().includes(s)
      )
    );
    setFilteredClusters(filtered);
    setCurrentPage(1);
  }, [search, allClusters]);

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentClusters = filteredClusters.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredClusters.length / itemsPerPage);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Cluster Review</h2>
      <div className="flex justify-between items-center mb-4">
        <div className="flex-1 mr-4">
          <input
            placeholder="Search by name, husband, or phone..."
            className="w-full border px-3 py-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => handleCalculateScores(allClusters)} disabled={calculating}>
            {calculating ? "Calculating…" : "Recalculate Scores"}
          </button>
          <button className="btn" onClick={() => { window.location.hash = "#/audit"; (window as any).location.reload(); }}>
            Go to Audit
          </button>
        </div>
      </div>

      {loading ? <div>Loading clusters…</div> : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentClusters.map((c, idx) => {
              const clusterNumber = (currentPage - 1) * itemsPerPage + idx + 1;
              return (
                <div key={clusterNumber} className="border rounded p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold">Cluster {clusterNumber}</div>
                      <div className="text-sm text-muted-foreground">{(c.records || []).length} records</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs">Confidence</div>
                      <div className="text-lg font-bold">{c.confidence !== undefined ? `${c.confidence}%` : "—"}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm space-y-1">
                    {(c.records || []).slice(0, 3).map((r: any, i: number) => <div key={i} title={r.womanName}>{r.womanName}</div>)}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className="btn" onClick={() => setSelectedCluster(c.records)}>Inspect</button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-6">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} className="btn">Previous</button>
              <div>Page {currentPage} of {totalPages}</div>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} className="btn">Next</button>
            </div>
          )}
        </>
      )}

      {selectedCluster && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl max-h-[80vh] overflow-auto rounded p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold">Cluster details</h3>
              <button onClick={() => setSelectedCluster(null)}>Close</button>
            </div>
            <pre className="text-xs">{JSON.stringify(selectedCluster, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  );
        }
