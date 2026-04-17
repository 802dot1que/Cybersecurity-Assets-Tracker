import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { AssetListItem, AssetPage } from "../types";

// ── Constants ────────────────────────────────────────────────────────────────
const ASSET_TYPES = [
  "Server", "Workstation", "Router", "Switch", "Firewall", "Hypervisor",
  "Printer", "IPPhone", "IPCamera", "URL", "LoadBalancer", "Database", "Unknown",
];
const CONTROL_CODES = ["EDR", "AV", "PATCH", "DLP", "VA", "SIEM", "PAM"];
const STATUS_VALUES = ["Operational", "Decommissioned", "In Store"];
const ENV_VALUES = ["Production", "Staging", "UAT", "DEV", "User"];

// ── Column definitions ───────────────────────────────────────────────────────
type ColKey =
  | "hostname" | "asset_type" | "asset_status" | "environment" | "location"
  | "mac" | "ips" | "os" | "os_version" | "criticality"
  | "conflicts" | "confidence" | "last_seen";

type ColDef = { key: ColKey; label: string; sortable: boolean; defaultW: number; hideable: boolean };

const ALL_COLUMNS: ColDef[] = [
  { key: "hostname",     label: "Hostname",    sortable: true,  defaultW: 200, hideable: false },
  { key: "asset_type",   label: "Type",        sortable: true,  defaultW: 100, hideable: true  },
  { key: "asset_status", label: "Status",      sortable: true,  defaultW: 115, hideable: true  },
  { key: "environment",  label: "Environment", sortable: true,  defaultW: 110, hideable: true  },
  { key: "location",     label: "Location",    sortable: true,  defaultW: 140, hideable: true  },
  { key: "mac",          label: "MAC",         sortable: false, defaultW: 145, hideable: true  },
  { key: "ips",          label: "IPs",         sortable: false, defaultW: 130, hideable: true  },
  { key: "os",           label: "OS",          sortable: true,  defaultW: 120, hideable: true  },
  { key: "os_version",   label: "OS Ver.",     sortable: true,  defaultW: 80,  hideable: true  },
  { key: "criticality",  label: "Criticality", sortable: true,  defaultW: 100, hideable: true  },
  { key: "conflicts",    label: "Conflicts",   sortable: true,  defaultW: 90,  hideable: true  },
  { key: "confidence",   label: "Conf.",       sortable: true,  defaultW: 65,  hideable: true  },
  { key: "last_seen",    label: "Last Seen",   sortable: true,  defaultW: 150, hideable: true  },
];

const DEFAULT_VISIBLE: ColKey[] = [
  "hostname", "asset_type", "asset_status", "environment", "location",
  "ips", "os", "os_version", "criticality", "conflicts", "last_seen",
];

const LS_VIS = "asset_visible_cols_v2";
const LS_WIDTHS = "asset_col_widths_v2";

function ls<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch {}
  return fallback;
}

// ── Small badge helpers ───────────────────────────────────────────────────────
function CritBadge({ level }: { level: string }) {
  const cls =
    level === "Critical" ? "bg-red-100 text-red-800" :
    level === "High"     ? "bg-orange-100 text-orange-800" :
    level === "Medium"   ? "bg-yellow-100 text-yellow-800" :
                           "bg-emerald-100 text-emerald-800";
  return <span className={`badge ${cls}`}>{level}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "Operational"    ? "bg-emerald-100 text-emerald-800" :
    status === "Decommissioned" ? "bg-red-100 text-red-800" :
                                  "bg-amber-100 text-amber-800";
  return <span className={`badge ${cls}`}>{status}</span>;
}

function EnvBadge({ env }: { env: string }) {
  const cls =
    env === "Production" ? "bg-red-100 text-red-800" :
    env === "Staging"    ? "bg-amber-100 text-amber-800" :
    env === "UAT"        ? "bg-blue-100 text-blue-800" :
    env === "DEV"        ? "bg-purple-100 text-purple-800" :
                           "bg-slate-100 text-slate-700";
  return <span className={`badge ${cls}`}>{env}</span>;
}

