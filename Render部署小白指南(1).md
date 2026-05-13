# Render.com 云端部署小白指南 (极简版)

恭喜你完成了本地的 Web 应用开发！现在，我们将把你的代码“搬”到云端服务器上，让全世界（包括你的微信朋友圈）都能访问你的作品。

**Render.com** 是目前对新手最友好的免费云部署平台（PaaS）之一。它能直接读取你的 GitHub 仓库并自动完成部署。

> 💡 **扩展常识**：Render 是一个全栈级平台，并非只能跑 Python。它原生支持 Node.js、Go、Ruby、Rust 以及任意的 Docker 镜像。本指南配合当前课程进度，专门以 **Python (FastAPI)** 项目为例进行极简操作演示。

---

## 避坑预警 🚨 (非常重要)
1. **冷启动说明**：免费版的 Render 如果 15 分钟没人访问，它就会“睡着”。下一个访问的人需要等大概 50 秒把它“叫醒”。所以如果你自己打开觉得很慢，耐心等1分钟即可。
2. **团队人数选 1**：注册时如果问你“有多少人一起开发”，**一定要填 1（Just me）**！一旦选了多人，就会变成付费团队模式，以后可能会找你要信用卡。

---

## 第一步：根据你的项目类型准备配置文件

在部署之前，请确保你的代码已经完整推送到 GitHub。Render 平台支持多种语言，请根据你**实际的项目技术栈**，在代码库根目录新建自动化部署配置文件 **`render.yaml`**：

### 🟢 情况 A：Python 后端项目 (如使用 FastAPI 开发的智能体)

请确保你的代码库包含 `requirements.txt` 和 `main.py`，并新建如下 `render.yaml` 模板：

```yaml
services:
  - type: web
    name: your-app-name  # ⚠️ 必须修改：换成你的酷炫应用名（仅限小写字母、数字和中划线）
    env: python
    region: singapore
    plan: free
    buildCommand: pip install -r requirements.txt
    startCommand: uvicorn main:app --host 0.0.0.0 --port 10000
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.0
    # 注意：涉及花钱的 API_KEY 千万别写进文件里！我们稍后会在后台手动配置。
```
> ![使用GitHub账号注册Render截图](image/Render部署小白指南/1778552055273.png)

### 🔵 情况 B：纯前端项目 (如原生 HTML / React / Vue)

如果你只是写了静态页面（例如在 JS 中直接请求大模型 API），完全不需要 Python 环境！纯前端不仅**配置更简单**，而且**没有 15 分钟的休眠机制（零冷启动时间）**。请新建如下 `render.yaml`：

**1. 原生 HTML/JS/CSS 项目（无需编译）：**
```yaml
services:
  - type: static_site
    name: your-frontend-app  # ⚠️ 必须修改：换成你自己的应用名
    buildCommand: ""         # 纯静态页面不需要构建，留空即可
    staticPublishPath: .     # 发布目录设为当前根目录
```

**2. 现代前端框架（如 React / Vue / Vite）：**
```yaml
services:
  - type: static_site
    name: your-react-app     # ⚠️ 必须修改：换成你自己的应用名
    buildCommand: npm install && npm run build  # 自动安装依赖并执行打包
    staticPublishPath: ./dist  # 填入你打包产物的目录（Vite/Vue 默认是 ./dist）
```
*(提示：纯前端项目不需要也不能配置 `startCommand`，Render 会自动将 `staticPublishPath` 中的内容托管到服务器上！)*

> ![GitHub仓库核心文件截图](image/Render部署小白指南/1778552680464.png)

## 第二步：注册并绑定 Render

1. 打开浏览器访问 [https://dashboard.render.com/login](https://dashboard.render.com/login)
2. 由于你是第一次使用，请务必点击页面下方的 **"Sign Up"** 进行注册（**注意：此时不要直接点 Sign In**，否则会提示账号不存在）。
3. 在注册方式中，**极力推荐**选择 **"GitHub"** 相关的选项（如 直接点击页面上方的 GitHub）。这样能直接将 Render 与你的代码库打通。
4. 注册流程中，所有的调查问卷选项都选择“个人用途（Personal / Just me）”。

## 第三步：使用 Blueprint 自动部署 (强烈推荐！)

既然我们在第一步已经往代码库中添加了 `render.yaml` 配置文件，这就意味着**所有的繁琐配置（如启动命令、Python环境等）都会被平台全自动读取**，你完全不需要手动填写！这就是企业级开发中的“基础设施即代码（IaC）”。

1. 登录成功后，在后台界面点击 **"New +"** 按钮，选择 **"Blueprint"**。
2. 此时页面会列出你的 GitHub 仓库。找到你要部署的项目（例如 `ncu-rag-tutor`），点击 **"Connect"**。
3. 在下一个页面中，你可以随意给实例起个名字（Blueprint Name），然后直接点击下方的 **"Apply"** 大按钮。

> ![选择新建Blueprint截图](image/Render部署小白指南/1778555713745.png)
![1778555884204](image/Render部署小白指南/1778555884204.png)

## 第四步：补充机密环境变量 (API Key) (针对AI原生应用，纯前端项目不需此步)

点击 Apply 后，Render 就会自动拉取代码并开始构建。但要注意：涉及到大模型费用的 API Key 等机密信息，**绝对不能**明文写在公开的 GitHub 文件（如 `render.yaml`）里！你必须在后台手动补充：

1. 在控制台主页 [https://dashboard.render.com](https://dashboard.render.com) 左侧的导航栏中，点击 **"Blueprints"** 菜单 [https://dashboard.render.com/blueprints](https://dashboard.render.com/blueprints)，然后点击进入你刚刚部署的 Blueprint 项目。
2. 在左侧菜单栏找到并点击 **"Environment"**（环境变量）。
3. 点击 **"Add Environment Variable"**。
4. 左边填你在代码里读的名字（比如 `SILICONFLOW_API_KEY`），右边填真实的密钥字符串。
5. **确认无误后，点击下方的 "Save Changes"**。保存后，系统会自动带着这些密码重新启动服务。

> ![1778556298998](image/Render部署小白指南/1778556298998.png)
> ![1778556341435](image/Render部署小白指南/1778556341435.png)
> ![1778556380709](image/Render部署小白指南/1778556380709.png)

## 第五步：见证奇迹的时刻

现在，点击左侧边栏的 **"Logs"**（日志），或者回到 Dashboard 查看该 Service 的构建状态。
你会看到一大串绿色的代码在疯狂滚动（这是云端服务器在自动帮你下载库和启动系统）。

1. 耐心等待 2-5 分钟。
2. 当你看到类似 `Your service is live 🎉` 的绿色提示，并且日志最后一行写着 `Application startup complete` 时，代表服务已成功运行。
3. 点击页面左上方为你自动生成的专属网址（形如 `https://ncu-rag-tutor-xxxx.onrender.com`）。

> ![部署成功与访问链接截图](image/Render部署小白指南/1778556693027.png)

**恭喜你，你的智能体应用已经正式上线了！快去黑客松平台提交你的 URL 吧！**
