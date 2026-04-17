import { useEffect, useState } from "react";
import { api } from "../api/client";

type Me = { id: number; email: string; full_name: string; role: string } | null;

export function useAuth() {
  const [user, setUser] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("token");
    if (!t) { setLoading(false); return; }
    api.get("/auth/me").then(r => setUser(r.data)).catch(() => {
      localStorage.removeItem("token");
    }).finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const form = new URLSearchParams({ username: email, password });
    const r = await api.post("/auth/login", form);
    localStorage.setItem("token", r.data.access_token);
    const me = await api.get("/auth/me");
    setUser(me.data);
  }

  function logout() {
    localStorage.removeItem("token");
    setUser(null);
    window.location.assign("/login");
  }

  return { user, loading, login, logout };
}
