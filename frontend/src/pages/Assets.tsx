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
const LOCATION_VALUES = ["HQ", "DR", "JED", "KHO", "Cloud"];
const CONTROL_CODES = ["EDR", "AV", "PATCH", "DLP", "VA", "SIEM", "PAM"];
const STATUS_VALUES = ["Operational", "Decommissioned", "In Store"];
const ENV_VALUES    = ["Production", "Staging", "UAT", "DEV", "User"];
const LS_CUSTOM_TYPES = "asset_custom_types_v1";

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

const LS_VIS    = "asset_visible_cols_v2";
const LS_WIDTHS = "asset_col_widths_v2";

// ── Pure helpers ─────────────────────────────────────────────────────────────
function ls<T>(key: string, fallback: T): T {
  try { const s = localStorage.getItem(key); if (s) return JSON.parse(s); } catch {}
  return fallback;
}

function getCustomTypes(): string[] {
  try { const s = localStorage.getItem(LS_CUSTOM_TYPES); if (s) return JSON.parse(s); } catch {}
  return [];
}

function persistCustomType(t: string): string[] {
  const existing = getCustomTypes();
  const trimmed  = t.trim();
  if (trimmed && !existing.includes(trimmed)) {
    const next = [...existing, trimmed];
    localStorage.setItem(LS_CUSTOM_TYPES, JSON.stringify(next));
    return next;
  }
  return existing;
}

