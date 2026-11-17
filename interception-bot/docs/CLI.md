# 命令行参考

命令行与桌面GUI使用同一套源码，但包含正式任务、独立采集工具和旧调试路径。存在子命令不代表它与GUI主业务完全等价。
正式业务介绍见[内容采集](../../docs/features/INTERCEPTION.md)与[主动私信](../../docs/features/LEAD_PRIVATE_MESSAGE.md)，安装和构建前提见[配置说明](CONFIGURATION.md)。
当前平台参数只允许 `douyin`；没有快手、小红书或TikTok的正式命令行实现。

## 入口与公共约定

在 `interception-bot` 项目目录、已经激活并安装依赖的环境中运行：

```bash
python main.py --help
python main.py run-core-robot --help
```

无参数 `python main.py` 和 `python main.py gui` 启动GUI，不是一次命令行采集。
`--base-dir` 是全局参数，放在子命令前，决定本地Profile、输出和会话文件的查找根目录。

```bash
python main.py --base-dir . show-selectors --platform douyin
```

示例中的 `YOUR_*`、`MY_*` 都是待替换占位符，没有附带真实账号、机器人、目标或凭据。请先建立自己的测试环境和有权使用的测试目标。
`--headless` 会隐藏执行浏览器，不适合首次人工扫码；没有这个标志也不代表登录一定成功。

## 15个子命令的用途与边界

| 子命令 | 分类 | 主要输入/前提 | 产物或边界 |
| --- | --- | --- | --- |
| `prepare-runtime` | 环境工具 | 匹配当前Playwright版本的浏览器；浏览器名 | 检查实际启动；是否自动安装受显式环境配置控制，不准备语音模型 |
| `core-login` | Core认证工具 | Core根地址、自己的后台账号密码，可选租户 | 写Core会话缓存；不登录抖音 |
| `core-list-robots` | 正式只读运维 | Core缓存或显式账号参数 | 列配置，不启动桌面机器人 |
| `run-core-robot` | 正式单次截流 | Core机器人ID、租户、配置与对应平台登录 | 读取后端配置执行一次并同步；不是常驻服务 |
| `recover-intercept-run` | 正式采集恢复 | 原base-dir内的断点、Core身份和平台登录 | 继续未完成采集，跳过已完成项，之后同步 |
| `continue-intercept-sync` | 正式数据续传 | 已保存payload/sync_state、Core身份 | 仅续传，不重采、转写或打开作品 |
| `run-private-message-robot` | 正式主动私信 | 后端任务、Core身份、对应平台登录 | 领取、发送、回报；连续空轮达到上限后退出 |
| `run-robot-config` | 本地配置扩展 | 私有配置JSON、平台Profile及必要模型 | 本地单次运行；不自动建立Core client或上传 |
| `login` | 平台授权工具 | 平台、账号别名、可选起始页面 | 打开平台，人工登录后保存该别名Profile；不等于Core登录 |
| `sync` | 旧DOM扩展路径 | 已登录Profile、主页、数量/时长参数 | 本地JSON/评论CSV/Excel，不自动接通正式后台链路 |
| `probe-comments` | 开发诊断 | 已登录Profile及主页/作品 | 监听候选请求与响应，输出诊断；不等于完整评论采集 |
| `sync-posts-api` | 独立作品列表工具 | 已登录Profile、主页、范围参数 | 列表与summary；不自动同步Core |
| `sync-comments-api` | 独立一级评论工具 | 已登录Profile、作品地址 | 评论结果与诊断；不代替机器人调度/后台分析 |
| `sync-account-api` | 旧聚合诊断，存在前提不匹配 | 已登录Profile、主页；见下方专门说明 | 当前不能作为正式完整采集的即用替代入口 |
| `show-selectors` | 只读开发配置查看 | 平台，可选本地覆盖文件 | 打印选择器，不打开平台，不证明选择器当前有效 |

