# DreamClass Photo - AI 虚拟大合影

基于本地 Stable Diffusion 的虚拟班级合影应用。同学扫码输入形象描述，本地 GPU 自动生成角色画像，实时在大屏上展示，最终合成一张星空背景的合影海报。**完全离线运行，无需在线 API。**

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Vite + Tailwind CSS |
| 路由 | react-router-dom |
| 后端 | FastAPI + Uvicorn |
| 实时通信 | WebSocket |
| AI 绘图 | 本地 Stable Diffusion v1.5 (diffusers) |
| GPU 加速 | CUDA + xformers + fp16 |

## 项目结构

```
dreamclass-fa/
├── backend/
│   ├── main.py               # FastAPI 主逻辑：REST API + WebSocket 广播 + 静态文件
│   ├── replicate_client.py   # 本地 SD 推理模块（generate_image 函数）
│   ├── static/               # 生成的角色图片存放目录
│   ├── requirements.txt      # Python 依赖
│   └── .env                  # 环境变量（可选）
└── frontend/
    ├── src/
    │   ├── App.jsx           # 路由入口
    │   ├── main.jsx          # React 挂载
    │   ├── index.css         # Tailwind + 自定义样式
    │   └── pages/
    │       ├── Join.jsx      # 学生加入页（移动端）
    │       └── Screen.jsx    # 大屏展示页（Canvas 绘制）
    ├── index.html
    ├── vite.config.js        # 开发代理配置
    ├── tailwind.config.js
    ├── postcss.config.js
    └── package.json
```

## 功能说明

### 学生端 (`/`)

- 深色渐变背景 + 半透明磨砂卡片
- 输入昵称（可选，默认"匿名同学"）和形象描述
- 提交后显示等待动画，提示看向大屏幕

### 大屏端 (`/screen`)

- 全屏 Canvas 实时绘制星空背景 + 角色头像
- WebSocket 实时同步：新角色加入、图片生成完毕
- 已完成角色：圆形裁剪头像 + 昵称 + 紫色发光边框
- 生成中角色：半透明占位圆 + 旋转加载动画
- 底部悬浮栏：显示已生成数量 + "生成合影海报"按钮
- 海报功能：离屏 Canvas 合成 1920×1080 星空合影，自动下载 `class-photo.png`

### 后端 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/generate` | POST | 提交昵称和形象描述，异步生成图片 |
| `/api/room` | GET | 获取所有角色数据 |
| `/static/{filename}` | GET | 访问本地生成的角色图片 |
| `/ws` | WebSocket | 实时推送角色状态变更 |

WebSocket 消息类型：

| type | 说明 |
|------|------|
| `init` | 连接时发送当前所有角色列表 |
| `new_character` | 新角色加入 |
| `image_ready` | 图片生成完毕（含 done/error 状态） |

## 快速开始

### 前置条件

- **GPU**：NVIDIA 显卡，8GB+ 显存（已验证 RTX 4070 Laptop）
- **CUDA**：已安装 CUDA Toolkit
- **Python**：3.11（建议使用 conda 管理环境）
- **PyTorch**：已安装支持 CUDA 的 PyTorch
- Node.js >= 18

### 1. 配置后端环境

```bash
# 创建并激活虚拟环境（如果还没有）
conda create -n dreamclass python=3.11 -y
conda activate dreamclass

cd backend
pip install -r requirements.txt
```

> 首次运行时 diffusers 会自动下载 `runwayml/stable-diffusion-v1-5` 模型（约 5GB）。由于使用了国内镜像源 (`https://hf-mirror.com`)，下载速度较快。

### 2. 激活环境并启动后端

```bash
conda activate dreamclass
cd backend
python main.py
```

启动时会看到模型加载日志，加载完成后后端运行在 `http://localhost:8000`。

### 3. 启动前端

```bash
cd frontend

# 安装依赖（国内推荐使用镜像源）
npm install --registry=https://registry.npmmirror.com

# 启动开发服务器
npm run dev
```

前端运行在 `http://localhost:5173`，已配置开发代理将 `/api`、`/ws`、`/static` 转发到后端。

### 4. 使用

1. 大屏设备打开 `http://localhost:5173/screen`
2. 同学用手机扫码访问 `http://<你的局域网IP>:5173/`
3. 输入昵称和形象描述，提交生成
4. 大屏实时显示生成进度和结果（本地 GPU 约 3-5 秒出图）
5. 全部完成后点击"生成合影海报"下载图片

## AI 图片生成（本地）

使用 diffusers 加载 `runwayml/stable-diffusion-v1-5`，推理参数：

| 参数 | 值 |
|------|-----|
| 精度 | fp16 (torch.float16) |
| 推理步数 | 25 |
| 引导系数 (CFG) | 7.5 |
| 输出尺寸 | 512 × 512 |
| xformers | 启用（不可用时自动降级） |
| attention_slicing | 始终启用 |

Prompt 自动补全为：

```
portrait of {用户描述}, digital art, fantasy, vibrant colors, studio lighting, centered, high quality
```

Negative prompt：

```
blurry, ugly, deformed, low resolution, bad anatomy
```

## 显存优化

针对 8GB 显存的 GPU，项目已做以下优化：

- **fp16 半精度推理**：显存占用减半
- **xformers 内存高效注意力**：进一步降低显存峰值
- **attention_slicing**：始终启用，作为兜底方案
- **关闭安全检查器**：省去 safety_checker 的额外显存开销

如仍遇显存不足（OOM），可尝试：
- 减小 `num_inference_steps`（如 20）
- 减小 `guidance_scale`（如 6.0）
- 在 `replicate_client.py` 中添加 `pipe.enable_vae_slicing()`

## 部署

### 后端 → Railway / 云服务器

需确保目标机器有 NVIDIA GPU + CUDA，启动命令：

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### 前端 → Vercel

1. 在 Vercel 导入仓库，Root Directory 设为 `frontend`
2. 设置环境变量 `VITE_API_BASE_URL` 为后端地址
3. 代码中需将请求地址改为读取环境变量：

```js
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

// fetch 改为
fetch(`${API_BASE}/api/generate`, ...)

// WebSocket 改为
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = API_BASE ? API_BASE.replace(/^https?:\/\//, '') : window.location.host;
const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws`);
```

## 注意事项

- 图片生成是异步的，不会阻塞 API 响应
- Canvas 绘制使用了 `img.crossOrigin = "anonymous"`，本地图片通过后端 `/static` 路径提供，无跨域问题
- 大屏 Canvas 适配高分屏（devicePixelRatio）
- 后端数据存储在内存中，重启后清空；生成的图片保留在 `static/` 目录
- 模型在模块加载时初始化一次，后续推理复用同一 pipeline
