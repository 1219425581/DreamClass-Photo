import { useEffect, useMemo, useState } from "react";

const PROMPT_TIPS = [
  "身份方向：阳光少年 / 自信少女 / 温柔魔法师 / 武侠少侠 / 星际旅行者",
  "外观细节：清爽发型、明亮眼睛、自然微笑、干净气质、灵动神情",
  "服装道具：校服、汉服、披风、机甲外套、法杖、长剑、星际徽章",
  "场景氛围：校园光影、竹林晨雾、星舰舷窗、童话森林、未来城市",
  "画面风格：清新写实、武侠水墨、梦幻童话、电影感、二次元、国风插画",
  "组合写法：身份 + 发型五官 + 服装道具 + 场景氛围 + 艺术风格",
];

const PROMPT_EXAMPLES = [
  "阳光少年，短黑发，明亮眼睛，自然微笑，穿白色衬衫，清新写实风格",
  "自信少女，柔顺长发，温暖笑容，穿浅色校服，梦幻电影感肖像",
  "温柔女魔法师，银色长发，戴圆框眼镜，手持法杖，奇幻治愈风格",
  "武侠少侠，束发高马尾，青色长衫，手持长剑，竹林晨雾，水墨国风",
  "星际旅行者，银灰短发，穿轻量机甲外套，胸前星际徽章，星舰舷窗背景",
  "国风少女，黑色长发，浅粉汉服，手持团扇，桃花微光，精致国风插画",
  "未来工程师，清爽短发，透明护目镜，蓝白科技外套，未来城市夜景",
  "森林精灵少年，浅金色头发，绿色披风，肩上发光小鸟，童话森林氛围",
  "活力运动员，利落短发，蓝色运动外套，阳光笑容，校园操场电影感",
  "治愈系画师，柔和卷发，米色针织衫，怀抱画板，暖色窗边光影",
];

function notifyAccessDenied() {
  window.dispatchEvent(new Event("dreamclass-access-denied"));
}

function getStoredSessionId() {
  const saved = localStorage.getItem("dreamclass-session-id");
  if (saved) return saved;
  const next = crypto.randomUUID().slice(0, 8);
  localStorage.setItem("dreamclass-session-id", next);
  return next;
}

