import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { AssetIPOut, AssetOut, ConflictOut, FieldValue, VulnPage } from "../types";
import { useState } from "react";

// ── Constants ─────────────────────────────────────────────────────────────────
const ASSET_TYPES = [
  "Server", "Workstation", "Router", "Switch", "Firewall", "Hypervisor",
  "Printer", "IPPhone", "IPCamera", "URL", "LoadBalancer", "Database", "Unknown",
];
const LOCATION_VALUES = ["HQ", "DR", "JED", "KHO", "Cloud"];
const LICENSE_STATES  = ["Licensed", "Unlicensed"];

// Asset types that show User field instead of Function/Custodian
const USER_FIELD_TYPES  = new Set(["IPPhone", "Workstation"]);
// Asset types that hide Function/Custodian
const NO_FUNC_CUST_TYPES = new Set(["IPPhone", "Workstation"]);

const TEMPLATE_FIELDS = [
  "asset_type", "asset_status", "environment", "location",
  "os", "os_version", "os_eos",
  "function", "custodian", "user_name",
  "os_license_state", "edr_license_state", "av_license_state",
] as const;
const LS_OVERRIDE_TMPL = "asset_override_templates_v1";

// ── Template helpers ──────────────────────────────────────────────────────────
type OverrideTemplate = {
  id: string; name: string; createdAt: string; values: Record<string, string>;
};

function getTemplates(): OverrideTemplate[] {
  try { const s = localStorage.getItem(LS_OVERRIDE_TMPL); if (s) return JSON.parse(s); } catch {}
  return [];
}
function persistTemplate(tpl: OverrideTemplate) {
  const list = getTemplates(); list.unshift(tpl);
  if (list.length > 10) list.splice(10);
  localStorage.setItem(LS_OVERRIDE_TMPL, JSON.stringify(list));
}
function deleteTemplate(id: string) {
  localStorage.setItem(LS_OVERRIDE_TMPL, JSON.stringify(getTemplates().filter(t => t.id !== id)));
}

// ── Custom-options helpers ────────────────────────────────────────────────────
function getCustomOpts(field: string): string[] {
  try { const s = localStorage.getItem(`custom_opts_${field}`); if (s) return JSON.parse(s); } catch {}
  return [];
}
function persistCustomOpt(field: string, value: string): string[] {
  const existing = getCustomOpts(field);
  if (!existing.includes(value)) {
    const next = [...existing, value];
    localStorage.setItem(`custom_opts_${field}`, JSON.stringify(next));
    return next;
  }
  return existing;
}

