# 快火智能运营与客服系统

一套供源码阅读、学习和二次开发的运营与客服系统，包含多租户后端、PC 管理后台、H5 任务前台，以及两个平台操作桌面客户端。数据库、模型、短信、微信及平台账号由使用者自行申请和配置。

## 五个项目

| 项目 | 职责 | 主要技术 |
| --- | --- | --- |
| [core-nexus](core-nexus/README.md) | 多租户权限、任务与线索、客服知识与生成、记录追踪、外部服务接入 | NestJS、TypeScript、Prisma、PostgreSQL、Redis |
| [kf-pc](kf-pc/README.md) | 管理配置、任务审核、机器人管理、客服知识、仿真与校准 | Vue 3、Vite、Element Plus |
| [task-distribution-app](task-distribution-app/README.md) | 任务领取与提交、团队邀请、状态和收益查询 | Vue 3、Vite、Vant |
| [ucp](ucp/README.md) | 抖音和视频号私信、评论的采集、回复执行与本地记录 | Python、PySide6、SQLite |
| [interception-bot](interception-bot/README.md) | 抖音作品和评论采集、筛选同步、主动私信任务执行 | Python、PySide6、Playwright、faster-whisper |

各目录可以独立阅读。业务界面和正式机器人流程通过 Core Nexus 协作，具体依赖与支持范围见各项目 README。

## 主要功能

项目按业务分为八个模块。每个模块都有独立说明，包含使用角色、功能拆解、配置和操作顺序、记录与状态、异常处理、当前边界及源码入口。

| 功能模块 | 具体做什么 | 详细说明 |
| --- | --- | --- |
| 任务分发与结算 | 管理任务和评论内容、分组派发、成员领取与提交证明、审核驳回、收益结算和提现 | [查看任务分发说明](docs/features/TASK_DISTRIBUTION.md) |
| 评论与私信自动回复 | 配置机器人和平台账号，采集来信上下文、请求回复决策、执行发送、回传记录，并处理重复与恢复 | [查看自动回复说明](docs/features/AUTO_REPLY.md) |
| AI 客服知识与优化 | 维护账号背景、角色、知识库与固定问答，进行仿真、回复校准、逐轮应用、转知识和 Trace 分析 | [查看智能客服说明](docs/features/AI_CUSTOMER_SERVICE.md) |
| 内容与评论采集 | 按主页或作品目标组织抖音采集，进行作品筛选、可选内容分析、评论归集和结果同步 | [查看截流采集说明](docs/features/INTERCEPTION.md) |
| 主动私信任务 | 操作员选择目标、准备草稿和发送任务，客户端领取执行并回报结果 | [查看主动私信说明](docs/features/LEAD_PRIVATE_MESSAGE.md) |
| 商机客户跟进 | 记录客户需求、渠道来源、推进阶段、跟进价值、实际沟通历史和下一步安排 | [查看商机客户说明](docs/features/CUSTOMER_LEADS.md) |
| 官网内容与咨询 | 管理内容草稿与发布配置，接收外接官网表单咨询并进入跟进工作台 | [查看官网管理说明](docs/features/WEBSITE_CONTENT.md) |
| 账号权限与公共服务 | 管理租户、后台账号、角色权限、媒体账号，以及文件、短信和微信等配套服务 | [查看公共管理说明](docs/features/PLATFORM_ADMINISTRATION.md) |

当前任务分发链路保留，未接通的 Distribution V2 已摘出。本仓库不包含真实客户数据、平台登录状态或可直接使用的服务账户。

## 四条业务链怎样配合

**任务协作：** 管理员在 PC 配置任务与分发，成员通过 H5 领取和提交证明，管理员审核并结算，成员再查询收益和提现状态。这条链主要使用 Core、PC 和 H5；平台任务由成员按指引操作，不是 H5 自动代发评论。

**客服回复：** 管理员配置账号背景、知识与机器人，UCP 获取平台消息，Core 处理回复判断与生成，UCP 执行页面发送并回传记录。自动回复说明讲执行流程，智能客服说明讲知识、规则和优化，两者配合使用。

