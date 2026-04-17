import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar, BarChart, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api/client";

type Coverage = {
  code: string; name: string;
  applicable: number; installed: number; missing: number;
  coverage_pct: number | null;
};
type DashboardData = {
  total_assets: number;
  eos_assets: number;
  unknown_assets: number;
  conflicts_count: number;
  coverage: Coverage[];
  criticality_distribution: Record<string, number>;
};

const CRIT_COLORS: Record<string, string> = {
  Critical: "#dc2626", High: "#ea580c", Medium: "#ca8a04",
  Low: "#16a34a", Unscored: "#94a3b8",
};

type CoverageFilter = "all" | "integrated" | "missing";

function StatCard({
  label, value, tone, to,
}: { label: string; value: number | string; tone: string; to?: string }) {
  const inner = (
    <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer h-full">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
      <div className={`h-1 rounded mt-4 ${tone}`} />
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>("all");

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/reports/dashboard")).data,
  });

  if (isLoading || !data) return <div className="text-slate-500">Loading…</div>;

  const critData = Object.entries(data.criticality_distribution)
    .map(([name, value]) => ({ name, value }))
    .filter((x) => x.value > 0);

  const filteredCoverage = data.coverage.filter((c) => {
    if (coverageFilter === "integrated") return c.installed > 0;
    if (coverageFilter === "missing") return c.missing > 0;
    return true;
  });

  const coverageChart = filteredCoverage.map((c) => ({
    code: c.code,
    Integrated: c.installed,
    Missing: c.missing,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Security Posture</h1>
        <a href="/api/reports/export/assets.xlsx" className="btn">Export to Excel</a>
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Assets" value={data.total_assets} tone="bg-indigo-600" to="/assets" />
        <StatCard label="EOS Operating Systems" value={data.eos_assets} tone="bg-red-600" to="/assets?eos_only=1" />
        <StatCard label="Unknown / Unmanaged" value={data.unknown_assets} tone="bg-amber-500" to="/assets?unknown_only=1" />
        <StatCard
          label="Unresolved Conflicts"
          value={data.conflicts_count}
          tone={data.conflicts_count > 0 ? "bg-orange-500" : "bg-slate-300"}
          to={data.conflicts_count > 0 ? "/assets?has_conflicts=1" : undefined}
        />
      </div>

      {/* Coverage chart + criticality donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold">Control Coverage (applicable assets only)</h2>
            <div className="flex gap-1">
              {(["all", "integrated", "missing"] as CoverageFilter[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setCoverageFilter(f)}
                  className={`px-3 py-1 text-xs rounded font-medium border transition-colors ${
                    coverageFilter === f
                      ? f === "integrated"
                        ? "bg-emerald-600 text-white border-emerald-600"
                        : f === "missing"
                        ? "bg-red-500 text-white border-red-500"
                        : "bg-indigo-600 text-white border-indigo-600"
                      : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {f === "all" ? "All" : f === "integrated" ? "Integrated" : "Missing"}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500 mb-3">Click a bar to see those assets</p>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={coverageChart} style={{ cursor: "pointer" }}>
                <XAxis dataKey="code" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="Integrated"
                  stackId="a"
                  fill="#10b981"
                  onClick={(barData) => {
                    navigate(`/assets?installed_control=${(barData as any).code}`);
                  }}
                />
                <Bar
                  dataKey="Missing"
                  stackId="a"
                  fill="#ef4444"
                  onClick={(barData) => {
                    navigate(`/assets?missing_control=${(barData as any).code}`);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold mb-3">Criticality</h2>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={critData}
                  dataKey="value" nameKey="name"
                  innerRadius={50} outerRadius={90}
                  label={(e) => `${e.name}: ${e.value}`}
                >
                  {critData.map((d) => (
                    <Cell key={d.name} fill={CRIT_COLORS[d.name] || "#94a3b8"} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed coverage table */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Control Coverage — click to investigate</h2>
          <div className="flex gap-1">
            {(["all", "integrated", "missing"] as CoverageFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setCoverageFilter(f)}
                className={`px-3 py-1 text-xs rounded font-medium border transition-colors ${
                  coverageFilter === f
                    ? f === "integrated"
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : f === "missing"
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
                }`}
              >
                {f === "all" ? "All" : f === "integrated" ? "Integrated" : "Missing"}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b">
            <tr>
              <th className="py-2 pr-4">Control</th>
              <th>Applicable</th>
              <th>Integrated</th>
              <th>Missing</th>
              <th>Coverage</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filteredCoverage.map((c) => (
              <tr key={c.code} className="border-b last:border-0 hover:bg-slate-50">
                <td className="py-2 pr-4">
                  <span className="font-medium">{c.code}</span>
                  <span className="ml-2 text-slate-500 text-xs">{c.name}</span>
                </td>
                <td>{c.applicable}</td>
                <td className="text-emerald-700">{c.installed}</td>
                <td className={c.missing ? "text-red-600 font-medium" : ""}>{c.missing}</td>
                <td>
                  {c.coverage_pct !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-slate-200 rounded">
                        <div
                          className={`h-2 rounded ${c.coverage_pct >= 90 ? "bg-emerald-500" : c.coverage_pct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${c.coverage_pct}%` }}
                        />
                      </div>
                      <span className="tabular-nums text-xs">{c.coverage_pct}%</span>
                    </div>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-2">
                    {c.installed > 0 && (
                      <Link
                        to={`/assets?installed_control=${c.code}`}
                        className="btn text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      >
                        View {c.installed} integrated →
                      </Link>
                    )}
                    {c.missing > 0 && (
                      <Link
                        to={`/assets?missing_control=${c.code}`}
                        className="btn text-xs"
                      >
                        View {c.missing} missing →
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
