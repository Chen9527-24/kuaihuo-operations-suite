# 截流客户端配置与构建

GUI 导出与所有 CLI 子命令、会话路径及能力范围见 [命令行与工具指南](CLI.md)。

## 后端和登录

复制 `.env.example` 为 `.env`，将 `CORE_NEXUS_API_BASE_URL`设为自己的服务根地址，如 `http://localhost:3000`。可接受末尾 `/api`，不要填写 `/api/v1`。优先级为系统环境 → `.env` → GUI已保存地址 → 本地默认；GUI修改地址后，如.env仍有地址，应同步修改.env。

在自己的 Core 创建操作员、租户与机器人，在客户端登录并自行登录平台。GUI登录产生 config/core_session.json、gui_settings.json；浏览器产生profiles/state；采集产生output。均是本机私有文件，不提交仓库，不复制到安装包。记住密码采用可逆编码，共享电脑请关闭保存。

## 配置变量

| 配置 | 说明 |
| --- | --- |
| CORE_NEXUS_API_BASE_URL | 自行部署的Core根地址 |
| ACS_HTTP_TRUST_ENV | 是否读取系统代理环境，默认0 |
| ACS_PLAYWRIGHT_AUTO_INSTALL | 是否允许运行时安装浏览器，示例默认0；请先手动安装Chromium |
| ACS_ALLOW_SYSTEM_BROWSER_FALLBACK | 系统Chrome/Edge兜底，默认0 |
| ACS_GUI_EXTERNAL_BROWSER / ACS_GUI_VERBOSE_LOG | 外部调试窗口与详细日志，默认0 |
| WHISPER_MODEL | 本地faster-whisper模型目录，默认空 |
| WHISPER_DEVICE / WHISPER_COMPUTE_TYPE | 默认cpu / int8，需匹配自己的运行环境 |
| TRANSCRIPT_LANGUAGE | 转写语言，默认zh |
| ACS_FFMPEG_PATH | ffmpeg可执行文件路径；为空则查找系统PATH |
| ACS_ALLOW_WHISPER_DOWNLOAD | 显式允许模型名称触发联网下载，默认0 |
| ACS_SPEECH_HEADLESS / ACS_SPEECH_RETRY_VISIBLE_ON_FAIL | 语音浏览器行为；默认后台且不弹窗重试 |

没有配置本地模型时，语音任务报告配置缺失，不会隐式选某个模型联网下载。若主动选择在线下载，必须同时配置模型名称和`ACS_ALLOW_WHISPER_DOWNLOAD=1`，并自行确认下载来源及授权。本仓库不分发模型或ffmpeg二进制。

## 机器人业务参数

业务参数来自Core机器人配置，不是在.env手工保存登录凭据。`config_examples/intercept_robot.example.json`没有真实目标，云判定默认关闭。先填写自己有权处理的主页/作品，并决定采集范围、执行时段、是否语音识别。若启用`workDecision.enabled`，必须填自己配置的`workflowId`；缺失时直接跳过判定和后续评论采集，`failStrategy=RUN`也不会绕过此配置要求。

正式机器人仅抖音。CLI和GUI均限制为抖音；其他选择器文件仅保留作扩展参考，主动私信也会拒绝非抖音平台。

## 离线检查

```bash
python -m unittest discover -s tests
```

现有测试使用模拟浏览器/请求对象，不代表真实页面或后端验收。不要把实际运行账号、私信记录、Cookie或截图放入测试夹具。

## Windows打包

```bat
build_exe.bat local
```

可用第二个参数指定服务地址，如 `build_exe.bat local http://localhost:3000`。若同时设置系统 `CORE_NEXUS_API_BASE_URL`，系统变量优先。local/test/prod只用于产物命名，默认地址均为本地。

脚本会安装构建依赖，但不会联网下载浏览器或语音模型。需要事先在构建机准备匹配Playwright版本的Chromium headless shell；prod构建还要求本地ffmpeg与明确的Whisper模型，可设置 `ACS_FFMPEG_SOURCE`、`WHISPER_MODEL` 或 `WHISPER_MODEL_SOURCE`。模型/浏览器未准备就绪会明确失败，不能当作完整发布包。

PyInstaller只收集config_examples和selector_overrides中命名为`*.example.json`的示例，不收集真实config/state/profiles/output。构建后将运行目录清空，不复制旧会话。使用者在自己的机器中生成登录状态。发布前仍需检查最终目录、验证首次登录、采集及安装包的第三方分发授权。

`LICENSE` 和 `NOTICE` 是必须随分发物提供的文件，构建会检查并原样复制到分发目录。CLI 默认还可能在项目根生成 `core_session.json`，它同样属于私有会话；推荐按 [CLI 指南](CLI.md) 显式指定 `config/core_session.json`。
