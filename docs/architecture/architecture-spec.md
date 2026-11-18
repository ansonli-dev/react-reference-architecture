# 前端架构规范

## 目录与职责

| 位置                      | 放在这里的代码                                                            | 仓库示例                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/`                | 页面、布局、加载和错误边界、同源 HTTP 路由。解析入口参数，组合调用和 UI。 | [目录页](<../../src/app/%5Blocale%5D/(store)/books/page.tsx>) · [目录 Route Handler](../../src/app/api/v1/catalog/books/route.ts) |
| `src/features/<feature>/` | 功能自己的模型、UI 和公开入口。只在有实际职责时添加内部目录。             | [目录模块](../../src/features/catalog/)                                                                                           |
| `src/server/`             | 数据读取、服务端缓存、运行配置和服务端装配。                              | [目录读取器](../../src/server/catalog.server.ts)                                                                                  |
| `src/shared/`             | 独立于业务和路由的基础组件、样式工具与公共传输类型。                      | [基础组件](../../src/shared/ui/) · [BFF 传输类型](../../src/shared/api/generated/bff.ts)                                          |
| `src/i18n/`、`messages/`  | 语言路由、请求语言和翻译资源。                                            | [语言路由](../../src/i18n/routing.ts) · [中文词典](../../messages/zh-CN.json) · [英文词典](../../messages/en.json)                |

## 公开入口与依赖方向

`app` 和 `server` 通过 feature 的公开入口使用它提供的能力。`client.ts` 导出可在浏览器依赖链中使用的组件及工具，`server.ts` 导出仅供服务端使用的接口，`model.ts` 导出纯类型、校验与规则。`client.ts` 的名字表示导出边界。具体交互模块以 `'use client'` 声明浏览器入口。[目录 client.ts](../../src/features/catalog/client.ts) · [目录 server.ts](../../src/features/catalog/server.ts) · [目录 model.ts](../../src/features/catalog/model.ts)

| 约束                                                                                               | 检查规则                                                 |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `app` 和 `server` 通过公开入口组合 feature。`ui/` 等内部实现由所属模块持有。                       | `feature-public-entries`                                 |
| feature 在仓库内依赖本模块及 `shared`，跨功能组合留在装配层。                                      | `no-cross-feature`、`features-do-not-import-composition` |
| `shared` 独立于 `app`、`features`、`server`、`i18n` 和 `mocks`。                                   | `shared-is-independent`                                  |
| feature 模型保持纯逻辑。框架、界面、HTTP 和服务端 I/O 各自由对应入口处理。                         | `pure-model`、ESLint `no-restricted-globals`             |
| 服务端读取与配置通过 `import 'server-only'` 标记。浏览器入口及其运行时依赖只访问客户端可用的模块。 | `no-client-to-server`、Next.js 构建                      |

用可静态解析的字符串字面量编写 `import()` 路径。客户端和模型的约束沿运行时依赖检查，别名导入和间接依赖同样受约束。[依赖配置](../../.dependency-cruiser.cjs) · [架构检查脚本](../../scripts/check-boundaries.mjs)

`client.ts` 即使只从 RSC 使用，也和带 `'use client'` 的模块一样是检查起点。传递依赖检查排除纯类型边。模型的依赖图会拒绝已标记的服务端模块、Node 内置模块以及规则列出的前端框架和 HTTP 客户端。全局 `fetch`（含 `globalThis.fetch`）的 Lint 限制覆盖 `model.ts` 和 `model/` 下源码中的直接调用等静态引用；对绕过静态引用的运行时 I/O 仍需评审。[组合方式 ADR](../adr/0003-frontend-module-composition.md)

## 渲染与状态

- 页面在服务端读取数据并组织视图。将事件处理、浏览器 API 和交互状态放在所需的最小客户端边界内。传入客户端组件的属性应可序列化，且仅限界面所需的公开值。
- 需要分享、刷新或后退恢复的查询条件放在 URL。可从现有数据推导的值随渲染计算，尚未提交的输入留在表单或组件内。
- 请求级数据保留在本次请求的上下文中。公共读缓存只接受公开数据，按结果变化的维度隔离键。页面和 BFF 共用目录读取器。[公开读取与缓存 ADR](../adr/0002-public-reads-and-cache.md)

## 同源接口与异常反馈

- 页面和 Route Handler 分别读取入口参数，复用模型的校验。目录模型对 `category`、`q`、`page` 与书籍 UUID 执行运行时校验。[目录模型](../../src/features/catalog/model.ts)
- BFF 的 OpenAPI 定义客户端可用的 HTTP 接口与响应形状。生成类型用于静态检查，运行时输入由服务端校验。`pnpm api:check` 核对契约和生成类型的一致性。[BFF 契约](../../contracts/bff/v1.yaml)
- HTTP 入口以 `{ error: { code, requestId } }` 表示失败，页面按语言呈现缺失、输入无效或重试提示。未知书籍在 BFF 返回 `404 BOOK_NOT_FOUND`，页面由 `notFound()` 选择缺失视图。流式页面已发送响应头时，页面请求仍可能是 HTTP 200。[错误码](../../src/shared/api/error.ts) · [HTTP 响应](../../src/server/http/response.server.ts) · [详情缺失页](<../../src/app/%5Blocale%5D/(store)/books/%5BbookId%5D/not-found.tsx>)

### 本地购书接口

演示的 BFF 用 `GET /api/v1/cart`、`PUT /api/v1/cart/items/{bookId}` 和 `DELETE /api/v1/cart/items/{bookId}` 管理购物车。加购先读取条目，再用 `If-Match` 设置下一数量，首次创建使用 `If-None-Match: *`。同一浏览器的标签页依次加购，以便共用首次加购建立的会话。购物车按页面读取到的条目版本更新和删除，版本变化时返回 `412`，页面提示核对最新数量。页面用 `POST /api/v1/order-quotes` 创建报价，客户端可读取 `Location` 指向的快照。确认页从 URL 恢复同一个报价。演示前端以报价 ID 作为稳定的幂等键。

SQLite 在同一事务内创建下单提交、订单和明细，扣减库存并清理该币种的购物车。首次提交同步完成并返回 `201`，重放返回 `200`。响应提供下单提交的 `Location`。订单集合和单笔订单可通过 `GET /api/v1/orders` 与 `GET /api/v1/orders/{orderId}` 读取。[BFF OpenAPI 契约](../../contracts/bff/v1.yaml)

### Java 集成购书接口

浏览器调用同源 `/api/v1` 接口。发布模式下，BFF 在 PostgreSQL 中按认证主体保存购物车草稿，使用条目版本执行条件写入，并以 Catalog 的实时价格、库存呈现估算。报价由 Order 创建和存储，确认页随 URL 恢复同一报价。提交返回指向同源提交资源的 `Location`。处理中返回 `202`，以 `PLACED` 且有订单 ID 的快照作为成功依据。拒绝、处理中和待核对分别显示反馈。可用同一报价和幂等键重查提交。订单集合使用 Java 保存的明细快照和创建时间，取消记录可从 `/api/v1/orders/{orderId}/cancellation` 读取或提交。[BFF OpenAPI 契约](../../contracts/bff/v1.yaml) · [Java v1 契约](../../contracts/java/README.md)

## 国际化、主题与可访问性

- 页面使用 URL 的 locale 选择翻译，词典以相同的命名空间和键组织。共享控件通过属性接收文案。语言切换保留路由后缀和查询条件。[语言切换](../../src/app/%5Blocale%5D/language-switch.tsx)
- 组件使用背景、前景、边框和焦点等语义色。主题通过 CSS 变量统一切换，主题开关在服务端和首次 hydration 使用相同的默认值，再读取浏览器保存的偏好。[主题开关](../../src/shared/ui/theme-switch.tsx) · [语义色](../../src/app/globals.css)
- 导航使用链接，操作使用按钮和表单。图标按钮提供可访问名称，开关暴露 `aria-pressed`，输入关联 `label`，键盘焦点可见。[共享按钮](../../src/shared/ui/button.tsx) · [筛选表单](../../src/features/catalog/ui/catalog-filters.tsx)

## 约束验证

`pnpm check` 包含类型、Lint、格式和架构检查。架构测试覆盖跨 feature 导入、绕过公开入口和客户端间接引入服务端模块等反例。生产构建与页面 E2E 覆盖一次导航中服务端 HTML、客户端筛选、语言切换和缺失页反馈。[架构约束测试](../../test/unit/architecture.test.ts) · [目录页面 E2E](../../test/e2e/catalog-journey.spec.ts)

新增功能时，先在 `src/features/<feature>/model.ts` 放置模型和校验，按实际使用需求设立 `client.ts`、`server.ts` 入口，再从 `src/app/` 或 `src/server/` 组合。修改 BFF 契约时，更新 [OpenAPI 定义](../../contracts/bff/v1.yaml)，运行 `pnpm api:generate` 并一起提交 [生成类型](../../src/shared/api/generated/)。用模型单测验证输入规则、适配器集成测试验证数据映射、生产 HTTP 或浏览器用例验证公开行为。切换运行环境或改变依赖边界时记录 ADR。

### 可视化回归

视觉 CI 用固定版本的 Linux ARM64 Playwright 镜像和 demo 种子比较截图。基线覆盖桌面与移动目录、深色详情、购物车和订单页。预期的页面变更应和基线一起评审。截图不一致时，CI 保留基线、实际截图和差异图。

```bash
bash scripts/test-visual.sh
bash scripts/test-visual.sh --update-snapshots
```

更新命令将新截图复制到 [test/visual/screenshots](../../test/visual/screenshots)，供评审与代码一起查看。同一命令的运行结果保存在 `test-results/visual-container/`。

已经启动的预览可以用下面的命令检查。它直接访问实际地址，在桌面和移动视口检查 CSS 请求、书卡布局、导航可见性和横向溢出。运行前用 `pnpm exec playwright install chromium --only-shell` 安装 Chromium。

```bash
BOOKSTORE_VISUAL_URL=http://127.0.0.1:3000 pnpm test:e2e:visual
```
