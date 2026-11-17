# 本地启动顺序

本指南面向自行搭建和二次开发。先在独立开发环境启动基础业务，再按需要接入模型、微信和平台账号。

## 环境与配置

Web 项目使用 pnpm 9.15.0；本轮后端构建使用 Node.js 22.17.1，前端构建使用 Node.js 20.11.1。Python 客户端建议使用独立 Python 3.12 环境；完整 GUI、浏览器与语音依赖按子项目说明安装。

先按 [统一配置说明](CONFIGURATION.md) 填写并生成本地文件。至少填写后端数据库、Redis、JWT 密钥；新建管理员时另填初始化用户名和密码。不要把示例里的字段名或空值直接当成自己的服务凭据。

## 后端

在 `core-nexus` 目录：

```bash
pnpm install --frozen-lockfile --ignore-scripts
docker compose up -d postgres redis
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed
pnpm start:dev
```

若使用已有 PostgreSQL/Redis，可跳过 Compose。迁移和种子会写数据库，只对自己确认的开发库执行。旧生产库升级需单独验证，不使用这份精简版改写旧生产迁移历史。

后端启动后可检查 `/api/v1/health` 和 `/docs`。默认端口及跨域来源以本地配置为准。

### 启用 AI 客服的系统与租户资料

`prisma:seed` 创建管理员并同步基础权限/字典，不会补齐客服角色模块定义。要使用客服初始化，在确认的开发库中另执行：

```bash
pnpm prisma:sync-system
```

该命令会写入系统字典、权限、角色和客服模块定义，并尝试维护种子管理员角色绑定。随后再用有权限的账号，为所需租户执行客服初始化或默认角色维护。PC“初始化系统默认角色”实际使用显式母版同步；它可能更新系统维护内容，不能当成每日刷新按钮。完整区别见 [高级管理工具](features/ADMIN_TOOLS.md)。

## PC 管理后台

在 `kf-pc` 目录：

```bash
pnpm install --frozen-lockfile
pnpm dev:vite
```

使用自己初始化的管理员登录，建立测试租户、账号和最小业务配置。管理权限、客服知识和机器人绑定都由本地后端维护。

## H5 任务前台

在 `task-distribution-app` 目录：

```bash
pnpm install --frozen-lockfile
pnpm dev
```

先设置自己的任务租户标识，使用本地接口。默认关闭强制微信 OAuth，便于普通浏览器开发；要启用微信授权与分享时，再准备自己的公众号、域名和后端配置。

PC 和 H5 若同时使用开发服务器，留意终端显示的实际端口，并让后端跨域来源和 PC 的 H5 链接配置保持一致。

## 桌面客户端

UCP 的入口是 `python run.py`，截流客户端的入口是 `python main.py`。分别创建虚拟环境、安装对应 requirements，再按 README 准备 Qt、浏览器及可选语音依赖。

两个客户端用自己的后端账号登录 Core，再使用自己的平台账号登录页面。首次启动不需要恢复原作者的登录缓存或业务账号文件。

正式发送、主动私信、重启恢复、多账号隔离和跨系统打包应在自己的测试环境逐项验收。

## 构建

三个 Web 项目分别支持 `pnpm build`。PC 构建包含 Vue 类型检查，H5 还提供独立 `pnpm typecheck`。

统一配置入口为两前端生成的是 `.env.development`，生产构建不会读取它。发布自己的前端前，需分别准备 `.env.production`，填写生产 API、H5 地址、任务租户、资源或分享图配置，再构建；H5 同时设置 `VITE_APP_ENV=production`。不要将后端密钥放入前端文件。

桌面发布物需按子项目打包说明制作，不能把运行期间生成的配置、账号资料或浏览器状态一并打入安装包。
