import { useState } from "react";
import { api } from "../api/client";

type Preview = {
  columns: string[];
  suggested_mapping: Record<string, string | null>;
  sample_rows: Record<string, any>[];
  total_rows: number;
};

const CANONICAL = [
  "hostname", "mac", "ips",
  "asset_type", "os", "os_version", "os_eos",
  "first_seen", "last_seen",
];

export default function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [source, setSource] = useState("excel");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function doPreview() {
    if (!file) return;
    setError(null); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const r = await api.post<Preview>("/ingestion/preview", fd);
      setPreview(r.data);
      const m: Record<string, string> = {};
      for (const [k, v] of Object.entries(r.data.suggested_mapping)) if (v) m[k] = v;
      setMapping(m);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Preview failed");
    }
  }

  async function doUpload() {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(mapping));
    fd.append("source", source);
    try {
      const r = await api.post("/ingestion/upload", fd);
      setResult(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Upload failed");
    }
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <h1 className="text-xl font-semibold">Upload Excel</h1>
      <div className="card p-4 space-y-3">
        <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} />
        <input className="input w-64" placeholder="source name (e.g. CMDB, NDR)" value={source} onChange={e => setSource(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn" onClick={doPreview} disabled={!file}>Preview</button>
          <button className="btn btn-primary" onClick={doUpload} disabled={!preview}>Ingest</button>
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
      </div>

      {preview && (
        <div className="card p-4">
          <h2 className="font-semibold mb-2">Column mapping ({preview.total_rows} rows)</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500"><th className="py-1">Canonical field</th><th>Excel column</th></tr></thead>
            <tbody>
              {CANONICAL.map(f => (
                <tr key={f} className="border-t">
                  <td className="py-1 font-medium">{f}</td>
                  <td>
                    <select className="input w-72" value={mapping[f] || ""}
                            onChange={e => setMapping({ ...mapping, [f]: e.target.value })}>
                      <option value="">— ignore —</option>
                      {preview.columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="card p-4 bg-emerald-50 border-emerald-200 text-sm">
          Ingestion complete · created <b>{result.created}</b> · merged <b>{result.merged}</b> · errors <b>{result.errors}</b>.
        </div>
      )}
    </div>
  );
}
