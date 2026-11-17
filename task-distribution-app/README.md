# Task Distribution H5

面向任务成员和团长的移动网页，与 Core Nexus 配合完成任务领取、评论领取、证明提交、团队邀请、收益记录和提现申请。它是 H5 网页，不是小程序或原生 App。

## 业务功能详解

下列说明位于总仓库的业务文档目录，按使用流程解释配置、操作、记录和当前边界。

| 功能 | 本项目相关内容 |
| --- | --- |
| [任务分发](../docs/features/TASK_DISTRIBUTION.md) | 成员领取、评论、证明、记录、团队、收益与提现 |
| [公共管理](../docs/features/PLATFORM_ADMINISTRATION.md) | H5成员与后台账号、平台账号的区别 |

## 当前包含

完整的14页进入条件、成员操作和后台处理步骤见 [H5 成员与管理员操作指南](../docs/features/H5_MEMBER_GUIDE.md)，包括关注检测、资料补全、任务账号切换和提现记录支线。

- 手机号验证码登录；可自行接入微信服务号 OAuth。
- 任务列表、领取、当前任务、平台操作指引和图片证明提交。
- 成员资料、任务账号切换、邀请绑定、团长申请及团队统计。
- 任务记录、驳回重提、收益和提现状态；可配置微信分享。

本版保留原 `/api/v1/app/distribution`、`/app/daily-tasks` 等接口链路。未落地的分发 V2 设计材料已移出，不附带 V2 功能。审核结算、权限、短信、文件和付款由 Core 实现并单独配置。

## 安装和运行

使用 Node.js 20.11+ 和 pnpm 9.15.0，先准备自己的 Core 开发服务。

```bash
cp .env.example .env.development
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

本地端口为 `5174`。在 `.env.development` 中填写自己创建的旧分发租户 `VITE_DEFAULT_TENANTS_ID`；未填写时显示站点配置提示，不使用原业务租户。默认 `VITE_ENABLE_WECHAT_OAUTH=false`，使用普通浏览器的手机号登录；验证码是否可用由自己的后端短信配置决定。

```bash
pnpm typecheck
pnpm build:prod
pnpm preview
```

生产配置需另外写入 `.env.production` 并重新构建。详细字段、反向代理和微信配置见 [配置说明](docs/CONFIGURATION.md)。

## 目录

- `src/pages/`：任务、团队、记录、登录和提现等页面。
- `src/components/TaskSteps.vue`：领取与提交步骤。
- `src/api/modules/`：现有分发和上传接口。
- `src/services/`：HTTP、授权、微信分享/收款确认和调试。
- `src/constant.ts`：平台配色与部署者配置的租户解析。
- `src/assets/operation-guide.svg`：新建的通用操作示意，明确标注并非平台截图。

原业务环境文件、业务响应样本、公众号验证文件、分享图和平台操作截图已移出。分享图可自行配置有权使用的公开图片 URL；未配置时不设置自定义分享图。

## 验证与边界

已完成冻结锁文件安装（禁用安装脚本）、`pnpm typecheck` 和生产构建。当前 `typecheck` 为 `tsc --noEmit`，不替代 Vue 模板的完整类型检查。未连接原业务服务，未验收真实微信授权、分享、短信、支付或完整任务闭环。

平台指引由用户自行操作，不能据此推断平台官方授权或自动评论接口。使用前需要自己配置账号、数据、短信、存储及微信相关能力。技术栈为 Vue 3、TypeScript、Vite 5、Vant 4、Pinia、Axios 和 Vue Router。

## 许可与商用限制

采用 **PolyForm Noncommercial License 1.0.0**，用于源码公开及许可范围内的非商业学习、研究、测试、修改和分发。**本项目不授予一般商业用途许可；商用须另行获得权利人许可。**

完整条款见 [LICENSE](LICENSE)，中文摘要见 [非商业使用说明](LICENSE.zh-CN.md)。第三方依赖和已有独立许可的代码仍适用各自原条款；本项目不撤销既有授权。这是限制商用的源码公开项目，不是 OSI 定义的标准开源项目。
