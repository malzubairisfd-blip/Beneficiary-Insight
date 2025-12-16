import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileDown, Loader2, CheckCircle, XCircle, Database, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

/**
 * Renderer Export page — calls electronAPI.generateExport(cacheId)
 */
export default function ExportPage() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadHistory, setDownloadHistory] = useState<any[]>([]);
  const [recordCount, setRecordCount] = useState(0);
  const [clusterCount, setClusterCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    const checkCache = async () => {
      setInitialLoading(true);
      const cacheId = sessionStorage.getItem("cacheId");
      if (!cacheId) {
        setIsReady(false);
        setInitialLoading(false);
        toast({ title: "No Data Found", description: "Please start from the upload page to generate data for export.", variant: "destructive" });
        return;
      }
      try {
        const res = await (window as any).electronAPI.cacheGet(cacheId);
        if (!res.ok) throw new Error(res.error || "Failed to fetch cached data");
        const data = res.data || {};
        const rows = data.rows || data.Rows || [];
        const clusters = data.clusters || [];
        setRecordCount(rows.length);
        setClusterCount(clusters.length);
        setIsReady(rows.length > 0);
        if (rows.length === 0) {
          toast({ title: "No Records Found", description: "The cached data is empty. Please re-upload your file.", variant: "destructive" });
        }
      } catch (err: any) {
        setIsReady(false);
        toast({ title: "Error Loading Data", description: String(err), variant: "destructive" });
      } finally {
        setInitialLoading(false);
      }
    };
    checkCache();
  }, [toast]);

  async function handleGenerateAndDownload() {
    const cacheId = sessionStorage.getItem("cacheId");
    if (!cacheId) {
      toast({ title: "No cache", description: "Please upload & run clustering first.", variant: "destructive" });
      return;
    }
    setLoading(true);
    setProgress(5);
    try {
      const res = await (window as any).electronAPI.generateExport(cacheId);
      if (!res.ok) throw new Error(res.error || "Export failed");
      setProgress(100);
      toast({ title: "Report Saved", description: `Saved to ${res.path}` });
      setDownloadHistory((d) => [{ fileName: res.path, createdAt: new Date().toLocaleString(), path: res.path }, ...d]);
    } catch (err: any) {
      toast({ title: "Generation Failed", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Advanced Export Workflow</CardTitle>
              <CardDescription>Generate and download your comprehensive beneficiary analysis report in a single step.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {initialLoading ? (
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              <div>Loading data from cache…</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-6 items-center">
                <div className="flex items-center gap-3 text-lg font-medium">
                  <Users className="h-6 w-6 text-primary" />
                  <span>{recordCount.toLocaleString()} Records Loaded</span>
                </div>
                <div className="flex items-center gap-3 text-lg font-medium">
                  <Database className="h-6 w-6 text-primary" />
                  <span>{clusterCount.toLocaleString()} Clusters Found</span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-2">
                This will generate a single Excel file with multiple sheets: Enriched Data, Review Summary, Cluster Details, and Audit Findings.
              </p>

              <div className="flex gap-3">
                <Button onClick={handleGenerateAndDownload} disabled={loading || !isReady} size="lg">
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                  {loading ? "Generating…" : "Generate and Save Report"}
                </Button>
              </div>

              {loading && (
                <div className="mt-4">
                  <Progress value={progress} />
                  <div className="text-sm mt-2">Generating report… {Math.round(progress)}%</div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Download Panel</CardTitle>
        </CardHeader>
        <CardContent>
          {downloadHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground">Generated reports will appear here after a successful export.</div>
          ) : (
            <div className="space-y-2">
              {downloadHistory.map((v, i) => (
                <div key={i} className="flex justify-between items-center border p-2 rounded">
                  <div>
                    <div className="font-medium">{v.fileName}</div>
                    <div className="text-xs text-muted-foreground">{v.createdAt}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => {
                      // open containing folder (desktop)
                      // Not implemented in this snippet — you can add ipc to open path
                      toast({ title: "Saved at", description: v.path });
                    }}>Show</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
