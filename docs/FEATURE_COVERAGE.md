# 功能介绍覆盖检查

本页列出运营套件的管理入口、后端模块和两个桌面客户端。

七个主要业务模块各有独立说明，高级管理工具、UCP 工作台和截流客户端的 CLI 命令另有专项指南。

这里确认的是功能文档覆盖与实现范围，不是宣布所有接口、页面和外部服务都已完成运行验收。内部helper、每个DTO参数和每份历史校验脚本不单独产品化；接口字段以控制器/DTO及启动后生成的Swagger为准。

## 1 本次补齐与修正

- 补齐客服系统定义同步、租户初始化和显式升级维护；说明它们与管理员seed不同。
- 补齐设备/授权会话、对话导出删除、防历史回灌与派生记忆维护。
- 补齐Guideline、校准档案、意图基准和真人感材料评测的高级/API-only范围。
- 补齐两个桌面工作台的实际操作、调度与日志，以及全部CLI子命令的用途分级。
- 修正实际使用的UCP顶部栏：未实现平台不可点击，并保留控制器拒绝。
- 补充CLI项目根会话缓存忽略规则，避免将本地登录资料加入提交。

## 2 PC可见菜单

下表按源码导航逐项列出。菜单可见仍取决于当前账号权限。

| 菜单 | 路径 | 对应说明 |
| --- | --- | --- |
| 工作台 | `/dashboard` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| 商机客户 | `/customer-leads` | [商机客户](features/CUSTOMER_LEADS.md) |
| 多媒体账号 | `/media-accounts` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| 自动回复 | `/customer-service/auto-reply` | [自动回复](features/AUTO_REPLY.md) |
| 竞品截流 | `/robots/intercept` | [截流采集](features/INTERCEPTION.md)、[主动私信](features/LEAD_PRIVATE_MESSAGE.md) |
| 回复记录 | `/customer-service/records` | [自动回复](features/AUTO_REPLY.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 账号配置 | `/customer-service/customer-profiles` | [AI客服](features/AI_CUSTOMER_SERVICE.md) |
| 知识与流程 | `/customer-service/knowledge` | [AI客服](features/AI_CUSTOMER_SERVICE.md) |
| 角色配置 | `/customer-service/role-center` | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 测试与优化 | `/customer-service/simulation` | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 官网内容 | `/website/content` | [官网管理](features/WEBSITE_CONTENT.md) |
| 官网意向客户 | `/website/inquiries` | [官网管理](features/WEBSITE_CONTENT.md)、[商机客户](features/CUSTOMER_LEADS.md) |
| 租户管理 | `/tenants` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| 账号管理 | `/accounts` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| 角色管理 | `/roles` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| 权限管理 | `/permissions` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| 数据字典 | `/dicts` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| 个人中心 | `/profile` | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |

PC登录页另由公共管理与启动说明覆盖。当前菜单依据见 [导航定义](../kf-pc/src/router/menu.ts) 与 [路由映射](../kf-pc/src/router/index.ts)。

## 3 隐藏与兼容入口

隐藏不代表全部不可用，也不代表独立新产品。旧工作台/旧高级管理为重定向；其余按当前已注册组件与权限处理。

| 名称 | 路径 | 当前定位 | 对应说明 |
| --- | --- | --- | --- |
| 旧工作台 | `/customer-service/overview` | 重定向至`/customer-service/auto-reply` | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 旧高级管理 | `/customer-service/advanced` | 重定向至`/customer-service/role-center` | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 私信自动回复 | `/robots/private-message` | 隐藏兼容组件/维护页 | [自动回复](features/AUTO_REPLY.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 评论自动回复 | `/robots/comment` | 隐藏兼容组件/维护页 | [自动回复](features/AUTO_REPLY.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 对话记录 | `/robots/dialogue-records` | 隐藏兼容组件/维护页 | [自动回复](features/AUTO_REPLY.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 评论记录 | `/robots/comment-records` | 隐藏兼容组件/维护页 | [自动回复](features/AUTO_REPLY.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 默认角色设置 | `/customer-service/ali-settings` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 账号知识与表达 | `/customer-service/context-profiles` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 客户意图与流程 | `/customer-service/intents` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 行业能力 | `/customer-service/industries` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 配置资产 | `/customer-service/assets` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 角色原型 | `/customer-service/roles` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 客服角色 | `/customer-service/merchant-roles` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| 回复与流程 | `/customer-service/response-rules` | 隐藏兼容组件/维护页 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |

## 4 后端业务目录

下表按 `src/modules` 下的业务目录列出源码入口。

| 模块 | 主要能力及入口范围 | 对应说明 |
| --- | --- | --- |
| `ai` | 模型连通测试；孤立PC组件不作为默认导航 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `auth` | 登录、刷新、退出、当前用户、租户切换 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `auto-replies` | 设置、提示词/数据集、测试与正式回复、评论私信记录 | [自动回复](features/AUTO_REPLY.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| `customer-leads` | 客户资料、历史跟进、官网线索与回收站 | [商机客户](features/CUSTOMER_LEADS.md) |
| `customer-service-agent` | 客服配置、生成、仿真、校准、追踪与治理 | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| `dialogue-records` | 标准会话、消息、状态、导出删除及防回灌 | [自动回复](features/AUTO_REPLY.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| `dicts` | 字典类型与选项 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `files` | 后台上传、直传与完成登记、我的文件 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `health` | PostgreSQL与Redis连通检查 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `media-accounts` | 平台账号标识、资料和状态 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `operation-logs` | 操作日志查询API，默认菜单未设独立页面 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `permissions` | 权限树、条目及状态 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `rbac` | 受admin角色约束的访问与权限诊断API | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `robots` | 配置、设备授权、采集、分析、主动私信和任务状态 | [自动回复](features/AUTO_REPLY.md)、[截流采集](features/INTERCEPTION.md)、[主动私信](features/LEAD_PRIVATE_MESSAGE.md)、[高级管理工具](features/ADMIN_TOOLS.md) |
| `roles` | 后台角色、作用域与权限集合 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `sms` | 向有发送权限的管理员提供账号停用模板通知接口 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `tenants` | 租户资料、启停、软删除与可切换选项 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `users` | 后台账号、租户/角色、资料、头像与密码管理 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `wechat` | 小程序身份、带参码、跳转链接和公众号 JS-SDK 签名 | [账号权限与公共服务](features/PLATFORM_ADMINISTRATION.md) |
| `website` | 草稿、发布、素材、公开配置与咨询提交 | [官网管理](features/WEBSITE_CONTENT.md) |

依据见[后端装配](../core-nexus/src/app.module.ts)。API存在、PC有页面、桌面端已接通和真实服务可运行分别核对，不能相互替代。

## 5 客服控制器的归属

| 功能组 | 覆盖的控制器/子模块 | 文档位置 |
| --- | --- | --- |
| 初始化与概览 | overview、foundation | [高级工具](features/ADMIN_TOOLS.md) |
| 身份与角色 | role-prototypes、merchant-roles、role-modules、industry-nodes、context-profiles | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级工具](features/ADMIN_TOOLS.md) |
| 业务知识 | knowledge-entries | [AI客服](features/AI_CUSTOMER_SERVICE.md) |
| 意图与流程 | intent-definitions、intent-candidates、response-rules | [AI客服](features/AI_CUSTOMER_SERVICE.md) |
| 版本与质量 | assets、guidelines、quality-rules | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级工具](features/ADMIN_TOOLS.md) |
| 评测 | evaluation-cases、evaluation-benchmarks | [高级工具](features/ADMIN_TOOLS.md) |
| 测试与校准 | tuning-sessions、calibrations、calibration-profiles | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级工具](features/ADMIN_TOOLS.md) |
| 追踪与治理 | reply-traces、effect-observation、data-governance | [AI客服](features/AI_CUSTOMER_SERVICE.md)、[高级工具](features/ADMIN_TOOLS.md) |
| 运行入口 | runtime/simulation、runtime/reply | [自动回复](features/AUTO_REPLY.md)、[AI客服](features/AI_CUSTOMER_SERVICE.md) |

高级接口不一概描述成现成可视化管理页；评测目标不写成实测成绩，确定性意图基准不写成线上模型准确率。

## 6 两个桌面项目

| 项目 | 文档覆盖 |
| --- | --- |
| UCP | [自动回复主流程](features/AUTO_REPLY.md)、[实际工作台/运行策略/日志恢复](../ucp/docs/OPERATIONS.md)、[配置与Windows构建](../ucp/docs/CONFIGURATION.md) |
| 截流客户端 | [采集](features/INTERCEPTION.md)、[主动私信](features/LEAD_PRIVATE_MESSAGE.md)、[15个CLI子命令及GUI导出](../interception-bot/docs/CLI.md)、[配置与Windows构建](../interception-bot/docs/CONFIGURATION.md) |

未实现平台已禁用并由控制器拒绝。文档明确主动私信SENT不是送达回执、暂停对已领批次的限制、采集一级评论范围，以及本地与服务器记录的不同生命周期。

## 7 发布材料和验证边界

项目入口见[仓库首页](../README.md)，使用范围见[非商业许可](../LICENSE)及[署名声明](../NOTICE)。

本轮UI修正使用轻量Qt桩回归与UCP离线测试验证，没有实测Qt界面、平台登录、真实AI或跨系统安装包。总体结果与未验收项见 [验证范围](VERIFICATION.md)。

返回 [业务功能目录](features/README.md) 或 [项目首页](../README.md)。
