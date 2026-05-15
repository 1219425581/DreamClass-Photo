import { useEffect, useMemo, useRef, useState } from "react";

const PROMPT_TIPS = [
  { title: "身份设定", items: "阳光少年、自信少女、武侠少侠、星际旅行者、森林精灵、未来工程师" },
  { title: "教师画像", items: "大学教师、课程主讲人、科研导师、学术前辈、教育工作者、项目负责人" },
  { title: "成熟气质", items: "成熟稳重、儒雅亲和、智慧从容、温和坚定、精神饱满、学者风范" },
  { title: "外观气质", items: "清爽发型、明亮眼睛、自然微笑、灵动神情、干净气质、亲和表情" },
  { title: "服装道具", items: "浅色校服、国风汉服、西装衬衫、针织开衫、书本讲义、眼镜徽章" },
  { title: "场景氛围", items: "校园光影、智慧教室、图书馆、竹林晨雾、星舰舷窗、未来城市" },
  { title: "画面风格", items: "清新写实、武侠水墨、梦幻童话、国风插画、电影感肖像、温暖纪实" },
  { title: "组合公式", items: "身份设定 + 年龄气质 + 服装道具 + 场景氛围 + 画面风格" },
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
  "中年大学老师，成熟稳重，戴细框眼镜，深色西装配浅色衬衫，智慧教室背景，温暖写实肖像",
  "儒雅男教师，短发微笑，手持教材与粉笔，站在黑板前，亲和从容，电影感半身像",
  "温和女教师，肩长发，米色针织开衫，怀抱讲义，图书馆柔和光影，知性优雅风格",
  "科研导师，精神饱满，白衬衫配深色外套，身后是实验室与数据屏幕，现代科技写实风",
  "课程主讲人，成熟亲切，自信微笑，佩戴校徽，智慧课堂讲台背景，庄重大方的纪念照",
  "学者风范的大学教师，灰色短发，圆框眼镜，手边有书本和笔记，暖色窗边光影，细腻写实",
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
  const nicknameInputRef = useRef(null);
  const promptInputRef = useRef(null);

  const candidates = session?.candidates || [];
  const attemptsUsed = session?.attemptsUsed || 0;
  const maxAttempts = session?.maxAttempts || 3;
  const totalSlots = Math.max(maxAttempts, candidates.length);
  const isGenerating = session?.status === "generating";
  const canGenerate = attemptsUsed < maxAttempts && !isGenerating && !session?.submitted;
  const selectedCandidate = useMemo(
    () => candidates.find((item) => item.id === selectedCandidateId),
    [candidates, selectedCandidateId]
  );
  const previewCandidate = selectedCandidate || [...candidates].reverse().find((item) => item.status === "generating") || candidates[candidates.length - 1];

  const restoreSession = (data) => {
    setSession(data);
    if (data.nickname && data.nickname !== "匿名同学") setNickname(data.nickname);
    if (data.prompt) setPrompt(data.prompt);
    const firstDone = data.candidates?.find((item) => item.status === "done");
    if (firstDone && !selectedCandidateId) setSelectedCandidateId(firstDone.id);
  };

  useEffect(() => {
    let cancelled = false;

    const loadExistingSession = async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}`, { credentials: "include" });
        if (res.status === 403) {
          notifyAccessDenied();
          return;
        }
        if (res.status === 404) return;
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) restoreSession(data);
      } catch {
        // 没有已有会话时保持空白状态
      }
    };

    loadExistingSession();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

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
        if (!cancelled) restoreSession(data);
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

    nicknameInputRef.current?.blur();
    promptInputRef.current?.blur();
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
    <div className="min-h-screen overflow-x-hidden bg-[#09051f] p-4 text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(168,85,247,0.28),transparent_34%),radial-gradient(circle_at_82%_20%,rgba(236,72,153,0.18),transparent_30%),linear-gradient(135deg,#0a0a2e,#1a0a3e_48%,#0a0a1a)]" />
      <div className="fixed left-1/2 top-1/2 h-[72vh] w-[68vw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl gap-5 py-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/25 backdrop-blur-2xl lg:sticky lg:top-5">
            <h1 className="bg-gradient-to-r from-violet-400 to-pink-400 bg-clip-text text-center text-2xl font-black text-transparent">
              DreamClass Photo
            </h1>
            <p className="mt-2 text-center text-sm text-white/45">
              先生成个人肖像，满意后再同步到大屏合影
            </p>

            <form onSubmit={generatePortrait} className="mt-5 space-y-3.5">
              <div>
                <label className="mb-1 block text-sm text-white/65">昵称</label>
                <input
                  ref={nicknameInputRef}
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="匿名同学"
                  disabled={session?.submitted || isGenerating || loading}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-violet-400 disabled:caret-transparent disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/65">
                  形象描述 <span className="text-pink-400">*</span>
                </label>
                <textarea
                  ref={promptInputRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="例如：阳光少年，短黑发，明亮眼睛，自然微笑，穿白色衬衫，清新写实风格"
                  rows={4}
                  disabled={isGenerating || attemptsUsed >= maxAttempts}
                  className="w-full resize-none rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none transition focus:border-violet-400 disabled:caret-transparent disabled:opacity-60"
                />
              </div>

              <div className="rounded-2xl border border-violet-300/15 bg-gradient-to-br from-violet-400/15 to-pink-400/10 p-3.5 shadow-inner shadow-white/5">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-violet-50">提示词灵感</p>
                    <p className="mt-0.5 text-[10px] text-white/38">从下面任选几个元素组合，描述会更丰富</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/45">师生皆可用</span>
                </div>
                <div className="grid max-h-64 grid-cols-2 gap-2 overflow-y-auto pr-1 scrollbar-hide">
                  {PROMPT_TIPS.map((tip) => (
                    <div key={tip.title} className="min-h-[92px] rounded-xl border border-white/10 bg-black/18 p-2.5 transition hover:border-violet-200/30 hover:bg-white/[0.07]">
                      <p className="mb-1.5 text-[11px] font-bold text-violet-200">{tip.title}</p>
                      <p className="text-[11px] leading-[1.7] text-white/62">{tip.items}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/10 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white/85">一键填入示例</p>
                    <p className="mt-0.5 text-[10px] text-white/38">点击任意卡片，会自动填到上方形象描述中</p>
                  </div>
                  <span className="rounded-full bg-violet-400/15 px-2 py-1 text-[10px] text-violet-100">点击试试</span>
                </div>
                <div className="max-h-56 overflow-y-auto pr-1 scrollbar-hide">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PROMPT_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setPrompt(example)}
                        disabled={isGenerating || attemptsUsed >= maxAttempts}
                        className="group flex min-h-[76px] flex-col justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-left text-[11px] leading-relaxed text-white/65 transition hover:-translate-y-0.5 hover:border-violet-300/50 hover:bg-violet-400/15 hover:text-white hover:shadow-lg hover:shadow-violet-950/20 disabled:opacity-45"
                      >
                        <span>{example}</span>
                        <span className="mt-2 inline-flex items-center gap-1 self-start rounded-full bg-violet-300/10 px-2 py-0.5 text-[10px] font-semibold text-violet-200/75 transition group-hover:bg-violet-300/20 group-hover:text-violet-100">
                          点击填入
                          <span className="transition group-hover:-translate-y-0.5">↑</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
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
                      ? `继续生成（还可成功 ${maxAttempts - attemptsUsed} 张）`
                      : "三次成功机会已用完"}
              </button>
            </form>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-white/[0.07] p-5 shadow-2xl shadow-black/25 backdrop-blur-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">候选肖像</h2>
                <p className="mt-1 text-sm text-white/45">
                  已成功生成 {attemptsUsed} / {maxAttempts} 张，失败不占次数
                </p>
              </div>
              {isGenerating && (
                <span className="rounded-full bg-violet-400/15 px-3 py-1 text-xs text-violet-100">
                  生成中
                </span>
              )}
            </div>

            {candidates.length === 0 ? (
              <div className="mt-5 flex min-h-[420px] items-center justify-center rounded-[1.75rem] border border-dashed border-violet-200/15 bg-gradient-to-br from-white/[0.06] to-white/[0.02] text-center">
                <div>
                  <div className="mx-auto mb-4 h-16 w-16 rounded-2xl bg-violet-400/15 ring-1 ring-violet-200/20" />
                  <p className="text-white/70">还没有候选肖像</p>
                  <p className="mt-2 text-sm text-white/35">填写描述后开始生成，最多成功生成三张</p>
                </div>
              </div>
            ) : (
              <div className="mt-5">
                <div className="relative mx-auto max-w-md overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-black/25 to-violet-950/30 p-3 shadow-2xl shadow-violet-950/30">
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

                <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-black/15 p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white/85">候选图库</p>
                      <p className="mt-0.5 text-xs text-white/38">最多成功生成三张，失败后可继续重试</p>
                    </div>
                    <span className="rounded-full bg-violet-400/15 px-2.5 py-1 text-xs text-violet-100">
                      成功 {attemptsUsed} / {maxAttempts}
                    </span>
                  </div>

                  <div className="scrollbar-hide max-h-[360px] overflow-y-auto pr-1">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      {Array.from({ length: totalSlots }).map((_, slot) => {
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
                            className={`group rounded-2xl border p-2.5 text-left transition ${
                              selected
                                ? "border-violet-200 bg-violet-400/25 shadow-lg shadow-violet-950/35 ring-1 ring-violet-200/40"
                                : previewing
                                  ? "border-white/35 bg-white/10 shadow-lg shadow-black/20"
                                  : "border-white/10 bg-white/[0.04] hover:-translate-y-0.5 hover:border-violet-300/45 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-violet-950/20"
                            } disabled:cursor-not-allowed disabled:opacity-80`}
                          >
                            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-violet-950/50 sm:aspect-square">
                              <span className="absolute left-2 top-2 z-10 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white/75 backdrop-blur">
                                #{slot + 1}
                              </span>
                              {done ? (
                                <img
                                  src={candidate.imageUrl}
                                  alt={`候选肖像 ${slot + 1}`}
                                  className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
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
                                <div className="flex h-full flex-col items-center justify-center gap-1 text-xs text-white/25">
                                  <div className="h-7 w-7 rounded-xl border border-white/10 bg-white/[0.04]" />
                                  待生成
                                </div>
                              )}
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs">
                              <span className="font-semibold text-white/70">第 {slot + 1} 张</span>
                              {selected ? (
                                <span className="text-violet-100">已选</span>
                              ) : done ? (
                                <span className="text-white/35">可选</span>
                              ) : candidate?.status === "generating" ? (
                                <span className="text-violet-200">生成中</span>
                              ) : candidate?.status === "error" ? (
                                <span className="text-red-200">失败</span>
                              ) : (
                                <span className="text-white/25">空位</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
              <p className="text-sm text-white/55">
                规则：个人肖像生成后只在本页预览，不会自动出现在大屏。每人最多成功生成三张；如果生成失败，可以继续重试，不占用三次机会。
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
  );
}
