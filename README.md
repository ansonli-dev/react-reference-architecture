# React Reference Architecture

现代 React 应用参考架构：基于 Next.js 的完整在线书店实例。

通过服务端渲染、客户端交互与 BFF，展示模块边界、状态归属、技术协作和工程交付。

## 当前状态

已完成 App Router 基线与双语外壳。工程首页、主题切换、健康检查和就绪检查可本地启动。目录页在下一批接入。

## 本地运行

使用 Node.js 24 LTS 和 package.json 中固定的 pnpm 版本。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

如果环境未提供 Corepack，请先按 [pnpm 官方安装指引](https://pnpm.io/installation) 安装 package.json 指定版本的 pnpm。

访问 [本地首页](http://127.0.0.1:3000/zh-CN)。`GET /api/health` 是进程健康检查，`GET /api/ready` 是目录依赖检查。

```bash
pnpm check   # 类型、ESLint、格式和模块依赖
pnpm build
pnpm start   # 启动生产构建
```

教学版用 `pnpm dev:mock` 开发，用 `pnpm build:demo` 和 `pnpm start:demo` 构建和启动。发布版用 `pnpm dev:real` 开发，用 `pnpm build` 构建并用 `pnpm start` 启动。通过 `PORT` 指定端口。构建过程无需配置目录数据源，并且两种构建应串行运行。

```bash
pnpm exec playwright install chromium --only-shell
pnpm api:check
pnpm test
pnpm build
pnpm build:demo
pnpm test:e2e
```

Playwright 测试启动两个生产产物。仅调试开发外壳时可用 `BOOKSTORE_E2E_DEV=1 pnpm test:e2e shell.spec.ts`。

## 文档

- [建设指导书](docs/project-guide.md)：目标、技术分工、总体架构与建设路线。
- [ADR 0001](docs/adr/0001-application-baseline.md)：初始工程决策及版本兼容性。
- [Superpowers 设计与实施计划](docs/superpowers/README.md)：业务纵切、Java 联调、验证步骤和评审记录。
- [初始化计划](docs/superpowers/plans/2026-10-30-initialize-project.md)：初始工程范围与验证状态。
- [Agent 工作指引](AGENTS.md)。

## 后续路线

1. 完成会话、国际化、组件与数据访问基线。
2. 打通书籍浏览与详情的纵向流程。
3. 实现购物车/结算、用户订单及管理场景。
4. 补齐真实集成、测试、可观测性与部署示例。

相关 Java 后端：[explicit-architecture](https://github.com/ansonli-dev/explicit-architecture)。

## 当前限制

教学登录、交易与真实 Java 集成位于后续阶段。
