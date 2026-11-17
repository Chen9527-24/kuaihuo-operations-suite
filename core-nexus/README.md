# Core Nexus

Core Nexus 是快火业务系统的多租户后端，供 PC 管理后台、任务 H5、自动回复客户端和内容采集客户端使用。它提供账号与权限、机器人配置、任务分发、客户线索、AI 客服、文件、微信及结算提现等 HTTP API。

本目录是供 GitHub 展示和继续开发的整理版。真实环境配置、部署凭据、运行日志、内部协作材料和业务响应样本已移出；未接通的任务分发 V2 模型与独占迁移已摘出。保留现有任务分发链路。没有连接原数据库，也没有对任何现有数据库执行删除操作。

## 业务功能详解

下列说明位于总仓库的业务文档目录，按使用流程解释配置、操作、记录和当前边界。

| 功能 | 本项目相关内容 |
| --- | --- |
| [任务分发](../docs/features/TASK_DISTRIBUTION.md) | 任务、审核、结算与提现服务 |
| [自动回复](../docs/features/AUTO_REPLY.md) | 评论私信决策、生成与记录接口 |
| [AI客服](../docs/features/AI_CUSTOMER_SERVICE.md) | 角色、知识、规则、仿真与校准 |
| [截流采集](../docs/features/INTERCEPTION.md) | 目标配置、分析和采集同步 |
| [主动私信](../docs/features/LEAD_PRIVATE_MESSAGE.md) | 目标、草稿与执行任务 |
| [商机客户](../docs/features/CUSTOMER_LEADS.md) | 客户资料与实际跟进历史 |
| [官网管理](../docs/features/WEBSITE_CONTENT.md) | 草稿发布和表单咨询 |
| [公共管理](../docs/features/PLATFORM_ADMINISTRATION.md) | 租户、账号、权限与外部服务 |

## 功能范围

| 部分 | 代码提供的能力 |
| --- | --- |
| 基础管理 | 租户、用户、角色、权限、字典、登录、操作日志 |
| 机器人 | 设备与账号授权、配对、配置、运行状态、采集记录、主动私信任务 |
| 自动回复 | 评论与私信配置、记录同步、会话上下文、回复生成接口 |
| AI 客服 | 角色、商家/账号背景、知识库、固定问答、规则、仿真、校准、回复追踪 |
| 任务分发 | 创建/分发任务、评论池、领取、凭证、审核、结算、团长及分组 |
| 配套服务 | H5 用户、微信 OAuth/小程序开放能力、短信、文件/云存储、询盘、提现 |

后端生成回复内容和任务结果，实际平台页面操作由 UCP/截流桌面客户端完成。微信、短信、AI 和云存储需要使用者自己的服务配置。Coze 路径只有调用代码，没有随包提供可导入的云端工作流或 Bot，需自行创建并填写对应 ID。

## 技术与目录

Node.js 22.17.1（22 系列）与 pnpm 9.15.0；NestJS 11、TypeScript、Prisma 6、PostgreSQL、Redis。依赖安装只使用 `pnpm-lock.yaml`。

```text
src/main.ts                         启动、API版本与Swagger
src/modules/                        23个业务模块目录
src/modules/customer-service-agent/ AI客服管理和运行
src/config/                         配置与校验
src/prisma/ src/redis/               数据库与缓存封装
prisma/schema.prisma                100个保留模型
prisma/migrations/                  108个保留历史迁移
prisma/seed.ts                      开发初始化，无默认管理员密码
tools/                              配置检查与历史专项验证器
docs/CONFIGURATION.md               由使用者填写配置的说明
```

任务分发 V2 与客服长期状态的 `CUSTOMER_SERVICE_LONG_HORIZON_STATE_V2` 不是同一功能；后者仍属于现有客服实现。

## 配置与本地运行

先复制模板，然后填写真实值：

```sh
cp .env.example .env
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile --ignore-scripts
```

