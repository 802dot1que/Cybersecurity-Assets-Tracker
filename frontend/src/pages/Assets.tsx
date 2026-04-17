import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { AssetListItem } from "../types";

export default function Assets() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");

  const { data } = useQuery({
    queryKey: ["assets", q, type],
    queryFn: async () =>
      (await api.get<AssetListItem[]>("/assets", { params: { q: q || undefined, asset_type: type || undefined } })).data,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Assets</h1>
        <input className="input w-64 ml-auto" placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
        <select className="input w-40" value={type} onChange={e => setType(e.target.value)}>
          <option value="">All types</option>
          {["Server","Workstation","Router","Switch","Firewall","Hypervisor","Printer","IPPhone","IPCamera","URL","LoadBalancer","Unknown"].map(t =>
            <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left">
            <tr>
              <th className="p-2">Hostname</th><th>Type</th><th>MAC</th><th>IPs</th>
              <th>OS</th><th>Criticality</th><th>Conf.</th><th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {data?.map(a => (
              <tr key={a.id} className="border-t hover:bg-slate-50">
                <td className="p-2"><Link className="text-indigo-700 hover:underline" to={`/assets/${a.id}`}>{a.hostname || "—"}</Link></td>
                <td>{a.asset_type || "—"}</td>
                <td className="font-mono text-xs">{a.mac || "—"}</td>
                <td>{a.ips.join(", ") || "—"}</td>
                <td>{a.os} {a.os_version}</td>
                <td>{a.criticality_level || "—"}</td>
                <td>{Math.round(a.confidence_score * 100)}%</td>
                <td>{a.last_seen ? new Date(a.last_seen).toLocaleString() : "—"}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={8} className="p-4 text-center text-slate-500">No assets yet — try uploading an Excel file.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
