# 初始化、记录管理与高级工具

本文补充日常业务说明以外的安装初始化、机器人授权、对话资料管理和客服高级维护能力。
主要供部署者、有相应权限的管理员及开发人员使用；普通业务流程仍见 [AI 客服](AI_CUSTOMER_SERVICE.md)、[自动回复](AUTO_REPLY.md) 和 [任务分发](TASK_DISTRIBUTION.md)。
这些操作有的只查询，有的修改长期配置，有的永久删除记录，不能把所有“维护”按钮当成无副作用刷新。

## 先分清入口与影响

| 能力 | 当前入口级别 | 主要影响 |
| --- | --- | --- |
| 管理员种子与系统数据同步 | 项目命令 | 写数据库、同步系统权限/字典或客服模块定义 |
| 客服租户初始化 | 后端 API；PC 默认角色页另有母版同步入口 | 写入或更新当前租户的客服基础数据 |
| 机器人设备与授权 | 后端 API，PC 部分按钮及客户端状态同步 | 绑定设备、改变授权和运行状态，不自动拉起远端进程 |
| 对话导出 | PC 回复记录 | 下载包含客户对话的文件 |
| 联系人删除、筛选清理 | PC 回复记录及后端 API | 删除服务端会话/消息并设置防回灌水位 |
| 会话状态失效与重建 | Reply Trace 详情及后端 API | 改变派生状态，不直接改原聊天证据 |
| 校准档案启停 | PC 测试与优化的高级工具 | 改变后续匹配生成是否使用相应校准原则 |
| Guideline 版本管理 | 主要为后端 API | 修改结构化准则及正式版本，需验证与发布 |
| 意图和真人感评测 | PC 测试与优化的高级工具及 API | 得到测试材料、指标和比较，不自动证明线上效果 |

接口是否存在、是否有 PC 页面、当前桌面客户端是否调用、是否完成实际验收，是四个不同问题。
本说明按当前代码分别标明，不把 API 或预留组件直接当成已经连通的完整产品。

## 一 首次启用客服前怎样初始化

### 三种初始化对象不同

| 操作 | 主要处理什么 | 不能代替什么 |
| --- | --- | --- |
| `pnpm prisma:seed` | 系统字典/权限、演示租户、管理员与默认租户关系 | 不会完整创建当前租户的客服角色、意图、案例与准则 |
| `pnpm prisma:sync-system` | 字典、权限/角色、客服角色模块定义，以及可识别的管理员角色关系 | 不会替每个业务租户完成全部客服背景和真实知识配置 |
| 客服 `foundation` 初始化 | 当前租户的行业/角色、响应、评测案例、意图和 Guideline 等基础数据 | 不会变成真实商家知识，也不替你取得模型或平台授权 |

首次按配置说明完成独立开发库迁移和管理员种子后，再补齐系统模块定义：

```sh
# 从 core-nexus 根目录执行，只针对自己确认的开发数据库
pnpm prisma:sync-system
```

这是会写数据库的同步命令，不是连通性检查。已有权限、字典、系统角色等条目也可能按系统定义更新。
初次启用前确认连接的是自己的数据库，操作账号有初始化权限，并已经选择正确租户。

### 通用初始化与默认角色同步怎样选择

| 入口 | 实际行为 | 适用情形 |
| --- | --- | --- |
| `GET /api/v5/customer-service/admin/foundation/status` | 返回当前租户基础资源的数量与初始化判断 | 检查缺什么，不能代替实际回复测试 |
| `POST .../foundation/initialize` | 按基础种子幂等创建行业/角色、响应、案例、意图和准则 | 开发接入或需要完整基础集合的首次安装 |
| `POST .../foundation/sync-ali-flagship` | 显式同步系统推荐默认角色、模块与策略等母版 | 首次默认角色初始化、旧版本升级或确有缺失的维护 |

两个写入口都会检查所需角色模块定义，缺失时提示先执行 `prisma:sync-system`。
`status` 中的 `initialized=true` 主要是资源存在性判断，不表示模型、知识、角色行为或真实渠道全部验收通过。

PC“角色配置→默认角色 / Prompt”为空时的“初始化系统默认角色”，以及高级维护里的“补齐系统推荐基线”，调用的是 `sync-ali-flagship`。
通用 `initialize` 已有 API 和前端封装，但当前未作为默认角色按钮的调用目标；不要把两者说成同一个操作。

### 显式升级同步的副作用