必填：`DATABASE_URL`、不同的随机 `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`（各至少 32 字符）。使用附带 Compose 时还需填写 `POSTGRES_PASSWORD`；首次初始化需填写 `SEED_ADMIN_USERNAME`、至少 12 字符的 `SEED_ADMIN_PASSWORD`。详见 [配置说明](docs/CONFIGURATION.md)。真实 `.env` 不应提交。

本地 Compose 只启动 PostgreSQL 16 和 Redis 7，端口绑定本机，不启动后端应用。`DATABASE_URL` 需要与 Compose 数据库名称、用户、密码、端口一致：

```sh
docker compose up -d postgres redis
pnpm prisma:generate
pnpm prisma:deploy
pnpm prisma:seed
pnpm start:dev
```

迁移和 seed 会写数据库，只对已确认的独立开发库执行。种子创建系统权限、演示租户和管理员；重复执行会整理管理员的默认租户和角色，已有管理员密码不会被覆盖。生产模式默认拒绝 seed。当前版本没有执行空库迁移或真实登录联调，因此这组步骤仍需在使用者开发环境验收。已有系统升级前需要另行评估迁移历史，不能直接用本整理版覆盖原部署。

启用 AI 客服前还需执行 `pnpm prisma:sync-system` 补齐客服角色模块定义，再按所需租户初始化客服基础资料；仅运行 seed 不会完成这一步。PC 的默认角色维护使用显式母版同步，和普通初始化有不同影响，见 [高级管理工具说明](../docs/features/ADMIN_TOOLS.md)。不要将升级同步当作日常刷新操作。

构建与运行：

```sh
pnpm build
pnpm start
```

生成入口为 `dist/src/main.js`。三个 Dockerfile 已统一为 Node 22.17.1、pnpm 9.15.0 和同一启动入口。容器运行时需要自行提供 `.env`/环境变量、数据库与 Redis；未执行容器构建和启动测试。现有 `docker/nginx/default.conf` 是反向代理示例，不由 Compose 自动启用。

## 接口与配套项目

普通业务 API 主要为 `/api/v1`，客服专用接口为 `/api/v5/customer-service`。Swagger UI 为 `/docs`，JSON 为 `/docs-json`。UCP 评论/私信运行入口属于 `/api/v1/auto-replies`，不是 `robots` 控制器。

| 配套目录 | 职责 |
| --- | --- |
| `kf-pc` | 管理账号、租户、机器人、任务、知识与客服调优 |
| `task-distribution-app` | H5任务领取、资料、团队、记录与提现 |
| `ucp` | 抖音/视频号消息采集、请求回复、页面发送与同步 |
| `interception-bot` | 抖音内容/评论采集、同步与私信任务执行 |

## 本次验证与边界

已完成 Prisma schema 校验、Prisma Client 生成、TypeScript 构建、配置与种子失败保护检查，以及部分已有只读专项验证。没有调用数据库、Redis、模型、短信、微信支付或平台账号；没有完成五项目联调和生产部署验证。

可复查配置保护：

```sh
pnpm exec node tools/verify-public-configuration.cjs
```

`tools/` 还保留历史专项验证器；部分验证依赖旧阶段文档或特定样例，不应把它们作为一组全部通过的当前发布验收。默认本地配置使用 mock 短信、MOCK 提现、本地文件，真实服务需逐项开启和验收。

## 许可与商用限制

采用 **PolyForm Noncommercial License 1.0.0**，用于源码公开及许可范围内的非商业学习、研究、测试、修改和分发。**本项目不授予一般商业用途许可；商用须另行获得权利人许可。**

完整条款见 [LICENSE](LICENSE)，中文摘要见 [非商业使用说明](LICENSE.zh-CN.md)。第三方依赖和已有独立许可的代码仍适用各自原条款；本项目不撤销既有授权。这是限制商用的源码公开项目，不是 OSI 定义的标准开源项目。