export default function Join() {
  const [sessionId] = useState(getStoredSessionId);
  const [nickname, setNickname] = useState("");
  const [prompt, setPrompt] = useState("");
  const [session, setSession] = useState(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedCharacter, setSubmittedCharacter] = useState(null);
  const [error, setError] = useState("");

  const candidates = session?.candidates || [];
  const attemptsUsed = session?.attemptsUsed || 0;
  const maxAttempts = session?.maxAttempts || 3;
  const isGenerating = session?.status === "generating";
  const canGenerate = attemptsUsed < maxAttempts && !isGenerating && !session?.submitted;
  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.id === selectedCandidateId),
    [candidates, selectedCandidateId]
  );
  const previewCandidate = selectedCandidate || [...candidates].reverse().find((item) => item.status === "generating") || candidates[candidates.length - 1];

  useEffect(() => {
    if (!session || session.submitted) return;
    if (!isGenerating && candidates.every((item) => item.status !== "generating")) return;

    let cancelled = false;
    const loadSession = async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}`, { credentials: "include" });
        if (res.status === 403) {
          notifyAccessDenied();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setSession(data);
          const firstDone = data.candidates?.find((item) => item.status === "done");
          if (firstDone && !selectedCandidateId) setSelectedCandidateId(firstDone.id);
        }
      } catch {
        // 下一轮轮询会重试
      }
    };

    const timer = setInterval(loadSession, 1500);
    loadSession();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [candidates, isGenerating, selectedCandidateId, session, sessionId]);

  const generatePortrait = async (e) => {
    e?.preventDefault();
    if (!prompt.trim() || !canGenerate) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          nickname: nickname || undefined,
          prompt: prompt.trim(),
        }),
      });

      const data = await res.json();
      if (res.status === 403) {
        notifyAccessDenied();
        return;
      }
      if (!res.ok) throw new Error(data.detail || "生成失败，请重试");
      setSession(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitSelected = async () => {
    if (!selectedCandidate || selectedCandidate.status !== "done") return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sessionId,
          candidateId: selectedCandidate.id,
          nickname: nickname || undefined,
        }),
      });

      const data = await res.json();
      if (res.status === 403) {
        notifyAccessDenied();
        return;
      }
      if (!res.ok) throw new Error(data.detail || "同步失败，请重试");
      setSession(data.session);
      setSubmittedCharacter(data.character);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submittedCharacter) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a2e] via-[#1a0a3e] to-[#0a0a1a] p-4">
        <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/5 p-7 text-center shadow-2xl shadow-violet-950/30 backdrop-blur-xl">
          <div className="mx-auto mb-5 aspect-square w-56 overflow-hidden rounded-3xl border border-violet-300/30 bg-violet-950/40 shadow-2xl shadow-violet-950/40">
            <img
              src={submittedCharacter.imageUrl}
              alt={submittedCharacter.nickname}
              className="h-full w-full object-cover"
            />
          </div>
          <h2 className="mb-2 text-xl font-bold text-violet-300">已同步到大屏合影</h2>
          <p className="text-sm text-white/65">
            {submittedCharacter.nickname}，请看向大屏幕确认你的虚拟形象
          </p>
          <a
            href="/screen"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-5 py-3 font-semibold text-white shadow-lg shadow-violet-950/30"
          >
            前往大屏幕观看
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a2e] via-[#1a0a3e] to-[#0a0a1a] p-4 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center py-6">
        <div className="grid w-full gap-5 lg:grid-cols-[0.95fr_1.25fr]">
          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <h1 className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-center text-2xl font-black text-transparent">
              DreamClass Photo
            </h1>
            <p className="mt-2 text-center text-sm text-white/45">
              先生成个人肖像，满意后再同步到大屏合影
            </p>

            <form onSubmit={generatePortrait} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm text-white/65">昵称</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="匿名同学"
                  disabled={session?.submitted}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-violet-400 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/65">
                  形象描述 <span className="text-pink-400">*</span>
                </label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例如：阳光少年，短黑发，明亮眼睛，自然微笑，穿白色衬衫，清新写实风格"
                  rows={5}
                  disabled={isGenerating || attemptsUsed >= maxAttempts}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-violet-400 disabled:opacity-60"
                />
              </div>

              <div className="rounded-2xl border border-violet-300/15 bg-violet-400/10 p-4">
                <p className="mb-2 text-sm font-semibold text-violet-100">提示词建议</p>
                <ul className="space-y-1.5 text-xs leading-relaxed text-white/58">
                  {PROMPT_TIPS.map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-wrap gap-2">
                {PROMPT_EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setPrompt(example)}
                    disabled={isGenerating || attemptsUsed >= maxAttempts}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-left text-xs text-white/65 transition hover:border-violet-300/50 hover:text-white disabled:opacity-45"
                  >
                    {example.slice(0, 18)}...
                  </button>
                ))}
              </div>

              {error && <p className="text-center text-sm text-red-300">{error}</p>}

              <button
                type="submit"
                disabled={loading || !prompt.trim() || !canGenerate}
                className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 py-3 font-semibold text-white shadow-lg shadow-violet-950/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isGenerating || loading
                  ? "肖像生成中..."
                  : attemptsUsed === 0
                    ? "生成第一张肖像"
                    : attemptsUsed < maxAttempts
                      ? `重新生成（剩余 ${maxAttempts - attemptsUsed} 次）`
                      : "三次机会已用完"}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/20 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">候选肖像</h2>
                <p className="mt-1 text-sm text-white/45">
                  已使用 {attemptsUsed} / {maxAttempts} 次，选择满意的一张同步到大屏
                </p>
              </div>
              {isGenerating && (
                <span className="rounded-full bg-violet-400/15 px-3 py-1 text-xs text-violet-100">
                  生成中
                </span>
              )}
            </div>

            {candidates.length === 0 ? (
              <div className="mt-6 flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-white/10 bg-white/[0.03] text-center">
                <div>
                  <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-violet-400/15 ring-1 ring-violet-200/20" />
                  <p className="text-white/70">还没有候选肖像</p>
                  <p className="mt-2 text-sm text-white/35">填写描述后开始生成，最多可生成三张</p>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <div className="relative mx-auto max-w-sm overflow-hidden rounded-[2rem] border border-white/10 bg-black/20 p-3 shadow-2xl shadow-violet-950/30">
                  <div className="aspect-square overflow-hidden rounded-[1.5rem] bg-violet-950/50">
                    {previewCandidate?.status === "done" && previewCandidate?.imageUrl ? (
                      <img
                        src={previewCandidate.imageUrl}
                        alt="当前预览肖像"
                        className="h-full w-full object-cover"
                      />
                    ) : previewCandidate?.status === "error" ? (
                      <div className="flex h-full items-center justify-center px-6 text-center text-red-200">
                        这张生成失败，请选择其他候选或重新生成
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-4 text-violet-100/80">
                        <div className="h-11 w-11 animate-spin rounded-full border-2 border-violet-200/25 border-t-violet-100" />
                        <span className="text-base font-semibold">肖像生成中</span>
                        <span className="text-xs text-white/35">完成后会自动显示在这里</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between px-1 text-sm">
                    <span className="font-semibold text-white/85">
                      当前预览：第 {Math.max(1, candidates.findIndex((item) => item.id === previewCandidate?.id) + 1)} 张
                    </span>
                    {previewCandidate?.id === selectedCandidateId && (
                      <span className="rounded-full bg-violet-400/15 px-2 py-1 text-xs text-violet-100">已选择</span>
                    )}
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((slot) => {
                    const candidate = candidates[slot];
                    const done = candidate?.status === "done" && candidate?.imageUrl;
                    const selected = candidate?.id === selectedCandidateId;
                    const previewing = candidate?.id === previewCandidate?.id;

                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => done && setSelectedCandidateId(candidate.id)}
                        disabled={!done}
                        className={`rounded-2xl border p-2 text-left transition ${
                          selected
                            ? "border-violet-300 bg-violet-400/20 shadow-lg shadow-violet-950/30"
                            : previewing
                              ? "border-white/30 bg-white/10"
                              : "border-white/10 bg-white/[0.03] hover:border-violet-300/40"
                        } disabled:cursor-not-allowed disabled:opacity-75`}
                      >
                        <div className="aspect-square overflow-hidden rounded-xl bg-violet-950/50">
                          {done ? (
                            <img
                              src={candidate.imageUrl}
                              alt={`候选肖像 ${slot + 1}`}
                              className="h-full w-full object-cover"
                            />
                          ) : candidate?.status === "error" ? (
                            <div className="flex h-full items-center justify-center px-2 text-center text-xs text-red-200">
                              失败
                            </div>
                          ) : candidate?.status === "generating" ? (
                            <div className="flex h-full items-center justify-center">
                              <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-200/25 border-t-violet-100" />
                            </div>
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-white/25">
                              待生成
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs">
                          <span className="font-semibold text-white/70">第 {slot + 1} 张</span>
                          {selected && <span className="text-violet-200">选中</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-white/55">
                规则：个人肖像生成后只在本页预览，不会自动出现在大屏。三次机会用完后，仍然可以从已成功生成的候选图中选择一张提交。
              </p>
              <button
                type="button"
                onClick={submitSelected}
                disabled={submitting || !selectedCandidate || selectedCandidate.status !== "done" || session?.submitted}
                className="mt-4 w-full rounded-xl bg-white px-5 py-3 font-semibold text-violet-950 shadow-lg shadow-black/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {submitting ? "同步中..." : "选择这张并同步到大屏合影"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