// ── Fuzzy-matching helpers ────────────────────────────────────────────────────
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function strSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const la = a.toLowerCase().trim(), lb = b.toLowerCase().trim();
  if (la === lb) return 1;
  const maxLen = Math.max(la.length, lb.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(la, lb) / maxLen;
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
    case "confidence":  return <span className="tabular-nums">{Math.round(a.confidence_score * 100)}%</span>;
    case "last_seen":   return <span className="text-xs">{a.last_seen ? new Date(a.last_seen).toLocaleString() : "—"}</span>;
    default:            return "—";
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

// ── Duplicate match type ──────────────────────────────────────────────────────
type DupMatch = AssetListItem & { matchScore: number; matchedOn: string[] };

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
  const [selected, setSelected]   = useState<Set<number>>(new Set());
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

  // ── Export modal state ───────────────────────────────────────────────────
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat]       = useState<"xlsx" | "csv">("xlsx");
  const [exportFilters, setExportFilters]     = useState({
    asset_type: "", location: "", environment: "", criticality: "",
    eos_only: false, missing_control: "", installed_control: "",
  });
  const ALL_EXPORT_COLS = [
    "ID", "UUID", "Hostname", "MAC", "IPs", "Asset Type", "Asset Status",
    "Environment", "Location", "OS", "OS Version", "OS EOS",
    "First Seen", "Last Seen", "Confidence", "Criticality", "Criticality Score",
    ...CONTROL_CODES.map(c => `Ctrl:${c}`),
  ];
  const [exportCols, setExportCols] = useState<Set<string>>(new Set(ALL_EXPORT_COLS));
  const [exporting, setExporting]   = useState(false);

  async function doExport() {
    setExporting(true);
    try {
      const params: Record<string, any> = { format: exportFormat };
      if (exportFilters.asset_type)      params.asset_type      = exportFilters.asset_type;
      if (exportFilters.location)        params.location        = exportFilters.location;
      if (exportFilters.environment)     params.environment     = exportFilters.environment;
      if (exportFilters.criticality)     params.criticality     = exportFilters.criticality;
      if (exportFilters.eos_only)        params.eos_only        = true;
      if (exportFilters.missing_control) params.missing_control = exportFilters.missing_control;
      if (exportFilters.installed_control) params.installed_control = exportFilters.installed_control;
      if (exportCols.size < ALL_EXPORT_COLS.length) {
        params.columns = [...exportCols].join(",");
      }
      const resp = await api.get("/reports/export/assets", {
        params,
        responseType: "blob",
      });
      const url  = URL.createObjectURL(new Blob([resp.data]));
      const a    = document.createElement("a");
      a.href     = url;
      a.download = exportFormat === "csv" ? "assets.csv" : "assets.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      setShowExportModal(false);
    } catch {
      // error silently — in production would show a toast
    } finally {
      setExporting(false);
    }
  }

  // ── Add-asset state ───────────────────────────────────────────────────────
  const [form, setForm]               = useState<AddForm>(EMPTY_FORM);
  const [formError, setFormError]     = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [dupChecking, setDupChecking] = useState(false);
  const [dupModal, setDupModal]       = useState<{ open: boolean; matches: DupMatch[]; payload: object }>({
    open: false, matches: [], payload: {},
  });

  // Custom asset-type state for the Add modal
  const [customTypeInput, setCustomTypeInput] = useState("");
  const [allAssetTypes, setAllAssetTypes]     = useState<string[]>(() => {
    const custom = getCustomTypes().filter(t => !ASSET_TYPES.includes(t));
    return [...ASSET_TYPES, ...custom];
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: async (payload: object) => (await api.post("/assets", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormError(null);
      setDupModal({ open: false, matches: [], payload: {} });
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
  const allSel  = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someSel = selected.size > 0;

  useEffect(() => {
    if (checkAllRef.current) checkAllRef.current.indeterminate = someSel && !allSel;
  }, [someSel, allSel]);

  function toggleAll() { setSelected(allSel ? new Set() : new Set(pageIds)); }
  function toggleOne(id: number) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Duplicate detection ───────────────────────────────────────────────────
  async function checkForDuplicates(payload: any) {
    const searchTerms: string[] = [];
    if (payload.hostname) searchTerms.push(payload.hostname);
    if (payload.mac)      searchTerms.push(payload.mac);
    if ((payload.ips as string[])?.length) searchTerms.push(payload.ips[0]);

    if (!searchTerms.length) { addMutation.mutate(payload); return; }

    const resultMap = new Map<number, AssetListItem>();
    for (const term of searchTerms) {
      try {
        const { data: pg } = await api.get<AssetPage>("/assets", { params: { q: term, page_size: 20 } });
        pg.items.forEach(item => resultMap.set(item.id, item));
      } catch { /* ignore individual search failures */ }
    }

    const normMac = (v: string) => v.replace(/[:\-.]/g, "").toLowerCase();

    const matches: DupMatch[] = [];
    for (const item of resultMap.values()) {
      const matchedOn: string[] = [];
      let maxScore = 0;

      if (payload.hostname && item.hostname) {
        const s = strSimilarity(payload.hostname, item.hostname);
        if (s >= 0.6) { maxScore = Math.max(maxScore, s); matchedOn.push("Hostname"); }
      }
      if (payload.mac && item.mac) {
        if (normMac(payload.mac) === normMac(item.mac)) {
          maxScore = 1; matchedOn.push("MAC (exact)");
        }
      }
      if ((payload.ips as string[])?.length && item.ips?.length) {
        const hit = payload.ips.some((ip: string) => item.ips.includes(ip));
        if (hit) { maxScore = Math.max(maxScore, 0.95); matchedOn.push("IP Address"); }
      }

      if (matchedOn.length) matches.push({ ...item, matchScore: maxScore, matchedOn });
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);

    if (!matches.length) { addMutation.mutate(payload); return; }

    setDupModal({ open: true, matches, payload });
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hostname && !form.mac && !form.ips) {
      setFormError("Provide at least a hostname, MAC, or IP.");
      return;
    }
    const payload = {
      hostname:     form.hostname     || null,
      mac:          form.mac          || null,
      asset_type:   form.asset_type   || null,
      os:           form.os           || null,
      os_version:   form.os_version   || null,
      asset_status: form.asset_status || null,
      environment:  form.environment  || null,
      location:     form.location     || null,
      ips: form.ips ? form.ips.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };
    setDupChecking(true);
    try { await checkForDuplicates(payload); }
    finally { setDupChecking(false); }
  }

  // ── Active filter chips ───────────────────────────────────────────────────
  const chips: { label: string; clear: () => void }[] = [];
  if (type)          chips.push({ label: `type: ${type}`,                clear: () => setParam("asset_type", null) });
  if (assetStatus)   chips.push({ label: `status: ${assetStatus}`,       clear: () => setParam("asset_status", null) });
  if (environment)   chips.push({ label: `env: ${environment}`,          clear: () => setParam("environment", null) });
  if (missingCtrl)   chips.push({ label: `missing: ${missingCtrl}`,      clear: () => setParam("missing_control", null) });
  if (installedCtrl) chips.push({ label: `integrated: ${installedCtrl}`, clear: () => setParam("installed_control", null) });
  if (hasConflicts)  chips.push({ label: "has conflicts",                 clear: () => setParam("has_conflicts", null) });
  if (eosOnly)       chips.push({ label: "EOS OS",                       clear: () => setParam("eos_only", null) });
  if (unknownOnly)   chips.push({ label: "unknown type",                  clear: () => setParam("unknown_only", null) });

  // ── Render ────────────────────────────────────────────────────────────────
  const visColDefs = ALL_COLUMNS.filter((c) => visCols.has(c.key));
  const totalW     = 36 + visColDefs.reduce((s, c) => s + (colWidths[c.key] ?? c.defaultW), 0);

  return (
    <div className="space-y-3">
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold">Assets</h1>
        <span className="text-slate-500 text-sm">{data ? `${data.total} total` : ""}</span>

        <select className="input w-36 ml-auto" value={type} onChange={(e) => setParam("asset_type", e.target.value || null)}>
          <option value="">All types</option>
          {allAssetTypes.map((t) => <option key={t}>{t}</option>)}
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

        {/* ── Column visibility toggle — FIX: left-0 + min-w + scroll ── */}
        <div className="relative" ref={colMenuRef}>
          <button className="btn" onClick={() => setShowColMenu((v) => !v)}>Columns ▾</button>
          {showColMenu && (
            <div className="absolute left-0 top-full mt-1 z-40 bg-white border border-slate-200 rounded-lg shadow-lg p-3 min-w-[220px] max-h-72 overflow-y-auto">
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
                  <span className="text-sm whitespace-nowrap">{c.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          className="btn whitespace-nowrap"
          onClick={() => setShowExportModal(true)}
        >
          ↓ Export
        </button>
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
            <button className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => setConfirmDel(true)}>
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
            {/* Column headers */}
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

            {/* ── Table-integrated search row ── */}
            <tr className="bg-white border-b border-slate-200">
              <td colSpan={visColDefs.length + 1} className="px-3 py-1.5">
                <div className="flex items-center gap-2 text-slate-500">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" strokeWidth="2" />
                    <path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <input
                    className="flex-1 text-sm bg-transparent outline-none placeholder-slate-400 text-slate-800"
                    placeholder="Search hostname, MAC, IP address…"
                    value={q}
                    onChange={(e) => setParam("q", e.target.value || null)}
                  />
                  {q && (
                    <button
                      className="text-xs text-slate-400 hover:text-slate-600 whitespace-nowrap"
                      onClick={() => setParam("q", null)}
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
              </td>
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
            <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <span className="text-slate-600">
              Page <span className="font-medium">{page}</span> / <span className="font-medium">{data.total_pages}</span>
            </span>
            <button className="btn" disabled={page >= data.total_pages} onClick={() => setPage(page + 1)}>Next →</button>
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

                {/* ── Asset Type combobox with custom type support ── */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Asset Type</label>
                  {form.asset_type === "__custom__" ? (
                    <div className="flex gap-1">
                      <input
                        className="input flex-1 min-w-0"
                        placeholder="New type name…"
                        value={customTypeInput}
                        autoFocus
                        onChange={(e) => setCustomTypeInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const val = customTypeInput.trim();
                            if (val) {
                              persistCustomType(val);
                              const custom = getCustomTypes().filter(t => !ASSET_TYPES.includes(t));
                              setAllAssetTypes([...ASSET_TYPES, ...custom]);
                              setForm({ ...form, asset_type: val });
                              setCustomTypeInput("");
                            }
                          } else if (e.key === "Escape") {
                            setForm({ ...form, asset_type: "" });
                            setCustomTypeInput("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary px-2"
                        onClick={() => {
                          const val = customTypeInput.trim();
                          if (!val) return;
                          persistCustomType(val);
                          const custom = getCustomTypes().filter(t => !ASSET_TYPES.includes(t));
                          setAllAssetTypes([...ASSET_TYPES, ...custom]);
                          setForm({ ...form, asset_type: val });
                          setCustomTypeInput("");
                        }}
                      >Add</button>
                      <button
                        type="button"
                        className="btn px-2"
                        onClick={() => { setForm({ ...form, asset_type: "" }); setCustomTypeInput(""); }}
                      >✕</button>
                    </div>
                  ) : (
                    <select
                      className="input w-full"
                      value={form.asset_type}
                      onChange={(e) => setForm({ ...form, asset_type: e.target.value })}
                    >
                      <option value="">— select —</option>
                      {allAssetTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                      <option value="__custom__">✚ Add custom type…</option>
                    </select>
                  )}
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

              {/* ── Location dropdown ── */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                <select className="input w-full" value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}>
                  <option value="">— select —</option>
                  {LOCATION_VALUES.map((l) => <option key={l}>{l}</option>)}
                </select>
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
                <button
                  type="submit"
                  className="btn bg-indigo-600 text-white hover:bg-indigo-700"
                  disabled={addMutation.isPending || dupChecking}
                >
                  {dupChecking ? "Checking…" : addMutation.isPending ? "Saving…" : "Create Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Export modal ── */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1">Export Assets</h2>
            <p className="text-sm text-slate-500 mb-4">Choose filters, format, and columns.</p>

            {/* Format */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Format</label>
              <div className="flex gap-3">
                {(["xlsx", "csv"] as const).map(f => (
                  <label key={f} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="exportFormat"
                      value={f}
                      checked={exportFormat === f}
                      onChange={() => setExportFormat(f)}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm font-medium">{f.toUpperCase()}</span>
                    <span className="text-xs text-slate-400">{f === "xlsx" ? "(Excel, recommended)" : "(plain text)"}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Filters */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Filters</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Asset Type</label>
                  <select className="input w-full" value={exportFilters.asset_type}
                    onChange={e => setExportFilters(p => ({ ...p, asset_type: e.target.value }))}>
                    <option value="">All types</option>
                    {ASSET_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Location</label>
                  <select className="input w-full" value={exportFilters.location}
                    onChange={e => setExportFilters(p => ({ ...p, location: e.target.value }))}>
                    <option value="">All locations</option>
                    {LOCATION_VALUES.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Environment</label>
                  <select className="input w-full" value={exportFilters.environment}
                    onChange={e => setExportFilters(p => ({ ...p, environment: e.target.value }))}>
                    <option value="">All environments</option>
                    {ENV_VALUES.map(e => <option key={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Criticality</label>
                  <select className="input w-full" value={exportFilters.criticality}
                    onChange={e => setExportFilters(p => ({ ...p, criticality: e.target.value }))}>
                    <option value="">All levels</option>
                    {["Critical", "High", "Medium", "Low"].map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Missing control</label>
                  <select className="input w-full" value={exportFilters.missing_control}
                    onChange={e => setExportFilters(p => ({ ...p, missing_control: e.target.value, installed_control: "" }))}>
                    <option value="">Any</option>
                    {CONTROL_CODES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Has control installed</label>
                  <select className="input w-full" value={exportFilters.installed_control}
                    onChange={e => setExportFilters(p => ({ ...p, installed_control: e.target.value, missing_control: "" }))}>
                    <option value="">Any</option>
                    {CONTROL_CODES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportFilters.eos_only}
                      onChange={e => setExportFilters(p => ({ ...p, eos_only: e.target.checked }))}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm">Only assets with OS past end-of-support</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Column selection */}
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Columns</label>
                <button className="text-xs text-indigo-600 hover:underline"
                  onClick={() => setExportCols(new Set(ALL_EXPORT_COLS))}>All</button>
                <button className="text-xs text-slate-500 hover:underline"
                  onClick={() => setExportCols(new Set())}>None</button>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-1 max-h-44 overflow-y-auto border rounded-lg p-3">
                {ALL_EXPORT_COLS.map(col => (
                  <label key={col} className="flex items-center gap-2 cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={exportCols.has(col)}
                      onChange={e => setExportCols(prev => {
                        const n = new Set(prev);
                        e.target.checked ? n.add(col) : n.delete(col);
                        return n;
                      })}
                      className="accent-indigo-600 shrink-0"
                    />
                    <span className="text-xs whitespace-nowrap">{col}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">{exportCols.size} of {ALL_EXPORT_COLS.length} columns selected</p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <button className="btn" onClick={() => setShowExportModal(false)}>Cancel</button>
              <button
                className="btn bg-indigo-600 text-white hover:bg-indigo-700"
                disabled={exporting || exportCols.size === 0}
                onClick={doExport}
              >
                {exporting ? "Exporting…" : `Export ${exportFormat.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Duplicate detection modal ── */}
      {dupModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-500 text-xl">⚠</span>
              <h2 className="text-lg font-semibold">Possible Duplicate Detected</h2>
            </div>
            <p className="text-sm text-slate-600 mb-4">
              The following existing assets are similar to the one you're adding. Review before proceeding.
            </p>

            <div className="space-y-3 mb-5">
              {dupModal.matches.map((m) => (
                <div key={m.id} className="border rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <Link
                      to={`/assets/${m.id}`}
                      className="font-medium text-indigo-700 hover:underline"
                      onClick={() => setDupModal(d => ({ ...d, open: false }))}
                    >
                      {m.hostname || `Asset #${m.id}`}
                    </Link>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">Match confidence:</span>
                      <span className={`badge text-xs ${
                        m.matchScore >= 0.9 ? "bg-red-100 text-red-800" :
                        m.matchScore >= 0.7 ? "bg-amber-100 text-amber-800" :
                        "bg-yellow-100 text-yellow-800"}`}>
                        {Math.round(m.matchScore * 100)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {m.matchedOn.map((f) => (
                      <span key={f} className="badge bg-indigo-100 text-indigo-700 text-xs">{f}</span>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs text-slate-600 bg-slate-50 rounded p-2">
                    <div>
                      <span className="text-slate-400">Hostname: </span>
                      <span className={(dupModal.payload as any).hostname?.toLowerCase() === m.hostname?.toLowerCase() ? "text-red-600 font-semibold" : ""}>
                        {m.hostname || "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">MAC: </span>
                      <span className="font-mono">{m.mac || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">IPs: </span>
                      <span className="font-mono">{m.ips.join(", ") || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">Type: </span>{m.asset_type || "—"}
                    </div>
                    <div>
                      <span className="text-slate-400">Status: </span>{m.asset_status || "—"}
                    </div>
                    <div>
                      <span className="text-slate-400">Location: </span>{m.location || "—"}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                className="btn"
                onClick={() => setDupModal(d => ({ ...d, open: false }))}
              >
                ← Cancel &amp; Edit
              </button>
              <button
                className="btn bg-amber-500 text-white hover:bg-amber-600"
                disabled={addMutation.isPending}
                onClick={() => addMutation.mutate(dupModal.payload)}
              >
                {addMutation.isPending ? "Saving…" : "Proceed Anyway"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
