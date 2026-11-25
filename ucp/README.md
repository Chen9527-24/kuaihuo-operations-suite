# UCP 自动回复客户端

连接 Core Nexus 的桌面客户端，负责抖音、微信视频号私信和评论的采集、平台发送、本地记录与恢复。正式 AI 生成、知识和回复决策由 Core Nexus 提供。

这是经过配置与运行资料清理的源码展示版。没有附带在线服务账号、平台登录态、模型服务密钥或可用的云工作流。尚未完成浏览器实机、Windows 安装包及 macOS 验收。

## 业务功能详解

下列说明位于总仓库的业务文档目录，按使用流程解释配置、操作、记录和当前边界。

| 功能 | 本项目相关内容 |
| --- | --- |
| [自动回复](../docs/features/AUTO_REPLY.md) | 消息如何采集、判定、发送、同步与恢复 |
| [AI客服](../docs/features/AI_CUSTOMER_SERVICE.md) | 后端知识、角色和校准怎样影响回复 |
| [公共管理](../docs/features/PLATFORM_ADMINISTRATION.md) | 操作员登录、租户与平台身份 |

## 支持范围

登录与租户恢复、机器人启停、工作窗口/休眠、远端状态监视、日志和本地记录，见 [日常操作指南](docs/OPERATIONS.md)。

| 平台 | 状态 |
| --- | --- |
| 抖音 | 已有私信、评论控制器；需用户自行登录并验收当前页面 |
| 微信视频号 | 已有独立私信、评论控制器；需用户自行登录并验收 |
| 快手、小红书 | 未实现，界面入口已禁用，控制器也会拒绝该平台 |

包含 Reply Trace 关联、SQLite schema 4、回复尝试记录、去重与恢复、抖音私信分段发送和客户插话中止剩余段。现有实现不构成平台官方授权或稳定性承诺。

## 安装与运行

需要 Python 3.10+，建议在独立 Python 3.11 或 3.12 环境验证。依赖包括 PySide6 / Qt WebEngine、requests 和 tzdata。先部署 Core Nexus 并创建测试租户、操作员及机器人，再启动客户端。

```bash
python -m venv .venv
```

激活环境：Windows PowerShell 使用 `.venv\Scripts\Activate.ps1`，macOS/Linux 使用 `source .venv/bin/activate`。激活后执行：

```bash
python -m pip install -r requirements.txt
```

将 `.env.example` 复制为 `.env`，填写自己的 `CORE_NEXUS_API_BASE_URL`，然后运行：

```bash
python run.py
```

Core 地址填写服务根地址，如 `http://localhost:3000`，不附加 `/api/v1`。在 GUI 登录后选择租户，加载机器人，再自行登录平台。缺失的 config/profiles/records 会自动创建；无需复制旧登录会话或恢复任何真实 data/accounts.json。

更多配置与构建说明见 [配置说明](docs/CONFIGURATION.md)。

## 目录

```text
run.py                          桌面入口
app/main_window.py              主窗口与生命周期
app/widgets/                    登录、列表、日志等操作界面
app/services/                   Core 接口、配置、SQLite 与恢复
app/platforms/douyin/            抖音实现
app/platforms/wechat_video/      视频号实现
data/platforms/douyin/           不含账号和密钥的运行默认值
tests/ tools/                   离线测试与专项校验
build_exe.py UCP.spec            使用白名单复制默认配置的构建入口
```

## 数据与配置

- `.env`、Core 会话、平台 Profile、records、日志只保存在本机，不随源码或安装包发布。
- 正式回复使用 Core 的模型配置。旧 Coze 兼容路径默认关闭，只有本机显式设置 `COZE_ENABLED=1` 且填写工作流与Token时才启用。
- 安装包不复制开发者的整个 data/config 目录，仅允许四份平台默认JSON，发现非空凭据或工作流标识即拒绝打包。
- 依赖目前仍按范围声明，尚未提供完整锁定的跨系统支持矩阵；请记录自己验证的环境版本。

## 配套项目

配套项目包括 [Core Nexus](../core-nexus/)、[PC 管理后台](../kf-pc/) 和 [interception-bot](../interception-bot/)。

## 许可与商用限制

采用 **PolyForm Noncommercial License 1.0.0**，用于源码公开及许可范围内的非商业学习、研究、测试、修改和分发。**本项目不授予一般商业用途许可；商用须另行获得权利人许可。**

完整条款见 [LICENSE](LICENSE)，中文摘要见 [非商业使用说明](LICENSE.zh-CN.md)。第三方依赖和已有独立许可的代码仍适用各自原条款；本项目不撤销既有授权。这是限制商用的源码公开项目，不是 OSI 定义的标准开源项目。
