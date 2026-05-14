import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Join from "./pages/Join";
import Screen from "./pages/Screen";

function AuthGate({ children }) {
  const location = useLocation();
  const [auth, setAuth] = useState({ loading: true, authenticated: false, enabled: true });

  useEffect(() => {
    let cancelled = false;
    const loadAuth = async () => {
      try {
        const res = await fetch("/api/auth/status", { credentials: "include" });
        const data = await res.json();
        if (!cancelled) setAuth({ loading: false, ...data });
      } catch {
        if (!cancelled) setAuth({ loading: false, authenticated: false, enabled: true });
      }
    };
    loadAuth();
    window.addEventListener("dreamclass-auth-required", loadAuth);
    return () => {
      cancelled = true;
      window.removeEventListener("dreamclass-auth-required", loadAuth);
    };
  }, []);

  const loginUrl = `/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`;

  const logout = async () => {
    await fetch("/auth/logout", { method: "POST", credentials: "include" });
    setAuth({ loading: false, authenticated: false, enabled: true });
  };

  if (auth.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070716] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-violet-200/25 border-t-violet-100" />
          <p className="text-sm text-white/60">正在检查登录状态...</p>
        </div>
      </div>
    );
  }

  if (auth.enabled && !auth.authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a2e] via-[#1a0a3e] to-[#0a0a1a] p-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
          <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-violet-400/15 ring-1 ring-violet-200/20" />
          <h1 className="text-2xl font-black">DreamClass Photo</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            请先通过南昌大学门户系统认证，认证成功后即可生成个人肖像并参与大屏合影。
          </p>
          <a
            href={loginUrl}
            className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-950/30"
          >
            通过南昌大学门户登录
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      {auth.enabled && auth.user && (
        <div className="fixed right-4 top-4 z-[100] flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/75 backdrop-blur-xl">
          <span>{auth.user.displayName || auth.user.username}</span>
          <button type="button" onClick={logout} className="text-violet-200 hover:text-white">
            退出
          </button>
        </div>
      )}
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route path="/" element={<Join />} />
        <Route path="/screen" element={<Screen />} />
      </Routes>
    </AuthGate>
  );
}
