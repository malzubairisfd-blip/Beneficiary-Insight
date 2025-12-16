/**
 * Basic offline audit rules applied to clusters.
 * Returns an array of findings:
 *  { type, severity, description, records: RecordRow[] }
 *
 * This is intentionally simple so you can extend the rules as needed.
 */

function jaroWinkler(a: string, b: string) {
  a = String(a || "");
  b = String(b || "");
  if (!a || !b) return 0;
  const la = a.length, lb = b.length;
  const matchDist = Math.floor(Math.max(la, lb) / 2) - 1;
  const aM = Array(la).fill(false), bM = Array(lb).fill(false);
  let matches = 0;
  for (let i = 0; i < la; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, lb);
    for (let j = start; j < end; j++) {
      if (bM[j]) continue;
      if (a[i] !== b[j]) continue;
      aM[i] = true; bM[j] = true; matches++; break;
    }
  }
  if (matches === 0) return 0;
  let k = 0, trans = 0;
  for (let i = 0; i < la; i++) {
    if (!aM[i]) continue;
    while (!bM[k]) k++;
    if (a[i] !== b[k]) trans++;
    k++;
  }
  trans = trans / 2;
  const m = matches;
  const jaro = (m / la + m / lb + (m - trans) / m) / 3;
  let prefix = 0, maxPrefix = 4;
  for (let i = 0; i < Math.min(maxPrefix, la, lb); i++) {
    if (a[i] === b[i]) prefix++; else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

export function runAuditOnClusters(clusters: any[]) {
  const findings: any[] = [];

  // Rule A: Duplicate national IDs across clusters/records
  const idMap = new Map<string, any[]>();
  clusters.forEach((c) => {
    (c.records || []).forEach((r: any) => {
      const id = String(r.nationalId || "").trim();
      if (!id) return;
      const arr = idMap.get(id) || [];
      arr.push(r);
      idMap.set(id, arr);
    });
  });
  for (const [id, records] of idMap.entries()) {
    if (records.length > 1) {
      findings.push({
        type: "DUPLICATE_ID",
        severity: "high",
        description: `National ID ${id} appears in ${records.length} records.`,
        records,
      });
    }
  }

  // Rule B: Woman with multiple distinct husband names (possible multiple husbands)
  const womanMap = new Map<string, Set<string>>();
  const womanRecords = new Map<string, any[]>();
  clusters.forEach((c) => {
    (c.records || []).forEach((r: any) => {
      const key = (r.womanName || String(r._internalId || "")).trim();
      const husband = (r.husbandName || "").trim();
      const set = womanMap.get(key) || new Set<string>();
      if (husband) set.add(husband);
      womanMap.set(key, set);
      const arr = womanRecords.get(key) || [];
      arr.push(r);
      womanRecords.set(key, arr);
    });
  });
  for (const [woman, husbandSet] of womanMap.entries()) {
    if (husbandSet.size > 1) {
      findings.push({
        type: "WOMAN_MULTIPLE_HUSBANDS",
        severity: "high",
        description: `${woman} is associated with ${husbandSet.size} distinct husband names.`,
        records: womanRecords.get(woman) || [],
      });
    }
  }

  // Rule C: High similarity pairs within clusters (possible duplicates)
  clusters.forEach((c) => {
    const recs = c.records || [];
    for (let i = 0; i < recs.length; i++) {
      for (let j = i + 1; j < recs.length; j++) {
        const a = recs[i], b = recs[j];
        const nameScore = jaroWinkler(String(a.womanName || ""), String(b.womanName || ""));
        const husbandScore = jaroWinkler(String(a.husbandName || ""), String(b.husbandName || ""));
        // Heuristic: both name scores high -> issue
        if (nameScore >= 0.92 && husbandScore >= 0.9) {
          findings.push({
            type: "HIGH_SIMILARITY",
            severity: "medium",
            description: `Records "${a.womanName}" and "${b.womanName}" have high similarity (name:${nameScore.toFixed(2)}, husband:${husbandScore.toFixed(2)}).`,
            records: [a, b],
          });
        }
      }
    }
  });

  // Rule D: Duplicate couple (same woman+husband across different records)
  const coupleMap = new Map<string, any[]>();
  clusters.forEach((c) => {
    (c.records || []).forEach((r: any) => {
      const key = `${String(r.womanName || "").toLowerCase()}|${String(r.husbandName || "").toLowerCase()}`;
      const arr = coupleMap.get(key) || [];
      arr.push(r);
      coupleMap.set(key, arr);
    });
  });
  for (const [k, arr] of coupleMap.entries()) {
    if (arr.length > 1) {
      findings.push({
        type: "DUPLICATE_COUPLE",
        severity: "medium",
        description: `Couple (${k}) appears ${arr.length} times.`,
        records: arr,
      });
    }
  }

  return findings;
}