具体参数以各子命令 `--help` 与[解析器](../src/cli.py#L222)为准。旧脚本中的多平台描述不代表本版支持范围。

## 先处理两种不同的登录

### Core身份与缓存

推荐先在GUI登录Core、选择租户，复用GUI生成的 `config/core_session.json`。
下面所有正式命令显式使用这个路径，避免与CLI原来的根目录默认 `core_session.json` 混淆。
原根路径现也在.gitignore中排除；任意自定义的缓存路径仍需自行放在私有、已忽略位置。
不要把含Token的会话文件复制给其他使用者或作为测试夹具。

若确需用命令行登录，先查看参数：

```bash
python main.py --base-dir . core-login --help
```

命令结构如下，仅含占位符。真实密码作为命令参数可能进入终端历史或进程信息，正常桌面使用优先GUI登录。

```bash
python main.py --base-dir . core-login --core-api-base-url http://localhost:3000 --username YOUR_CORE_USER --password YOUR_CORE_PASSWORD --tenant-id YOUR_TENANT_ID --token-cache-path config/core_session.json
```

后端地址填写服务根地址或末尾带 `/api` 的地址，不填 `/api/v1`。
Core CLI主要读取缓存中的地址，或显式 `--core-api-base-url`；它不会因为修改.env就自动重建已登录会话或切换租户。
需要切换租户时，先在GUI重新选择，或用明确的租户重新登录；检查缓存属于预期环境。

### 平台身份与Profile

Core登录成功不等于已经登录抖音。独立平台授权工具例子：

```bash
python main.py --base-dir . login --platform douyin --account-alias local_test_account
```

浏览器打开后自行登录，回到终端按提示回车结束授权步骤；该工具保存的是这个别名的Profile。
正式机器人可能按机器人ID、名称及登录资料关联选择Profile，不能保证任意 `account-alias` 自动对应任意机器人。
正式任务推荐先在GUI以同一机器人完成平台登录，并在同一base-dir继续运行；需要传 `--storage-state-path` 时只能使用自己生成的状态文件。
状态文件含Cookie，是私有登录资料，不能从其他人的项目包借用。

## 正式截流命令

先在自己的Core/PC创建抖音截流机器人，填写目标、窗口与范围；语音及作品工作流需满足自己的配置前提。
列出配置不会执行采集：

```bash
python main.py --base-dir . core-list-robots --token-cache-path config/core_session.json --platform douyin --type INTERCEPT
```

执行一次已配置的机器人：

```bash
python main.py --base-dir . run-core-robot --robot-id MY_INTERCEPT_ROBOT_ID --token-cache-path config/core_session.json
```

`MY_INTERCEPT_ROBOT_ID`必须换成列表中自己创建的机器人ID。先完成平台登录；首次人工扫码不要追加 `--headless`。
默认按配置检查窗口和周期；`--ignore-run-cycle`只跳过按天周期，`--ignore-schedule`同时跳过窗口与周期，不能混用两者含义。
这些参数不解决登录失败、缺目标、模型或工作流配置问题，也不授予额外平台访问权限。
按实际返回核对新增/更新/跳过/失败数，不把退出码0直接当成每条评论已成功新增。

## 恢复采集与仅续传

采集中断并且断点仍在同一base-dir时：

```bash
python main.py --base-dir . recover-intercept-run --robot-id MY_INTERCEPT_ROBOT_ID --token-cache-path config/core_session.json
```

采集产物已经存在、只需要完成上传时：

```bash
python main.py --base-dir . continue-intercept-sync --robot-id MY_INTERCEPT_ROBOT_ID --token-cache-path config/core_session.json
```

可用 `--run-id YOUR_RUN_ID`选择具体批次；未传时查找最近符合条件的本地任务。
无可恢复/续传资料时会提示没有任务，不会自动从后端下载并重建所有本地文件。
续传会跳过本地已确认成功批次，失败隔离资料仍需查看；恢复采集则仍可能需要访问平台。

## 主动私信命令

先在PC确认捕获记录、最终文案、执行机器人及计划窗口，再在自己的平台账号中完成测试登录。

```bash
python main.py --base-dir . run-private-message-robot --robot-id MY_PRIVATE_MESSAGE_ROBOT_ID --robot-name YOUR_ROBOT_NAME --token-cache-path config/core_session.json --poll-interval-sec 10 --max-empty-rounds 3
```

`--robot-name`关系到同名登录资料的复用，名称应与自己的后端配置一致。
本轮空领取累计达到 `--max-empty-rounds` 后结束，不等于后台永远等待将来的任务。
暂停/停用会在后续轮次检查；已领取的批次、SENT回报、重试及冷却边界见[主动私信说明](../../docs/features/LEAD_PRIVATE_MESSAGE.md)。
SENT不是收件人已收到或已读的回执，遇到不确定发送结果先核对实际会话。

## 本地配置模式

将公开示例另存为已忽略的 `config/intercept.local.json`，填入自己的目标、范围及平台信息，再执行：

```bash
python main.py --base-dir . run-robot-config --config-file config/intercept.local.json
```

公开示例没有真实目标，直接运行未经填写的示例应报缺少目标，不能当成演示服务已运行。
本地首次测试可把 `schedule.runEveryDays`设为1，并选择包含测试时间的运行窗口；多日周期需要一个稳定、明确的 `anchorDate`。
当前无完成记录且anchorDate为空时，会以当天作为锚点计算首次日期；周期大于1可能一直提示尚未到首次日期，不能靠每天重启解决。
这条路径没有自动建立Core client；不使用作品云判定时明确设置 `workDecision.enabled=false`。
不需要语音时明确设置 `speech.enabled=false`；启用时先填自己的本地模型和ffmpeg配置。
结果只在本地，不因为名称里有robot就自动上传Core或生成后台主动私信任务。

## 独立与旧诊断工具

`sync-posts-api`适合观察主页作品列表，`sync-comments-api`适合核对一个作品的一级评论读取，`probe-comments`适合开发者定位响应候选。
它们使用本地别名Profile，与Core机器人、计划窗口、后台分析和任务队列分开。
`sync`是保留的旧DOM路径，输出不代表正式机器人链路经过验收。
这些命令可能打开平台、下载页面或保存响应资料，只能对自己有权使用的目标执行；不要把调试产物当公开样例。

特别是 `sync-account-api`：当前分支未创建Core client，也没有传入作品判定workflow配置，而服务默认开启前置判定。
在主页作品处理进入该判断时，会因缺少workflowId返回 `CONFIG_MISSING`并跳过评论；语音还可能有自己的配置前提。
因此不能把这条旧聚合命令描述为“无需后台即可完整替代run-core-robot”。正常使用选择正式Core链，或显式关闭不需要云判定的本地配置模式。
源码对应：[聚合CLI分支](../src/cli.py#L1021)、[服务默认参数](../src/account_sync_service.py#L54)、[缺失工作流处理](../src/account_sync_service.py#L977)。

## 运行时工具和选择器

```bash
python main.py --base-dir . prepare-runtime --browser-name chromium
python main.py --base-dir . show-selectors --platform douyin
```

`.env.example`默认关闭运行时自动安装；浏览器不存在时prepare-runtime可以失败。手动准备浏览器的方法见配置说明。
`show-selectors`读取内置选择器及 `selector_overrides/douyin.json`覆盖；`.example.json`只是示例，不会仅因存在便自动替换实际选择器。
选择器接口调试、屏幕截图和响应可能包含客户信息，保存位置与公开文件清单要区分。

## 本地结果、失败和构建工具

正式采集与续传主要使用 `output/`、`state/`、`profiles/`；`--base-dir`改变后会使用另一组资料。
旧 `sync` 的ResultStore可写 `result.json`、`comments.csv`、`result.xlsx`；GUI“导出”是作品判断表，两者不能混为同一份评论导出。
脚本返回成功也可能包含跳过、部分失败、隔离行或空结果，需结合summary、sync_state和日志检查。

`build_tools/bundle_ffmpeg.py`、`bundle_whisper_model.py`、`bundle_faster_whisper_assets.py`是构建辅助，不是日常采集命令。
它们分别准备媒体程序、本地模型和转写运行资产，Windows构建脚本会按流程调用；普通GUI启动无需逐个手工执行。
Windows构建必须保留本项目LICENSE和NOTICE；缺失时spec拒绝打包，两文件按白名单原样附在exe分发目录，私人运行目录仍被排除。
构建命令、依赖及模型准备见[构建说明](CONFIGURATION.md)。本命令行文档不表示真实平台、语音或Windows产物已经验收。
