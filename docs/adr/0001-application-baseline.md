# ADR 0001：应用与工程基线

日期：2026-10-30
状态：接受

采用 Next.js App Router、React、TypeScript strict、Tailwind CSS 与 React Compiler。业务按功能组织，路由入口负责组合；后续按指导书接入 shadcn/ui、表单、Query、会话与 BFF。

独立 Java 后端保留业务权威；Next.js 负责渲染和面向前端的适配。NestJS 独立 BFF 作为演进专题。

当前提交仅初始化工程，不宣称已实现在线书店。优先官方脚手架并锁定实际安装版本，避免自行拼装未经验证的版本组合。

## 实际版本兼容性

初始化验证发现最新 TypeScript 7 与当前 typescript-eslint 不兼容，ESLint 10 也超出当前 Next.js 配套 React/import/a11y 插件的 peer 范围。因此暂用 TypeScript 6.0.3、ESLint 9.39.5，避免忽略 peer 错误。ESLint 9 已提示停止支持，后续需跟踪配套插件升级，支持后统一迁移 ESLint 10；该限制不应被称为最新工具链已全部兼容。

系统字体代替构建时 Google Fonts 请求，确保生产构建不需要额外字体网络访问。业务模块、共享层与装配层的基础依赖规则通过 dependency-cruiser 检查；客户端/服务端边界由后续 server-only 接入及构建测试继续补齐。
