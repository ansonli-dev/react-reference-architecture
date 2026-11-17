# ADR 0001：应用与工程基线

日期：2026-10-30
状态：接受

采用 Next.js App Router、React、TypeScript strict、Tailwind CSS 与 React Compiler。业务按功能组织，路由入口负责组合；后续按指导书接入 shadcn/ui、表单、Query、会话与 BFF。

独立 Java 后端保留业务权威；Next.js 负责渲染和面向前端的适配。NestJS 独立 BFF 作为演进专题。

当前提交仅初始化工程，不宣称已实现在线书店。优先官方脚手架并锁定实际安装版本，避免自行拼装未经验证的版本组合。

## 实际版本兼容性

初始化验证发现最新 TypeScript 7 与当前 typescript-eslint 不兼容，ESLint 10 也超出当前 Next.js 配套 React/import/a11y 插件的 peer 范围。因此暂用 TypeScript 6.0.3、ESLint 9.39.5，避免忽略 peer 错误。ESLint 9 已提示停止支持，后续需跟踪配套插件升级，支持后统一迁移 ESLint 10；该限制不应被称为最新工具链已全部兼容。

系统字体代替构建时 Google Fonts 请求，确保生产构建不需要额外字体网络访问。业务模块、共享层与装配层的基础依赖规则通过 dependency-cruiser 检查；客户端/服务端边界由后续 server-only 接入及构建测试继续补齐。

## 2026-11-17 安全补丁验证

Node `24.15.0` 与 pnpm `11.25.0` 下，原锁文件可冻结安装，`pnpm peers check` 和 `pnpm check` 通过。Next.js 16.4.3 的 `pnpm build` 在编译后以 `SecurityFatalError` 退出，`pnpm audit --prod` 报告一条 [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h)。公告的 16.x 修复线为 16.4.5。Next 16.x 为 [Active LTS](https://nextjs.org/support-policy)，本仓库将 Next.js 和 ESLint 配置一起固定在 [16.4.6](https://github.com/vercel/next.js/releases/tag/v16.4.6)。

在更新后的锁文件上运行 `pnpm install --frozen-lockfile`、`pnpm peers check`、`pnpm audit --prod`、`pnpm check` 和 `pnpm build`。生产审计报告零已知漏洞，生产构建退出 0。受限执行环境首次安装报 `ENOTFOUND registry.npmjs.org`。获准访问 npm 官方注册表后，冻结安装和审计成功，期间补丁 tarball 下载重试后恢复。Turbopack 的 CSS loader 需要绑定本机内部端口，受限运行报 `Operation not permitted`。确认回环端口可用并通过 Next CLI 构建后，重跑 `pnpm build` 退出 0。

后续批次从 npm 官方注册表实查以下版本候选，安装结果以锁文件和该批验证为准。openapi-typescript 7.13.0 的 TypeScript peer 为 `^5.x`，与应用的 TypeScript 6.0.3 不匹配。代码生成可使用单独固定的 TypeScript 5 工具包。

| 批次 | 候选版本                                                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A2   | [Zod 4.6.7](https://www.npmjs.com/package/zod/v/4.6.7)、[server-only 0.0.1](https://www.npmjs.com/package/server-only/v/0.0.1)、[Vitest 5.1.0](https://www.npmjs.com/package/vitest/v/5.1.0)                             |
| A3   | [next-intl 4.15.1](https://www.npmjs.com/package/next-intl/v/4.15.1)、[Lucide 1.73.0](https://www.npmjs.com/package/lucide-react/v/1.73.0)、[Playwright 1.65.1](https://www.npmjs.com/package/@playwright/test/v/1.65.1) |
| A4   | [openapi-typescript 7.13.0](https://www.npmjs.com/package/openapi-typescript/v/7.13.0)、[openapi-fetch 0.17.0](https://www.npmjs.com/package/openapi-fetch/v/0.17.0)                                                     |
| A5   | [React Testing Library 16.3.3](https://www.npmjs.com/package/@testing-library/react/v/16.3.3)、[jsdom 31.0.1](https://www.npmjs.com/package/jsdom/v/31.0.1)、[MSW 3.0.6](https://www.npmjs.com/package/msw/v/3.0.6)      |

## 双语外壳与组件来源

外壳固定 `zh-CN` 和 `en`。默认语言由路由决定。主题切换在浏览器保存选择，静态 HTML 与首次 hydration 使用相同默认值。使用系统字形，不在构建时抓取字体。Next.js 的 `agentRules` 关闭，以免开发 smoke 自动修改仓库维护的 `AGENTS.md`。

Button 和 Input 从 2026-11-17 可访问的官方 shadcn `new-york-v4` registry 源码移植。记录的 SHA-256 对应 registry JSON 的 `files[0].content`。实现映射了项目别名和色彩变量，按钮使用独立的 Radix Slot 包。

| 组件   | 官方来源                                                                          | 源码 SHA-256                                                       |
| ------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Button | [new-york-v4/button.json](https://ui.shadcn.com/r/styles/new-york-v4/button.json) | `79dd6f75f8136394442202d6b8b922fb269eaad0a5dba579397c9d5b41f893bb` |
| Input  | [new-york-v4/input.json](https://ui.shadcn.com/r/styles/new-york-v4/input.json)   | `0c9457181f6ddc80969bcf854e92c362903a55b6e889fbef3fd85343ecc4af5b` |
