import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { AssetOut, ConflictOut, FieldValue } from "../types";
import { useState } from "react";

function OverrideField({
  label, field, value, assetId, type = "text", onSaved,
}: { label: string; field: string; value: FieldValue; assetId: number; type?: string; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(value.override ?? "");

  const save = useMutation({
    mutationFn: async () =>
      (await api.put(`/assets/${assetId}/override/${field}`, { value: draft || null })).data,
    onSuccess: () => { onSaved(); setEditing(false); },
  });
  const clear = useMutation({
    mutationFn: async () => (await api.delete(`/assets/${assetId}/override/${field}`)).data,
    onSuccess: () => { onSaved(); setEditing(false); },
  });

  return (
    <div className="py-2 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-32 text-sm text-slate-500">{label}</div>
        <div className="flex-1">
          <div className="font-medium">
            {String(value.effective ?? "—")}
            {value.overridden && <span className="ml-2 badge bg-amber-100 text-amber-800">overridden</span>}
          </div>
          {value.overridden && (
            <div className="text-xs text-slate-500">
              System value: {String(value.system ?? "—")}
            </div>
          )}
        </div>
        {!editing && <button className="btn" onClick={() => { setDraft(String(value.override ?? "")); setEditing(true); }}>Edit</button>}
      </div>
      {editing && (
        <div className="flex items-center gap-2 mt-2 ml-32">
          <input className="input max-w-sm" type={type} value={draft} onChange={e => setDraft(e.target.value)} />
          <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Save override</button>
          {value.overridden && <button className="btn" onClick={() => clear.mutate()}>Clear override</button>}
          <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function ConflictsPanel({ asset, onSaved }: { asset: AssetOut; onSaved: () => void }) {
  const [customValues, setCustomValues] = useState<Record<number, string>>({});

  const resolve = useMutation({
    mutationFn: async ({ conflictId, choice, overrideValue }: { conflictId: number; choice: string; overrideValue?: string }) =>
      (await api.post(`/assets/${asset.id}/conflicts/${conflictId}/resolve`, {
        choice,
        override_value: overrideValue ?? null,
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
              <button
                className="btn btn-primary text-xs"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ conflictId: c.id, choice: "a" })}
              >
                Use A
              </button>
              <button
                className="btn btn-primary text-xs"
                disabled={resolve.isPending}
                onClick={() => resolve.mutate({ conflictId: c.id, choice: "b" })}
              >
                Use B
              </button>
              <input
                className="input text-xs w-40"
                placeholder="Custom value…"
                value={customValues[c.id] ?? ""}
                onChange={(e) => setCustomValues((prev) => ({ ...prev, [c.id]: e.target.value }))}
              />
              <button
                className="btn text-xs"
                disabled={resolve.isPending || !customValues[c.id]}
                onClick={() => resolve.mutate({ conflictId: c.id, choice: "override", overrideValue: customValues[c.id] })}
              >
                Use custom
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
        <thead className="text-slate-500 text-left"><tr>
          <th>Control</th><th>Applicable</th><th>System</th><th>Override</th><th>Effective</th><th>Last check-in</th>
        </tr></thead>
        <tbody>
          {asset.controls.map(c => (
            <tr key={c.code} className={`border-t ${!c.applicable ? "opacity-40" : ""}`}>
              <td className="py-1">{c.code}</td>
              <td>{c.applicable ? "Yes" : "N/A"}</td>
              <td>{c.system_status || "—"}</td>
              <td>
                <select
                  className="input w-32" disabled={!c.applicable}
                  value={c.override_status || ""}
                  onChange={e => update.mutate({ code: c.code, status: e.target.value || null })}
                >
                  <option value="">—</option>
                  <option>Installed</option><option>Missing</option><option>Unknown</option>
                </select>
              </td>
              <td><span className={`badge ${c.effective_status === "Installed" ? "bg-emerald-100 text-emerald-800" :
                c.effective_status === "Missing" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>
                {c.effective_status}
              </span></td>
              <td>{c.last_check_in ? new Date(c.last_check_in).toLocaleString() : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AssetDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => (await api.get<AssetOut>(`/assets/${id}`)).data,
  });

  if (!data) return <div>Loading…</div>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["asset", id] });

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="text-xl font-semibold">{data.hostname.effective || `Asset #${data.id}`}</h1>
        {data.conflict_count > 0 && (
          <span className="ml-3 badge bg-red-100 text-red-800">{data.conflict_count} conflict(s)</span>
        )}
        <div className="ml-auto text-sm text-slate-500">confidence {Math.round(data.confidence_score * 100)}%</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4">
          <OverrideField label="Hostname" field="hostname" value={data.hostname} assetId={data.id} onSaved={refresh} />
          <OverrideField label="MAC" field="mac" value={data.mac} assetId={data.id} onSaved={refresh} />
          <OverrideField label="Asset Type" field="asset_type" value={data.asset_type} assetId={data.id} onSaved={refresh} />
          <OverrideField label="OS" field="os" value={data.os} assetId={data.id} onSaved={refresh} />
          <OverrideField label="OS Version" field="os_version" value={data.os_version} assetId={data.id} onSaved={refresh} />
          <OverrideField label="OS EOS" field="os_eos" value={data.os_eos} assetId={data.id} type="date" onSaved={refresh} />
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-2">IP Addresses</h3>
          <ul className="text-sm">
            {data.ips.map(i => (
              <li key={i.ip} className="flex justify-between border-b last:border-0 py-1">
                <span className="font-mono">{i.ip}</span>
                <span className="text-slate-500">{i.source || "—"}</span>
              </li>
            ))}
            {!data.ips.length && <li className="text-slate-500">None</li>}
          </ul>

          <h3 className="font-semibold mb-2 mt-4">Criticality</h3>
          {data.criticality ? (
            <div>
              <div className="text-2xl font-semibold">{data.criticality.level} <span className="text-base text-slate-500">· {data.criticality.score}/100</span></div>
              <div className="text-xs text-slate-500 mt-1">source: {data.criticality.source}</div>
              {data.criticality.details?.reasons && (
                <ul className="list-disc list-inside text-sm mt-2 text-slate-600">
                  {data.criticality.details.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          ) : <div className="text-slate-500 text-sm">Not scored</div>}
          <button className="btn mt-3" onClick={async () => { await api.post(`/assets/${data.id}/criticality/recompute`); refresh(); }}>
            Recompute
          </button>
        </div>
      </div>

      <ConflictsPanel asset={data} onSaved={refresh} />
      <ControlsPanel asset={data} onSaved={refresh} />
    </div>
  );
}
