import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      nav("/");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={submit} className="card p-6 w-80 space-y-3">
        <h1 className="text-lg font-semibold">Sign in</h1>
        <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email" />
        <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="password" />
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button className="btn btn-primary w-full">Sign in</button>
      </form>
    </div>
  );
}
