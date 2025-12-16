import ExcelJS from "exceljs";
import { readCacheFile } from "./cache";

/**
 * Generate an Excel workbook Buffer from the cache.
 * - Enrich rows with Cluster_ID, Cluster_Size, Max_PairScore
 * - Sort by Max_PairScore desc, then Cluster_ID asc
 * - Create sheets: Enriched Data, Review Summary, Cluster Details, Audit Findings
 */
export async function generateWorkbookBufferFromCache(cacheId: string) {
  const cache = await readCacheFile(cacheId);
  const clusters = cache.clusters || [];
  const allRows = cache.rows || cache.Rows || [];

  // Build a row -> cluster mapping
  const rowMap = new Map<string, any>(); // internalId -> enrichedRow
  clusters.forEach((cluster: any, ci: number) => {
    const clusterId = ci + 1;
    const clusterSize = (cluster.records || []).length;
    // try to determine pair scores per record: cluster.pairScores expected optional
    // compute a simple Max_PairScore per record using cluster.pairScores if present:
    let maxPair = 0;
    if (cluster.pairScores && Array.isArray(cluster.pairScores) && cluster.pairScores.length) {
      maxPair = Math.max(...cluster.pairScores.map((p: any) => p.finalScore || 0));
    } else {
      // fallback: if cluster has pairScores per pair, attempt to compute per-record max
      if (cluster.pairs && Array.isArray(cluster.pairs)) {
        maxPair = Math.max(...cluster.pairs.map((p: any) => p.score || 0));
      }
    }

    (cluster.records || []).forEach((r: any) => {
      const internalId = r._internalId || r.id || JSON.stringify(r);
      rowMap.set(internalId, {
        ...r,
        Cluster_ID: clusterId,
        Cluster_Size: clusterSize,
        Max_PairScore: maxPair,
      });
    });
  });

  // for rows not in any cluster, assign cluster 0
  const enrichedRows = allRows.map((r: any) => {
    const internalId = r._internalId || r.id || JSON.stringify(r);
    const existing = rowMap.get(internalId);
    if (existing) return existing;
    return {
      ...r,
      Cluster_ID: 0,
      Cluster_Size: 1,
      Max_PairScore: 0,
    };
  });

  // Sort deterministically
  enrichedRows.sort((a: any, b: any) => {
    if ((b.Max_PairScore || 0) !== (a.Max_PairScore || 0)) return (b.Max_PairScore || 0) - (a.Max_PairScore || 0);
    return (a.Cluster_ID || 0) - (b.Cluster_ID || 0);
  });

  // Create workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Beneficiary Insights (Offline)";
  workbook.created = new Date();

  // Enriched Data sheet
  const sheet = workbook.addWorksheet("Enriched Data");
  // Build columns dynamically from first row keys (including new columns)
  const first = enrichedRows[0] || {};
  const keys = Array.from(new Set([...Object.keys(first), ...Object.keys(first || {})]));
  // Prefer putting our columns at front
  const preferred = ["Cluster_ID", "Cluster_Size", "Max_PairScore"];
  const cols = [
    ...preferred.filter((k) => keys.includes(k)),
    ...keys.filter((k) => !preferred.includes(k)),
  ].map((k) => ({ header: k, key: k }));
  sheet.columns = cols;
  enrichedRows.forEach((r: any) => {
    // ensure simple values
    const row: any = {};
    for (const c of sheet.columns as any) {
      const key = c.key;
      row[key] = r[key] !== undefined ? r[key] : "";
    }
    sheet.addRow(row);
  });

  // Review Summary sheet
  const summarySheet = workbook.addWorksheet("Review Summary");
  const totalRecords = enrichedRows.length;
  const totalClusters = clusters.length;
  summarySheet.addRow(["Total Records", totalRecords]);
  summarySheet.addRow(["Total Clusters", totalClusters]);
  summarySheet.addRow(["Generated At", new Date().toLocaleString()]);
  summarySheet.addRow([]);
  summarySheet.addRow(["Top clusters (by size)"]);
  summarySheet.addRow(["Cluster ID", "Cluster Size", "Representative Names"]);
  const topClusters = clusters
    .map((c: any, i: number) => ({ id: i + 1, size: (c.records || []).length, rep: (c.records || []).slice(0, 3).map((r: any) => r.womanName).join(" | ") }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 20);
  topClusters.forEach((c) => summarySheet.addRow([c.id, c.size, c.rep]));

  // Cluster Details sheet
  const clusterSheet = workbook.addWorksheet("Cluster Details");
  clusterSheet.addRow(["Cluster_ID", "Cluster_Size", "Record_Count", "Reasons", "Sample_Records_JSON"]);
  clusters.forEach((c: any, i: number) => {
    clusterSheet.addRow([
      i + 1,
      (c.records || []).length,
      (c.records || []).length,
      (c.reasons || []).join("; "),
      JSON.stringify((c.records || []).slice(0, 5).map((r: any) => ({ id: r._internalId, womanName: r.womanName, husbandName: r.husbandName })))
    ]);
  });

  // Audit Findings sheet
  const auditSheet = workbook.addWorksheet("Audit Findings");
  auditSheet.addRow(["Type", "Severity", "Description", "Related_Record_IDs"]);
  const findings = cache.auditFindings || [];
  (findings || []).forEach((f: any) => {
    const ids = (f.records || []).map((r: any) => r._internalId || r.id || "").join(", ");
    auditSheet.addRow([f.type, f.severity || "", f.description || "", ids]);
  });

  // Formatting: width and bold headers for main sheet
  sheet.columns.forEach((c) => {
    (c as any).width = Math.min(30, Math.max(12, String(c.header).length + 4));
  });
  sheet.getRow(1).font = { bold: true };

  // Return buffer
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}
