# KF PC 管理后台

Core Nexus 的 Vue 3 管理后台，供管理员和运营人员管理机器人和商机客户、维护客服知识并查看回复和业务记录。该目录是从原项目清理出的 GitHub 展示副本，业务配置由部署者自行填写。

## 业务功能详解

下列说明位于总仓库的业务文档目录，按使用流程解释配置、操作、记录和当前边界。

| 功能 | 本项目相关内容 |
| --- | --- |
| [自动回复](../docs/features/AUTO_REPLY.md) | 机器人与回复配置、运行记录 |
| [AI客服](../docs/features/AI_CUSTOMER_SERVICE.md) | 知识、角色和测试优化的配置顺序 |
| [截流采集](../docs/features/INTERCEPTION.md) | 目标配置与结果查看 |
| [主动私信](../docs/features/LEAD_PRIVATE_MESSAGE.md) | 目标筛选、草稿和发送任务 |
| [商机客户](../docs/features/CUSTOMER_LEADS.md) | 客户录入、跟进和待办 |
| [官网管理](../docs/features/WEBSITE_CONTENT.md) | 内容草稿、发布和咨询工作台 |
| [公共管理](../docs/features/PLATFORM_ADMINISTRATION.md) | 账号权限及媒体资料 |

## 当前包含

客服初始化、设备授权、记录导出清理及高级/API-only能力见 [高级管理工具](../docs/features/ADMIN_TOOLS.md)。当前菜单与隐藏入口的完整对应见 [功能覆盖检查表](../docs/FEATURE_COVERAGE.md)。

- 私信/评论自动回复机器人、截流线索及主动私信任务管理。
- 账号背景、店铺和角色、业务知识、固定问答、测试、回复校准和追踪。
- 商机客户、媒体账号、租户、后台账号、角色权限、字典及官网内容配置。

管理员登录后进入工作台查看服务状态，再按角色权限进入业务菜单。Core 提供模型调用、权限校验和文件存储接口，机器人通过各自的客户端运行。

## 安装和运行

使用 Node.js 20.11+ 和 pnpm 9.15.0。先启动自己的 Core 开发环境，创建测试管理员与租户。

```bash
cp .env.example .env.development
pnpm install --frozen-lockfile --ignore-scripts
pnpm dev
```

按 [配置说明](docs/CONFIGURATION.md) 修改自己的 API 和文件服务地址。默认仅使用本机地址；登录表单为空，不附带业务账号和密码。

```bash
pnpm typecheck
pnpm build:prod
pnpm preview
```

生产构建如需自定义值，应创建 `.env.production`；`.env.development` 不会被生产模式读取。生产托管需要将前端路由回退到 `index.html`，并配置自己的 API/文件代理。

## 项目结构

- `src/router/`：当前路由、菜单和访问权限。
- `src/views/`：运营、客服、机器人、官网及系统管理页面。
- `src/api/`：统一请求和各业务接口。
- `src/modules/customer-service/`：客服 API、类型、导入及测试相关界面能力。
- `src/stores/`：账号、租户和页面状态。
- `public/customer-service/knowledge-samples/`：示例知识与通用导入表头，使用前替换为已核实内容。

客服模块保留知识、固定问答等导入模板。官网初始内容为空白配置，不包含客户名单、合作标志或商业效果承诺。

## 验证与边界

使用 `pnpm build:prod` 可检查类型并生成生产静态文件。真实设备授权和机器人联调需使用自己的部署环境和测试账号。

技术栈为 Vue 3、TypeScript、Vite 5、Element Plus、Pinia、Vue Router 和 ExcelJS；准确依赖版本以 `pnpm-lock.yaml` 为准。

## 保留的离线源码检查

```bash
node tools/customer-service-v520/verify-v520-admin-import-calibration-knowledge.cjs
node tools/verify_wechat_dm_e1_pc.mjs
```

两项分别通过 15/15、6/6。它们检查现有源码结构，不替代浏览器或后端联调；旧固定问答断言等历史检查未包含在此副本。

## 许可与商用限制

采用 **PolyForm Noncommercial License 1.0.0**，用于源码公开及许可范围内的非商业学习、研究、测试、修改和分发。**本项目不授予一般商业用途许可；商用须另行获得权利人许可。**

完整条款见 [LICENSE](LICENSE)，中文摘要见 [非商业使用说明](LICENSE.zh-CN.md)。第三方依赖和已有独立许可的代码仍适用各自原条款；本项目不撤销既有授权。这是限制商用的源码公开项目，不是 OSI 定义的标准开源项目。