// ── Cell renderer ─────────────────────────────────────────────────────────────
function renderCell(key: ColKey, a: AssetListItem): React.ReactNode {
  switch (key) {
    case "hostname":
      return (
        <Link className="text-indigo-700 hover:underline font-medium" to={`/assets/${a.id}`}>
          {a.hostname || `Asset #${a.id}`}
        </Link>
      );
    case "asset_type":    return a.asset_type || "—";
    case "asset_status":  return a.asset_status ? <StatusBadge status={a.asset_status} /> : "—";
    case "environment":   return a.environment  ? <EnvBadge env={a.environment} />       : "—";
    case "location":      return a.location || "—";
    case "mac":           return <span className="font-mono text-xs">{a.mac || "—"}</span>;
    case "ips":           return <span className="text-xs">{a.ips.join(", ") || "—"}</span>;
    case "os":            return a.os || "—";
    case "os_version":    return a.os_version || "—";
    case "criticality":   return a.criticality_level ? <CritBadge level={a.criticality_level} /> : "—";
    case "conflicts":
      return a.conflict_count > 0 ? (
        <Link to={`/assets/${a.id}`}>
          <span className="badge bg-amber-100 text-amber-800 hover:bg-amber-200 cursor-pointer">
            {a.conflict_count} conflict{a.conflict_count !== 1 ? "s" : ""}
          </span>
        </Link>
      ) : null;
    case "confidence":    return <span className="tabular-nums">{Math.round(a.confidence_score * 100)}%</span>;
    case "last_seen":     return <span className="text-xs">{a.last_seen ? new Date(a.last_seen).toLocaleString() : "—"}</span>;
    default:              return "—";
  }
}

// ── Add-asset form type ───────────────────────────────────────────────────────
type AddForm = {
  hostname: string; mac: string; asset_type: string;
  os: string; os_version: string;
  asset_status: string; environment: string; location: string;
  ips: string;
};
const EMPTY_FORM: AddForm = {
  hostname: "", mac: "", asset_type: "", os: "", os_version: "",
  asset_status: "", environment: "", location: "", ips: "",
};

