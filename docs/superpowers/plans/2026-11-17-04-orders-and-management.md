# 私域订单与后台管理实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal** 完成用户订单读取/取消、查询缓存隔离、管理编辑和页面再验证。

**Architecture** 动态 RSC 取本人订单与管理数据，客户端 Query 负责交互刷新。取消调用 BFF，标题修改走受保护 Server Action。教学 SQLite 与后续 Java 实现同一受信端口。

**Tech Stack** TanStack Query、TanStack Table、React Hook Form、Zod、Next.js Server Action 与 Cache Components、Vitest、Playwright。

**Spec** [前端设计](../specs/2026-11-17-bookstore-reference-design.md) 第 3–7 节。

## 全局约束

- 先完成 C1–C5。测试账号包含两个顾客和管理员。禁止服务端跨请求共享用户 QueryClient，私域 HTTP 禁止缓存。
- 两个业务修改分别示例 Route Handler 与 Server Action，同一动作保留一个写入口。真实 v1 在能力判定处关闭这些场景。

- 执行 Playwright 生产用例前，根据测试 profile 用当前源码运行 `pnpm build` 或 `pnpm build:demo`。RED 和 GREEN 都执行，测试须失败在目标断言。

## 评审关注点

| 触发                              | 预期                                       | 任务   |
| --------------------------------- | ------------------------------------------ | ------ |
| 对 A 的订单尝试 B 访问或取消      | 与未知订单一致的 404，副作用为零           | D1     |
| 订单已在另一标签取消/发货         | 409，刷新获取现状，无第二次释放            | D2     |
| 缺 Origin 或顾客捕获管理员 Action | 拒绝，名称版本不变，缓存不失效             | D3     |
| 标题已被管理员更新又提交旧版本    | 冲突保留输入，不覆盖新值                   | D3     |
| 目录已缓存后修改标题              | 首次重新读取返回新值，失败修改不驱逐 cache | D3、D4 |

## Task D1 · 本人订单及身份缓存隔离

**文件** `src/features/orders/{model,server,client}.ts`、`src/server/{orders,adapters/demo/orders}.server.ts`、`src/app/api/v1/orders/{route.ts,[orderId]/route.ts}`、`src/app/[locale]/(account)/orders/{page,loading}.tsx`、`src/app/[locale]/(account)/orders/[orderId]/page.tsx`、`src/features/orders/ui/order-detail.tsx`、`src/app/[locale]/_composition/query-scope-provider.tsx`、`test/e2e/{order-ownership,session-scope}.spec.ts`。

**消费** C4 订单持久化，C1 角色/会话与 session scope。先安装并锁定 TanStack Query。**产出** `listOrders(actor,page): Promise<OrderPage>`、`readOrder(actor,id): Promise<OrderDetail|null>`、`orderKey(scope,id)`，详情 version、明细、总价与状态。

- [ ] 先写失败断言：A 直达/刷新自己的订单可见。B 直达 A 及未知 ID 都是 404。匿名 API 401。不输出原始邮箱、session 或用户 bearer。浏览器同一 tab 登录 A、前往详情、切换 B、Back，另一 tab 收广播或恢复页面后也不得看到 A 详情。打开两个浏览器上下文防互串。
- [ ] 实现所有查询加 owner 条件，RSC 请求中校验身份并只 payload 安全字段。Query 仅订单详情示范 prefetch、HydrationBoundary、staleTime 15s 和客户端刷新，服务端按请求新建，客户端新 scope 重建和清旧 cache。禁用私域 Link 预取。从不把模块或页面做进公共 cache。
- [ ] 两产物构建完成后运行 `pnpm exec playwright test order-ownership.spec.ts session-scope.spec.ts`。同时核定 private,no-store、无同源作用域污染和正常导航。提交 `feat: render and isolate authenticated order reads`。

## Task D2 · 订单取消与冲突体验

**文件** `src/features/orders/server.ts`、`src/server/{orders,adapters/demo/orders}.server.ts`、`src/app/api/v1/orders/[orderId]/cancel/route.ts`、`src/features/orders/ui/cancel-order-form.tsx`、`test/integration/demo-cancel.test.ts`、`test/e2e/order-cancel.spec.ts`、OpenAPI。

