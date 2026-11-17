# ADR 0001 应用与工程基线

已接受，2026-10-30。

## 背景

前端需要同时提供服务端渲染的目录页面和在浏览器中运行的筛选交互。目录模型、UI 和 URL 策略应随功能演进，同时保持路由与通用组件的职责清晰。

## 决策

- 使用 Next.js App Router 管理路由、布局、React Server Components 和 Route Handlers。页面与同源 HTTP 接口都可以调用同一服务端读取器。[架构概览](../architecture/overview.md)
- 按 feature 组织业务。`app` 与 `server` 承担组合，通过公开入口使用模块能力。类型使用 TypeScript strict，React Compiler 由 Next.js 配置启用。[架构规范](../architecture/architecture-spec.md) · [TypeScript 配置](../../tsconfig.json) · [Next.js 配置](../../next.config.ts)
- 用 next-intl 管理语言路由与翻译，Tailwind CSS 与 CSS 变量负责样式和主题。共享 Button 和 Input 使用 shadcn/ui 源码，并保留许可证。使用系统字体使构建独立于字体下载。[样式入口](../../src/app/globals.css) · [组件许可证](../../src/shared/ui/LICENSE.shadcn)
- 本仓库的 Node 主版本、包管理器与依赖解析由 `.nvmrc`、`package.json` 和锁文件共同定义。[运行时版本](../../.nvmrc) · [依赖声明](../../package.json) · [锁文件](../../pnpm-lock.yaml)

## 取舍

页面、布局和 HTTP 入口共用 App Router 的约定，功能实现随业务模块演进。团队需要同时维护 feature 的公开入口和服务端、客户端的执行边界。导入规则、`server-only` 和 Next.js 构建共同检查这些约束。[架构约束测试](../../test/unit/architecture.test.ts)
