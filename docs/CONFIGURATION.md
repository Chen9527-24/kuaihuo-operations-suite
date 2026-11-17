# 统一填写配置

可以在根目录的一个文件填写配置，再生成五个项目分别读取的本地文件。各子项目也保留自己的 `.env.example`，单独使用时无需依赖根目录脚本。

## 填写与生成

1. 将根目录 `config.example.env` 复制为 `config.local.env`。
2. 填入自己的数据库、服务地址和密钥。`CORE__` 对应后端，`PC__` 和 `H5__` 对应前端，`UCP__` 和 `INTERCEPTION__` 对应两个桌面客户端。
3. 运行 `python3 scripts/configure.py --check` 检查。
4. 运行 `python3 scripts/configure.py` 生成配置。Windows 可用支持的 `python` 命令代替 `python3`。

| 分组 | 输出文件 |
| --- | --- |
| CORE__ | core-nexus/.env |
| PC__ | kf-pc/.env.development |
| H5__ | task-distribution-app/.env.development |
| UCP__ | ucp/.env |
| INTERCEPTION__ | interception-bot/.env |

已存在的文件默认不覆盖。确需更新时先检查差异，再使用 `--force`。生成配置时不会连接数据库、启动服务或登录平台，也不会在终端打印配置值。

这套分发入口面向本地开发。PC/H5 的生产构建不读取 `.env.development`；发布前需在各自目录另建 `.env.production`，填写生产地址、租户和资源配置。H5 生产环境还需设置 `VITE_APP_ENV=production`。

## 基础配置

后端必须配置 `DATABASE_URL`、`REDIS_URL` 和两个不同的随机 JWT 密钥；每个 JWT 密钥至少 32 个字符。首次初始化管理员另需填写 `SEED_ADMIN_USERNAME` 和至少 12 字符的 `SEED_ADMIN_PASSWORD`。

如果用后端的 Docker Compose 启动本地 PostgreSQL，还需填写 `POSTGRES_PASSWORD`，并让 `DATABASE_URL` 使用相同的用户名、数据库和密码。密码中的特殊字符应在数据库 URL 中正确编码。

前端只填写客户端公开配置。配置分发按模板字段分别映射，后端密钥不会复制到 PC 或 H5。不要在 `VITE_` 变量中放密钥。

H5 默认关闭强制微信授权，任务租户由部署者配置。启动后端并创建自己的测试租户，再填写 H5 租户标识。分享图片、资源基址和微信 OAuth 均可按需要开启。

两个桌面客户端连接自己的 Core Nexus，操作员和平台账号通过各自界面登录。登录后产生的会话、Cookie 和本地记录属于使用者自己的运行资料，保持在忽略目录中。

## 可选外部服务

短信、模型、Coze 工作流、云存储、微信授权和支付需要使用者自行申请。后端基础示例采用本地文件、mock 短信和 mock 提现模式；启用真实服务前按子项目说明填入自己的配置。后端 mock 提现不代表 H5 普通浏览器能够完成提现流程，当前 H5 提现入口仍检查手机微信环境。

源码不包含可导入的 Coze 云端工作流资产。只填写工作流标识不能自动创建工作流。

## 文件格式

一行一个 `KEY=value`，支持注释及单行引号值，不执行任何命令，不展开 `${...}`。私钥建议使用对应服务支持的文件路径；不要将多行私钥直接塞入统一文件。所有真实配置文件均已加入忽略规则。
