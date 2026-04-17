import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import AssetDetail from "./pages/AssetDetail";
import Upload from "./pages/Upload";
import Audit from "./pages/Audit";
import Login from "./pages/Login";
import { useAuth } from "./hooks/useAuth";

function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const link = "px-3 py-1.5 rounded-md text-sm";
  const active = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${link} bg-indigo-600 text-white` : `${link} hover:bg-slate-200`;
  return (
    <div className="min-h-screen">
      <header className="border-b bg-white px-6 py-3 flex items-center gap-6">
        <div className="font-semibold">Asset Inventory</div>
        <nav className="flex gap-1">
          <NavLink to="/" end className={active}>Dashboard</NavLink>
          <NavLink to="/assets" className={active}>Assets</NavLink>
          <NavLink to="/upload" className={active}>Upload</NavLink>
          <NavLink to="/audit" className={active}>Audit</NavLink>
        </nav>
        <div className="ml-auto text-sm text-slate-600">
          {user?.email} · <button className="underline" onClick={logout}>Logout</button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/assets" element={<Protected><Assets /></Protected>} />
      <Route path="/assets/:id" element={<Protected><AssetDetail /></Protected>} />
      <Route path="/upload" element={<Protected><Upload /></Protected>} />
      <Route path="/audit" element={<Protected><Audit /></Protected>} />
    </Routes>
  );
}
