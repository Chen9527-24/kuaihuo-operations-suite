# Core Nexus 配置说明

所有真实值由使用者填写到根目录 `.env`；模板是 `.env.example`。不要把密钥填写进 TypeScript 源码、README 或示例文件。Nest 应用和管理员初始化/重置工具会读取当前工作目录的 `.env`，请从项目根目录执行命令。

## 先完成基础配置

| 项目 | 填写要求 |
| --- | --- |
| `DATABASE_URL` | 必填。独立 PostgreSQL 数据库连接，包含用户名、URL 编码后的密码、主机、端口和库名 |
| `REDIS_URL` | 必填；本机 Compose 可使用模板的 `redis://127.0.0.1:6379` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | 必填，各至少 32 字符，两个值必须不同；每个环境使用独立随机值 |
| `POSTGRES_PASSWORD` | 使用本地 Compose 时必填，不提供公共默认密码 |
| `POSTGRES_DB` / `POSTGRES_USER` | 本地 Compose 默认均为 `core_nexus`，修改后同步更新数据库 URL |
| `POSTGRES_PORT` / `REDIS_PORT` | 本机映射端口，默认 5432 / 6379；修改后同步更新连接 URL |
| `SEED_ADMIN_USERNAME` / `SEED_ADMIN_PASSWORD` | 运行 seed 前必填，密码至少 12 字符；不设置会在任何数据库写入前明确报错 |
| `PORT` | 后端监听端口，默认 3000 |
| `APP_ORIGIN` | 允许访问 API 的前端来源，逗号分隔；模板为本地 5173 和 5174 |
| `APP_BASE_URL` / `API_BASE_URL` | 使用者实际后端公开地址；本地模板为 `http://localhost:3000` |
| `H5_BASE_URL` | 实际 H5 地址；本地模板为 5174。生成任务链接、OCR 识别本系统任务页等会读取它 |

数据库 URL 形式为 `postgresql://USER:ENCODED_PASSWORD@HOST:PORT/DATABASE?schema=public`。这里的名称只是填写说明，不是可用账号。含 `@`、`:`、`#`、`/` 等字符的密码需要 URL 编码；Compose 中的 `POSTGRES_PASSWORD` 填原始密码，URL 中填编码后的密码。Docker Compose 只在首次创建数据库数据卷时应用初始账号密码，修改 `.env` 不会自动改掉已有数据库用户的密码。

可以运行下列命令单独生成随机值，每个 JWT 字段执行一次并保存输出；不要把生成后的值提交仓库：

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`.env` 不使用跨字段插值来拼装数据库 URL，避免配置加载器之间的差异。请完整填写 `DATABASE_URL`。

## 管理员初始化与重置

`pnpm prisma:seed` 会同步权限、字典，创建演示租户和管理员角色关系，并整理管理员的默认租户。已有管理员密码不会被 seed 覆盖；`SEED_ADMIN_PASSWORD` 仍必须提供有效值，以免首次初始化使用固定公共口令。

默认 `NODE_ENV=production` 时拒绝 seed。`ALLOW_PRODUCTION_SEED` 是原有显式绕过开关，模板保持 `false`，不要用于正常生产部署。首次本地验证应使用独立空开发库，迁移/种子从未在本整理过程中连接数据库执行。

确需重置管理员密码时，在本地填写 `ADMIN_RESET_USERNAME`、至少 12 字符的 `ADMIN_RESET_PASSWORD`，再执行 `pnpm admin:reset-password`。该命令会修改账号密码、状态及默认租户字段，应先确认数据库和目标账号。执行后清空临时密码字段。

## 按需要填写外部服务

