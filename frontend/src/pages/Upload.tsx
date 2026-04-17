import { useState } from "react";
import { api } from "../api/client";

type Preview = {
  columns: string[];
  suggested_mapping: Record<string, string | null>;
  suggested_control_columns: Record<string, string | null>;
  sample_rows: Record<string, any>[];
  total_rows: number;
};

const CANONICAL = [
  "hostname", "mac", "ips",
  "asset_type", "os", "os_version", "os_eos",
  "first_seen", "last_seen",
];

const CONTROL_CODES = ["EDR", "AV", "SIEM", "PATCH", "DLP", "VA", "PAM"];

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [controlMapping, setControlMapping] = useState<Record<string, string>>({});
  const [source, setSource] = useState("excel");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  async function doUpload() {
    if (!file) return;
    setError(null); setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("control_mapping", JSON.stringify(controlMapping));
    fd.append("source", source);
    try {
      const r = await api.post("/ingestion/upload", fd);
      setResult(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Upload failed");
    } finally { setBusy(false); }
  }

  const detectedCount = preview ? Object.values(controlMapping).filter(Boolean).length : 0;

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
            <button className="btn btn-primary" onClick={doUpload} disabled={!preview || busy}>2 · Ingest</button>
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
          Ingestion complete · created <b>{result.created}</b> · merged <b>{result.merged}</b> · errors <b>{result.errors}</b>.
        </div>
      )}
    </div>
  );
}
