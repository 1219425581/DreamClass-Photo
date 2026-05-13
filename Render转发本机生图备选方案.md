# Render 转发到本机生图备选方案

## 适用场景

Render 免费实例没有 NVIDIA GPU，不适合直接运行本地 SDXL / RealVisXL 生图模型。为了继续利用本机 RTX 4070 Notebook 8GB，可以让 Render 负责网页和房间状态，把生图请求转发到本机执行。

## 架构

1. Render 部署线上 Web 服务：负责前端页面、用户提交、候选图状态、大屏合影状态。
2. 本机运行生图服务：继续使用当前 `backend/replicate_client.py` 的本地模型生成图片。
3. 使用公网隧道暴露本机接口：可选 `cloudflared`、`ngrok`、frp 等。
4. Render 通过环境变量 `LOCAL_GENERATOR_URL` 调用本机公网地址。
5. 本机生成图片后返回可访问的图片 URL 或把图片上传回 Render/对象存储。

## 优点

- 继续使用本机 RTX 4070，图像质量和速度可控。
- Render 免费版也能上线网页。
- 不需要购买 GPU 云服务器，适合演示、课程、黑客松。

## 缺点

- 本机必须开机，并保持后端和隧道运行。
- 免费隧道地址可能变化，需要更新 Render 环境变量。
- 如果多人同时使用，本机生成队列会变慢。
- 本机网络中断会导致线上生图失败。

## 推荐实现步骤

1. 保留 Render 作为主后端。
2. 新增一个轻量本机生成服务，例如：
   - `POST /generate-local`
   - 请求：`{ "prompt": "..." }`
   - 返回：`{ "imageUrl": "https://隧道地址/static/xxx.png" }`
3. Render 后端读取环境变量：
   - `LOCAL_GENERATOR_URL=https://xxxxx.trycloudflare.com`
4. 如果设置了 `LOCAL_GENERATOR_URL`，Render 不在云端加载模型，而是请求本机生成服务。
5. 本机服务继续把图片保存到 `backend/static`。
6. 前端显示本机隧道返回的图片地址。

## 推荐工具

### cloudflared

优点：免费、稳定、无需信用卡。

示例命令：

```bash
cloudflared tunnel --url http://127.0.0.1:8000
```

### ngrok

优点：使用简单，控制台体验好。

示例命令：

```bash
ngrok http 8000
```

## 后续注意

如果要正式长期上线，建议改用云端生图 API 或带 GPU 的云服务；本方案更适合作为低成本临时演示方案。
