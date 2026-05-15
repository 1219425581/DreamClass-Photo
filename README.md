# DreamClass Photo - AI 虚拟结课打卡合影

DreamClass Photo 是一个用于课程结课活动的 AI 虚拟合影应用。同学在个人页面填写昵称和形象描述，最多成功生成三张候选肖像，失败不占次数，选择满意的一张同步到大屏；大屏页面实时展示所有同学的虚拟形象，并可导出《人机协同程序设计》结课打卡纪念合影。

当前版本使用在线图片生成 API，不再依赖本地 GPU 模型；线上部署在 Render，并通过校园网 IP 白名单限制访问。

## 功能特性

- 学生端 `/`
  - 输入昵称和形象描述
  - 提供丰富提示词灵感和一键填入示例
  - 每人最多成功生成 3 张候选肖像，生成失败可重试且不占次数
  - 生成后先在本页预览，不会自动进入大屏
  - 用户手动选择满意肖像同步到大屏
  - 提交成功后可点击按钮前往 `/screen` 观看

- 大屏端 `/screen`
  - 展示《人机协同程序设计》结课打卡纪念合影
  - 自动轮询房间数据
  - 根据人数动态调整头像大小、列数、间距和姓名显示
  - 支持大量同学头像展示
  - 支持导出合影海报 `class-photo.png`

- 后端
  - FastAPI 提供生图、候选、提交、房间数据接口
  - 后台异步生成图片，避免阻塞请求
  - 支持 SupAI 和 SiliconFlow 两类图片 API 配置
  - 支持 Render Secret Files 读取敏感配置
  - 支持校园网 IP 白名单访问控制
  - 提供 `/healthz` 供 Render 健康检查使用

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18 + Vite + Tailwind CSS |
| 路由 | react-router-dom |
| 后端 | FastAPI + Uvicorn |
| 图片生成 | 在线图片生成 API：SupAI / SiliconFlow |
| 部署 | Render Blueprint |
| 访问限制 | 校园网出口 IP 白名单 |

## 项目结构

```text
DreamClass-Photo/
├── backend/
│   ├── main.py                  # FastAPI 主应用
│   ├── access_control.py        # 校园网 IP 白名单访问控制
│   ├── image_config.py          # 图片 API 配置加载
│   ├── replicate_client.py      # 图片 API 调用与提示词增强
│   ├── supai_image_tool.py      # 单独图片生成测试工具
│   ├── batch_test_generate.py   # 前后端稳定性批量测试工具
│   ├── requirements.txt         # Python 依赖
│   └── static/                  # 生成图片目录
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # 前端路由与校园网访问提示
│   │   ├── main.jsx             # React 挂载入口
│   │   ├── index.css            # Tailwind 与自定义样式
│   │   └── pages/
│   │       ├── Join.jsx         # 学生生成与提交页
│   │       └── Screen.jsx       # 大屏合影页与海报导出
│   ├── vite.config.js           # 本地开发代理
│   └── package.json
├── render.yaml                  # Render 部署配置
└── README.md
```

## 本地开发

### 1. 后端

```powershell
conda activate dreamclass
cd D:\Microsoft_VS_Code\DreamClass-Photo\backend
pip install -r requirements.txt
uvicorn main:app --reload
```

后端默认运行在：

```text
http://127.0.0.1:8000
```

### 2. 前端

另开一个终端：

```powershell
cd D:\Microsoft_VS_Code\DreamClass-Photo\frontend
npm install
npm run dev
```

前端默认运行在：

```text
http://localhost:5173
```

访问：

```text
http://localhost:5173/
http://localhost:5173/screen
```

## 图片 API 配置

本地配置文件：

```text
backend/image_api_config.json
```

该文件已被 `.gitignore` 忽略，不要提交到 GitHub。

示例结构：

```json
{
  "active_provider": "siliconflow",
  "providers": {
    "supai": {
      "api_key": "你的 SupAI API Key",
      "api_url": "https://vibe.supai.app/v1/images/generations",
      "model": "gpt-image-2",
      "size": "1024x1024",
      "timeout": 600,
      "retries": 2
    },
    "siliconflow": {
      "api_key": "你的 SiliconFlow API Key",
      "api_url": "https://api.siliconflow.cn/v1/images/generations",
      "model": "Kwai-Kolors/Kolors",
      "size": "768x768",
      "timeout": 600,
      "retries": 2
    }
  }
}
```

Render 线上推荐使用 Secret File：

