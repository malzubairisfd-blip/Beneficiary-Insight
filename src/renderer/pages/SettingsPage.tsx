import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, RotateCcw, Upload, Download, ArrowLeft, Plus, Minus } from "lucide-react";
import Link from "next/link";
import { computePairScore } from "@/lib/scoringClient";

/**
 * Settings page for Electron renderer — uses electronAPI.settingsGet / settingsSave
 * This is an adaptation of your Next-based settings page.
 */

export default function SettingsPage() {
  const [settings, setSettings] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testA, setTestA] = useState({ womanName: "", husbandName: "", nationalId: "", phone: "" });
  const [testB, setTestB] = useState({ womanName: "", husbandName: "", nationalId: "", phone: "" });
  const [lastResult, setLastResult] = useState<any>(null);
  const { toast } = useToast();

  const getDefaultSettings = () => ({
    thresholds: {
      minPair: 0.62,
      minInternal: 0.54,
      blockChunkSize: 3000,
    },
    finalScoreWeights: {
      firstNameScore: 0.15,
      familyNameScore: 0.25,
      advancedNameScore: 0.12,
      tokenReorderScore: 0.1,
      husbandScore: 0.12,
      idScore: 0.08,
      phoneScore: 0.05,
      childrenScore: 0.04,
      locationScore: 0.04,
    },
    rules: {
      enableNameRootEngine: true,
      enableTribalLineage: true,
      enableMaternalLineage: true,
      enablePolygamyRules: true,
    },
  });

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await (window as any).electronAPI.settingsGet();
        if (res.ok && res.settings) {
          // normalize keys and merge defaults
          const defaults = getDefaultSettings();
          const merged = { ...defaults, ...res.settings, thresholds: { ...defaults.thresholds, ...(res.settings.thresholds || {}) }, finalScoreWeights: { ...defaults.finalScoreWeights, ...(res.settings.finalScoreWeights || {}) }, rules: { ...defaults.rules, ...(res.settings.rules || {}) } };
          setSettings(merged);
        } else {
          setSettings(getDefaultSettings());
          toast({ title: "Settings", description: "Using defaults — save to persist.", variant: "default" });
        }
      } catch (err: any) {
        setSettings(getDefaultSettings());
        toast({ title: "Error", description: String(err), variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(path: string, value: any) {
    if (!settings) return;
    const clone = JSON.parse(JSON.stringify(settings));
    const parts = path.split(".");
    let cur: any = clone;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] ?? {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
    setSettings(clone);
  }

  function handleNumericChange(path: string, delta: number) {
    if (!settings) return;
    const parts = path.split(".");
    let cur: any = settings;
    for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]];
    const currentValue = cur[parts[parts.length - 1]] || 0;
    const newValue = Math.max(0, Math.min(1, parseFloat((currentValue + delta).toFixed(2))));
    update(path, newValue);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await (window as any).electronAPI.settingsSave(settings);
      if (!res.ok) throw new Error(res.error || "Save failed");
      toast({ title: "Settings Saved", description: "Your changes have been saved." });
    } catch (err: any) {
      toast({ title: "Save Failed", description: String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    if (!confirm("Reset settings to defaults?")) return;
    setSettings(getDefaultSettings());
    toast({ title: "Settings Reset", description: "Settings reset locally. Click Save to persist." });
  }

  function exportJSON() {
    if (!settings) return;
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "clustering-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file: File | null) {
    if (!file) return;
    const r = new FileReader();
    r.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result));
        if (parsed.thresholds && parsed.rules && parsed.finalScoreWeights) {
          setSettings(parsed);
          toast({ title: "Settings Imported", description: "Preview loaded. Click Save to persist." });
        } else {
          throw new Error("Invalid settings file structure.");
        }
      } catch (err: any) {
        toast({ title: "Import Failed", description: String(err), variant: "destructive" });
      }
    };
    r.readAsText(file);
  }

  function runTestScoring() {
    if (!settings) return toast({ title: "No settings", variant: "destructive" });
    const res = computePairScore(testA, testB, settings);
    setLastResult(res);
  }

  if (loading || !settings) return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /> <span className="ml-2">Loading settings…</span></div>;

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Clustering — Admin Settings</CardTitle>
              <CardDescription>Fine-tune clustering thresholds, weights and rules (offline)</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild><Link href="/upload"><ArrowLeft className="mr-2" /> Upload</Link></Button>
              <Button onClick={exportJSON} variant="outline"><Download className="mr-2" />Export</Button>
              <label className="btn btn-outline cursor-pointer">
                <Upload className="mr-2" />Import
                <input type="file" accept="application/json" className="hidden" onChange={(e) => importJSON(e.target.files?.[0] ?? null)} />
              </label>
              <Button onClick={resetDefaults} variant="destructive"><RotateCcw className="mr-2" />Reset</Button>
              <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="animate-spin mr-2" /> : <Save className="mr-2" />} Save</Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle>Thresholds</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-4">
                <div>
                  <Label>Min Pair Score: <strong className="ml-2">{settings.thresholds.minPair}</strong></Label>
                  <div className="flex gap-2 items-center mt-2">
                    <button className="btn" onClick={() => handleNumericChange("thresholds.minPair", -0.01)}><Minus /></button>
                    <input type="range" min={0} max={1} step={0.01} value={settings.thresholds.minPair} onChange={(e) => update("thresholds.minPair", parseFloat(e.target.value))} />
                    <button className="btn" onClick={() => handleNumericChange("thresholds.minPair", 0.01)}><Plus /></button>
                  </div>
                </div>

                <div>
                  <Label>Min Internal Score: <strong className="ml-2">{settings.thresholds.minInternal}</strong></Label>
                  <div className="flex gap-2 items-center mt-2">
                    <button className="btn" onClick={() => handleNumericChange("thresholds.minInternal", -0.01)}><Minus /></button>
                    <input type="range" min={0} max={1} step={0.01} value={settings.thresholds.minInternal} onChange={(e) => update("thresholds.minInternal", parseFloat(e.target.value))} />
                    <button className="btn" onClick={() => handleNumericChange("thresholds.minInternal", 0.01)}><Plus /></button>
                  </div>
                </div>

                <div>
                  <Label>Block Chunk Size</Label>
                  <Input type="number" value={settings.thresholds.blockChunkSize || 3000} onChange={(e) => update("thresholds.blockChunkSize", parseInt(e.target.value || "3000"))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Final Score Weights</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(settings.finalScoreWeights).map(([k, v]) => (
                  <div key={k} className="p-3 border rounded">
                    <div className="flex justify-between items-center">
                      <Label className="capitalize">{k.replace(/([A-Z])/g, " $1")}</Label>
                      <div className="flex items-center gap-2">
                        <button className="btn" onClick={() => handleNumericChange(`finalScoreWeights.${k}`, -0.01)}><Minus /></button>
                        <Input type="number" step="0.01" value={v} onChange={(e) => update(`finalScoreWeights.${k}`, parseFloat(e.target.value) || 0)} className="w-20 text-center" />
                        <button className="btn" onClick={() => handleNumericChange(`finalScoreWeights.${k}`, 0.01)}><Plus /></button>
                      </div>
                    </div>
                    <input type="range" min={0} max={1} step={0.01} value={v} onChange={(e) => update(`finalScoreWeights.${k}`, parseFloat(e.target.value))} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Rules</CardTitle></CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {Object.entries(settings.rules).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center border p-3 rounded">
                    <div>
                      <Label className="capitalize">{k.replace(/([A-Z])/g, " $1")}</Label>
                    </div>
                    <Switch checked={v} onCheckedChange={(val) => update(`rules.${k}`, val)} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Test Scoring</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div>
                  <Label>Record A - Woman Name</Label>
                  <Input value={testA.womanName} onChange={(e) => setTestA({ ...testA, womanName: e.target.value })} />
                  <Label>Husband</Label>
                  <Input value={testA.husbandName} onChange={(e) => setTestA({ ...testA, husbandName: e.target.value })} />
                </div>
                <div>
                  <Label>Record B - Woman Name</Label>
                  <Input value={testB.womanName} onChange={(e) => setTestB({ ...testB, womanName: e.target.value })} />
                  <Label>Husband</Label>
                  <Input value={testB.husbandName} onChange={(e) => setTestB({ ...testB, husbandName: e.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={runTestScoring}>Run Test</Button>
                  <Button variant="outline" onClick={() => { setTestA({ womanName: "", husbandName: "", nationalId: "", phone: "" }); setTestB({ womanName: "", husbandName: "", nationalId: "", phone: "" }); setLastResult(null); }}>Clear</Button>
                </div>

                {lastResult && (
                  <div className="mt-3 p-3 border rounded bg-muted">
                    <div className="font-bold text-lg">Score: {lastResult.score.toFixed(4)}</div>
                    <div className="text-sm mt-2">Compare to minPair: <b>{settings.thresholds.minPair}</b></div>
                    <details className="mt-2">
                      <summary>View Breakdown</summary>
                      <pre className="text-xs mt-2 p-2 bg-background rounded">{JSON.stringify(lastResult.breakdown, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
