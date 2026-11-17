# ADR 0003 前端模块组合

已采用，2026-11-17。

## 背景

目录的 UI、输入规则和链接一起变化。它们要支撑两条入口和两个数据源，并明确哪些代码可以进浏览器。

## 决策

| 来源                                                                                                                                                      | 本仓采用的规则                                                                         | 代码                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Bulletproof React 项目结构](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)                                         | 按功能共置，依赖从应用组合层指向 feature，再指向 shared；横跨 feature 的组合留在外层。 | [目录 feature](../../src/features/catalog/) · [依赖规则](../../.dependency-cruiser.cjs)                                                                                 |
| [FSD 的 Next.js 指南](https://feature-sliced.design/docs/guides/tech/with-nextjs#server-and-client-public-apis)                                           | `client.ts` 是浏览器可用入口，`server.ts` 是服务端入口，纯模型单列。                   | [客户端入口](../../src/features/catalog/client.ts) · [服务端入口](../../src/features/catalog/server.ts) · [模型](../../src/features/catalog/model.ts)                   |
| [Next.js BFF 指南](https://nextjs.org/docs/app/guides/backend-for-frontend#server-components)                                                             | RSC 在进程内调用读取器；Route Handler 为 HTTP 调用方组合校验、读取与 JSON 响应。       | [列表页](<../../src/app/%5Blocale%5D/(store)/books/page.tsx>) · [列表 HTTP](../../src/app/api/v1/catalog/books/route.ts)                                                |
| [Cockburn 的端口与适配器](https://alistair.cockburn.us/hexagonal-architecture)                                                                            | SQLite 和 Java 各自适配到 `CatalogPort`，在服务端读取器装配。                          | [端口](../../src/features/catalog/server.ts) · [SQLite](../../src/server/adapters/demo/catalog.server.ts) · [Java](../../src/server/adapters/java/catalog-v1.server.ts) |
| [Graça 的 Explicit Architecture](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) | 按业务组织模块，在应用边缘接入 HTTP 和数据适配，模型保留公开查询语义。                 | [查询模型](../../src/features/catalog/model.ts) · [服务端装配](../../src/server/catalog.server.ts)                                                                      |
| [Vercel Shop 搜索页](https://github.com/vercel/shop/blob/main/app/search/page.tsx)                                                                        | 查询状态留在 URL，读取与结果位于 `Suspense` 内。                                       | [目录链接](../../src/features/catalog/ui/links.ts) · [目录页](<../../src/app/%5Blocale%5D/(store)/books/page.tsx>)                                                      |

## 取舍与证据

- 页面与 HTTP 各自校验入口输入，再调用同一个读取器。公开缓存按数据源、语言及查询或 UUID 隔离。返回链接和故障日志处在读取边界外，不进入缓存键。[缓存 ADR](0002-public-reads-and-cache.md) · [读取器](../../src/server/catalog.server.ts)
- 两个 RSC 只在 `connection()` 之后读取单调时钟，为请求失败计时。时间只进入日志，不参与渲染或缓存；React 纯度检查的例外仅限这两处取样。
- 构建会检查浏览器中实际用到的模块。架构检查还覆盖未被浏览器用到的 `client.ts`，例如它经别名和中间模块重导 `server-only` 仍会失败。保持 type-only 例外。模型的全局 `fetch` 在源码范围内由 Lint 拦截，Java 适配器仍可以发 HTTP 请求。[架构反例](../../test/unit/architecture.test.ts)
- 通过生产构建核对真实执行路径：浏览器结果和同源响应的书名一致，同语言的页面与 HTTP 热读复用公开缓存，Java 延迟时静态外壳先到达。[目录旅程](../../test/e2e/catalog-journey.spec.ts) · [HTTP 用例](../../test/e2e/catalog-http.spec.ts)
