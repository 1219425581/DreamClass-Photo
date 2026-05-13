import asyncio
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from image_config import get_active_provider, list_providers, load_image_config, set_active_provider
from replicate_client import generate_image

# ── 内存数据 ──────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
MAX_ATTEMPTS = 3
characters: list[dict] = []
draft_sessions: dict[str, dict] = {}
generation_lock = asyncio.Lock()
# 活跃的 WebSocket 连接
ws_connections: list[WebSocket] = []


# ── 广播工具 ──────────────────────────────────────────────
async def broadcast(message: dict):
    """向所有已连接的 WebSocket 客户端广播消息"""
    dead = []
    for ws in ws_connections:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        ws_connections.remove(ws)


# ── 生命周期 ──────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 DreamClass Photo 后端已启动")
    yield
    print("👋 DreamClass Photo 后端已关闭")


app = FastAPI(lifespan=lifespan)

# CORS：开发阶段允许所有来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 静态文件：本地生成的图片 ──────────────────────────────
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")


# ── 请求模型 ──────────────────────────────────────────────
class GenerateRequest(BaseModel):
    sessionId: Optional[str] = None
    nickname: Optional[str] = None
    prompt: str


class SubmitRequest(BaseModel):
    sessionId: str
    candidateId: str
    nickname: Optional[str] = None


class DebugSeedRequest(BaseModel):
    count: int
    reset: bool = True


class ProviderRequest(BaseModel):
    provider: str


# ── REST API ──────────────────────────────────────────────
@app.get("/api/room")
async def get_room():
    """返回当前房间所有角色数据"""
    return {"characters": characters}


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    draft = draft_sessions.get(session_id)
    if not draft:
        raise HTTPException(status_code=404, detail="会话不存在")
    return draft


@app.get("/api/image-provider")
async def get_image_provider():
    config = load_image_config()
    return {
        "activeProvider": get_active_provider(),
        "providers": list_providers(),
        "model": config["model"],
        "apiUrl": config["api_url"],
        "hasApiKey": bool(config["api_key"]),
    }


@app.post("/api/image-provider")
async def update_image_provider(req: ProviderRequest):
    try:
        config = set_active_provider(req.provider)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {
        "activeProvider": req.provider,
        "providers": list_providers(),
        "model": config["model"],
        "apiUrl": config["api_url"],
        "hasApiKey": bool(config["api_key"]),
    }


@app.post("/api/generate")
async def api_generate(req: GenerateRequest):
    prompt = req.prompt.strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="请输入形象描述")

    session_id = req.sessionId or str(uuid.uuid4())[:8]
    nickname = req.nickname.strip() if req.nickname and req.nickname.strip() else "匿名同学"
    draft = draft_sessions.setdefault(
        session_id,
        {
            "sessionId": session_id,
            "nickname": nickname,
            "prompt": prompt,
            "attemptsUsed": 0,
            "maxAttempts": MAX_ATTEMPTS,
            "status": "idle",
            "candidates": [],
            "submitted": False,
        },
    )

    if draft["submitted"]:
        raise HTTPException(status_code=400, detail="已经提交到大屏")
    if draft["status"] == "generating":
        raise HTTPException(status_code=409, detail="上一张肖像还在生成中")
    if draft["attemptsUsed"] >= MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="三次生成机会已用完")

    draft["nickname"] = nickname
    draft["prompt"] = prompt
    draft["status"] = "generating"
    candidate = {
        "id": str(uuid.uuid4())[:8],
        "prompt": prompt,
        "status": "generating",
        "imageUrl": None,
    }
    draft["attemptsUsed"] += 1
    draft["candidates"].append(candidate)

    asyncio.create_task(_do_generate_candidate(session_id, candidate["id"], prompt))
    return draft