**采集与目标处理：** 管理员配置采集目标，截流客户端执行并同步结果，操作员再查看、筛选和决定后续处理。主动私信使用单独的任务流程，不能把采集到评论直接当作已确认商机或同意接收消息。

**咨询与跟进：** 管理员发布官网内容配置，自行接入的官网页面提交访客咨询，Core 保存原始快照并建立客户记录，PC 用于登记实际跟进。仓库没有独立官网前端。

完整模块地图、角色阅读顺序和几个易混淆概念见 [业务功能说明目录](docs/features/README.md)。
另有 [H5 成员操作指南](docs/features/H5_MEMBER_GUIDE.md)、[设备授权与高级管理工具](docs/features/ADMIN_TOOLS.md)、[UCP 日常操作](ucp/docs/OPERATIONS.md) 和 [截流命令行指南](interception-bot/docs/CLI.md)。逐项核对范围见 [功能覆盖检查表](docs/FEATURE_COVERAGE.md)。

## 先看什么

1. [业务功能说明](docs/features/README.md)：先了解各模块具体做什么、怎样使用。
2. [架构与项目关系](docs/ARCHITECTURE.md)：理解服务端、界面和执行端如何协作。
3. [统一配置说明](docs/CONFIGURATION.md)：在一个文件中填写自己的配置。
4. [本地启动顺序](docs/QUICK_START.md)：从基础服务到前端和客户端逐步启动。
5. [验证范围](docs/VERIFICATION.md)：查看构建、离线检查和尚需自行验收的部分。

## 一个配置文件入口

复制根目录的模板，填写 `config.local.env`：

```bash
cp config.example.env config.local.env
python3 scripts/configure.py --check
python3 scripts/configure.py
```

脚本将各分组分别写到五个项目的本地配置文件。真实配置已加入忽略规则；脚本不会打印密钥、连接数据库或启动服务。已有配置默认不覆盖。

也可以只使用某个子项目，复制该项目自己的 `.env.example`，按其 README 填写。

## 自行搭建需要准备

- 后端和前端：Node.js、pnpm，以及自己的 PostgreSQL 和 Redis。
- 桌面客户端：独立 Python 环境、GUI 运行条件和自行登录的平台账号。
- AI 能力：自己的模型凭据；Coze 路径还需自行建立相应云端工作流。
- 可选能力：短信、存储、微信 OAuth、支付、公开分享图片及相应域名配置。
- 语音采集：截流客户端另需 ffmpeg 和可用的 Whisper 模型。

后端本地基础配置从 mock 短信、mock 提现和本地文件开始；当前 H5 提现入口仍要求手机微信环境。真实支付、平台发送和外部服务需在使用者自己的环境验收。

## 平台实现范围

| 客户端 | 当前实现 | 说明 |
| --- | --- | --- |
| UCP | 抖音、微信视频号 | 私信与评论；其他平台入口不作为已实现能力 |
| 截流客户端 | 抖音 | 内容评论采集及主动私信任务；其他平台不作为正式适配器 |

平台页面变化会影响自动化实现。源码提供实现与扩展入口，不承诺当前所有页面、账号或环境都可直接运行。

## 开发与贡献

见 [参与开发](CONTRIBUTING.md) 与 [安全问题](SECURITY.md)。仓库包含构建和源码检查工作流；这些检查不需要真实平台账号，也不证明真实短信、支付或发送已经验收。

## 许可与商用限制

采用 **PolyForm Noncommercial License 1.0.0**，用于源码公开及许可范围内的非商业学习、研究、测试、修改和分发。**本项目不授予一般商业用途许可；商用须另行获得权利人许可。**

完整条款见 [LICENSE](LICENSE)，中文摘要见 [非商业使用说明](LICENSE.zh-CN.md)。第三方依赖和已有独立许可的代码仍适用各自原条款；本项目不撤销既有授权。这是限制商用的源码公开项目，不是 OSI 定义的标准开源项目。
