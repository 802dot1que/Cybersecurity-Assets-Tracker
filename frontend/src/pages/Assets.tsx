import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { AssetListItem } from "../types";

const ASSET_TYPES = [
  "Server", "Workstation", "Router", "Switch", "Firewall", "Hypervisor",
  "Printer", "IPPhone", "IPCamera", "URL", "LoadBalancer", "Unknown",
];

export default function Assets() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") || "");
  const type = params.get("asset_type") || "";
  const missingControl = params.get("missing_control") || "";
  const installedControl = params.get("installed_control") || "";
  const hasConflicts = params.get("has_conflicts") === "1";
  const eosOnly = params.get("eos_only") === "1";
  const unknownOnly = params.get("unknown_only") === "1";

  const { data, isLoading } = useQuery({
    queryKey: ["assets", q, type, missingControl, installedControl, hasConflicts, eosOnly, unknownOnly],
    queryFn: async () =>
      (await api.get<AssetListItem[]>("/assets", {
        params: {
          q: q || undefined,
          asset_type: type || undefined,
          missing_control: missingControl || undefined,
          installed_control: installedControl || undefined,
          has_conflicts: hasConflicts || undefined,
          eos_only: eosOnly || undefined,
          unknown_only: unknownOnly || undefined,
        },
      })).data,
  });

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  }

  function clearAllFilters() { setParams(new URLSearchParams()); setQ(""); }

  const activeFilters: { label: string; onClear: () => void }[] = [];
  if (type) activeFilters.push({ label: `type: ${type}`, onClear: () => setParam("asset_type", null) });
  if (missingControl) activeFilters.push({ label: `missing ${missingControl}`, onClear: () => setParam("missing_control", null) });
  if (installedControl) activeFilters.push({ label: `installed ${installedControl}`, onClear: () => setParam("installed_control", null) });
  if (hasConflicts) activeFilters.push({ label: "has conflicts", onClear: () => setParam("has_conflicts", null) });
  if (eosOnly) activeFilters.push({ label: "EOS OS only", onClear: () => setParam("eos_only", null) });
  if (unknownOnly) activeFilters.push({ label: "Unknown type only", onClear: () => setParam("unknown_only", null) });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <span className="text-slate-500 text-sm">{data?.length ?? 0} shown</span>
        <input
          className="input w-64 ml-auto"
          placeholder="Search hostname / MAC / IP…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setParam("q", e.target.value); }}
        />
        <select
          className="input w-44"
          value={type}
          onChange={(e) => setParam("asset_type", e.target.value)}
        >
          <option value="">All types</option>
          {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <span key={f.label} className="badge bg-indigo-100 text-indigo-800">
              {f.label}
              <button className="ml-1 text-indigo-900/70 hover:text-indigo-900" onClick={f.onClear}>×</button>
            </span>
          ))}
          <button className="text-xs text-slate-500 hover:text-slate-800 underline" onClick={clearAllFilters}>clear all</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="p-2">Hostname</th>
              <th>Type</th>
              <th>MAC</th>
              <th>IPs</th>
              <th>OS</th>
              <th>Criticality</th>
              <th>Conflicts</th>
              <th>Conf.</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="p-6 text-center text-slate-500">Loading…</td></tr>}
            {!isLoading && data?.map((a) => (
              <tr key={a.id} className="border-t hover:bg-slate-50">
                <td className="p-2">
                  <Link className="text-indigo-700 hover:underline font-medium" to={`/assets/${a.id}`}>
                    {a.hostname || `Asset #${a.id}`}
                  </Link>
                </td>
                <td>{a.asset_type || "—"}</td>
                <td className="font-mono text-xs">{a.mac || "—"}</td>
                <td className="text-xs">{a.ips.join(", ") || "—"}</td>
                <td>{[a.os, a.os_version].filter(Boolean).join(" ")}</td>
                <td>
                  {a.criticality_level && (
                    <span className={`badge ${
                      a.criticality_level === "Critical" ? "bg-red-100 text-red-800" :
                      a.criticality_level === "High" ? "bg-orange-100 text-orange-800" :
                      a.criticality_level === "Medium" ? "bg-yellow-100 text-yellow-800" :
                      "bg-emerald-100 text-emerald-800"
                    }`}>{a.criticality_level}</span>
                  )}
                </td>
                <td>
                  {a.conflict_count > 0 && (
                    <Link to={`/assets/${a.id}`}>
                      <span className="badge bg-amber-100 text-amber-800 cursor-pointer hover:bg-amber-200">
                        {a.conflict_count} conflict{a.conflict_count !== 1 ? "s" : ""}
                      </span>
                    </Link>
                  )}
                </td>
                <td className="tabular-nums">{Math.round(a.confidence_score * 100)}%</td>
                <td className="text-xs">{a.last_seen ? new Date(a.last_seen).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {!isLoading && !data?.length && (
              <tr><td colSpan={9} className="p-8 text-center text-slate-500">No assets match these filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
