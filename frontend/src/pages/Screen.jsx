import { useEffect, useMemo, useRef, useState } from "react";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculateGridMetrics(count, containerWidth) {
  const safeWidth = Math.max(320, containerWidth || 1280);
  const padding = safeWidth < 720 ? 20 : count > 100 ? 40 : count > 60 ? 44 : 48;
  const usableWidth = safeWidth - padding * 2;
  const gap = count > 100 ? 9 : count > 80 ? 10 : count > 40 ? 12 : count > 20 ? 16 : count > 10 ? 22 : 28;
  const minAvatar = count > 100 ? 50 : count > 60 ? 56 : count > 30 ? 62 : count > 20 ? 72 : 92;
  const maxAvatar = count <= 6 ? 176 : count <= 10 ? 154 : count <= 20 ? 142 : count <= 50 ? 104 : count <= 100 ? 80 : 68;
  const maxFitColumns = Math.max(
    1,
    Math.floor((usableWidth + gap) / (minAvatar + gap))
  );
  const density = safeWidth < 800 ? 1.12 : count > 100 ? 1.55 : count > 60 ? 1.5 : count <= 20 ? 1.08 : 1.42;
  const idealColumns =
    count <= 4 ? count : Math.ceil(Math.sqrt(count * density * (usableWidth / 1000)));
  const columns = clamp(idealColumns || 1, 1, Math.min(count || 1, maxFitColumns));
  const avatarSize = clamp(
    Math.floor((usableWidth - gap * (columns - 1)) / columns),
    minAvatar,
    maxAvatar
  );
  const showNames = count <= 80;
  const labelHeight = showNames ? (count > 40 ? 26 : 30) : 0;
  const itemHeight = avatarSize + labelHeight;
  const rows = Math.ceil((count || 1) / columns);
  const gridWidth = columns * avatarSize + (columns - 1) * gap;

  return { avatarSize, columns, gap, gridWidth, itemHeight, padding, rows, showNames };
}

function getPortraitStyle(index, columns, count) {
  if (count > 60) {
    return { offsetX: 0, offsetY: 0, rotate: 0, scale: 1, depth: 0.5 };
  }

  const row = Math.floor(index / columns);
  const col = index % columns;
  const depth = columns <= 1 ? 0.5 : col / Math.max(columns - 1, 1);
  const offsetX = ((row % 2 === 0 ? -1 : 1) * ((col % 3) - 1)) * 4;
  const offsetY = ((index % 4) - 1.5) * 5 + (row % 2 === 0 ? -3 : 4);
  const rotate = ((index % 5) - 2) * 1.2;
  const scale = 0.96 + ((index + row) % 4) * 0.025;

  return { offsetX, offsetY, rotate, scale, depth };
}

function notifyAuthRequired() {
  window.dispatchEvent(new Event("dreamclass-auth-required"));
}