@app.post("/api/submit")
async def api_submit(req: SubmitRequest):
    draft = draft_sessions.get(req.sessionId)
    if not draft:
        raise HTTPException(status_code=404, detail="会话不存在")
    if draft["submitted"]:
        raise HTTPException(status_code=400, detail="已经提交到大屏")

    candidate = next((item for item in draft["candidates"] if item["id"] == req.candidateId), None)
    if not candidate or candidate["status"] != "done" or not candidate["imageUrl"]:
        raise HTTPException(status_code=400, detail="请选择已生成成功的肖像")

    nickname = req.nickname.strip() if req.nickname and req.nickname.strip() else draft["nickname"]
    character = {
        "id": str(uuid.uuid4())[:8],
        "nickname": nickname,
        "prompt": candidate["prompt"],
        "status": "done",
        "imageUrl": candidate["imageUrl"],
    }
    characters.append(character)
    draft["submitted"] = True
    draft["selectedCandidateId"] = candidate["id"]

    await broadcast({"type": "new_character", "character": character})
    return {"character": character, "session": draft}


@app.post("/api/debug/reset")
async def api_debug_reset():
    characters.clear()
    draft_sessions.clear()
    return {"ok": True}


@app.get("/api/debug/avatar/{index}.svg")
async def api_debug_avatar(index: int):
    hue = (index * 47) % 360
    accent = (hue + 52) % 360
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl({hue}, 78%, 62%)"/>
      <stop offset="1" stop-color="hsl({accent}, 72%, 36%)"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#bg)"/>
  <circle cx="256" cy="188" r="84" fill="rgba(255,255,255,0.88)"/>
  <path d="M112 450c24-92 84-142 144-142s120 50 144 142" fill="rgba(255,255,255,0.9)"/>
  <circle cx="228" cy="180" r="11" fill="#172033"/>
  <circle cx="284" cy="180" r="11" fill="#172033"/>
  <path d="M222 226c22 19 47 19 68 0" fill="none" stroke="#172033" stroke-width="12" stroke-linecap="round"/>
  <text x="256" y="492" text-anchor="middle" font-family="Arial, sans-serif" font-size="48" font-weight="700" fill="rgba(255,255,255,0.72)">{index}</text>
</svg>'''
    return Response(content=svg, media_type="image/svg+xml")


@app.post("/api/debug/seed")
async def api_debug_seed(req: DebugSeedRequest):
    if req.count < 0 or req.count > 500:
        raise HTTPException(status_code=400, detail="测试人数必须在 0 到 500 之间")

    if req.reset:
        characters.clear()
        draft_sessions.clear()

    sample_prompts = [
        "阳光少年，短黑发，明亮眼睛，自然微笑，清新写实风格",
        "自信少女，柔顺长发，温暖笑容，梦幻电影感肖像",
        "温柔魔法师，银色长发，戴圆框眼镜，奇幻治愈风格",
        "活力运动员，清爽短发，蓝色外套，青春感肖像",
        "英气骑士，金色长发，银色盔甲，坚定眼神，奇幻写实",
    ]
    start = len(characters)
    for index in range(start + 1, start + req.count + 1):
        prompt = sample_prompts[(index - 1) % len(sample_prompts)]
        characters.append(
            {
                "id": f"debug{index:03d}",
                "nickname": f"测试同学{index:03d}",
                "prompt": prompt,
                "status": "done",
                "imageUrl": f"/api/debug/avatar/{index}.svg",
            }
        )

    await broadcast({"type": "debug_seed", "characters": characters})
    return {"ok": True, "count": len(characters), "characters": characters}


async def _do_generate_candidate(session_id: str, candidate_id: str, prompt: str):
    loop = asyncio.get_event_loop()
    async with generation_lock:
        image_url = await loop.run_in_executor(None, generate_image, prompt)

    draft = draft_sessions.get(session_id)
    if not draft:
        return

    for candidate in draft["candidates"]:
        if candidate["id"] == candidate_id:
            if image_url:
                candidate["status"] = "done"
                candidate["imageUrl"] = image_url
            else:
                candidate["status"] = "error"
            break

    draft["status"] = "idle"


# ── 前端页面 ──────────────────────────────────────────────
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="前端还未构建，请先运行 npm run build")


# ── WebSocket ─────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_connections.append(ws)

    # 连接时发送当前所有角色
    try:
        await ws.send_json({"type": "init", "characters": characters})
    except Exception:
        ws_connections.remove(ws)
        return

    # 保持连接，直到客户端断开
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if ws in ws_connections:
            ws_connections.remove(ws)


# ── 启动入口 ──────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
