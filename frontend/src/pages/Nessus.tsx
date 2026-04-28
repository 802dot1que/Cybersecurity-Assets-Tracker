import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import type {
  NessusStatusOut,
  NessusScanOut,
  SyncLogOut,
  VulnerabilityOut,
  VulnPage,
} from "../types";

const api = axios.create({ baseURL: "/api/nessus" });

const SEVERITY_COLOR: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high:     "bg-orange-100 text-orange-800",
  medium:   "bg-yellow-100 text-yellow-800",
  low:      "bg-blue-100 text-blue-800",
  info:     "bg-slate-100 text-slate-600",
};

function StatusBadge({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-sm font-medium ${
      connected ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"
    }`}>
      <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
      {label}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export default function Nessus() {
  const [status, setStatus] = useState<NessusStatusOut | null>(null);
  const [scans, setScans] = useState<NessusScanOut[]>([]);
  const [syncs, setSyncs] = useState<SyncLogOut[]>([]);
  const [vulns, setVulns] = useState<VulnPage | null>(null);
  const [page, setPage] = useState(1);
  const [severityFilter, setSeverityFilter] = useState("");
  const [syncing, setSyncing] = useState<number | "all" | null>(null);
  const [scansError, setScansError] = useState<string | null>(null);

  const loadStatus = useCallback(() => {
    api.get<NessusStatusOut>("/status").then(r => setStatus(r.data)).catch(() =>
      setStatus({ connected: false, status: null, code: null, error: "Failed to reach backend" })
    );
  }, []);

  const loadScans = useCallback(() => {
    setScansError(null);
    api.get<NessusScanOut[]>("/scans")
      .then(r => setScans(r.data))
      .catch(e => setScansError(e.response?.data?.detail ?? "Could not load scans"));
  }, []);

  const loadSyncs = useCallback(() => {
    api.get<SyncLogOut[]>("/syncs").then(r => setSyncs(r.data)).catch(() => {});
  }, []);

  const loadVulns = useCallback(() => {
    const params: Record<string, string | number> = { page, page_size: 50 };
    if (severityFilter) params.severity = severityFilter;
    api.get<VulnPage>("/vulnerabilities", { params })
      .then(r => setVulns(r.data))
      .catch(() => {});
  }, [page, severityFilter]);

  useEffect(() => { loadStatus(); loadScans(); loadSyncs(); loadVulns(); }, [loadStatus, loadScans, loadSyncs, loadVulns]);

  async function triggerSync(scanId?: number) {
    setSyncing(scanId ?? "all");
    try {
      const url = scanId != null ? `/sync/${scanId}` : "/sync";
      await api.post(url);
      loadSyncs();
      loadVulns();
      loadStatus();
    } catch (e: any) {
      alert(e.response?.data?.detail ?? "Sync failed");
    } finally {
      setSyncing(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Nessus Integration</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Pull scan results from Nessus Professional and correlate vulnerabilities with your assets.
          </p>
        </div>
        <button
          onClick={() => triggerSync()}
          disabled={syncing !== null}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50"
        >
          {syncing === "all" ? "Syncing…" : "Sync All Completed Scans"}
        </button>
      </div>

      {/* Connection Status */}
      <SectionCard title="Connection Status">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            {status ? (
              <StatusBadge
                connected={status.connected}
                label={status.connected ? `Connected · ${status.status ?? ""}` : "Not connected"}
              />
            ) : (
              <span className="text-slate-400 text-sm">Checking…</span>
            )}
            <button onClick={loadStatus} className="text-xs text-indigo-600 underline">Refresh</button>
          </div>
          {status && !status.connected && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {status.error}
            </div>
          )}
          <div className="mt-2 rounded-md bg-slate-50 border border-slate-200 p-4 text-sm space-y-2">
            <p className="font-medium text-slate-700">API Configuration</p>
            <p className="text-slate-500">
              Set the following in your <code className="bg-slate-100 px-1 rounded">.env</code> file, then restart the stack:
            </p>
            <pre className="bg-white border border-slate-200 rounded p-3 text-xs text-slate-700 overflow-x-auto">{`NESSUS_URL=https://<nessus-host>:8834
NESSUS_ACCESS_KEY=<your-access-key>
NESSUS_SECRET_KEY=<your-secret-key>
NESSUS_VERIFY_SSL=false`}</pre>
            <p className="text-slate-400 text-xs">
              API keys are generated in Nessus UI → My Account → API Keys → Generate.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Available Scans */}
      <SectionCard title="Available Scans">
        {scansError ? (
          <p className="text-sm text-red-600">{scansError}</p>
        ) : scans.length === 0 ? (
          <p className="text-sm text-slate-400">No scans found. Connect Nessus and run a scan first.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Last Modified</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {scans.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-800">{s.name}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        s.status === "completed" ? "bg-green-100 text-green-700" :
                        s.status === "running"   ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>{s.status}</span>
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{s.type ?? "—"}</td>
                    <td className="py-2 pr-4 text-slate-400 text-xs">
                      {s.last_modification_date
                        ? new Date(s.last_modification_date * 1000).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2">
                      {s.status === "completed" && (
                        <button
                          onClick={() => triggerSync(s.id)}
                          disabled={syncing !== null}
                          className="text-xs text-indigo-600 hover:underline disabled:opacity-40"
                        >
                          {syncing === s.id ? "Syncing…" : "Sync"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Sync History */}
      <SectionCard title="Sync History">
        {syncs.length === 0 ? (
          <p className="text-sm text-slate-400">No syncs run yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-4">Started</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Scans</th>
                  <th className="pb-2 pr-4">Assets Matched</th>
                  <th className="pb-2 pr-4">Vulns Created</th>
                  <th className="pb-2 pr-4">Vulns Updated</th>
                  <th className="pb-2">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {syncs.map(s => {
                  const dur = s.finished_at
                    ? Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 1000)
                    : null;
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-4 text-slate-500 text-xs">
                        {new Date(s.started_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          s.status === "completed" ? "bg-green-100 text-green-700" :
                          s.status === "failed"    ? "bg-red-100 text-red-700" :
                          "bg-yellow-100 text-yellow-700"
                        }`}>{s.status}</span>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{s.scans_processed}</td>
                      <td className="py-2 pr-4 text-slate-600">{s.assets_matched}</td>
                      <td className="py-2 pr-4 text-green-700 font-medium">{s.vulns_created}</td>
                      <td className="py-2 pr-4 text-blue-700">{s.vulns_updated}</td>
                      <td className="py-2 text-slate-400 text-xs">{dur != null ? `${dur}s` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Vulnerabilities */}
      <SectionCard title={`Vulnerabilities${vulns ? ` (${vulns.total.toLocaleString()})` : ""}`}>
        {/* Filters */}
        <div className="flex gap-3 mb-4 flex-wrap">
          {["", "critical", "high", "medium", "low", "info"].map(sv => (
            <button
              key={sv}
              onClick={() => { setSeverityFilter(sv); setPage(1); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                severityFilter === sv
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300"
              }`}
            >
              {sv === "" ? "All" : sv.charAt(0).toUpperCase() + sv.slice(1)}
            </button>
          ))}
        </div>

        {!vulns || vulns.items.length === 0 ? (
          <p className="text-sm text-slate-400">No vulnerabilities found. Run a sync to populate.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                    <th className="pb-2 pr-3">Severity</th>
                    <th className="pb-2 pr-3">Plugin</th>
                    <th className="pb-2 pr-3">Name</th>
                    <th className="pb-2 pr-3">CVE</th>
                    <th className="pb-2 pr-3">CVSS v3</th>
                    <th className="pb-2 pr-3">Host</th>
                    <th className="pb-2 pr-3">Port</th>
                    <th className="pb-2">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {vulns.items.map((v: VulnerabilityOut) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${SEVERITY_COLOR[v.severity] ?? "bg-slate-100 text-slate-600"}`}>
                          {v.severity}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-slate-400 text-xs">{v.plugin_id}</td>
                      <td className="py-2 pr-3 text-slate-800 max-w-xs truncate" title={v.plugin_name}>{v.plugin_name}</td>
                      <td className="py-2 pr-3 text-xs font-mono text-slate-600">{v.cve_id ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-600 text-xs">
                        {v.cvss_v3_score != null ? v.cvss_v3_score.toFixed(1) : v.cvss_score != null ? v.cvss_score.toFixed(1) : "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-500 text-xs font-mono">{v.nessus_ip ?? v.nessus_hostname ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-400 text-xs">{v.port != null ? `${v.port}/${v.protocol ?? ""}` : "—"}</td>
                      <td className="py-2 text-slate-400 text-xs">{new Date(v.last_seen).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {vulns.total_pages > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-slate-500">
                  Page {vulns.page} of {vulns.total_pages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 border rounded text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(vulns.total_pages, p + 1))}
                    disabled={page === vulns.total_pages}
                    className="px-3 py-1 border rounded text-slate-600 disabled:opacity-40 hover:bg-slate-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SectionCard>
    </div>
  );
}
