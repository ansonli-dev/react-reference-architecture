# React Reference Architecture

现代 React 应用参考架构：基于 Next.js 的完整在线书店实例。

通过服务端渲染、客户端交互与 BFF，展示模块边界、状态归属、技术协作和工程交付。

## 当前状态

已初始化 Next.js App Router、React Compiler、TypeScript strict、Tailwind、工程首页、健康检查和 CI。在线书店、认证、国际化及真实后端集成按建设指导书逐步实现；当前首页不依赖后端。

## 本地运行

使用 Node.js 24 LTS 和 package.json 中固定的 pnpm 版本。

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

如果环境未提供 Corepack，请先按 [pnpm 官方安装指引](https://pnpm.io/installation) 安装 package.json 指定版本的 pnpm。

访问 http://localhost:3000。健康检查：`GET /api/health`。

```bash
pnpm check   # 类型、ESLint、格式和模块依赖
pnpm build
pnpm start   # 启动生产构建
```

当前不需要环境变量。后端接入后再提供独立 Mock/真实模式；目前不要将工程首页视作业务 Mock。

## 文档

- [建设指导书](docs/project-guide.md)：目标、技术分工、总体架构与建设路线。
- [ADR 0001](docs/adr/0001-application-baseline.md)：初始工程决策及版本兼容性。
- [初始化计划](docs/superpowers/plans/2026-10-30-initialize-project.md)：本次范围与验证状态。
- [Agent 工作指引](AGENTS.md)。

## 后续路线

1. 完成会话、国际化、组件与数据访问基线。
2. 打通书籍浏览与详情的纵向流程。
3. 实现购物车/结算、用户订单及管理场景。
4. 补齐真实集成、测试、可观测性与部署示例。

相关 Java 后端：[explicit-architecture](https://github.com/ansonli-dev/explicit-architecture)。

## 当前限制

shadcn/ui 初始化在当前执行环境被网络拒绝，尚未接入。Query、Zustand、表单、国际化、认证、Mock 与业务测试按后续阶段实现；本次只交付可运行的工程基线。
