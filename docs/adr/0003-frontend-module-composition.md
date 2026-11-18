# ADR 0003 前端模块组合

已采用，2026-11-17。

## 背景

目录的筛选表单、查询规则和链接往往一起修改。购物车也要显示目录的书封，却有自己的数量、金额和报价规则。若结算组件直接导入目录内部实现，两组业务就需要同时理解对方的目录布局。服务端凭据与浏览器交互又有不同的运行条件。

## 决策

**按业务共置，在页面组合。** `features/catalog` 持有书封，`features/checkout` 持有购物车视图。购物车页给 `CurrencyCart` 传入画书封的函数。这样，修改书封只涉及目录模块，调整购物车金额或操作只涉及结算模块。两个 feature 共享的基础 UI 归 `shared`。[购物车页](<../../src/app/%5Blocale%5D/(store)/cart/page.tsx>) · [书封组合](<../../src/app/%5Blocale%5D/(store)/book-thumbnail.tsx>) · [Bulletproof React 项目结构](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)

**按执行环境设计公开入口。** `client.ts` 只导出浏览器可依赖的代码，服务端页面也可以使用这些组件。`'use client'` 放在需要浏览器交互的模块中。`server.ts` 导出服务端能力，`model.ts` 提供纯类型、校验和规则。应用与服务端装配层通过这三个入口消费 feature。[目录公开入口](../../src/features/catalog/client.ts) · [筛选表单](../../src/features/catalog/ui/catalog-filters.tsx) · [依赖规则](../../.dependency-cruiser.cjs) · [FSD 的 Next.js 公开入口](https://feature-sliced.design/docs/guides/tech/with-nextjs#server-and-client-public-apis)

**把 I/O 留给入口和适配器。** 目录模型定义查询语义，`CatalogPort` 描述列表、详情与分类的读取能力。服务端装配演示和发布适配器，目录模块、页面和接口均可使用相同的查询语义。[目录端口](../../src/features/catalog/server.ts) · [目录读取器](../../src/server/catalog.server.ts) · [Cockburn 的端口与适配器](https://alistair.cockburn.us/hexagonal-architecture) · [Graça 的 Explicit Architecture](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/)

在这个边界上，目录页和 HTTP 入口分别解析输入，然后共用读取器。目录页把已提交的筛选放在 URL 中，在 `Suspense` 内请求数据。[列表页](<../../src/app/%5Blocale%5D/(store)/books/page.tsx>) · [Next.js BFF 指南](https://nextjs.org/docs/app/guides/backend-for-frontend#server-components) · [Vercel Shop 搜索页](https://github.com/vercel/shop/blob/main/app/search/page.tsx)

## 取舍与证据

装配层需要明确传入跨功能视图，并维护各模块的公开入口。作为回报，架构检查可以直接定位越界依赖。测试覆盖跨 feature 导入、绕过公开入口、经别名间接导入 `server-only` 以及纯模型经辅助模块引入 React 等反例，也允许仅类型导入。ESLint 单独检查纯模型中对全局 `fetch` 的引用。[架构反例测试](../../test/unit/architecture.test.ts)

目录列表页和详情页在 `connection()` 后为失败日志采样单调时钟，React 纯度检查的例外限于这两处。计时值只参与日志，公开读取缓存的键由数据集、语言及查询或书籍 ID 决定。流式用例检查慢请求下页面外壳先到，读取策略和库存变化的证据见缓存决策。[流式外壳用例](../../test/e2e/catalog-journey.spec.ts#L279) · [缓存取舍与证据](0002-public-reads-and-cache.md#取舍)
