# 本地启动顺序

本指南面向自行搭建和二次开发。先在独立开发环境启动基础业务，再按需要接入模型、对象存储和平台账号。

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

若使用已有 PostgreSQL 和 Redis，可跳过 Compose。以上迁移和种子会写入数据库，请核对连接地址。

**已有数据库升级**时，先备份数据库，在副本运行 `pnpm prisma:deploy` 并检查账号权限、文件访问及机器人配置。仓库保留已发布的历史迁移及其校验和。拆分迁移只调整菜单、字典和共享上传权限，旧业务表及其记录会继续留在原库。新库从头执行历史迁移时也会创建这些旧表，当前服务不再读写它们。升级沿用 `prisma:deploy`，请勿对旧库执行 `prisma db push`、重置数据卷或接受自动生成的删表操作。原有私有配置的迁移步骤见[统一配置说明](CONFIGURATION.md#从旧版迁移配置)。

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

## 桌面客户端

UCP 的入口是 `python run.py`，截流客户端的入口是 `python main.py`。分别创建虚拟环境、安装对应 requirements，再按 README 准备 Qt、浏览器及可选语音依赖。

两个客户端用自己的后端账号登录 Core，再使用自己的平台账号登录页面。首次启动不需要恢复原作者的登录缓存或业务账号文件。

正式发送、主动私信、重启恢复、多账号隔离和跨系统打包应在自己的测试环境逐项验收。

## 构建

后端与 PC 项目分别执行 `pnpm build`。PC 构建包含 Vue 类型检查。

统一配置入口为 PC 生成 `.env.development`。发布管理后台时，在 `kf-pc/.env.production` 中填写生产 API 和公开资源地址，再执行构建。密钥保存在服务端。

桌面发布物需按子项目打包说明制作，不能把运行期间生成的配置、账号资料或浏览器状态一并打入安装包。
