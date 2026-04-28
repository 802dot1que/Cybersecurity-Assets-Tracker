import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { AuditEntry } from "../types";

const ACTION_OPTIONS = [
  "ingest", "override", "clear", "create_manual", "delete", "bulk_delete",
  "merge", "ip_add", "ip_edit", "ip_delete",
];

const ACTION_BADGE: Record<string, string> = {
  ingest:        "bg-blue-100 text-blue-800",
  override:      "bg-amber-100 text-amber-800",
  clear:         "bg-slate-100 text-slate-700",
  create_manual: "bg-emerald-100 text-emerald-800",
  delete:        "bg-red-100 text-red-800",
  bulk_delete:   "bg-red-100 text-red-800",
  ip_add:        "bg-indigo-100 text-indigo-800",
  ip_edit:       "bg-indigo-100 text-indigo-800",
  ip_delete:     "bg-red-100 text-red-800",
};

export default function Audit() {
  const [q, setQ]               = useState("");
  const [action, setAction]     = useState("");
  const [field, setField]       = useState("");
  const [entityId, setEntityId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");
  const [limit, setLimit]       = useState(200);

  const params = new URLSearchParams();
  if (q)        params.set("q", q);
  if (action)   params.set("action", action);
  if (field)    params.set("field", field);
  if (entityId) params.set("entity_id", entityId);
  if (dateFrom) params.set("date_from", new Date(dateFrom).toISOString());
  if (dateTo)   params.set("date_to", new Date(dateTo).toISOString());
  params.set("limit", String(limit));

  const { data, isLoading, refetch } = useQuery<AuditEntry[]>({
    queryKey: ["audit", q, action, field, entityId, dateFrom, dateTo, limit],
    queryFn: async () => (await api.get(`/audit?${params}`)).data,
  });

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit Log</h1>

      {/* ── Filters ── */}
      <div className="card p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Text search</label>
            <input
              className="input w-full"
              placeholder="field, value, action…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Action</label>
            <select className="input w-full" value={action} onChange={e => setAction(e.target.value)}>
              <option value="">All</option>
              {ACTION_OPTIONS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Field</label>
            <input
              className="input w-full"
              placeholder="hostname, os…"
              value={field}
              onChange={e => setField(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Asset ID</label>
            <input
              className="input w-full"
              type="number"
              placeholder="e.g. 42"
              value={entityId}
              onChange={e => setEntityId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input className="input w-full" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input className="input w-full" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button className="btn btn-primary text-xs" onClick={() => refetch()}>
            Apply filters
          </button>
          <button className="btn text-xs" onClick={() => {
            setQ(""); setAction(""); setField(""); setEntityId("");
            setDateFrom(""); setDateTo("");
          }}>
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            Show
            <select className="input w-20" value={limit} onChange={e => setLimit(Number(e.target.value))}>
              {[50, 100, 200, 500, 1000].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            entries
            {data && <span>— {data.length} shown</span>}
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-slate-500 text-sm">Loading…</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-left text-xs">
              <tr>
                <th className="p-2 whitespace-nowrap">When</th>
                <th className="p-2">Asset</th>
                <th className="p-2">Action</th>
                <th className="p-2">Field</th>
                <th className="p-2">Old value</th>
                <th className="p-2">New value</th>
                <th className="p-2">User</th>
                <th className="p-2">Document</th>
              </tr>
            </thead>
            <tbody>
              {!data?.length && (
                <tr>
                  <td colSpan={8} className="p-4 text-center text-slate-400">
                    No entries match the current filters.
                  </td>
                </tr>
              )}
              {data?.map(r => (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="p-2 whitespace-nowrap text-slate-500 text-xs">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-2">
                    {r.entity_type === "asset" && r.entity_id ? (
                      <Link
                        to={`/assets/${r.entity_id}`}
                        className="text-indigo-600 hover:underline font-mono text-xs"
                      >
                        {r.asset_hostname || `#${r.entity_id}`}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {r.entity_type} #{r.entity_id}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    <span className={`badge text-xs ${ACTION_BADGE[r.action] ?? "bg-slate-100 text-slate-700"}`}>
                      {r.action}
                    </span>
                  </td>
                  <td className="p-2 text-xs text-slate-600">{r.field || "—"}</td>
                  <td className="p-2 font-mono text-xs text-slate-500 max-w-[140px] truncate" title={r.old_value ?? ""}>
                    {r.old_value || "—"}
                  </td>
                  <td className="p-2 font-mono text-xs max-w-[140px] truncate" title={r.new_value ?? ""}>
                    {r.new_value || "—"}
                  </td>
                  <td className="p-2 text-xs">
                    {r.user_name
                      ? <span title={r.user_email ?? ""}>{r.user_name}</span>
                      : <span className="text-slate-400">system</span>}
                  </td>
                  <td className="p-2 text-xs text-slate-500 max-w-[120px] truncate" title={r.document_name ?? ""}>
                    {r.document_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
