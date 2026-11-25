# 统一填写配置

可以在根目录的一个文件填写配置，再生成四个项目分别读取的本地文件。各子项目也保留自己的 `.env.example`，单独使用时无需依赖根目录脚本。

## 填写与生成

1. 将根目录 `config.example.env` 复制为 `config.local.env`。
2. 填入自己的数据库、服务地址和密钥。`CORE__` 对应后端，`PC__` 对应管理前端，`UCP__` 和 `INTERCEPTION__` 对应两个桌面客户端。
3. 运行 `python3 scripts/configure.py --check` 检查。
4. 运行 `python3 scripts/configure.py` 生成配置。Windows 可用支持的 `python` 命令代替 `python3`。

| 分组 | 输出文件 |
| --- | --- |
| CORE__ | core-nexus/.env |
| PC__ | kf-pc/.env.development |
| UCP__ | ucp/.env |
| INTERCEPTION__ | interception-bot/.env |

已存在的文件默认不覆盖。确需更新时先检查差异，再使用 `--force`。生成配置时不会连接数据库、启动服务或登录平台，也不会在终端打印配置值。

本地开发读取 `kf-pc/.env.development`。发布管理后台前，在 `kf-pc/.env.production` 中填写生产 API 和资源地址，再执行构建。

## 从旧版迁移配置

1. 在本机备份旧的 `config.local.env` 和正在使用的子项目配置。备份留在自己的私有目录。
2. 复制新版 `config.example.env` 创建新的 `config.local.env`，按模板逐项填回后端、PC、UCP 和截流客户端仍使用的值。旧版的 `H5__` 分组及已撤下的后端业务字段可留在旧备份中。
3. 运行 `python3 scripts/configure.py --check`。如果提示未知字段，对照新版模板检查字段名和所属分组，尤其注意前端配置只接收可公开的值。
4. 检查通过后，按需运行 `python3 scripts/configure.py`。已有子项目配置要更新时，先比对并保存原文件，再使用 `--force`。切换配置保留现有数据库和数据卷。

## 基础配置

后端必须配置 `DATABASE_URL`、`REDIS_URL` 和两个不同的随机 JWT 密钥；每个 JWT 密钥至少 32 个字符。首次初始化管理员另需填写 `SEED_ADMIN_USERNAME` 和至少 12 字符的 `SEED_ADMIN_PASSWORD`。

如果用后端的 Docker Compose 启动本地 PostgreSQL，还需填写 `POSTGRES_PASSWORD`，并让 `DATABASE_URL` 使用相同的用户名、数据库和密码。密码中的特殊字符应在数据库 URL 中正确编码。

前端只填写客户端公开配置。配置分发按模板字段分别映射，后端密钥仅写入服务端配置。不要在 `VITE_` 变量中放密钥。

两个桌面客户端连接自己的 Core Nexus，操作员和平台账号通过各自界面登录。登录后产生的会话、Cookie 和本地记录属于使用者自己的运行资料，保持在忽略目录中。

## 可选外部服务

需要模型回复、Coze 工作流、云存储或微信开放接口时，按所选服务申请凭据并填写后端配置。本机可先使用本地文件存储。

若要向用户发送账号停用通知，准备腾讯云短信应用、已审核的短信签名和对应的通知模板，以及有短信发送权限的服务端密钥。在后端配置中启用 `SMS_ENABLED=true`、`SMS_PROVIDER=tencent`，填写应用 SDKAppID、签名、服务端凭据和 `TENCENT_SMS_TEMPLATE_ACCOUNT_DISABLED_ID`。统一配置文件中的这些字段带有 `CORE__` 前缀。使用后台和机器人本身无需开通短信。

源码不包含可导入的 Coze 云端工作流资产。只填写工作流标识不能自动创建工作流。

## 文件格式

一行一个 `KEY=value`，支持注释及单行引号值，不执行任何命令，不展开 `${...}`。私钥建议使用对应服务支持的文件路径；不要将多行私钥直接塞入统一文件。所有真实配置文件均已加入忽略规则。