// ── Main component ────────────────────────────────────────────────────────────
export default function Assets() {
  const [params, setParams] = useSearchParams();

  // filter params (URL-driven)
  const q             = params.get("q") || "";
  const type          = params.get("asset_type") || "";
  const assetStatus   = params.get("asset_status") || "";
  const environment   = params.get("environment") || "";
  const missingCtrl   = params.get("missing_control") || "";
  const installedCtrl = params.get("installed_control") || "";
  const hasConflicts  = params.get("has_conflicts") === "1";
  const eosOnly       = params.get("eos_only") === "1";
  const unknownOnly   = params.get("unknown_only") === "1";
  const page          = parseInt(params.get("page") || "1", 10);
  const sortBy        = (params.get("sort_by") || "") as ColKey | "";
  const sortDir       = (params.get("sort_dir") || "asc") as "asc" | "desc";

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    // reset page to 1 on any filter change (but not on page/sort changes themselves)
    if (!["page", "sort_by", "sort_dir"].includes(key)) next.set("page", "1");
    setParams(next, { replace: true });
  }
  function clearAllFilters() { setParams(new URLSearchParams()); }
  function setPage(p: number) { setParam("page", String(p)); }
  function handleSort(col: ColKey) {
    const next = new URLSearchParams(params);
    if (sortBy === col) {
      next.set("sort_dir", sortDir === "asc" ? "desc" : "asc");
    } else {
      next.set("sort_by", col);
      next.set("sort_dir", "asc");
    }
    setParams(next, { replace: true });
  }

  // ── Column visibility ─────────────────────────────────────────────────────
  const [visCols, setVisCols] = useState<Set<ColKey>>(
    () => new Set(ls<ColKey[]>(LS_VIS, DEFAULT_VISIBLE))
  );
  const [colWidths, setColWidths] = useState<Record<ColKey, number>>(
    () => ls<Record<ColKey, number>>(
      LS_WIDTHS,
      Object.fromEntries(ALL_COLUMNS.map((c) => [c.key, c.defaultW])) as Record<ColKey, number>
    )
  );
  const [showColMenu, setShowColMenu] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { localStorage.setItem(LS_VIS, JSON.stringify([...visCols])); }, [visCols]);
  useEffect(() => { localStorage.setItem(LS_WIDTHS, JSON.stringify(colWidths)); }, [colWidths]);
  useEffect(() => {
    if (!showColMenu) return;
    function onClickOutside(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [showColMenu]);

  // ── Column resize ─────────────────────────────────────────────────────────
  function startResize(key: ColKey, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = colWidths[key];
    const onMove = (ev: MouseEvent) => {
      setColWidths((prev) => ({ ...prev, [key]: Math.max(60, startW + ev.clientX - startX) }));
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Selection + bulk delete ───────────────────────────────────────────────
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  const checkAllRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  // ── Data query ────────────────────────────────────────────────────────────
  const PAGE_SIZE = 50;
  const { data, isLoading } = useQuery({
    queryKey: [
      "assets", q, type, assetStatus, environment,
      missingCtrl, installedCtrl, hasConflicts, eosOnly, unknownOnly,
      sortBy, sortDir, page,
    ],
    queryFn: async () =>
      (await api.get<AssetPage>("/assets", {
        params: {
          q: q || undefined,
          asset_type: type || undefined,
          asset_status: assetStatus || undefined,
          environment: environment || undefined,
          missing_control: missingCtrl || undefined,
          installed_control: installedCtrl || undefined,
          has_conflicts: hasConflicts || undefined,
          eos_only: eosOnly || undefined,
          unknown_only: unknownOnly || undefined,
          sort_by: sortBy || undefined,
          sort_dir: sortDir,
          page,
          page_size: PAGE_SIZE,
        },
      })).data,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const [form, setForm] = useState<AddForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const addMutation = useMutation({
    mutationFn: async (payload: object) => (await api.post("/assets", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: (err: any) => setFormError(err?.response?.data?.detail || "Failed to create asset."),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => api.post("/assets/bulk-delete", { ids }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      setSelected(new Set());
      setConfirmDel(false);
    },
  });

  // ── Selection helpers ──────────────────────────────────────────────────────
  const pageIds = data?.items.map((a) => a.id) ?? [];
  const allSel = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSel = selected.size > 0;

  useEffect(() => {
    if (checkAllRef.current) checkAllRef.current.indeterminate = someSel && !allSel;
  }, [someSel, allSel]);

  function toggleAll() { setSelected(allSel ? new Set() : new Set(pageIds)); }
  function toggleOne(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hostname && !form.mac && !form.ips) {
      setFormError("Provide at least a hostname, MAC, or IP.");
      return;
    }
    addMutation.mutate({
      hostname: form.hostname || null,
      mac: form.mac || null,
      asset_type: form.asset_type || null,
      os: form.os || null,
      os_version: form.os_version || null,
      asset_status: form.asset_status || null,
      environment: form.environment || null,
      location: form.location || null,
      ips: form.ips ? form.ips.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
  }

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips: { label: string; clear: () => void }[] = [];
  if (type)          chips.push({ label: `type: ${type}`,                 clear: () => setParam("asset_type", null) });
  if (assetStatus)   chips.push({ label: `status: ${assetStatus}`,        clear: () => setParam("asset_status", null) });
  if (environment)   chips.push({ label: `env: ${environment}`,           clear: () => setParam("environment", null) });
  if (missingCtrl)   chips.push({ label: `missing: ${missingCtrl}`,       clear: () => setParam("missing_control", null) });
  if (installedCtrl) chips.push({ label: `integrated: ${installedCtrl}`,  clear: () => setParam("installed_control", null) });
  if (hasConflicts)  chips.push({ label: "has conflicts",                  clear: () => setParam("has_conflicts", null) });
  if (eosOnly)       chips.push({ label: "EOS OS",                        clear: () => setParam("eos_only", null) });
  if (unknownOnly)   chips.push({ label: "unknown type",                  clear: () => setParam("unknown_only", null) });

  // ── Render ────────────────────────────────────────────────────────────────
  const visColDefs = ALL_COLUMNS.filter((c) => visCols.has(c.key));
  const totalW = 36 + visColDefs.reduce((s, c) => s + (colWidths[c.key] ?? c.defaultW), 0);

  return (
    <div className="space-y-3">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <span className="text-slate-500 text-sm">{data ? `${data.total} total` : ""}</span>

        <input
          className="input w-52 ml-auto"
          placeholder="Search hostname / MAC / IP…"
          value={q}
          onChange={(e) => setParam("q", e.target.value || null)}
        />
        <select className="input w-36" value={type} onChange={(e) => setParam("asset_type", e.target.value || null)}>
          <option value="">All types</option>
          {ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select className="input w-36" value={assetStatus} onChange={(e) => setParam("asset_status", e.target.value || null)}>
          <option value="">All statuses</option>
          {STATUS_VALUES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-36" value={environment} onChange={(e) => setParam("environment", e.target.value || null)}>
          <option value="">All envs</option>
          {ENV_VALUES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select
          className="input w-44"
          value={installedCtrl}
          onChange={(e) => { setParam("installed_control", e.target.value || null); if (e.target.value) setParam("missing_control", null); }}
        >
          <option value="">Integrated control…</option>
          {CONTROL_CODES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select
          className="input w-44"
          value={missingCtrl}
          onChange={(e) => { setParam("missing_control", e.target.value || null); if (e.target.value) setParam("installed_control", null); }}
        >
          <option value="">Missing control…</option>
          {CONTROL_CODES.map((c) => <option key={c}>{c}</option>)}
        </select>

        {/* Column visibility toggle */}
        <div className="relative" ref={colMenuRef}>
          <button className="btn" onClick={() => setShowColMenu((v) => !v)}>Columns ▾</button>
          {showColMenu && (
            <div className="absolute right-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-lg shadow-lg p-3 w-52">
              <p className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Show / hide columns</p>
              {ALL_COLUMNS.filter((c) => c.hideable).map((c) => (
                <label key={c.key} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-slate-50 rounded px-1">
                  <input
                    type="checkbox"
                    checked={visCols.has(c.key)}
                    onChange={() => setVisCols((prev) => {
                      const n = new Set(prev);
                      n.has(c.key) ? n.delete(c.key) : n.add(c.key);
                      return n;
                    })}
                  />
                  <span className="text-sm">{c.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn bg-indigo-600 text-white hover:bg-indigo-700 whitespace-nowrap"
          onClick={() => { setShowAddModal(true); setFormError(null); }}
        >
          + Add Asset
        </button>
      </div>

      {/* ── Active filter chips ── */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((f) => (
            <span key={f.label} className="badge bg-indigo-100 text-indigo-800">
              {f.label}
              <button className="ml-1 text-indigo-900/70 hover:text-indigo-900" onClick={f.clear}>×</button>
            </span>
          ))}
          <button className="text-xs text-slate-500 hover:text-slate-800 underline" onClick={clearAllFilters}>clear all</button>
        </div>
      )}

      {/* ── Bulk-delete toolbar ── */}
      {someSel && (
        <div className="flex items-center gap-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm">
          <span className="font-medium text-red-800">
            {selected.size} asset{selected.size !== 1 ? "s" : ""} selected
          </span>
          {!confirmDel ? (
            <button
              className="btn bg-red-600 text-white hover:bg-red-700"
              onClick={() => setConfirmDel(true)}
            >
              Delete Selected
            </button>
          ) : (
            <>
              <span className="text-red-700">Permanently delete {selected.size} asset{selected.size !== 1 ? "s" : ""}?</span>
              <button
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate([...selected])}
              >
                {deleteMutation.isPending ? "Deleting…" : "Confirm"}
              </button>
              <button className="btn" onClick={() => setConfirmDel(false)}>Cancel</button>
            </>
          )}
          <button className="ml-auto text-xs text-slate-500 hover:text-slate-800" onClick={() => { setSelected(new Set()); setConfirmDel(false); }}>
            Clear selection
          </button>
        </div>
      )}

      {/* ── Table ── */}
      <div className="card overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: "fixed", minWidth: totalW, width: "100%" }}>
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th style={{ width: 36 }} className="p-2">
                <input type="checkbox" ref={checkAllRef} checked={allSel} onChange={toggleAll} />
              </th>
              {visColDefs.map((col) => (
                <th
                  key={col.key}
                  style={{ width: colWidths[col.key] ?? col.defaultW, position: "relative", userSelect: "none" }}
                  className={`p-2 whitespace-nowrap overflow-hidden ${col.sortable ? "cursor-pointer hover:bg-slate-200" : ""}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span>{col.label}</span>
                  {sortBy === col.key && (
                    <span className="ml-1 text-slate-400 text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                  {/* Resize handle */}
                  <div
                    className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-indigo-400 active:bg-indigo-600"
                    style={{ touchAction: "none" }}
                    onMouseDown={(e) => startResize(col.key, e)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={visColDefs.length + 1} className="p-6 text-center text-slate-500">Loading…</td>
              </tr>
            )}
            {!isLoading && data?.items.map((a) => (
              <tr
                key={a.id}
                className={`border-t hover:bg-slate-50 ${selected.has(a.id) ? "bg-indigo-50" : ""}`}
              >
                <td className="p-2">
                  <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} />
                </td>
                {visColDefs.map((col) => (
                  <td
                    key={col.key}
                    className="p-2 overflow-hidden text-ellipsis whitespace-nowrap"
                    style={{ maxWidth: colWidths[col.key] ?? col.defaultW }}
                  >
                    {renderCell(col.key, a)}
                  </td>
                ))}
              </tr>
            ))}
            {!isLoading && !data?.items.length && (
              <tr>
                <td colSpan={visColDefs.length + 1} className="p-8 text-center text-slate-500">
                  No assets match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.total_pages > 0 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">
            {data.total === 0 ? "0 assets" : (
              <>
                Showing{" "}
                <span className="font-medium">{(page - 1) * PAGE_SIZE + 1}</span>–
                <span className="font-medium">{Math.min(page * PAGE_SIZE, data.total)}</span>{" "}
                of <span className="font-medium">{data.total}</span> assets
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              className="btn"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ← Prev
            </button>
            <span className="text-slate-600">
              Page <span className="font-medium">{page}</span> / <span className="font-medium">{data.total_pages}</span>
            </span>
            <button
              className="btn"
              disabled={page >= data.total_pages}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Add Asset modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-screen overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Add Asset Manually</h2>
            <form onSubmit={submitAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Hostname</label>
                  <input className="input w-full" placeholder="srv-hq-01" value={form.hostname}
                    onChange={(e) => setForm({ ...form, hostname: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Asset Type</label>
                  <select className="input w-full" value={form.asset_type}
                    onChange={(e) => setForm({ ...form, asset_type: e.target.value })}>
                    <option value="">— select —</option>
                    {ASSET_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                  <select className="input w-full" value={form.asset_status}
                    onChange={(e) => setForm({ ...form, asset_status: e.target.value })}>
                    <option value="">— select —</option>
                    {STATUS_VALUES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Environment</label>
                  <select className="input w-full" value={form.environment}
                    onChange={(e) => setForm({ ...form, environment: e.target.value })}>
                    <option value="">— select —</option>
                    {ENV_VALUES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                <input className="input w-full" placeholder="e.g. HQ Rack A-3" value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">MAC Address</label>
                <input className="input w-full font-mono" placeholder="AA:BB:CC:DD:EE:FF" value={form.mac}
                  onChange={(e) => setForm({ ...form, mac: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  IP Addresses <span className="text-slate-400 font-normal">(comma-separated)</span>
                </label>
                <input className="input w-full font-mono" placeholder="10.0.0.1, 10.0.0.2" value={form.ips}
                  onChange={(e) => setForm({ ...form, ips: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">OS</label>
                  <input className="input w-full" placeholder="Windows Server" value={form.os}
                    onChange={(e) => setForm({ ...form, os: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">OS Version</label>
                  <input className="input w-full" placeholder="2022" value={form.os_version}
                    onChange={(e) => setForm({ ...form, os_version: e.target.value })} />
                </div>
              </div>
              {formError && <p className="text-red-600 text-sm">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn"
                  onClick={() => { setShowAddModal(false); setForm(EMPTY_FORM); setFormError(null); }}>
                  Cancel
                </button>
                <button type="submit" className="btn bg-indigo-600 text-white hover:bg-indigo-700"
                  disabled={addMutation.isPending}>
                  {addMutation.isPending ? "Saving…" : "Create Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
