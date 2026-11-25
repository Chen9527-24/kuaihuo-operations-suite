# Interception Bot 截流与主动私信客户端

连接 Core Nexus 的桌面工具，提供抖音主页/作品与评论采集、内容分析、筛选、结果分批同步，以及 `LEAD_PRIVATE_MESSAGE` 主动私信任务领取、执行和结果回报。

这是经过运行资料清理的源码展示版，没有附带账号、密码、会话Cookie、真实目标或云工作流。当前正式采集适配器和主动私信实现仅抖音；快手、小红书、TikTok按钮已禁用，旧选择器仅保留作扩展参考，CLI也仅允许抖音。

## 业务功能详解

下列说明位于总仓库的业务文档目录，按使用流程解释配置、操作、记录和当前边界。

| 功能 | 本项目相关内容 |
| --- | --- |
| [截流采集](../docs/features/INTERCEPTION.md) | 主页作品、内容处理、评论归集和结果同步 |
| [主动私信](../docs/features/LEAD_PRIVATE_MESSAGE.md) | 与自动回复不同的目标发送任务 |
| [公共管理](../docs/features/PLATFORM_ADMINISTRATION.md) | 后端身份、平台登录及服务配置 |

## 安装与启动

所有 CLI 子命令的用途分级、正式 Core 任务示例、会话保存位置及 GUI 导出操作，见 [命令行与工具指南](docs/CLI.md)。独立采集/探测命令具有不同前提，不能直接当作正式机器人流程的替代。

建议使用独立 Python 3.11 或 3.12 环境；实际跨系统支持矩阵仍待验收。

```bash
python -m venv .venv
```

激活环境：Windows PowerShell 使用 `.venv\Scripts\Activate.ps1`；macOS/Linux 使用 `source .venv/bin/activate`。然后安装：

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
```

Chromium安装会联网下载浏览器。将 `.env.example` 复制为 `.env`，填写自己的 Core 地址，再运行 GUI：

```bash
python main.py
```

CLI帮助：`python main.py --help`。运行采集或私信前，先在自己部署的 Core 建立租户、机器人和专用测试任务，再在本机登录平台。config会自动创建，登录后生成会话；不需要复制任何旧 core_session.json。

依赖包括 PySide6 / Qt WebEngine、Playwright、requests、python-dateutil、openpyxl 和 faster-whisper。语音识别额外需要 ffmpeg 与本地Whisper模型；不配置模型时不会自动下载，启用语音任务会给出配置错误。打开GUI不等于已具备语音识别环境。详见 [配置说明](docs/CONFIGURATION.md)。

## 功能与目录

```text
main.py                         GUI/CLI入口
src/gui_app.py                  桌面登录、机器人列表、浏览器工作区
src/cli.py                      命令行组织
src/platform_registry.py        正式适配器注册，目前仅抖音
src/robot_runner.py             监听目标、计划、限时和恢复
src/account_sync_service.py     作品、语音/文字、判定及评论汇总
src/private_message_worker.py   主动私信任务执行
src/core_nexus_client.py         后端接口
config_examples/                默认禁用且无真实目标的示例
selector_overrides/             实验选择器示例
tests/                          现有离线测试
build_tools/ *.spec             Windows构建辅助
```

采集结果不等于用户同意接收主动私信，也不证明形成询盘或订单。使用者应自行确认目标、平台账号和发送内容的使用权限。本项目没有平台官方授权、无限量采集或不封号承诺。

## 默认配置与发布边界

- Core地址默认为本地，优先读取系统环境、其次`.env`、最后GUI本地设置。
- 私有config/state/profiles/output、截图和Cookie不进入源码仓库或安装包。
- 作品云判定启用时必须明确填写机器人 `workDecision.workflowId`；缺失时不会调用后端默认工作流。示例默认关闭该判定。
- Whisper模型路径由用户选择；默认禁止源码与打包程序自动下载模型。
- 构建只收集命名为 `.example.json` 的配置示例，生成的登录目录为空。

未进行当前平台实机登录、采集、发送、转写或安装包验收。离线测试通过只能证明相应本地逻辑。

## 配套项目

配套项目包括 [Core Nexus](../core-nexus/)、[PC 管理后台](../kf-pc/) 和 [ucp](../ucp/)。

## 许可与商用限制

采用 **PolyForm Noncommercial License 1.0.0**，用于源码公开及许可范围内的非商业学习、研究、测试、修改和分发。**本项目不授予一般商业用途许可；商用须另行获得权利人许可。**

完整条款见 [LICENSE](LICENSE)，中文摘要见 [非商业使用说明](LICENSE.zh-CN.md)。第三方依赖和已有独立许可的代码仍适用各自原条款；本项目不撤销既有授权。这是限制商用的源码公开项目，不是 OSI 定义的标准开源项目。
