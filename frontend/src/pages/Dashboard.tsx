import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/reports/dashboard")).data,
  });
  if (!data) return <div>Loading…</div>;

  const stat = (label: string, value: any, tone = "bg-indigo-600") => (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className={`h-1 rounded mt-3 ${tone}`} />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        {stat("Total Assets", data.total_assets)}
        {stat("EOS Operating Systems", data.eos_assets, "bg-red-600")}
        {stat("Unknown / Unmanaged", data.unknown_assets, "bg-amber-500")}
        {stat("Controls Tracked", data.coverage.length, "bg-emerald-600")}
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Security Control Coverage</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-1">Control</th><th>Applicable</th><th>Installed</th><th>Missing</th><th>Coverage</th>
            </tr>
          </thead>
          <tbody>
            {data.coverage.map((c: any) => (
              <tr key={c.code} className="border-b last:border-0">
                <td className="py-1 font-medium">{c.code} <span className="text-slate-500">{c.name}</span></td>
                <td>{c.applicable}</td>
                <td>{c.installed}</td>
                <td className={c.missing ? "text-red-600" : ""}>{c.missing}</td>
                <td>
                  {c.coverage_pct !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-slate-200 rounded">
                        <div className="h-2 bg-emerald-500 rounded" style={{ width: `${c.coverage_pct}%` }} />
                      </div>
                      <span>{c.coverage_pct}%</span>
                    </div>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold mb-3">Criticality Distribution</h2>
        <div className="flex gap-4">
          {Object.entries(data.criticality_distribution).map(([k, v]) => (
            <div key={k} className="flex-1 border rounded-md p-3 text-center">
              <div className="text-xs uppercase text-slate-500">{k}</div>
              <div className="text-xl font-semibold">{v as any}</div>
            </div>
          ))}
        </div>
      </div>

      <a href="/api/reports/export/assets.xlsx" className="btn">Export assets to Excel</a>
    </div>
  );
}
