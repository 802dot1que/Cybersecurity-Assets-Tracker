import { useState } from "react";
import { api } from "../api/client";
import type { AssetPage } from "../types";

type Preview = {
  columns: string[];
  suggested_mapping: Record<string, string | null>;
  suggested_control_columns: Record<string, string | null>;
  sample_rows: Record<string, any>[];
  total_rows: number;
};

type ScanMatch = { id: number; hostname: string | null; mac: string | null; ips: string[] };
type ScanResult = { identifier: string; field: string; matches: ScanMatch[] };

const CANONICAL = [
  "hostname", "mac", "ips",
  "asset_type", "os", "os_version", "os_eos",
  "first_seen", "last_seen",
  "asset_status", "environment", "location",
];

const CONTROL_CODES = ["EDR", "AV", "SIEM", "PATCH", "DLP", "VA", "PAM"];

export default function Upload() {
  const [file, setFile]                   = useState<File | null>(null);
  const [preview, setPreview]             = useState<Preview | null>(null);
  const [mapping, setMapping]             = useState<Record<string, string>>({});
  const [controlMapping, setControlMapping] = useState<Record<string, string>>({});
  const [source, setSource]               = useState("excel");
  const [result, setResult]               = useState<any>(null);
  const [error, setError]                 = useState<string | null>(null);
  const [busy, setBusy]                   = useState(false);

  // ── Pre-ingest confirmation state ──────────────────────────────────────────
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [scanning, setScanning]         = useState(false);
  const [scanResults, setScanResults]   = useState<ScanResult[]>([]);
  // checked[i] = true means "ingest / merge"; false = "skip this existing asset"
  const [checked, setChecked]           = useState<Record<number, boolean>>({});

  // ── Preview ────────────────────────────────────────────────────────────────
  async function doPreview() {
    if (!file) return;
    setError(null); setResult(null); setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post<Preview>("/ingestion/preview", fd);
      setPreview(r.data);
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.data.suggested_mapping)) if (v) m[k] = v;
      setMapping(m);
      const cm: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.data.suggested_control_columns)) if (v) cm[k] = v;
      setControlMapping(cm);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Preview failed");
    } finally { setBusy(false); }
  }

  // ── Scan sample rows for potential duplicates ──────────────────────────────
  async function scanForDuplicates(p: Preview, m: Record<string, string>): Promise<ScanResult[]> {
    const results: ScanResult[] = [];
    const seen = new Set<string>();

    for (const row of p.sample_rows) {
      const hostnameCol = m["hostname"];
      const hostname    = hostnameCol ? String(row[hostnameCol] ?? "").trim() : "";
      if (hostname && !seen.has(`h:${hostname.toLowerCase()}`)) {
        seen.add(`h:${hostname.toLowerCase()}`);
        try {
          const { data } = await api.get<AssetPage>("/assets", { params: { q: hostname, page_size: 5 } });
          if (data.items.length > 0) {
            results.push({
              identifier: hostname,
              field: "Hostname",
              matches: data.items.map(a => ({ id: a.id, hostname: a.hostname, mac: a.mac, ips: a.ips })),
            });
          }
        } catch { /* ignore per-row errors */ }
      }

      const macCol = m["mac"];
      const mac    = macCol ? String(row[macCol] ?? "").trim() : "";
      if (mac && !seen.has(`m:${mac.toLowerCase()}`)) {
        seen.add(`m:${mac.toLowerCase()}`);
        try {
          const { data } = await api.get<AssetPage>("/assets", { params: { q: mac, page_size: 5 } });
          if (data.items.length > 0) {
            results.push({
              identifier: mac,
              field: "MAC Address",
              matches: data.items.map(a => ({ id: a.id, hostname: a.hostname, mac: a.mac, ips: a.ips })),
            });
          }
        } catch { /* ignore */ }
      }

      const ipsCol  = m["ips"];
      const firstIp = ipsCol ? String(row[ipsCol] ?? "").split(",")[0]?.trim() : "";
      if (firstIp && !seen.has(`i:${firstIp}`)) {
        seen.add(`i:${firstIp}`);
        try {
          const { data } = await api.get<AssetPage>("/assets", { params: { q: firstIp, page_size: 5 } });
          if (data.items.length > 0) {
            results.push({
              identifier: firstIp,
              field: "IP Address",
              matches: data.items.map(a => ({ id: a.id, hostname: a.hostname, mac: a.mac, ips: a.ips })),
            });
          }
        } catch { /* ignore */ }
      }
    }

    return results;
  }

  // ── Open confirmation modal + kick off background scan ────────────────────
  async function handleIngestClick() {
    if (!preview) return;
    setConfirmOpen(true);
    setScanResults([]);
    setChecked({});
    setScanning(true);
    try {
      const found = await scanForDuplicates(preview, mapping);
      setScanResults(found);
      // Default: all checked (will ingest/merge)
      const initial: Record<number, boolean> = {};
      found.forEach((_, i) => { initial[i] = true; });
      setChecked(initial);
    } finally {
      setScanning(false);
    }
  }

  // ── Compute skip_asset_ids from unchecked scan results ────────────────────
  function buildSkipIds(): number[] {
    const ids = new Set<number>();
    scanResults.forEach((sr, i) => {
      if (!checked[i]) {
        sr.matches.forEach(m => ids.add(m.id));
      }
    });
    return [...ids];
  }

  // ── Actual ingest ─────────────────────────────────────────────────────────
  async function doIngest() {
    if (!file) return;
    setConfirmOpen(false);
    setError(null); setBusy(true);
    const skipIds = buildSkipIds();
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("control_mapping", JSON.stringify(controlMapping));
    fd.append("source", source);
    fd.append("skip_asset_ids", JSON.stringify(skipIds));
    try {
      const r = await api.post("/ingestion/upload", fd);
      setResult(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  }

  const detectedCount = preview ? Object.values(controlMapping).filter(Boolean).length : 0;
  const mappedFields  = preview ? CANONICAL.filter(f => mapping[f]) : [];

  // Summary counts for the modal
  const dupCount      = scanResults.length;
  const skipCount     = scanResults.filter((_, i) => !checked[i]).length;
  const selectedCount = dupCount - skipCount;

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-semibold">Upload Excel</h1>

      <div className="card p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); setResult(null); }}
            className="text-sm"
          />
          <input
            className="input w-56"
            placeholder="source name (e.g. CMDB, NDR)"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <div className="flex gap-2 ml-auto">
            <button className="btn" onClick={doPreview} disabled={!file || busy}>1 · Preview</button>
            <button
              className="btn btn-primary"
              onClick={handleIngestClick}
              disabled={!preview || busy}
            >
              2 · Ingest
            </button>
          </div>
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {file && !preview && <div className="text-xs text-slate-500">Click <b>Preview</b> to detect columns.</div>}
      </div>

      {preview && (
        <>
          <div className="card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-semibold">Asset fields</h2>
              <span className="text-xs text-slate-500">{preview.total_rows} rows · {preview.columns.length} columns</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {CANONICAL.map((f) => (
                <div key={f} className="flex items-center gap-2">
                  <label className="w-28 text-sm font-medium text-slate-700">{f}</label>
                  <select
                    className="input flex-1"
                    value={mapping[f] || ""}
                    onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })}
                  >
                    <option value="">— ignore —</option>
                    {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-semibold">Security control columns</h2>
              <span className="text-xs text-slate-500">{detectedCount} detected</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Pick the column for each control. Cell values are interpreted as
              <span className="mx-1 badge bg-emerald-100 text-emerald-800">Yes → Installed</span>
              <span className="badge bg-red-100 text-red-800">No → Missing</span>
              <span className="ml-1 badge bg-slate-100 text-slate-700">other → Unknown</span>
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              {CONTROL_CODES.map((code) => (
                <div key={code} className="flex items-center gap-2">
                  <label className="w-20 text-sm font-medium text-slate-700">{code}</label>
                  <select
                    className="input flex-1"
                    value={controlMapping[code] || ""}
                    onChange={(e) => setControlMapping({ ...controlMapping, [code]: e.target.value })}
                  >
                    <option value="">— ignore —</option>
                    {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-semibold mb-2">Sample rows</h2>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead className="bg-slate-100">
                  <tr>{preview.columns.map((c) => <th key={c} className="px-2 py-1 text-left whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.sample_rows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {preview.columns.map((c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{String(row[c] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {result && (
        <div className="card p-4 bg-emerald-50 border-emerald-200 text-sm">
          Ingestion complete · created <b>{result.created}</b> · merged <b>{result.merged}</b>
          {result.skipped > 0 && <> · skipped <b>{result.skipped}</b></>}
          {result.errors > 0 && <> · errors <b>{result.errors}</b></>}.
        </div>
      )}

      {/* ── Pre-ingest confirmation + duplicate scan modal ── */}
      {confirmOpen && preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">

            <h2 className="text-lg font-semibold mb-1">Review Before Ingesting</h2>
            <p className="text-sm text-slate-500 mb-4">
              Check the summary and potential duplicates below. Uncheck any you want to skip.
            </p>

            {/* Ingestion summary */}
            <div className="bg-slate-50 rounded-lg p-4 mb-4 text-sm grid grid-cols-2 gap-y-2 gap-x-6">
              <div><span className="text-slate-500">File:</span> <span className="font-medium">{file?.name}</span></div>
              <div><span className="text-slate-500">Source:</span> <span className="font-medium">{source || "—"}</span></div>
              <div><span className="text-slate-500">Total rows:</span> <span className="font-medium">{preview.total_rows}</span></div>
              <div><span className="text-slate-500">Controls mapped:</span> <span className="font-medium">{detectedCount}</span></div>
              {!scanning && dupCount > 0 && (
                <>
                  <div>
                    <span className="text-slate-500">Duplicates detected:</span>{" "}
                    <span className="font-medium text-amber-700">{dupCount}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">Selected to merge:</span>{" "}
                    <span className="font-medium text-indigo-700">{selectedCount}</span>
                    {skipCount > 0 && (
                      <span className="ml-2 text-slate-500">({skipCount} will be skipped)</span>
                    )}
                  </div>
                </>
              )}
              <div className="col-span-2">
                <span className="text-slate-500">Asset fields mapped:</span>{" "}
                <span className="font-medium">
                  {mappedFields.length > 0 ? mappedFields.join(", ") : "none"}
                </span>
              </div>
            </div>

            {/* Duplicate scan results */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-sm">Duplicate / Similar Asset Scan</h3>
                <span className="text-xs text-slate-400">(based on sample rows)</span>
                {scanning && (
                  <span className="ml-auto text-xs text-indigo-600 animate-pulse">Scanning…</span>
                )}
              </div>

              {!scanning && dupCount === 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <span>✓</span>
                  <span>No potential duplicates found in sample rows.</span>
                </div>
              )}

              {!scanning && dupCount > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                    <span>⚠</span>
                    <span>
                      <b>{dupCount}</b> potential duplicate{dupCount !== 1 ? "s" : ""} detected in sample rows.
                      Uncheck any you want to skip. The full file may contain more.
                    </span>
                  </div>

                  {/* Select all / deselect all */}
                  <div className="flex items-center gap-3 mb-1 px-1">
                    <button
                      className="text-xs text-indigo-600 hover:underline"
                      onClick={() => {
                        const next: Record<number, boolean> = {};
                        scanResults.forEach((_, i) => { next[i] = true; });
                        setChecked(next);
                      }}
                    >Select all</button>
                    <button
                      className="text-xs text-slate-500 hover:underline"
                      onClick={() => {
                        const next: Record<number, boolean> = {};
                        scanResults.forEach((_, i) => { next[i] = false; });
                        setChecked(next);
                      }}
                    >Deselect all</button>
                  </div>

                  {scanResults.map((sr, i) => (
                    <div
                      key={i}
                      className={`border rounded-lg p-3 text-sm transition-colors ${
                        checked[i] ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {/* Checkbox: checked = merge, unchecked = skip */}
                        <input
                          type="checkbox"
                          id={`dup-${i}`}
                          checked={!!checked[i]}
                          onChange={(e) => setChecked(prev => ({ ...prev, [i]: e.target.checked }))}
                          className="w-4 h-4 accent-indigo-600 cursor-pointer"
                        />
                        <label htmlFor={`dup-${i}`} className="cursor-pointer flex items-center gap-2 flex-1">
                          <span className={`badge text-xs ${checked[i] ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"}`}>
                            {sr.field}
                          </span>
                          <span className="font-mono font-medium">{sr.identifier}</span>
                        </label>
                        <span className="text-slate-400 text-xs">
                          {sr.matches.length} existing match{sr.matches.length !== 1 ? "es" : ""}
                        </span>
                        <span className={`text-xs font-medium ${checked[i] ? "text-indigo-600" : "text-slate-400"}`}>
                          {checked[i] ? "Will merge" : "Will skip"}
                        </span>
                      </div>
                      <div className="space-y-1 ml-6">
                        {sr.matches.slice(0, 3).map((m) => (
                          <div key={m.id} className="flex items-center gap-3 text-xs text-slate-600 bg-white border rounded px-2 py-1">
                            <a
                              href={`/assets/${m.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-700 hover:underline font-medium"
                            >
                              {m.hostname || `Asset #${m.id}`}
                            </a>
                            {m.mac && <span className="font-mono text-slate-500">{m.mac}</span>}
                            {m.ips.length > 0 && <span className="font-mono text-slate-500">{m.ips.slice(0, 2).join(", ")}</span>}
                          </div>
                        ))}
                        {sr.matches.length > 3 && (
                          <div className="text-xs text-slate-400 px-2">
                            +{sr.matches.length - 3} more…
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {scanning && (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn" onClick={() => setConfirmOpen(false)}>← Cancel</button>
              <button
                className="btn bg-indigo-600 text-white hover:bg-indigo-700"
                disabled={scanning || busy}
                onClick={doIngest}
              >
                {scanning ? "Scanning…" : `Confirm & Ingest${skipCount > 0 ? ` (skip ${skipCount})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