它会更新系统维护的角色/模块/策略，并处理旧固定句式和冲突调优材料；部分旧系统自动创建的全局/闲聊档案会归档。
现有代码保留已有非空角色生成 Prompt，不应把“补齐基线”理解为必须恢复原始默认话术。
历史校准记录和案例不会因此全部删除，但旧档案是否参与后续运行可能改变。
普通修改 Prompt、账号资料或业务知识，不需要反复运行母版同步。

建议先查看状态和现有资料，明确要初始化还是升级，再用新测试消息核对角色、知识及 Trace。
初始样例和系统母版不是自己店铺的真实政策，启用前仍应替换或核对业务事实。
依据：[系统同步命令](../../core-nexus/prisma/sync-system-data.ts#L11)、[租户初始化与升级同步](../../core-nexus/src/modules/customer-service-agent/admin/foundation/customer-service-foundation.service.ts#L58)、[PC 默认角色入口](../../kf-pc/src/views/customer-service/ali-settings/index.vue#L11)。

## 二 设备、授权与机器人运行生命周期

### 三个状态分别代表什么

| 对象 | 保存什么 | 不能据此推断什么 |
| --- | --- | --- |
| 执行设备 | 设备标识、平台、状态、版本和心跳 | 当前电脑一定运行着客户端、浏览器一定登录正确账号 |
| 平台授权对象 | 平台账号标识、授权状态、会话信息和到期时间 | 平台官方认证了整个自动化产品，或 Cookie 永远有效 |
| 机器人 | 业务类型、租户、设备/授权绑定、启停和运行状态 | 后端写 RUNNING 就已在另一台电脑启动进程 |

普通评论/私信机器人与主动私信 `LEAD_PRIVATE_MESSAGE` 使用的运行条件不同。
主动私信按启用、暂停、时间窗口和本机登录执行，不能把普通设备/授权绑定要求套用到它；见 [主动私信说明](LEAD_PRIVATE_MESSAGE.md)。

### 设备注册和配对：后端已有协议

1. 有权限的管理员创建当前租户设备，取得设备编码与创建时返回的设备密钥。
2. 后端只保存密钥哈希；实际密钥应由使用者自己保管，不放源码、截图或公开配置。
3. 管理端创建设备配对会话，取得配对码与有效期。
4. 要接入该协议的执行端提交配对码、设备编码和设备密钥。
5. 后端校验当前租户、设备凭据和平台关系，再把配对会话标记为已确认并更新设备在线信息。

管理接口为 `/api/v1/robots/devices`、`pair-sessions` 等；配对消费在 `POST .../pair-sessions/consume`。
消费入口不使用普通后台 JWT，但仍校验有效配对会话和设备凭据，不能理解为任意设备可接入。
这些是可供开发者对接的协议；本版没有据此承诺两个桌面客户端已经实现完整通用配对界面。
依据：[设备创建](../../core-nexus/src/modules/robots/robots.service.ts#L4026)、[配对消费](../../core-nexus/src/modules/robots/robots.service.ts#L4261)。

### 扫码授权：区分 PC 接口与桌面闭环

后端流程是创建授权会话→执行端上报二维码→执行端确认登录→更新平台授权对象。
创建会话要求授权对象与设备属于允许的租户和平台，并将授权状态更新为等待扫码。
上报二维码和完成授权的接口校验会话及对应设备凭据；完成时可保存账号标识、会话数据和到期时间。

| 层次 | 当前可确认的接入范围 |
| --- | --- |
| Core | 有创建/查询、`report-qr`、`complete` 及设备凭据校验 |
| PC 普通机器人页 | 有“刷新扫码”动作；创建后可再读取会话，并提示二维码地址或等待 GUI 上报 |
| 当前 UCP/截流客户端 | 有平台自行登录与授权/状态同步代码；没有发现调用上述配对/二维码上报/完成协议的完整链路 |

PC 当前按钮不是完整的持续扫码控制台：有会话提示不代表实际二维码已经由桌面生成，更不代表登录已经完成。
若自己扩展执行端，应分别验收二维码来源、有效期、设备绑定、上报完成、过期与重新授权。
依据：[授权会话接口](../../core-nexus/src/modules/robots/robots.controller.ts#L475)、[后端二维码处理](../../core-nexus/src/modules/robots/robots.service.ts#L4336)、[PC 扫码动作](../../kf-pc/src/views/robotmanagement/RobotManagementPage.vue#L595)。

### 心跳、授权同步与启停

普通设备心跳接口可更新设备在线信息；机器人还提供 `auth-sync` 和 `runtime-status` 同步。
UCP 当前服务封装包含授权等待/完成状态、设备在线触达及机器人运行状态上报；这不等于它使用了全部设备配对 API。
授权失效、撤销、等待重登等同步可能清理后端保存的会话信息；不要仅把状态改回“已授权”当成浏览器已经重新登录。

PC 的启动、停止、过期刷新，以及后端禁用等状态操作改变后台状态与运行记录；执行端仍必须在本机实际运行并消费配置。当前普通机器人页面没有独立“禁用”行按钮。
排查顺序应为：当前租户与权限→设备/授权对象→本机平台登录→客户端进程→机器人状态与心跳→具体业务结果。
依据：[状态同步](../../core-nexus/src/modules/robots/robots.controller.ts#L505)、[UCP 后端服务封装](../../ucp/app/services/core_nexus_service.py#L118)。

## 三 对话导出、删除与清理

### 导出按联系人和会话段组织

在 PC“回复记录→私信对话”筛选并勾选联系人，再选择 CSV 或 JSON 导出。
当前界面要求先勾选，导出会整合相关联系人下的标准会话段和有效消息，并返回联系人、会话段、消息数量。
导出文件可能包含客户消息、账号和追踪资料，应按自己的资料管理方式保存，不作为公开演示种子。
导出不会删除后端记录，也不等于从平台下载全部历史聊天。
依据：[PC 导出](../../kf-pc/src/views/dialoguerecordmanagement/index.vue#L549)、[对话接口](../../core-nexus/src/modules/dialogue-records/dialogue-records.controller.ts#L90)。

### 删除联系人与按筛选清理

| 操作 | 范围和后果 |
| --- | --- |
| 删除一个或选中多个联系人 | 扩展到相应联系人的全部匹配会话段，删除其服务端消息/会话关系 |
| 清理当前筛选 | 处理匹配筛选的联系人与会话段，需要输入确认文本 `DELETE` |
| API 的 `hardDelete=false` | 后端另有软删除分支；不应将当前 PC 永久删除按钮等同于此分支 |
| 删除测试会话 | 属于客服调优会话管理，和删除真实同步对话不是同一个入口 |

当前 PC 对话删除按永久删除提示处理；后端还有限量与数据范围条件，不应宣传为无限量全站清空。
先检查筛选、选中对象和导出需求，再执行删除。联系人聚合可能包含多个会话段，不仅删除屏幕上一条消息。
删除服务端记录不等于撤回平台消息，也不自动删除 UCP 本地 SQLite、浏览器资料或已导出的文件。
依据：[PC 删除/筛选清理](../../kf-pc/src/views/dialoguerecordmanagement/index.vue#L511)、[后端删除范围](../../core-nexus/src/modules/dialogue-records/dialogue-records.service.ts#L897)。

### 防历史回灌水位怎样工作

删除或清理前，后端保存相应来源的“已删除到哪个观察时间”的水位。
同租户、机器人、来源客户端和本地会话后续同步时，水位之前或相同时间的旧事件会被过滤，避免客户端立即把旧聊天又传回来。
水位后的新消息仍可正常进入，不是把这个联系人永久拉黑。

它依赖来源标识与观察时间，不能保证改换来源 ID、错误时间或任意外部导入都被全局阻止。
因此不要用删除一次服务端记录代替本地和外部副本管理。
依据：[同步时过滤](../../core-nexus/src/modules/dialogue-records/dialogue-records.service.ts#L123)、[创建水位](../../core-nexus/src/modules/dialogue-records/dialogue-records.service.ts#L1701)。

## 四 错误会话状态与记忆怎样处理

客户原始消息、模型生成记录和系统据此形成的派生状态，是不同数据。
例如系统把客户已撤回的偏好仍保留为有效信息时，可以先在 Reply Trace 详情核对来源与当前标准状态。

| 工具 | 实际作用 | 不会做什么 |
| --- | --- | --- |
| 读取 canonical State | 查看当前状态、证据和重建信息 | 不替你核实聊天之外的事实 |
| 标记字段/记忆失效 | 让当前派生状态不再把指定目标当作有效依据 | 不删除原始聊天，不改商品知识正文 |
| 安全重建 | 从服务端有效对话事件重新计算状态 | 不凭空补出平台未同步的全部历史 |

PC 提供“标记失效”与“从权威会话证据重建”确认；目标类型和字段需符合后端支持范围。
期间出现新消息或版本冲突时，需要刷新重试；非标准会话也可能没有可重建状态。
标记失效不是永久禁止后续消息重新说明同类事实；若错误来自业务知识或原始信息本身，还要处理对应来源。
这属于生成上下文维护，不是客服知识发布，也不是对话删除。
依据：[状态操作控制器](../../core-nexus/src/modules/dialogue-records/dialogue-records.controller.ts#L54)、[PC 状态操作](../../kf-pc/src/modules/customer-service/components/ReplyGenerationDetailsDialog.vue#L481)。

## 五 校准档案的查询、停用与归档

在 PC“测试与优化”的高级工具可查看校准档案，按角色、作用域、关键词和状态筛选。
详情包含来源记录、累计应用、抽象目标/行为规则、作用域与最近应用时间。
当新回复持续受到不合适的长期原则影响时，应先找到实际命中的档案，核对范围，再决定停用或另作校准。

| 状态操作 | 作用与限制 |
| --- | --- |
| ACTIVE → DISABLED | 后续匹配加载不再把此档案当作启用校准；不会追溯改写已生成回复 |
| DISABLED → ACTIVE | 要通过后端允许条件；不保证每种旧档案都能直接启用 |
| 归档 | 退出可启停的日常管理状态；后端不允许已归档档案直接重新启停 |

精确 `ACCOUNT_*` / `ROBOT_*` 档案与 `ROLE_*` 共享候选仍然不同。
角色共享档案有独立证据要求，含旧句式规则的档案也可能被拒绝启用；修改 ACTIVE 标签不代替共享策略的回归发布。
精确作用域的运行投影主要使用抽象目标与行为原则，不能因档案保留了历史示例就认为每次按示例原句回复。
完整应用范围见 [AI 客服校准说明](AI_CUSTOMER_SERVICE.md#校准如何从反馈变成可用配置)。
依据：[档案面板](../../kf-pc/src/views/customer-service/simulation/components/CalibrationProfilesPanel.vue#L3)、[启停校验](../../core-nexus/src/modules/customer-service-agent/admin/calibration-profiles/customer-service-calibration-profiles.service.ts#L47)。

## 六 Guideline 结构化准则：主要为高级 API

Guideline 用结构化绑定、条件和动作描述某种情境下需要、禁止或优先考虑什么行为。
它与普通知识、固定问答和角色语气 Prompt 不同，不应只作为一大段自然语言话术保存。

| 内容 | 实际用途 |
| --- | --- |
| 绑定 | 关联系统/租户、角色、店铺、账号、行业或渠道范围 |
| 条件 | 组合已支持事实键及比较条件，判断是否适用 |
| 动作 | 请求/抑制/排序行为、要求事实支持、指定响应资产或请求人工处理等 |
| 优先级、重要程度、关系 | 参与依赖、互斥及冲突处理，不能简单理解为数字最大就绕过所有边界 |
| 版本、证据引用 | 记录发布依据与可复核的配置来源 |

后端提供列表/详情、创建/修改、版本创建、校验、发布和历史回滚。
当前未发现独立完整的 PC Guideline CRUD 编辑器；PC Trace 中有相关诊断展示，维护者主要通过授权 API 对接。

建议操作顺序：先确认作用对象和条件→创建草稿版本→校验结构及引用的响应资产→在测试链路检查命中与冲突→由有权限人员发布→用新请求核对版本与 Trace。
`validate` 成功只说明当前校验通过，不证明真实业务效果或所有条件组合都正确。
发布会检查内容哈希、版本状态和并发 revision；回滚也要求确认、原因和可用历史版本。
不要给普通运营人员提供没有验证和范围提示的任意准则 JSON 编辑入口。
依据：[Guideline 数据结构](../../core-nexus/src/modules/customer-service-agent/runtime/guideline/customer-service-guideline.type.ts#L9)、[版本校验与发布](../../core-nexus/src/modules/customer-service-agent/admin/guidelines/customer-service-guidelines.service.ts#L109)、[控制器](../../core-nexus/src/modules/customer-service-agent/admin/guidelines/customer-service-guidelines.controller.ts#L20)。

## 七 意图识别与真人感评测

### 意图基准测的是哪一层

PC“测试与优化”的高级工具可以读取基准清单并运行现有意图样例。
当前后端对样例调用确定性启发式理解器，返回模式为 `HEURISTIC_DETERMINISTIC`，不在这个评测入口调用外部模型。
输出包括分场景、主要意图、多意图、话题切换等指标及失败样本，适合比较代码修改前后。

清单里的 target 是目标，不是已经达到的成绩；这种结果也不是 DeepSeek 完整生成链或真实客户对话的线上准确率。
查看失败时应对照样例预期、实际理解和适用版本，不要把“测试通过”直接改写成产品效果承诺。
依据：[PC 意图基准](../../kf-pc/src/views/customer-service/simulation/components/IntentBenchmarkPanel.vue#L3)、[确定性运行](../../core-nexus/src/modules/customer-service-agent/admin/evaluation-benchmarks/customer-service-evaluation-benchmarks.service.ts#L62)。

### 真人感材料评估与匿名盲评

1. 读取当前评测对话与要求，准备基线和候选的输出材料包。
2. 在界面加载两份材料，先做确定性材料检查和比较。
3. 按匿名 A/B 展示对话，由评审人员评价各维度、问题标记和总体偏好。
4. 汇总评分并按需要导出评审记录，结合失败样本继续分析。

当前页面不是点击一下就自动替所有样例调用模型并完成真人评审；输出材料与人工评分都有明确准备工作。
评分和比较只反映这些材料、样例与评审，不是客户满意度调查、真实咨询转化或成交因果证据。
评测 API 还提供材料 evaluate/compare 和 review score，使用时需遵循当前材料格式与对话标识。
依据：[盲评页面](../../kf-pc/src/views/customer-service/simulation/components/HumanityBlindReviewPanel.vue#L1)、[评测接口](../../core-nexus/src/modules/customer-service-agent/admin/evaluation-benchmarks/customer-service-evaluation-benchmarks.controller.ts#L14)。

### 用例库与测试会话管理

评测案例控制器当前只有列表和详情，不是已实现全部任意案例增改删的管理系统。
测试会话可改名、删除单个或批量删除；删除会清理其消息、分析及测试 Reply Trace，已应用生效的长期校准资产另行保留。
测试候选接受、追加回复段与真实平台发送是不同动作，详见 [AI 客服测试](AI_CUSTOMER_SERVICE.md#对话测试与仿真能检查什么)。
依据：[只读案例接口](../../core-nexus/src/modules/customer-service-agent/admin/evaluation-cases/customer-service-evaluation-cases.controller.ts#L13)、[测试会话接口](../../core-nexus/src/modules/customer-service-agent/admin/tuning-sessions/customer-service-tuning-sessions.controller.ts#L19)。

## 八 其他兼容与诊断入口

| 能力 | 当前范围与使用边界 |
| --- | --- |
| DeepSeek 连通测试 | `POST /api/v1/ai/deepseek-chat/test` 使用后端环境 Key；PC 有组件但当前没有注册默认路由，不介绍为现有菜单 |
| 健康检查 | `GET /api/v1/health` 检查 PostgreSQL 查询与 Redis PING；成功不代表模型、支付和平台都正常 |
| RBAC 诊断 | `/api/v1/rbac/overview`、`me/access`；控制器受 admin 角色限制，不是所有普通账号通用查询 |
| 短信模板通知 | `POST /api/v1/sms/notifications` 只接受服务端预设 templateKey，不支持任意正文或任意云模板 ID |
| 小程序版本模式与 scene | `app/miniprogram/mode`、`wechat/scene/:ticket`；属于后端接入能力，不表示附有完整小程序前端 |
| 平台指引 | `/api/v1/platform-guide/public` 供消费指引配置；有指引不表示相应平台机器人已实现 |
| 旧任务 public/legacy | `app/daily-tasks`、`posts/*`、`claim-comment/*` 兼容旧 H5/小程序，不是已摘出的任务分发 V2；新接入需核对其不同身份参数 |
| 旧界面入口 | overview/advanced 等历史路径部分已重定向，不能据旧文件名承诺仍有独立完整工作台 |

开发者按当前 Swagger、DTO、权限声明和服务实现对接，不应把这张表当成已经完成外部服务运行验收。
依据：[AI 测试](../../core-nexus/src/modules/ai/ai.controller.ts#L8)、[健康检查](../../core-nexus/src/modules/health/health.controller.ts#L16)、[微信控制器](../../core-nexus/src/modules/wechat/wechat.controller.ts#L10)、[旧任务兼容](../../core-nexus/src/modules/daily-tasks/daily-tasks-legacy.controller.ts#L15)。

## 使用前后的核对清单

- 操作前确认当前实例、数据库、租户、权限、目标和实际作用范围。
- 导出/删除/升级前，按自己的资料管理与恢复方式保留必要副本；不能把演示库当生产库。
- 修改后用新的有效请求检查来源版本与实际结果，相同幂等键可能复用旧回复。
- 状态、授权和记录维护不能代替平台消息送达确认，也不会自动生成 CRM 成交或收入。
- 本版仅有源码与既有离线验证范围；这些维护流程未在本次对真实数据库、平台或外部服务执行。
