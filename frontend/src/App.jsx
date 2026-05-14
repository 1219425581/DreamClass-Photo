import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import Join from "./pages/Join";
import Screen from "./pages/Screen";

function AccessGate({ children }) {
  const [access, setAccess] = useState({ loading: true, allowed: true, mode: "none" });

  useEffect(() => {
    let cancelled = false;
    const loadAccess = async () => {
      try {
        const res = await fetch("/api/access-status");
        if (res.status === 403) {
          const data = await res.json();
          if (!cancelled) setAccess({ loading: false, allowed: false, ...data });
          return;
        }
        const data = await res.json();
        if (!cancelled) setAccess({ loading: false, allowed: true, ...data });
      } catch {
        if (!cancelled) setAccess({ loading: false, allowed: true, mode: "none" });
      }
    };
    loadAccess();
    window.addEventListener("dreamclass-access-denied", loadAccess);
    return () => {
      cancelled = true;
      window.removeEventListener("dreamclass-access-denied", loadAccess);
    };
  }, []);

  if (access.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070716] text-white">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-2 border-violet-200/25 border-t-violet-100" />
          <p className="text-sm text-white/60">正在检查校园网访问状态...</p>
        </div>
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a2e] via-[#1a0a3e] to-[#0a0a1a] p-4 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
          <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-violet-400/15 ring-1 ring-violet-200/20" />
          <h1 className="text-2xl font-black">DreamClass Photo</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            请连接南昌大学校园网后再使用本服务。
          </p>
          {access.clientIp && (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/45">
              当前访问 IP：{access.clientIp}
            </p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-7 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-950/30"
          >
            已连接校园网，重新检测
          </button>
        </div>
      </div>
    );
  }

  return children;
}

export default function App() {
  return (
    <AccessGate>
      <Routes>
        <Route path="/" element={<Join />} />
        <Route path="/screen" element={<Screen />} />
      </Routes>
    </AccessGate>
  );
}