| 分组 | 主要字段 | 未配置时的范围 |
| --- | --- | --- |
| 本地文件 | `UPLOAD_DRIVER=local`、`LOCAL_UPLOAD_DIR`、`UPLOAD_MAX_FILE_SIZE_MB` | 模板可用，不需要云账户；运行时 uploads 不进入仓库 |
| 阿里 OSS | `UPLOAD_DRIVER=oss`、`OSS_REGION`、`OSS_BUCKET`、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_ENDPOINT`、可选 CDN/前缀 | 不启用则不使用该云存储路径 |
| 腾讯 COS | `TENCENT_COS_ENABLED`、区域/桶/SecretId/SecretKey、前缀、签名与缩略图参数 | 默认关闭；启用前使用自己的最小权限账户与桶 |
| 腾讯 OCR | `TENCENT_OCR_ENABLED`、独立 SecretId/SecretKey、区域、超时和图片上限 | 默认关闭，主页图片识别能力不可用 |
| DeepSeek | `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`、`DEEPSEEK_TIMEOUT_MS` | 模型生成不可用；编译/部分管理不等于已经产生真实回复 |
| Coze | 自有 token 或 OAuth 凭据、各工作流/Bot ID | 没有原业务 ID 或默认账号；相关路径会提示缺配置，云端资产需要自行创建 |
| 短信 | `SMS_PROVIDER=mock` 或 `tencent`、`SMS_ENABLED`、验证码限制、腾讯账户/签名/模板 | 默认 mock，只用于本地验证；`aliyun` 未实现且会在配置校验时拒绝 |
| 微信小程序 | `WECHAT_MINI_APPID`、`WECHAT_MINI_SECRET`、页面、环境版本、scene 参数 | 相关登录、码、跳转能力需要使用者自己的小程序 |
| 微信公众号 | `WECHAT_MP_APPID`、`WECHAT_MP_SECRET`、OAuth 回调路径/范围/允许返回来源、可选通知模板 | 公众号授权、JSSDK和模板通知需独立配置；本地 HTTP 示例不能代替真实域名设置 |
| 微信提现 | `WECHAT_PAY_TRANSFER_MODE`、商户/应用身份、V3 密钥、证书/公钥路径、回调等 | 默认 `MOCK`，不会发起真实转账；真实资金流程没有在本次验证 |
| 官网询盘 | `WEBSITE_BASE_URL`、`WEBSITE_CONTACT_*`、`WEBSITE_CONFIG_MAX_BYTES`、`WEBSITE_IP_HASH_SALT` | 配置大小与请求限额有默认值；建议为哈希提供独立随机盐 |

### Coze 工作流分别填在哪里

| 字段 | 用途 |
| --- | --- |
| `COZE_WORKFLOW_ID` / `COZE_BOT_ID` | 每日任务生成评论的兼容路径 |
| `COZE_COMMENT_REPLY_WORKFLOW_ID` | 评论自动回复兼容路径 |
| `COZE_DM_CHAT_WORKFLOW_ID` / `COZE_DM_CHAT_BOT_ID` | 私信对话流兼容路径 |
| `COZE_COMMENT_INTENT_WORKFLOW_ID` | 截流评论意图分析 |
| `COZE_INTERCEPT_WORK_DECISION_WORKFLOW_ID` | 截流作品继续执行判断 |

认证可填写 `COZE_SERVICE_ACCESS_TOKEN`；按路径也支持 `COZE_PERSONAL_ACCESS_TOKEN` / `COZE_API_PAT`，或 `COZE_AUTH_MODE=oauth_jwt` 配合 `COZE_OAUTH_APP_ID`、`COZE_OAUTH_PUBLIC_KEY_ID`、`COZE_OAUTH_PRIVATE_KEY`。每日任务的旧兼容函数读取 `COZE_API_PAT`，并非所有调用路径都完整支持所有认证方式。模型主路径使用 DeepSeek，Coze 是兼容能力，不应为启动基础后台而先填写所有 Coze 字段。

本包不含云端工作流定义。只有自己的 token 而没有对应工作流，不能复现原业务逻辑。数据库中每个机器人/提示词也可填写自有工作流覆盖值；全局环境值作为未指定时的后备，清理后的代码不再注入原工作流 ID。

### 微信转账模式

`MOCK` 是默认本地测试模式；`MANUAL` 是手工处理状态路径；`WECHAT` 才调用真实支付接口。要启用真实微信支付，填写 `WECHAT_PAY_MCH_ID`、`WECHAT_PAY_APP_ID`、`WECHAT_PAY_API_V3_KEY`、`WECHAT_PAY_MERCHANT_SERIAL_NO`、`WECHAT_PAY_PRIVATE_KEY_PATH`、`WECHAT_PAY_PUBLIC_KEY_ID`、`WECHAT_PAY_PUBLIC_KEY_PATH`、`WECHAT_PAY_NOTIFY_URL` 及业务场景参数，并先在自己的隔离环境完成验签、回调与失败状态验证。路径填写本机/容器可读文件位置，私钥文件不得放入 Git。

## 客服保留策略与其他参数

`CUSTOMER_SERVICE_JSON_MAX_BYTES` 限制持久化 JSON；`CUSTOMER_SERVICE_*_RETENTION_DAYS`、`CUSTOMER_SERVICE_CALIBRATION_COMPACT_DAYS` 和批大小控制客服调优/追踪数据治理。`CUSTOMER_SERVICE_GOVERNANCE_PURGE_ENABLED=false` 默认关闭清理。`CUSTOMER_SERVICE_LONG_HORIZON_STATE_V2` 是客服会话状态实现开关，与已摘出的任务分发 V2 无关。

`ALLOW_TEST_DATA_PURGE=false` 控制旧任务分发链路的测试数据清理。不要对未经确认的库开启。`APP_TRUST_PROXY_HOPS` 仅在已知反向代理层数时配置；本地为 0。`WECHAT_PAY_*`、短信和 AI 的超时默认值并不保证外部服务一定成功。

模板列出主要支持字段；代码仍保留少量旧部署兼容别名，例如 `DEEPSEEK_API_BASE_URL`、`DEEPSEEK_CHAT_MODEL`、`WITHDRAW_TRANSFER_MODE`。新配置统一使用模板主字段，不要同时填写冲突别名。专项调试限额以相关 service 读取位置为准。

## 验证配置的范围

`pnpm exec node tools/verify-public-configuration.cjs` 检查缺失数据库/JWT、重复密钥、未实现短信提供商、默认 mock 模式、无原 Coze ID，以及 seed 缺账号/短密码时在数据库操作前失败。它不会证明实际凭据有效，也不连接外部服务。

Prisma `validate` 只检查模型定义与关系，不连接数据库。`prisma:deploy`、`prisma:seed` 和启动服务都会访问数据库/Redis，需由使用者在自己的开发环境验收；公开展示并不等于这些操作已经完成。
