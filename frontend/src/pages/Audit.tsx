import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export default function Audit() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: async () => (await api.get("/audit")).data,
  });
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Audit Log</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-600 text-left"><tr>
            <th className="p-2">When</th><th>Entity</th><th>Action</th><th>Field</th><th>Old</th><th>New</th><th>User</th>
          </tr></thead>
          <tbody>
            {data?.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.entity_type} #{r.entity_id}</td>
                <td>{r.action}</td>
                <td>{r.field || "—"}</td>
                <td className="font-mono text-xs">{r.old_value || "—"}</td>
                <td className="font-mono text-xs">{r.new_value || "—"}</td>
                <td>{r.user_id ?? "system"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
