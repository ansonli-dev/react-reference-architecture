# Agent 工作指引

1. 开始前阅读 `docs/project-guide.md`、`README.md` 及相关 `docs/adr/` 决策。
2. 项目是现代 React 应用架构参考实现；以在线书店贯穿服务端、客户端和 BFF，不扩展为组件 API 课程。
3. 路由入口保持薄层；业务按 feature 组织。服务端秘密、会话与后端适配器必须使用 server-only，不能进入客户端依赖链。
4. 明确区分服务端页面数据、Query 缓存、Zustand 草稿、表单与 URL 状态。禁止跨请求共享用户状态。
5. 依赖安装使用 pnpm，提交 lockfile。不得将尚未安装验证的依赖或尚未接通的后端能力标为已完成。
6. 提交前执行 `pnpm check` 与 `pnpm build`；涉及行为变化时增加有意义的测试。未能运行的检查需明确说明原因。
7. 技术栈变更和边界例外记录 ADR；更新 README 中的实现状态。