function coverImage(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export default function Screen() {
  const [characters, setCharacters] = useState([]);
  const [gridWidth, setGridWidth] = useState(1280);
  const gridWrapRef = useRef(null);

  const loadRoom = async () => {
    const res = await fetch("/api/room", { credentials: "include" });
    if (res.status === 401) {
      notifyAuthRequired();
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    setCharacters(Array.isArray(data.characters) ? data.characters : []);
  };

  useEffect(() => {
    loadRoom();
    const timer = setInterval(loadRoom, 2000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const node = gridWrapRef.current;
    if (!node) return;

    const updateWidth = () => setGridWidth(node.clientWidth || 1280);
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);


  const doneCount = useMemo(
    () => characters.filter((c) => c.status === "done" && c.imageUrl).length,
    [characters]
  );

  const gridMetrics = useMemo(
    () => calculateGridMetrics(Math.max(characters.length, 1), gridWidth),
    [characters.length, gridWidth]
  );

  const downloadPoster = async () => {
    const doneChars = characters.filter((c) => c.status === "done" && c.imageUrl);
    if (doneChars.length === 0) {
      alert("还没有完成生成的角色，无法生成海报");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 1920;
    const metrics = calculateGridMetrics(doneChars.length, 1880);
    const titleHeight = doneChars.length > 80 ? 172 : doneChars.length <= 20 ? 180 : 164;
    const footerHeight = doneChars.length > 80 ? 86 : 88;
    const rowHeight = metrics.itemHeight + metrics.gap;
    const gridHeight = metrics.rows * rowHeight - metrics.gap;
    const canvasMinHeight = doneChars.length > 80 ? 820 : doneChars.length <= 20 ? 800 : 920;
    canvas.height = Math.max(canvasMinHeight, titleHeight + gridHeight + footerHeight + 70);

    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, "#100a32");
    grad.addColorStop(0.5, "#24104c");
    grad.addColorStop(1, "#09091f");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < 140; i += 1) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      ctx.fillStyle = `rgba(255,255,255,${0.1 + Math.random() * 0.35})`;
      ctx.beginPath();
      ctx.arc(x, y, 1 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(216,180,254,0.9)";
    ctx.font = "24px sans-serif";
    ctx.fillText("Congratulations on completing the course", canvas.width / 2, 54);
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.font = "bold 56px sans-serif";
    ctx.fillText("《人机协同程序设计》结课打卡纪念合影", canvas.width / 2, 112);
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = "24px sans-serif";
    ctx.fillText("祝贺大家完成课程学习，带着创造力继续前行", canvas.width / 2, 150);

    const badgeY = 104;
    ctx.fillStyle = "rgba(255,255,255,0.11)";
    ctx.beginPath();
    ctx.roundRect(92, badgeY - 28, 210, 56, 28);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(canvas.width - 302, badgeY - 28, 210, 56, 28);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.82)";
    ctx.font = "22px sans-serif";
    ctx.fillText("课程结业", 197, badgeY + 8);
    ctx.fillText("共同纪念", canvas.width - 197, badgeY + 8);

    const images = await Promise.all(
      doneChars.map(
        (char) =>
          new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => resolve({ char, img });
            img.onerror = () => resolve({ char, img: null });
            img.src = char.imageUrl;
          })
      )
    );

    const startX = (canvas.width - metrics.gridWidth) / 2;
    const availableGridHeight = canvas.height - titleHeight - footerHeight;
    const startY = titleHeight + Math.max(0, (availableGridHeight - gridHeight) / 2);

    const floor = ctx.createRadialGradient(canvas.width / 2, startY + gridHeight * 0.68, 40, canvas.width / 2, startY + gridHeight * 0.74, metrics.gridWidth * 0.62);
    floor.addColorStop(0, "rgba(167,139,250,0.25)");
    floor.addColorStop(1, "rgba(167,139,250,0)");
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.ellipse(canvas.width / 2, startY + gridHeight * 0.74, metrics.gridWidth * 0.48, Math.max(80, gridHeight * 0.28), 0, 0, Math.PI * 2);
    ctx.fill();

    images.forEach(({ char, img }, index) => {
      if (!img) return;

      const col = index % metrics.columns;
      const row = Math.floor(index / metrics.columns);
      const style = getPortraitStyle(index, metrics.columns, doneChars.length);
      const baseSize = metrics.avatarSize;
      const size = baseSize * style.scale;
      const x = startX + col * (metrics.avatarSize + metrics.gap) + (baseSize - size) / 2 + style.offsetX;
      const y = startY + row * rowHeight + (baseSize - size) / 2 + style.offsetY;
      const cx = x + size / 2;

      ctx.fillStyle = `rgba(0,0,0,${0.2 + style.depth * 0.12})`;
      ctx.beginPath();
      ctx.ellipse(cx, y + size + 8, size * 0.42, size * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(cx, y + size / 2);
      ctx.rotate((style.rotate * Math.PI) / 180);
      ctx.translate(-cx, -(y + size / 2));
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, size * 0.24);
      ctx.clip();
      coverImage(ctx, img, x, y, size, size);
      ctx.restore();

      ctx.save();
      ctx.translate(cx, y + size / 2);
      ctx.rotate((style.rotate * Math.PI) / 180);
      ctx.translate(-cx, -(y + size / 2));
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.72)";
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, size * 0.24);
      ctx.stroke();
      ctx.restore();

      if (metrics.showNames) {
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.font = `${Math.max(13, Math.min(20, baseSize * 0.16))}px sans-serif`;
        ctx.fillText(char.nickname, cx, y + size + Math.max(18, baseSize * 0.2), baseSize + metrics.gap * 0.5);
      }
    });

    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "22px sans-serif";
    ctx.fillText(`共 ${doneChars.length} 位同学`, canvas.width / 2, canvas.height - 48);

    const link = document.createElement("a");
    link.download = "class-photo.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#070716] text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_50%_0%,#4c1d95_0%,#24104c_36%,#070716_78%)]" />
      <div className="fixed inset-0 opacity-40 bg-[radial-gradient(circle_at_18%_18%,white_0_1px,transparent_1px),radial-gradient(circle_at_72%_28%,white_0_1px,transparent_1px),radial-gradient(circle_at_46%_76%,white_0_1px,transparent_1px)] bg-[length:110px_110px,170px_170px,140px_140px]" />
      <div className="fixed left-1/2 top-[58%] h-[32vh] w-[86vw] -translate-x-1/2 rounded-[50%] bg-violet-400/20 blur-3xl" />

      <main className="relative z-10 flex h-screen flex-col px-5 pb-20 pt-3 md:px-8 md:pb-20 md:pt-4">
        <header className="shrink-0 text-center">
          <p className="text-[10px] uppercase tracking-[0.32em] text-violet-200/70 md:text-xs">
            CONGRATULATIONS · COURSE COMPLETED
          </p>
          <h1 className="mx-auto mt-1 max-w-5xl text-3xl font-black tracking-tight md:text-5xl">
            《人机协同程序设计》结课打卡纪念合影
          </h1>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-violet-100/85">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">祝贺大家完成课程学习</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">已生成 {doneCount} / {characters.length} 位同学</span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1">共同纪念</span>
          </div>
        </header>

        <section className="relative mt-3 min-h-0 flex-1 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30 backdrop-blur">
          <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/10 to-transparent" />
          <div className="absolute left-[12%] top-[5%] h-[70%] w-24 -rotate-12 bg-gradient-to-b from-white/20 to-transparent blur-2xl" />
          <div className="absolute right-[14%] top-[5%] h-[70%] w-24 rotate-12 bg-gradient-to-b from-fuchsia-200/20 to-transparent blur-2xl" />
          <div className="absolute bottom-[8%] left-1/2 h-[30%] w-[72%] -translate-x-1/2 rounded-[50%] bg-violet-300/10 blur-2xl" />
          <div className="absolute bottom-0 left-0 right-0 h-[24%] bg-gradient-to-t from-black/50 via-black/18 to-transparent" />

          <div ref={gridWrapRef} className="scrollbar-hide relative flex h-full items-center justify-center overflow-y-auto px-5 py-6 md:px-8 md:py-8">
            {characters.length === 0 ? (
              <div className="flex h-full w-full items-center justify-center text-center">
                <div className="rounded-3xl border border-white/10 bg-white/5 px-10 py-8 shadow-2xl shadow-black/20 backdrop-blur">
                  <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-violet-400/15 ring-1 ring-violet-200/20" />
                  <p className="text-xl font-semibold text-white/70">等待同学加入...</p>
                  <p className="mt-2 text-sm text-white/35">提交形象描述后，头像会自动出现在这里</p>
                </div>
              </div>
            ) : (
              <div
                className="mx-auto my-auto grid shrink-0 justify-center rounded-[2rem] bg-black/10 p-3 shadow-2xl shadow-violet-950/20 md:p-4"
                style={{
                  width: `${gridMetrics.gridWidth}px`,
                  maxWidth: "100%",
                  gridTemplateColumns: `repeat(${gridMetrics.columns}, ${gridMetrics.avatarSize}px)`,
                  gap: `${gridMetrics.gap}px`,
                }}
              >
                {characters.map((char, index) => {
                  const done = char.status === "done" && char.imageUrl;
                  const failed = char.status === "error";
                  const portraitStyle = getPortraitStyle(index, gridMetrics.columns, characters.length);

                  return (
                    <button
                      key={char.id}
                      type="button"
                      title={`${char.nickname}：${char.prompt}`}
                      className="group flex flex-col items-center rounded-2xl outline-none transition-transform duration-200 hover:-translate-y-1 focus-visible:ring-2 focus-visible:ring-violet-300"
                      style={{
                        width: `${gridMetrics.avatarSize}px`,
                        transform: `translate(${portraitStyle.offsetX}px, ${portraitStyle.offsetY}px) rotate(${portraitStyle.rotate}deg) scale(${portraitStyle.scale})`,
                        zIndex: 10 + index,
                      }}
                    >
                      <div
                        className="relative overflow-hidden rounded-[26%] border border-white/30 bg-violet-950/70 shadow-xl ring-2 ring-white/10 transition-shadow duration-200 group-hover:shadow-violet-950/50"
                        style={{
                          width: `${gridMetrics.avatarSize}px`,
                          height: `${gridMetrics.avatarSize}px`,
                          boxShadow: `0 ${14 + portraitStyle.depth * 10}px ${26 + portraitStyle.depth * 18}px rgba(0,0,0,${0.28 + portraitStyle.depth * 0.16})`,
                        }}
                      >
                        {done ? (
                          <img
                            src={char.imageUrl}
                            alt={char.nickname}
                            className="h-full w-full object-cover"
                          />
                        ) : failed ? (
                          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-red-200">
                            生成失败
                          </div>
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-violet-100/80">
                            <div className="h-7 w-7 animate-spin rounded-full border-2 border-violet-200/25 border-t-violet-100" />
                            <span className="text-xs">生成中</span>
                          </div>
                        )}
                      </div>

                      {gridMetrics.showNames && (
                        <p
                          className="mt-2 w-full truncate text-center font-semibold text-white/90 drop-shadow"
                          style={{
                            fontSize: `${clamp(gridMetrics.avatarSize * 0.14, 11, 16)}px`,
                          }}
                        >
                          {char.nickname}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t border-white/10 bg-black/45 px-6 py-3 backdrop-blur-xl">
        <div className="text-sm text-white/65">
          已生成 <span className="font-bold text-violet-300">{doneCount}</span> / {characters.length} 位同学
        </div>
        <button
          onClick={downloadPoster}
          disabled={doneCount === 0}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-6 py-2.5 font-semibold text-white shadow-lg shadow-violet-950/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下载大合影
        </button>
      </footer>
    </div>
  );
}