**消费** D1 详情和 version，A4 request boundary。**产出** `cancelOrder(actor,id,{reason,expectedVersion}): Promise<void>` 与 204/409 端点。

- [ ] 测试 SHIPPED 和已取消 → 409，A/B → 404，两个并发相同 version 仅一个取消成功，库存仅释放一次。确认 origin 缺失和 forged role 无副作用，`pnpm exec vitest run test/integration/demo-cancel.test.ts` 先红。
- [ ] 同一 SQLite immediate transaction 校验 owner、状态、版本之后更新并归还条目数。返回 204 空体。UI 仅 pending，不乐观改业务状态。成功 invalidates 当前 Query、刷新 RSC，冲突重取详情又保留说明。
- [ ] 运行上列单元/集成、`pnpm check` 及 `pnpm exec playwright test order-cancel.spec.ts`，观察版本变化、库存防重复和客户端反馈。提交 `feat: cancel orders with authorization and version checks`。

## Task D3 · 管理页面、Server Action 与缓存协调

**文件** `src/features/book-management/{model,server,client}.ts`、`src/features/book-management/ui/{book-table,book-title-form}.tsx`、`src/server/{book-management,adapters/demo/book-management}.server.ts`、`src/app/[locale]/(admin)/admin/books/{page.tsx,[bookId]/page.tsx,[bookId]/actions.ts}`、`test/integration/demo-management.test.ts`、`test/e2e/book-management.spec.ts`。

**消费** B2 tags，C1 requireViewer/APP_ORIGIN，A3 公用 UI。先安装并锁定 TanStack Table。**产出** `listForAdmin(actor,query)`、`getForAdmin(actor,id)`、`updateTitle(actor,{bookId,title,expectedVersion})`、`saveBookTitle(previousState,formData): Promise<ActionResult>`。

- [ ] 写真实 HTTP/Playwright 用例，预先热身目录页/详情缓存。管理员一次修改 title 成功，第二个相同 version 冲突。普通顾客用捕获的 action 请求提交、以及缺少 Origin 的请求均无写入。验证发布 v1 CAPABILITY_DISABLED。`pnpm exec vitest run test/integration/demo-management.test.ts` 与本阶段管理 E2E 起初红。
- [ ] TanStack Table 的筛选分页由 URL 控制，服务端加载，表单经 action prop。Action 先编译/部署能力再来源和权限，Zod 限 title 1–120、非负 version。转换 FormData 的数字值，限制 16 KiB、丢弃框架字段并拒绝未知业务字段。执行预期 version 的条件更新。
- [ ] 成功提交后执行 `updateTag('catalog:lists')` 与 detail tag。验证服务端两类页面缓存更新，管理表单拿回新 version。事务被拒绝时不驱逐。服务端确认提交成功而失效失败时保留成功语义，记录告警并触发读取重试。
- [ ] 运行两产物 build 与管理 E2E，检查捕获的 action request 在当前 build 有效但被权限/来源守卫拒绝，不能以失效 action id 当证明。提交 `feat: manage book titles through a protected server action`。

## Task D4 · 四条教学路径验收

**文件** `docs/walkthroughs/{03-orders,04-management}.md`、`README.md`、`test/e2e` 中现存测试。

**消费** B4/C5/D1–D3。**产出** 独立完整教学路径以及架构/状态边界的出处。

- [ ] 在 fresh seed、生产 demo 构建上按目录→加购→报价→订单→取消和管理改标题→公开目录更新重放。浏览器两个顾客身份、权限拒绝、导航和 hydration 无错误。
- [ ] 将 Query 与 RSC 更新、Action 与 BFF 路径、私域授权、真实库存异步的差异链接到代码和可重放测试。演示一次并发冲突与手动恢复。
- [ ] 运行 `pnpm check && pnpm test && pnpm build && pnpm build:demo && pnpm test:e2e`，提交 `docs: verify complete teaching journeys`。