// ── OverrideField ─────────────────────────────────────────────────────────────
function OverrideField({
  label, field, value, assetId, type = "text", options, allowCustom = false, onSaved,
}: {
  label: string; field: string; value: FieldValue; assetId: number;
  type?: string; options?: string[]; allowCustom?: boolean; onSaved: () => void;
}) {
  const [editing, setEditing]         = useState(false);
  const [draft, setDraft]             = useState("");
  const [customDraft, setCustomDraft] = useState("");
  const [extraOptions, setExtraOptions] = useState<string[]>(() =>
    allowCustom ? getCustomOpts(field) : []
  );
  const base       = options ?? [];
  const allOptions = [...base, ...extraOptions.filter(e => !base.includes(e))];

  const save = useMutation({
    mutationFn: async () =>
      (await api.put(`/assets/${assetId}/override/${field}`, { value: draft || null })).data,
    onSuccess: () => { onSaved(); setEditing(false); },
  });
  const clear = useMutation({
    mutationFn: async () => (await api.delete(`/assets/${assetId}/override/${field}`)).data,
    onSuccess: () => { onSaved(); setEditing(false); },
  });

  function startEdit() {
    setDraft(String(options ? (value.effective ?? "") : (value.override ?? "")));
    setEditing(true); setCustomDraft("");
  }
  function confirmCustom() {
    const val = customDraft.trim(); if (!val) return;
    const next = persistCustomOpt(field, val);
    setExtraOptions(next.filter(e => !base.includes(e)));
    setDraft(val); setCustomDraft("");
  }

  return (
    <div className="py-2 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-36 text-sm text-slate-500 shrink-0">{label}</div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">
            {String(value.effective ?? "—")}
            {value.overridden && <span className="ml-2 badge bg-amber-100 text-amber-800">overridden</span>}
          </div>
          {value.overridden && (
            <div className="text-xs text-slate-500">System: {String(value.system ?? "—")}</div>
          )}
        </div>
        {!editing && <button className="btn shrink-0" onClick={startEdit}>Edit</button>}
      </div>
      {editing && (
        <div className="flex flex-wrap items-center gap-2 mt-2 ml-36">
          {options ? (
            draft === "__custom__" ? (
              <div className="flex items-center gap-1">
                <input className="input" placeholder="New value…" value={customDraft} autoFocus
                  onChange={e => setCustomDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { e.preventDefault(); confirmCustom(); }
                    else if (e.key === "Escape") { setDraft(""); setCustomDraft(""); }
                  }} />
                <button className="btn" type="button" onClick={confirmCustom}>Add</button>
                <button className="btn" type="button" onClick={() => { setDraft(""); setCustomDraft(""); }}>✕</button>
              </div>
            ) : (
              <select className="input w-56" value={draft} onChange={e => setDraft(e.target.value)}>
                <option value="">— clear override —</option>
                {allOptions.map(o => <option key={o} value={o}>{o}</option>)}
                {allowCustom && <option value="__custom__">✚ Add custom…</option>}
              </select>
            )
          ) : (
            <input className="input max-w-sm" type={type} value={draft}
              onChange={e => setDraft(e.target.value)} />
          )}
          <button className="btn btn-primary" disabled={save.isPending || draft === "__custom__"}
            onClick={() => save.mutate()}>
            Save override
          </button>
          {value.overridden && (
            <button className="btn" disabled={clear.isPending} onClick={() => clear.mutate()}>
              Clear override
            </button>
          )}
          <button className="btn" onClick={() => { setEditing(false); setDraft(""); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

// ── IPPanel ───────────────────────────────────────────────────────────────────
function IPPanel({ asset, onSaved }: { asset: AssetOut; onSaved: () => void }) {
  const [addDraft, setAddDraft]         = useState("");
  const [editingId, setEditingId]       = useState<number | null>(null);
  const [editDraft, setEditDraft]       = useState("");
  const [addError, setAddError]         = useState<string | null>(null);
  const [editError, setEditError]       = useState<string | null>(null);

  const addIP = useMutation({
    mutationFn: async () => (await api.post(`/assets/${asset.id}/ips`, { ip: addDraft })).data,
    onSuccess: () => { onSaved(); setAddDraft(""); setAddError(null); },
    onError: (e: any) => setAddError(e?.response?.data?.detail || "Invalid IP"),
  });
  const editIP = useMutation({
    mutationFn: async (ipId: number) =>
      (await api.put(`/assets/${asset.id}/ips/${ipId}`, { ip: editDraft })).data,
    onSuccess: () => { onSaved(); setEditingId(null); setEditError(null); },
    onError: (e: any) => setEditError(e?.response?.data?.detail || "Invalid IP"),
  });
  const deleteIP = useMutation({
    mutationFn: async (ipId: number) =>
      (await api.delete(`/assets/${asset.id}/ips/${ipId}`)).data,
    onSuccess: onSaved,
  });

  function startEdit(ip: AssetIPOut) {
    setEditingId(ip.id); setEditDraft(ip.ip); setEditError(null);
  }

  return (
    <div>
      <h3 className="font-semibold mb-2">IP Addresses</h3>
      <ul className="text-sm divide-y">
        {asset.ips.map(i => (
          <li key={i.id} className="py-1.5">
            {editingId === i.id ? (
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  className="input font-mono w-40"
                  value={editDraft}
                  autoFocus
                  onChange={e => setEditDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") editIP.mutate(i.id); else if (e.key === "Escape") setEditingId(null); }}
                />
                <button className="btn btn-primary text-xs" disabled={editIP.isPending}
                  onClick={() => editIP.mutate(i.id)}>Save</button>
                <button className="btn text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                {editError && <span className="text-red-500 text-xs">{editError}</span>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="font-mono flex-1">{i.ip}</span>
                <span className="text-slate-400 text-xs">{i.source || "—"}</span>
                {i.is_override && <span className="badge bg-amber-100 text-amber-700 text-xs">manual</span>}
                <button className="btn text-xs" onClick={() => startEdit(i)}>Edit</button>
                <button
                  className="btn text-xs text-red-600 hover:bg-red-50"
                  disabled={deleteIP.isPending}
                  onClick={() => deleteIP.mutate(i.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
        {!asset.ips.length && <li className="text-slate-500 py-1">None</li>}
      </ul>

      {/* Add IP */}
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <input
          className="input font-mono w-40"
          placeholder="e.g. 10.0.0.1"
          value={addDraft}
          onChange={e => setAddDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && addDraft) addIP.mutate(); }}
        />
        <button
          className="btn btn-primary text-xs"
          disabled={!addDraft || addIP.isPending}
          onClick={() => addIP.mutate()}
        >
          Add IP
        </button>
        {addError && <span className="text-red-500 text-xs">{addError}</span>}
      </div>
    </div>
  );
}

// ── ConflictsPanel ────────────────────────────────────────────────────────────
function ConflictsPanel({ asset, onSaved }: { asset: AssetOut; onSaved: () => void }) {
  const [customValues, setCustomValues] = useState<Record<number, string>>({});
  const resolve = useMutation({
    mutationFn: async ({ conflictId, choice, overrideValue }: {
      conflictId: number; choice: string; overrideValue?: string;
    }) =>
      (await api.post(`/assets/${asset.id}/conflicts/${conflictId}/resolve`, {
        choice, override_value: overrideValue ?? null,
      })).data,
    onSuccess: onSaved,
  });
  if (!asset.conflicts.length) return null;
  return (
    <div className="card p-4 border-l-4 border-amber-400">
      <h3 className="font-semibold mb-3 text-amber-800">
        Conflicts ({asset.conflicts.length} unresolved)
      </h3>
      <div className="space-y-4">
        {asset.conflicts.map((c: ConflictOut) => (
          <div key={c.id} className="bg-amber-50 rounded p-3 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium capitalize">{c.field}</span>
              <span className="text-slate-400 text-xs">{new Date(c.created_at).toLocaleString()}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-white border rounded p-2">
                <div className="text-xs text-slate-500 mb-1">Source A: {c.source_a || "—"}</div>
                <div className="font-mono font-medium">{c.value_a ?? "—"}</div>
              </div>
              <div className="bg-white border rounded p-2">
                <div className="text-xs text-slate-500 mb-1">Source B: {c.source_b || "—"}</div>
                <div className="font-mono font-medium">{c.value_b ?? "—"}</div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="btn btn-primary text-xs" disabled={resolve.isPending}
                onClick={() => resolve.mutate({ conflictId: c.id, choice: "a" })}>Use A</button>
              <button className="btn btn-primary text-xs" disabled={resolve.isPending}
                onClick={() => resolve.mutate({ conflictId: c.id, choice: "b" })}>Use B</button>
              <input className="input text-xs w-40" placeholder="Custom value…"
                value={customValues[c.id] ?? ""}
                onChange={e => setCustomValues(p => ({ ...p, [c.id]: e.target.value }))} />
              <button className="btn text-xs" disabled={resolve.isPending || !customValues[c.id]}
                onClick={() => resolve.mutate({ conflictId: c.id, choice: "override", overrideValue: customValues[c.id] })}>
                Use custom
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CriticalityPanel ──────────────────────────────────────────────────────────
const CIA_LEVELS = [{ value: 1, label: "Low" }, { value: 2, label: "Medium" }, { value: 3, label: "High" }];
const BIZ_IMPACTS = ["Critical", "High", "Medium", "Low"];

function CriticalityPanel({ asset, onSaved }: { asset: AssetOut; onSaved: () => void }) {
  const isDecommissioned = asset.asset_status.effective === "Decommissioned";
  const existingAnswers = asset.criticality?.details?.answers ?? {};
  const [showQn, setShowQn] = useState(false);
  const [answers, setAnswers] = useState({
    confidentiality: existingAnswers.confidentiality ?? 1,
    integrity:       existingAnswers.integrity       ?? 1,
    availability:    existingAnswers.availability    ?? 1,
    is_production:   existingAnswers.is_production   ?? false,
    business_impact: existingAnswers.business_impact ?? "Medium",
  });
  const recompute = useMutation({
    mutationFn: () => api.post(`/assets/${asset.id}/criticality/recompute`),
    onSuccess: onSaved,
  });
  const submitQn = useMutation({
    mutationFn: () => api.post(`/assets/${asset.id}/criticality/questionnaire`, answers),
    onSuccess: () => { onSaved(); setShowQn(false); },
  });
  const crit = asset.criticality;
  const levelColor =
    crit?.level === "Critical" ? "text-red-700" :
    crit?.level === "High"     ? "text-orange-700" :
    crit?.level === "Medium"   ? "text-yellow-700" : "text-emerald-700";

  if (isDecommissioned) {
    return (
      <div className="mt-4">
        <h3 className="font-semibold mb-2">Criticality</h3>
        <div className="text-sm text-slate-500 italic">
          Not applicable — asset is Decommissioned.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <h3 className="font-semibold mb-2">Criticality</h3>
      {crit ? (
        <div>
          <div className={`text-2xl font-semibold ${levelColor}`}>
            {crit.level}
            <span className="text-base text-slate-500 ml-2">{crit.score}/100</span>
          </div>
          <div className="mt-1 mb-2 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${
              crit.level === "Critical" ? "bg-red-500" :
              crit.level === "High"     ? "bg-orange-500" :
              crit.level === "Medium"   ? "bg-yellow-500" : "bg-emerald-500"
            }`} style={{ width: `${crit.score}%` }} />
          </div>
          <div className="text-xs text-slate-500 mb-2">
            Source: <span className="font-medium">{crit.source}</span>
          </div>
          {crit.details?.reasons && (
            <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5 mb-3">
              {crit.details.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </div>
      ) : (
        <div className="text-slate-500 text-sm mb-3">Not scored yet.</div>
      )}
      <div className="flex flex-wrap gap-2 mt-2">
        <button className="btn text-xs" disabled={recompute.isPending} onClick={() => recompute.mutate()}>
          {recompute.isPending ? "…" : "Auto-score"}
        </button>
        <button className={`btn text-xs ${showQn ? "bg-indigo-100 text-indigo-800" : ""}`}
          onClick={() => setShowQn(v => !v)}>
          {showQn ? "Hide questionnaire" : "Score via questionnaire"}
        </button>
      </div>
      {showQn && (
        <div className="mt-3 border rounded-lg p-4 bg-slate-50 space-y-3 text-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">CIA Triad Questionnaire</p>
          {[
            { key: "confidentiality" as const, label: "Confidentiality — how sensitive is the data?", name: "conf" },
            { key: "integrity"       as const, label: "Integrity — impact of data modification/corruption?", name: "integ" },
            { key: "availability"    as const, label: "Availability — impact of this asset being unavailable?", name: "avail" },
          ].map(({ key, label, name }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
              <div className="flex gap-4">
                {CIA_LEVELS.map(l => (
                  <label key={l.value} className="flex items-center gap-1 cursor-pointer">
                    <input type="radio" name={name} value={l.value}
                      checked={answers[key] === l.value}
                      onChange={() => setAnswers(a => ({ ...a, [key]: l.value }))}
                      className="accent-indigo-600" />
                    <span>{l.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={!!answers.is_production}
              onChange={e => setAnswers(a => ({ ...a, is_production: e.target.checked }))}
              className="accent-indigo-600" />
            <span className="text-xs font-medium text-slate-700">This is a production system</span>
          </label>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Business function importance</label>
            <select className="input w-48" value={answers.business_impact}
              onChange={e => setAnswers(a => ({ ...a, business_impact: e.target.value }))}>
              {BIZ_IMPACTS.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1 border-t">
            <button className="btn text-xs" onClick={() => setShowQn(false)}>Cancel</button>
            <button className="btn bg-indigo-600 text-white hover:bg-indigo-700 text-xs"
              disabled={submitQn.isPending} onClick={() => submitQn.mutate()}>
              {submitQn.isPending ? "Scoring…" : "Calculate Score"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── ControlsPanel ─────────────────────────────────────────────────────────────
function ControlsPanel({ asset, onSaved }: { asset: AssetOut; onSaved: () => void }) {
  const update = useMutation({
    mutationFn: async (payload: { code: string; status: string | null }) =>
      (await api.put(`/assets/${asset.id}/controls/${payload.code}`, { override_status: payload.status })).data,
    onSuccess: onSaved,
  });
  return (
    <div className="card p-4">
      <h3 className="font-semibold mb-2">Security Controls</h3>
      <table className="w-full text-sm">
        <thead className="text-slate-500 text-left text-xs">
          <tr>
            <th>Control</th><th>Applicable</th><th>System</th>
            <th>Override</th><th>Effective</th><th>Last check-in</th>
          </tr>
        </thead>
        <tbody>
          {asset.controls.map(c => (
            <tr key={c.code} className={`border-t ${!c.applicable ? "opacity-40" : ""}`}>
              <td className="py-1">{c.code}</td>
              <td>{c.applicable ? "Yes" : "N/A"}</td>
              <td>{c.system_status || "—"}</td>
              <td>
                <select className="input w-32" disabled={!c.applicable}
                  value={c.override_status || ""}
                  onChange={e => update.mutate({ code: c.code, status: e.target.value || null })}>
                  <option value="">—</option>
                  <option>Installed</option><option>Missing</option><option>Unknown</option>
                </select>
              </td>
              <td>
                <span className={`badge ${
                  c.effective_status === "Installed" ? "bg-emerald-100 text-emerald-800" :
                  c.effective_status === "Missing"   ? "bg-red-100 text-red-800" :
                  "bg-slate-100 text-slate-700"}`}>
                  {c.effective_status}
                </span>
              </td>
              <td>{c.last_check_in ? new Date(c.last_check_in).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── VulnerabilitiesPanel ──────────────────────────────────────────────────────
const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high:     "bg-orange-100 text-orange-800",
  medium:   "bg-yellow-100 text-yellow-800",
  low:      "bg-blue-100 text-blue-800",
  info:     "bg-slate-100 text-slate-600",
};

function VulnerabilitiesPanel({ assetId }: { assetId: number }) {
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState("");

  const { data, isLoading } = useQuery<VulnPage>({
    queryKey: ["vulns", assetId, page, severity],
    queryFn: async () => {
      const params = new URLSearchParams({
        asset_id: String(assetId),
        page: String(page),
        page_size: "20",
      });
      if (severity) params.set("severity", severity);
      return (await api.get<VulnPage>(`/nessus/vulnerabilities?${params}`)).data;
    },
  });

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <h3 className="font-semibold">Vulnerabilities</h3>
        {data && <span className="text-sm text-slate-500">{data.total} total</span>}
        <div className="ml-auto flex items-center gap-2">
          <select className="input w-36 text-sm" value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }}>
            <option value="">All severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      {isLoading && <div className="text-slate-500 text-sm py-2">Loading…</div>}
      {!isLoading && (!data || data.items.length === 0) && (
        <div className="text-slate-500 text-sm py-2">No vulnerabilities found.</div>
      )}
      {data && data.items.length > 0 && (
        <>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-1">Severity</th>
                <th className="pb-1">Plugin</th>
                <th className="pb-1">CVE</th>
                <th className="pb-1">Port</th>
                <th className="pb-1">Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map(v => (
                <tr key={v.id} className="border-t align-top">
                  <td className="py-1.5 pr-2">
                    <span className={`badge capitalize ${SEVERITY_COLORS[v.severity] ?? "bg-slate-100"}`}>
                      {v.severity}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="font-medium leading-snug">{v.plugin_name}</div>
                    {v.plugin_family && <div className="text-xs text-slate-400">{v.plugin_family}</div>}
                  </td>
                  <td className="py-1.5 pr-2 font-mono text-xs">{v.cve_id || "—"}</td>
                  <td className="py-1.5 pr-2 font-mono text-xs">
                    {v.port ? `${v.port}/${v.protocol ?? ""}` : "—"}
                  </td>
                  <td className="py-1.5 text-xs text-slate-500">
                    {new Date(v.last_seen).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.total_pages > 1 && (
            <div className="flex items-center gap-2 mt-3 text-sm">
              <button className="btn text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>←</button>
              <span className="text-slate-500">Page {page} of {data.total_pages}</span>
              <button className="btn text-xs" disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── AssetDetail ───────────────────────────────────────────────────────────────
export default function AssetDetail() {
  const { id } = useParams();
  const qc     = useQueryClient();
  const { data } = useQuery({
    queryKey: ["asset", id],
    queryFn:  async () => (await api.get<AssetOut>(`/assets/${id}`)).data,
  });

  const [templateModal, setTemplateModal] = useState<"save" | "apply" | null>(null);
  const [templateName, setTemplateName]   = useState("");
  const [templates, setTemplates]         = useState<OverrideTemplate[]>(() => getTemplates());
  const [applyingTpl, setApplyingTpl]     = useState(false);
  const [applyError, setApplyError]       = useState<string | null>(null);

  if (!data) return <div>Loading…</div>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["asset", id] });

  const effectiveType = data.asset_type.effective ?? "";
  const showFuncCust  = !NO_FUNC_CUST_TYPES.has(effectiveType);
  const showUser      = USER_FIELD_TYPES.has(effectiveType);

  // ── Template save ─────────────────────────────────────────────────────────
  function handleSaveTemplate() {
    const values: Record<string, string> = {};
    TEMPLATE_FIELDS.forEach(f => {
      const fv = (data as any)[f] as FieldValue;
      if (fv?.effective != null && fv.effective !== "") values[f] = String(fv.effective);
    });
    persistTemplate({
      id: Date.now().toString(),
      name: templateName.trim() || `Template – ${new Date().toLocaleDateString()}`,
      createdAt: new Date().toISOString(),
      values,
    });
    setTemplates(getTemplates()); setTemplateModal(null); setTemplateName("");
  }

  async function handleApplyTemplate(tpl: OverrideTemplate) {
    setApplyingTpl(true); setApplyError(null);
    try {
      for (const [field, value] of Object.entries(tpl.values)) {
        await api.put(`/assets/${data.id}/override/${field}`, { value });
      }
      refresh(); setTemplateModal(null);
    } catch (e: any) {
      setApplyError(e?.response?.data?.detail || "Failed to apply template.");
    } finally {
      setApplyingTpl(false);
    }
  }

  function handleDeleteTemplate(tplId: string) {
    deleteTemplate(tplId); setTemplates(getTemplates());
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{data.hostname.effective || `Asset #${data.id}`}</h1>
        {data.conflict_count > 0 && (
          <span className="badge bg-red-100 text-red-800">{data.conflict_count} conflict(s)</span>
        )}
        <div className="ml-auto text-sm text-slate-500">confidence {Math.round(data.confidence_score * 100)}%</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* ── Left card: override fields ── */}
        <div className="card p-4">
          {/* Template toolbar */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Override Fields</span>
            <div className="ml-auto flex gap-2">
              <button className="btn text-xs"
                onClick={() => { setTemplateModal("save"); setTemplateName(""); }}>
                Save as Template
              </button>
              <button className="btn text-xs"
                onClick={() => { setTemplates(getTemplates()); setTemplateModal("apply"); setApplyError(null); }}>
                Apply Template ▾
              </button>
            </div>
          </div>

          {/* Core identity fields */}
          <OverrideField label="Hostname"    field="hostname"    value={data.hostname}    assetId={data.id} onSaved={refresh} />
          <OverrideField label="MAC"         field="mac"         value={data.mac}         assetId={data.id} onSaved={refresh} />
          <OverrideField label="Asset Type"  field="asset_type"  value={data.asset_type}  assetId={data.id}
            options={ASSET_TYPES} allowCustom onSaved={refresh} />
          <OverrideField label="Status"      field="asset_status" value={data.asset_status} assetId={data.id}
            options={["Operational", "Decommissioned", "In Store"]} onSaved={refresh} />
          <OverrideField label="Environment" field="environment"  value={data.environment}  assetId={data.id}
            options={["Production", "Staging", "UAT", "DEV", "User"]} onSaved={refresh} />
          <OverrideField label="Location"    field="location"    value={data.location}    assetId={data.id}
            options={LOCATION_VALUES} onSaved={refresh} />

          {/* OS fields */}
          <OverrideField label="OS"              field="os"              value={data.os}              assetId={data.id} onSaved={refresh} />
          <OverrideField label="OS Version"      field="os_version"      value={data.os_version}      assetId={data.id} onSaved={refresh} />
          <OverrideField label="OS EOS"          field="os_eos"          value={data.os_eos}          assetId={data.id} type="date" onSaved={refresh} />
          <OverrideField label="OS License"      field="os_license_state" value={data.os_license_state} assetId={data.id}
            options={LICENSE_STATES} onSaved={refresh} />

          {/* EDR / AV license states */}
          <OverrideField label="EDR License" field="edr_license_state" value={data.edr_license_state} assetId={data.id}
            options={LICENSE_STATES} onSaved={refresh} />
          <OverrideField label="AV License"  field="av_license_state"  value={data.av_license_state}  assetId={data.id}
            options={LICENSE_STATES} onSaved={refresh} />

          {/* Conditional: Function + Custodian (not for IPPhone / Workstation) */}
          {showFuncCust && (
            <>
              <OverrideField label="Function"  field="function"  value={data.function}  assetId={data.id} onSaved={refresh} />
              <OverrideField label="Custodian" field="custodian" value={data.custodian} assetId={data.id} onSaved={refresh} />
            </>
          )}

          {/* Conditional: User (IPPhone + Workstation only) */}
          {showUser && (
            <OverrideField label="User" field="user_name" value={data.user_name} assetId={data.id} onSaved={refresh} />
          )}
        </div>

        {/* ── Right card: IPs + criticality ── */}
        <div className="card p-4 space-y-4">
          <IPPanel asset={data} onSaved={refresh} />
          <CriticalityPanel asset={data} onSaved={refresh} />
        </div>
      </div>

      <ConflictsPanel asset={data} onSaved={refresh} />
      <ControlsPanel  asset={data} onSaved={refresh} />
      <VulnerabilitiesPanel assetId={data.id} />

      {/* Save Template modal */}
      {templateModal === "save" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold mb-1">Save Override Template</h2>
            <p className="text-xs text-slate-500 mb-4">
              Saves current effective values for all overridable fields (hostname and MAC excluded).
            </p>
            <label className="block text-xs font-medium text-slate-600 mb-1">Template name</label>
            <input className="input w-full mb-4"
              placeholder={`Template – ${new Date().toLocaleDateString()}`}
              value={templateName} onChange={e => setTemplateName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === "Enter") handleSaveTemplate(); }} />
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => setTemplateModal(null)}>Cancel</button>
              <button className="btn bg-indigo-600 text-white hover:bg-indigo-700" onClick={handleSaveTemplate}>
                Save Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply Template modal */}
      {templateModal === "apply" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <h2 className="text-base font-semibold mb-1">Apply Saved Override Template</h2>
            <p className="text-xs text-slate-500 mb-4">
              Applying a template overwrites matching override fields on this asset.
            </p>
            {applyError && <p className="text-red-600 text-sm mb-3">{applyError}</p>}
            {templates.length === 0 ? (
              <div className="text-slate-500 text-sm py-4 text-center">
                No saved templates yet. Use "Save as Template" on any asset.
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map(tpl => (
                  <div key={tpl.id} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-medium text-sm">{tpl.name}</div>
                        <div className="text-xs text-slate-400">{new Date(tpl.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="btn text-xs bg-indigo-600 text-white hover:bg-indigo-700"
                          disabled={applyingTpl} onClick={() => handleApplyTemplate(tpl)}>
                          {applyingTpl ? "Applying…" : "Apply"}
                        </button>
                        <button className="btn text-xs text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteTemplate(tpl.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 bg-slate-50 rounded p-2">
                      {Object.entries(tpl.values).map(([k, v]) => (
                        <div key={k}>
                          <span className="text-slate-400">{k}: </span>
                          <span className="font-medium">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-4 pt-3 border-t">
              <button className="btn" onClick={() => setTemplateModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