```text
/etc/secrets/image_api_config.json
```

后端读取优先级：

1. `/etc/secrets/image_api_config.json`
2. `backend/image_api_config.json`
3. 旧版 `backend/supai_config.json`
4. 默认配置和环境变量

## API 说明

| 接口 | 方法 | 说明 |
| --- | --- | --- |
| `/healthz` | GET | Render 健康检查 |
| `/api/access-status` | GET | 返回访问控制模式、当前 IP 和是否放行 |
| `/api/room` | GET | 获取大屏所有角色 |
| `/api/session/{session_id}` | GET | 获取某个学生的候选生成会话 |
| `/api/generate` | POST | 生成一张候选肖像 |
| `/api/submit` | POST | 提交选中的候选肖像到大屏 |
| `/api/image-provider` | GET | 查看当前图片 API provider |
| `/api/image-provider` | POST | 临时切换图片 API provider |
| `/api/debug/reset` | POST | 清空内存数据 |
| `/api/debug/seed` | POST | 批量生成测试头像数据 |
| `/static/{filename}` | GET | 访问生成图片 |

## 校园网访问限制

线上通过 IP 白名单限制访问。Render 配置项位于 `render.yaml`：

```yaml
ACCESS_CONTROL_MODE=campus_ip
CAMPUS_ALLOWED_CIDRS=222.204.0.0/18,210.35.240.0/20,218.64.56.8/32,2001:250:6c00::/48,39.161.242.0/24
CAMPUS_ALLOW_PRIVATE_IPS=false
TRUST_PROXY_HEADERS=true
```

说明：

- `ACCESS_CONTROL_MODE=campus_ip`：启用校园网 IP 限制
- `CAMPUS_ALLOWED_CIDRS`：允许访问的校园网出口 IP 段
- `CAMPUS_ALLOW_PRIVATE_IPS=false`：线上不自动放行私有地址
- `TRUST_PROXY_HEADERS=true`：通过 Render / Cloudflare 代理头识别真实访问 IP

如果有同学在宿舍运营商校园网无法访问，可让他访问：

```text
https://你的域名/api/access-status
```

返回中会包含：

```json
{
  "detail": "请连接南昌大学校园网后再使用本服务",
  "clientIp": "访问者公网 IP"
}
```

将该 `clientIp` 以 `/32` 形式加入 `CAMPUS_ALLOWED_CIDRS` 后重新部署即可。

## Render 部署

项目使用 `render.yaml` 部署：

```yaml
services:
  - type: web
    name: dreamclass-photo
    env: python
    region: singapore
    plan: free
    buildCommand: pip install -r backend/requirements.txt && cd frontend && npm install && npm run build
    startCommand: cd backend && uvicorn main:app --host 0.0.0.0 --port $PORT --proxy-headers --forwarded-allow-ips='*'
    healthCheckPath: /healthz
```

部署步骤：

1. 将代码推送到 GitHub。
2. 在 Render 中创建 Blueprint 或连接该仓库。
3. 配置 Secret File：`/etc/secrets/image_api_config.json`。
4. 确认 `CAMPUS_ALLOWED_CIDRS` 包含需要放行的校园网出口 IP。
5. 点击 `Manual Deploy -> Deploy latest commit`。

Render 线上验证：

```text
https://你的域名/healthz
https://你的域名/api/access-status
```

## 常用命令

### 前端构建

```powershell
npm --prefix frontend run build
```

### 后端语法检查

```powershell
python -m py_compile backend/main.py backend/access_control.py backend/image_config.py backend/replicate_client.py
```

### 批量测试前后端稳定性

```powershell
cd backend
python batch_test_generate.py --target 200
python batch_test_generate.py --cases --target 200 --step 10
```

### 单独测试图片 API

```powershell
cd backend
python supai_image_tool.py "阳光少年，白色衬衫，清新写实" --provider siliconflow
python supai_image_tool.py "阳光少年，白色衬衫，清新写实" --provider supai
```

## 数据与安全说明

- `backend/image_api_config.json`、`backend/supai_config.json`、`backend/.env` 不应提交。
- 生成图片位于 `backend/static/`，默认忽略 `.png` 文件。
- 后端角色、候选会话数据存储在内存中，服务重启后会清空。
- Render 免费实例可能存在冷启动；`/healthz` 用于健康检查，不受校园网限制影响。
- 当前校园网 IP 段来自公开资料和实际测试 IP，若用于正式长期服务，应以学校网络与信息中心确认的出口 IP 段为准。
