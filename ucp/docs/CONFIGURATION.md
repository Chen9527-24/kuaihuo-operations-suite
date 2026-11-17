# UCP 配置与构建

工作台登录、启停、时段、休眠、日志和本地恢复见 [日常操作指南](OPERATIONS.md)。

## 配置文件

复制根目录 `.env.example` 为 `.env`，仅修改 `.env`。该文件不会提交到 Git。系统环境中的同名配置优先于 `.env`。`CORE_NEXUS_API_BASE_URL` 指向自行部署的 Core 服务根地址，默认本地，不附加 `/api/v1`。

| 配置 | 用途 |
| --- | --- |
| CORE_NEXUS_API_BASE_URL | 必填的自有后端地址；本地默认 localhost:3000 |
| DM_ACTIVE_SCAN_INTERVAL_MS / DM_TAB_SCAN_INTERVAL_MS | 工作中与切换子页时扫描间隔 |
| DM_IDLE_SCAN_MIN_MS / DM_IDLE_SCAN_MAX_MS | 空闲扫描区间 |
| DM_IDLE_LOG_EVERY_N / DM_IDLE_HEARTBEAT_INTERVAL_MS | 空闲日志及心跳 |
| DM_DEBUG_VERBOSE | 详细诊断开关，默认0 |
| COZE_ENABLED | 旧Coze兼容路径显式开关，默认0 |
| COZE_API_URL / COZE_INPUT_KEY | 兼容路径的服务地址及输入参数名 |
| COZE_WORKFLOW_ID / COZE_TOKEN | 由用户申请并填写；默认空 |

正常机器人回复不需要填写本地 Coze 配置，使用后端提供的模型绑定与知识。兼容路径必须同时开启开关并填写工作流和Token，配置不完整则维持关闭。该兼容开关不是将后端请求失败时自动转到另一个供应商的许可。

## 第一次登录

先确保 Core 可以登录且操作员有租户、相应机器人。客户端第一次启动会创建 config、profiles、records，缺失平台JSON时有内置默认值。GUI登录生成的缓存、平台扫码产生的Cookie、SQLite对话与恢复记录均是本机私有资料。无需手工创建 accessToken/refreshToken，也不要把登录文件当成配置模板。

当前“记住密码”和GUI会话缓存使用可逆编码，不是系统加密凭据库；共享电脑请不要保存密码或复制这些目录。日志与截图也可能带有客户消息，提交反馈前先清理。

## 本地验证

```bash
python -m unittest discover -s tests
```

测试包含源码断言、数据记录与恢复逻辑；通过不等于实际平台网页、后端权限或发送已验证。支持平台为抖音和微信视频号，未实现平台已禁用。

## Windows 构建

在独立构建环境安装 `requirements-build.txt`，再执行：

```bash
python -m pip install -r requirements-build.txt
python build_exe.py --env local
```

可用 `--api-base-url http://localhost:3000` 指定安装包后端根地址，`--env` 只决定产物名称，不隐含任何线上服务。默认目录模式；`--onefile`仍会在程序旁放置公开默认配置。也可用 `pyinstaller UCP.spec --clean --noconfirm`，地址通过 `UCP_API_BASE_URL` 显式传入。

构建只从 `.env.example`选取无凭据的扫描参数，并写入指定Core地址；不会复制本机 `.env`、会话、Profile、records或整个data目录。四份允许JSON为 common.json、dm.json、comment.json、dm_reply.json，非空token、密码、工作流/账号标识会阻止打包。云兼容凭据留给安装使用者在本机自行填写。

发布前在空目录实际启动并检查产物，验证依赖分发授权。仓库不含 exe，尚未实测 Windows 打包或 macOS 应用构建。

构建要求项目目录存在 `LICENSE` 和 `NOTICE`，并将它们按原字节复制到程序分发目录；缺少文件时构建会失败。不要仅发布 exe 而遗漏随包配置与许可声明。
