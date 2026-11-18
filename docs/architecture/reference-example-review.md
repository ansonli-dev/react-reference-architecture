# React 架构参考示例评审

书店的参考价值在于展示具体架构问题如何解决，以及哪些条件会改变方案。功能闭环、失败反馈和状态正确性为每个示例提供证据。评审基于 `f2e581d`。

## 现有实现适合展示的案例

### 页面首屏和独立 HTTP 调用共用读取逻辑

目录页在 `Suspense` 内直接调用服务端读取器，慢请求期间先发标题和加载提示。目录 Route Handler 独立处理 HTTP 参数、语言和状态码，复用同一个读取器。现有生产构建用例核对页面和 JSON 的书目，并通过延迟替身验证静态外壳先发出。[目录页](<../../src/app/%5Blocale%5D/(store)/books/page.tsx#L40>) · [目录接口](../../src/app/api/v1/catalog/books/route.ts#L9) · [页面与接口用例](../../test/e2e/catalog-journey.spec.ts#L53) · [流式用例](../../test/e2e/catalog-journey.spec.ts#L279)

数据只用于本站页面渲染时，RSC 进程内读取就足够。有独立 HTTP 调用方，或浏览器要脱离页面导航单独刷新某块数据时，再增加 Route Handler。HTTP 入口带来的收益是独立契约，代价是需要维护输入、响应和错误语义。[Next.js BFF 指南](https://nextjs.org/docs/app/guides/backend-for-frontend#server-components)

### 筛选、表单草稿和交易状态各有归属

已提交的筛选和页码在 URL，直接访问和浏览器后退都能恢复。未提交的输入留在表单。报价确认页的 URL 只持有报价 ID，正文由服务端按当前会话读取。Demo 购物车按浏览器会话保存在 SQLite，Release 购物车按账户保存在 BFF PostgreSQL。报价与订单的权威状态由相应的服务端数据源持有。[筛选表单](../../src/features/catalog/ui/catalog-filters.tsx#L35) · [URL 状态用例](../../test/e2e/catalog-journey.spec.ts#L69) · [报价确认入口](<../../src/app/%5Blocale%5D/(store)/cart/page.tsx#L61>) · [Java 结算 ADR](../adr/0004-java-integrated-checkout.md)

站内表单和短时提交轮询可以就地管理。多个客户端界面若需要共享远端状态并协调刷新，例如跨页购物车数量或持续展示的订单进度，再考虑 TanStack Query 一类的缓存，并处理用户切换后的失效。多个编辑区域确有共享未提交草稿的需求时，再考虑 Context 或 Zustand。示例文档宜按这些需求解释状态归属。[Bulletproof React 状态管理](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md)

### 条件写入和幂等提交处理并发与中断

购物车使用 `ETag` 和条件请求保护条目版本。编辑页遇到 `412` 时重新读取当前数量。下单使用报价 ID 作为稳定的幂等键，并用 `Location` 指向可单独读取的提交状态。Release 中成功以 `PLACED` 且带订单 ID 为准。跨标签首次建立 Demo 会话时，当前串行化依赖浏览器提供 Web Locks，现有用例验证的是 Chromium 环境。[结算请求](../../src/features/checkout/ui/checkout-form.tsx#L69) · [条目接口](../../src/app/api/v1/cart/items/%5BbookId%5D/route.ts#L48) · [跨标签用例](../../test/e2e/bookstore-checkout.spec.ts#L6) · [BFF 契约](../../contracts/bff/v1.yaml#L198)

需要稳定的 HTTP 资源、版本冲突语义或可单独查询的长操作时，Route Handler 适合承载这些约定。只为本站页面处理单次表单写入，又无需独立 HTTP 契约时，Server Action 可以用更少的传输代码完成写入和页面刷新。两种方式都在服务端校验输入与权限。[Next.js 数据变更指南](https://nextjs.org/docs/app/getting-started/mutating-data)

### 同一个目录适配两种数据源，按新鲜度选择缓存

`CatalogPort` 有 SQLite 和 Java HTTP 两个实际实现，目录页面与 BFF 继续使用相同的查询和返回模型。可重复的公开读取才值得复用缓存，缓存收益取决于查询是否集中、业务能否容忍短暂陈旧和写入后是否能失效。Demo 缓存符合条件的公开列表和详情，成交时使库存缓存失效。Release 每次向 Java 读取，以便下一次请求看到库存变化。私有结算 HTTP 响应使用 `no-store`。[目录接口](../../src/features/catalog/server.ts#L4) · [缓存 ADR](../adr/0002-public-reads-and-cache.md) · [Demo 成交后库存用例](../../test/e2e/bookstore-checkout.spec.ts#L211) · [Release 库存用例](../../test/e2e/catalog-http.spec.ts#L154)

仅有一种数据源时，直接读取通常更简单。希望同一应用独立演示并接入真实后端时，适配接口有明确用途。两种模式共用页面和 BFF 资源，仍有业务差异。Demo 按浏览器会话和币种在 SQLite 内同步结算，Release 按账户保存购物车，由 Java Order 处理人民币报价和可能异步的提交。案例旁适合标明其所属模式和依赖。[运行模式](../operations/run-and-release.md) · [Java 购物车适配器](../../src/server/adapters/java/cart.server.ts#L194)

### 业务代码共置，跨功能由页面组合

目录筛选组件、查询规则和链接随同一功能变化，放在 `features/catalog` 中。购物车同时需要书封与结算操作，应用层通过公开入口组合。当前 Next.js 项目用 `client.ts`、`server.ts` 和依赖检查表达运行环境边界。通用重试提示由多处复用，适合放进 `shared`。书封本身仍有书籍语义，适合由目录提供。路由变长时，可以先提取会独立变化的结算请求或业务视图，依赖方向比行数更能决定放置位置。[组合 ADR](../adr/0003-frontend-module-composition.md) · [购物车入口](<../../src/app/%5Blocale%5D/(store)/cart/page.tsx#L8>) · [Bulletproof React 项目结构](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

## 示例的验证范围

- **Demo 可证明单库交易与浏览器流程。** 普通 CI 有 SQLite 交易测试、购物车版本冲突、双语购书以及同一报价幂等重放。模拟的 `202` 用例覆盖浏览器轮询到成功，底层订单由 Demo 同步创建。[Demo HTTP 用例](../../test/e2e/bookstore-checkout-http.spec.ts#L9) · [轮询用例](../../test/e2e/bookstore-checkout.spec.ts#L153) · [SQLite 交易用例](../../test/integration/demo-checkout.test.ts#L85)
- **Release 普通 CI 用目录替身验证发布产物的目录和匿名访问边界。** 现有 `/api/ready` 表示运行配置可解析且目录可读。真实账户登录、邮件、PostgreSQL 草稿与 Java Order 的协作有独立联调用例。运行说明适合就近链接这些用例，记录通过验证的前后端版本和测试数据条件。[CI](../../.github/workflows/ci.yml#L30) · [镜像烟测](../../scripts/test-release.sh#L93) · [真实 Java 用例](../../test/live-java/checkout.spec.ts#L234) · [联调前提](../operations/run-and-release.md#java-集成)
- **两项表述值得收紧。** 组合 ADR 目前写着生产用例验证了页面和 HTTP 的热读缓存复用。现有用例比较书目，带上游调用次数的断言验证的是 Release 每次重新读取 Java。可将 ADR 改为这两项已验证的事实；如果要把 Demo 跨入口命中作为案例证据，需要观测同查询的实际读取次数。首次跨标签加购也应注明 Web Locks 的适用条件。[组合 ADR](../adr/0003-frontend-module-composition.md#取舍与证据) · [Release 读取次数用例](../../test/e2e/catalog-journey.spec.ts#L322) · [本地购书接口说明](architecture-spec.md#本地购书接口)
- **Release 的版本清理值得补一条直接证据。** 报价后同一账户如果修改某个条目，订单成功只应清理仍匹配报价版本的行。Java 适配器已经按版本删除。现有联调覆盖丢响应重试与两账户争购，建议再断言同账户修改后的新行在成功和重放时都保留。[版本清理实现](../../src/server/adapters/java/cart.server.ts#L140) · [Java 结算 ADR](../adr/0004-java-integrated-checkout.md) · [已有联调用例](../../test/live-java/checkout.spec.ts#L444)

## 改进优先级

先在 README 或架构概览提供按问题索引的三条代表性案例。目录首屏与同源 HTTP、筛选和报价的状态归属、购物车并发与提交恢复，都有可引用的实现。每条写明适用条件并就近链接证据。双模式说明和截图也应标注身份、存储、币种与结算方式，便于读者判断自己对应哪种情况。[项目 README](../../README.md) · [架构概览](overview.md) · [运行模式](../operations/run-and-release.md)

同时修复会话过期后无法续单的缺口，修正示例中超出测试证据的表述。结算请求集中和 OpenAPI 接入适合随后作为明确的契约示例。按业务提取视图和故障日志关联可跟随相关案例演进。

## 已记录的工程改进

1. **结算 401 后恢复原报价。** 本地 Demo 生产构建分别模拟提交和轮询返回 `401`，两种情况都丢失了 URL 中的 `quote`，并显示了 `Checkout.notices.signIn`。为重新登录提供双语提示，通过现有回跳机制恢复原报价，并沿用原幂等键查询或继续确认。双语词典对齐测试还需检查业务提示枚举中的每个键。[结算表单](../../src/features/checkout/ui/checkout-form.tsx#L193) · [登录回跳](../../src/app/%5Blocale%5D/checkout-sign-in.tsx#L25) · [词典测试](../../test/integration/translations.test.ts#L13)
2. **让结算请求使用已有的 OpenAPI 客户端。** `CheckoutForm` 现在同时实现 HTTP 请求、响应解析、重试和导航。优先从报价、提交和状态查询抽出 feature 请求声明，用生成类型检查请求契约，用 Zod 校验会影响流程的响应内容。[结算表单](../../src/features/checkout/ui/checkout-form.tsx#L26) · [类型客户端](../../src/shared/api/client.ts#L1)
3. **补异步结算失败与恢复的 CI 证据。** 普通 CI 的 Demo 用例将已落单的响应改成 `202`，覆盖轮询成功。独立 Java 联调已覆盖响应丢失后重试。优先补普通 CI 的会话过期、轮询未收敛或响应丢失等可控场景，并用独立联调验证实际依赖协作。[Demo 浏览器用例](../../test/e2e/bookstore-checkout.spec.ts#L153) · [Java 联调](../../test/live-java/checkout.spec.ts#L444) · [CI](../../.github/workflows/ci.yml#L30)
4. **按职责拆购物车和订单视图。** 购物车路由文件同时承载数据读取、币种分组展示和报价确认。把能独立描述、一起变化的结算视图作为提取候选，按需在应用层组合书封等目录能力。通用 `CatalogNotice` 可移到 `shared/ui`，由调用方传入文案与操作。[购物车页](<../../src/app/%5Blocale%5D/(store)/cart/page.tsx#L143>) · [订单页](<../../src/app/%5Blocale%5D/(store)/orders/page.tsx#L50>) · [提示组件](../../src/features/catalog/ui/catalog-notice.tsx#L1)
5. **用 `requestId` 关联结算故障。** 目录已有 5xx 结构化日志。可将结算操作名、错误码、耗时和响应中的 `requestId` 一起写入日志，以便定位报价、提交和轮询失败。[结算错误处理](../../src/server/http/checkout.server.ts#L11) · [目录日志](../../src/server/observability/catalog.server.ts#L10)

基线的静态检查、OpenAPI 生成检查、116 个单元与集成测试、两种生产构建、4 个现有 Demo 结算用例均通过。两种 `401` 情况已通过本地模拟响应复现。基线核验未运行连接真实 Java／Keycloak 的联调。
