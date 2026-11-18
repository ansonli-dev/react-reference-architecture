# React 架构参考示例改进计划

此处保留实施前的任务清单。对应改动已在 [PR #10](https://github.com/ansonli-dev/react-reference-architecture/pull/10) 合入，当前的章节组织见[架构导读](../../../README.md#架构导读)。

让读者能按架构问题找到「页间书店」中的实现，从适用条件判断何时采用同样的方案。每个案例简明说明问题、实现、方案取舍和验证证据。功能验收聚焦目录与结算已有链路。评审基线为 `f2e581d`。[改进规格](../specs/2026-11-18-reference-example-improvements-design.md) · [评审依据](../../architecture/reference-example-review.md)

采用现有 Next.js App Router、OpenAPI、Zod、Vitest 和 Playwright。路由在应用层组合 feature，服务端秘密和会话处在 `server-only` 依赖链。以 Superpowers 分任务验证规格和代码质量，最终分支还有独立评审。

## P0 先补齐代表性示例和结算恢复

### Task 1 按架构问题提供案例入口

- [ ] 在根 README 首页列出三组案例，每组链接架构概览中对应的简短说明、实际代码和现有测试。
  - **首屏读取与独立 HTTP 调用。** 页面用 RSC 直接读取目录，Route Handler 为独立 HTTP 调用方返回 JSON。两者共用读取器。用页面与 JSON 书目一致、延迟时先发送页面外壳的用例说明效果。
  - **URL、表单和服务端状态。** 已提交筛选放 URL，表单持有未提交的输入，报价 URL 持有 ID，购物车与报价由当前会话对应的服务端持有。只有多个客户端视图需要共享远端数据并协调刷新时，再评估客户端查询缓存。
  - **并发写入与异步结算。** 普通站内表单写入可考虑 Server Action。需要版本冲突、稳定幂等键或独立查询状态时，以现有 BFF 说明 `ETag`、`412`、`Location` 和 `202` 各解决什么问题。
- [ ] 补齐概览中的交易状态归属，链接双数据源与公开缓存、跨 feature 组合两个已有案例。README 的运行模式和截图标明所属模式，并概括浏览器会话与账户、SQLite 同步事务与 Java 异步提交、演示按币种与 Release 人民币报价的差异。
- [ ] 校正文档证据。组合 ADR 写明页面与 JSON 结果一致、Release 每次读取 Java、Demo 成交后详情库存更新。将 Demo 跨入口缓存复用标为实现策略。架构规范注明首次跨标签加购的串行化依赖 Web Locks，现有浏览器证据来自 Chromium。发布手册和测试说明标明 `/api/ready` 及目录替身的验证范围，链接独立的 Java／Keycloak 联调。

**验收**　从 README 可直接找到三组问题与做法，每组都能追溯到代码和测试。Demo、Release 目录替身与真实联调的证据范围在相关说明旁可查。缓存复用若将来写成实测结论，需有同语言、同查询跨两个入口的底层读取次数证据。[项目 README](../../../README.md) · [架构概览](../../architecture/overview.md) · [架构规范](../../architecture/architecture-spec.md) · [组合 ADR](../../adr/0003-frontend-module-composition.md) · [运行手册](../../operations/run-and-release.md) · [测试说明](../../testing-strategy/README.md)

### Task 2 修复结算收到 401 后无法回到原报价

- [ ] 在 `test/e2e/bookstore-checkout.spec.ts` 先增加两条回归，分别模拟提交 POST、轮询 GET 返回 `401`，断言原报价留在 URL 且页面显示双语提示。先在基线生产构建观察断言失败。
- [ ] 在 `CheckoutForm` 的提交失败分支为 `signIn` 保存原报价。在 Release 的购物车页处理 `notice=signIn`，复用明确的登录入口和同站 `returnTo`。回跳去掉提示参数、保留原报价 ID，由 RSC 按当前会话读取报价。继续确认沿用原幂等键，只有提交返回 `QUOTE_EXPIRED` 才提示重新报价。
- [ ] 在 `messages/en.json` 和 `messages/zh-CN.json` 添加登录续单文案。用 `test/integration/translations.test.ts` 验证 `checkoutNoticeSchema` 的可渲染键在两份词典里都有对应文案。重新构建后执行两条浏览器回归和翻译测试。

**验收**　两种 `401` 分支都保住同一个报价 ID。相同账户重新登录后，仍有效的报价可继续确认。重复提交沿用原幂等键，订单和库存扣减各发生一次。[结算表单](../../../src/features/checkout/ui/checkout-form.tsx) · [购物车页](<../../../src/app/%5Blocale%5D/(store)/cart/page.tsx>) · [登录回跳](../../../src/app/%5Blocale%5D/checkout-sign-in.tsx) · [翻译测试](../../../test/integration/translations.test.ts)

## P1 补齐结算示例的验证证据

### Task 3 验证异步处理、丢响应和版本清理

- [ ] 扩充 `test/e2e/bookstore-checkout.spec.ts`。持续 `PROCESSING` 用例验证轮询耗尽后提示处理中并保留报价，初始 `RECONCILE_REQUIRED` 用例验证提示待核对、保留报价且自动轮询次数为零。两个场景手动继续时都沿用原幂等键。丢响应场景让 Demo 真实落单，再丢弃浏览器响应，重试核对订单 ID、库存和幂等键。复用普通 CI 与 SQLite 种子。在 `test/integration/demo-checkout.test.ts` 复用隔离数据库内的报价过期设置，验证已受理提交在报价到期后仍可重放。
- [ ] 在 `test/live-java/checkout.spec.ts` 用可控的操作 401 验证真实登录回跳。确认同一个 BFF 会话能读购物车和报价，仍有明确登录动作。核对实际进入 Keycloak、回到同一报价、由用户手动提交并复用原幂等键。第一次向真实 Java 发出提交时，核对浏览器收到的 BFF 202 与 `PROCESSING`、准确的 `Location` 和对该地址的查询。
- [ ] 在 `test/live-java/checkout.spec.ts` 增加同账户的版本清理用例。报价包含两行，在报价后修改其中一行。原报价提交成功后，未修改的行被清理，修改过的行及其新版本保留。用同一幂等键重放，确认新行仍在且订单只有一笔。
- [ ] 在已有联调环境执行 Release 用例时，记录实际通过的前后端提交、种子条件与联调结果。环境缺失时，在案例证据中标记待联调。

**验收**　普通 CI 有处理中与失败恢复的可观察断言。跨服务交易的验证单独覆盖同一报价重试、版本清理和真实登录恢复。[Demo 浏览器用例](../../../test/e2e/bookstore-checkout.spec.ts) · [Java 联调用例](../../../test/live-java/checkout.spec.ts) · [Java 版本清理实现](../../../src/server/adapters/java/cart.server.ts#L140)

## P2 用现有工具收敛实现

### Task 4 让结算请求体现 OpenAPI 契约

- [ ] 在新增的 `src/features/checkout/api.ts` 声明 `createQuote`、`submitQuote` 和 `getSubmission`，接入已有的 `shared/api/client.ts`。保留每次请求 8 秒的期限与 `no-store`。校验 OpenAPI 客户端已解析的 `data` 或 `error`，从原 `Response` 读取 `Location`。现有 `submitOrder` 调用提交和查询请求，负责何时轮询及停止。表单处理用户操作、反馈和导航。
- [ ] 用可控浏览器响应核对错误的 `Location`、格式不正确的 JSON、响应的提交 ID 与路径 ID 不一致。无效响应显示可恢复的错误，避免把错误提交认成订单。任务 2 与 3 的 401、202 和原幂等键回归验证迁移前后的行为。

**验收**　生成类型约束请求路径、参数和请求体。用例检查 `Location`、稳定幂等键和现有的恢复行为，并验证提交响应超时时保留原报价。购物车的 `ETag` 条件写入与 `412` 回归通过。[类型客户端](../../../src/shared/api/client.ts) · [BFF 契约](../../../contracts/bff/v1.yaml)

### Task 5 按业务职责提取结算视图

- [ ] 优先评估报价确认、币种购物车和订单列表。将能独立变化的服务端视图放到结算 feature，从 `features/checkout/server.ts` 导出。路由负责参数、服务端读取与跨 feature 组合，由应用传入书封与格式化价格需要的能力。通用的金额格式化可以放在 shared。已被目录和结算共用的 `CatalogNotice` 迁入 `shared/ui`，文案和动作由调用方传入。

**验收**　改动对应明确的业务职责。页面仍能验证加购、编辑、报价、下单与订单记录。公开入口约束和服务端依赖检查通过。[购物车页](<../../../src/app/%5Blocale%5D/(store)/cart/page.tsx>) · [订单页](<../../../src/app/%5Blocale%5D/(store)/orders/page.tsx>) · [依赖规则](../../architecture/architecture-spec.md#公开入口与依赖方向)

### Task 6 让结算故障可通过 requestId 关联

- [ ] 在创建或读取报价、提交、轮询发生 5xx 时，沿用目录的结构化日志做法。结算的 HTTP 错误响应和服务端日志使用同一个 `requestId`，记录固定操作名、HTTP 状态、错误码和耗时。结算请求层保留该 ID，供错误反馈和排查关联。

**验收**　可控的上游失败用例能从错误响应的 `requestId` 查到对应日志。用户仍能看到与故障类型匹配的恢复动作。[结算错误处理](../../../src/server/http/checkout.server.ts) · [目录日志](../../../src/server/observability/catalog.server.ts)

## 交付顺序与验证

任务 1 和 2 可并行。任务 2 是把登录中断恢复列为已验证示例的前提，任务 3 在此基础上提升异步交易的证据强度。任务 4 在恢复用例通过后开展。任务 5、6 可独立评审。

文档改动核对链接与 `pnpm check`。功能分支最终验收从干净的候选提交运行 `pnpm peers check`、`pnpm check`、`pnpm api:check`、`pnpm test`、`pnpm build`、`pnpm build:demo`、全量 `pnpm test:e2e`、`bash scripts/test-visual.sh`、`bash scripts/test-release.sh` 和 `pnpm test:e2e:java`。Java 用例使用隔离种子以及实际 Keycloak、PostgreSQL 和 Java Order，记录与前端候选提交对应的结果。

提交供全分支对抗性评审。推送后核对当前 PR 提交的普通检查、视觉与镜像烟测均通过，再按已审核的 head 合入 `main`，核对 GitHub 合并提交和更新后的远端 `main`。
