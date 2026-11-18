# 前端架构规范

目录筛选和交易结算各有自己的业务规则。路由可以同时使用两者，服务端适配器可以替换数据源。以下约束规定了代码可以依赖谁、数据可以跨过哪些边界，以及如何核对一项修改。[页面组合示例](overview.md#业务模块与页面组合)

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

即使目前只有服务端页面使用某个 `client.ts`，它的导出也必须能在浏览器使用。检查器从各 feature 的 `client.ts` 和带 `'use client'` 的模块出发，沿运行时导入追踪到最终依赖，跳过纯类型导入。动态导入使用字符串字面量，使路径可解析。[依赖配置](../../.dependency-cruiser.cjs) · [架构检查脚本](../../scripts/check-boundaries.mjs)

模型经由工具函数间接导入 React、Node 内置模块或服务端实现，同样会触发检查。ESLint 另查 `model.ts` 和 `model/` 中对全局 `fetch` 的静态引用。判断一段逻辑是否依赖请求上下文或有其他副作用，仍需要阅读实现。[依赖规则反例](../../test/unit/architecture.test.ts)

## 渲染与状态

- 页面在服务端读取数据并组织视图。浏览器事件和短时交互状态由相应的客户端组件处理。跨到客户端的属性必须可序列化，且只包含当前用户有权查看的界面数据。会话令牌、数据库连接及读写实现留在服务端。
- 需要分享、刷新或后退恢复的查询条件放在 URL。可从现有数据推导的值随渲染计算，尚未提交的输入留在表单或组件内。
- 请求级数据保留在本次请求的上下文中。公共读缓存只接受公开数据，按结果变化的维度隔离键。页面和 BFF 共用目录读取器。[公开读取与缓存 ADR](../adr/0002-public-reads-and-cache.md)

## 同源接口与异常反馈

- 页面和 Route Handler 分别读取入口参数，复用模型的校验。目录模型对 `category`、`q`、`page` 与书籍 UUID 执行运行时校验。[目录模型](../../src/features/catalog/model.ts)
- BFF 的 OpenAPI 定义 HTTP 接口与响应形状。修改契约后运行 `pnpm api:generate` 更新类型，并以 `pnpm api:check` 核对生成结果。服务端仍需校验请求，浏览器也需校验决定下一步操作的结算响应。[BFF 契约](../../contracts/bff/v1.yaml) · [结算响应的运行时校验](checkout-contract.md#类型正确的请求也可能收到无效响应)
- 购物车、报价、提交与订单按当前会话读取，私有 HTTP 响应使用 `Cache-Control: no-store`。[响应头断言](../../test/e2e/bookstore-checkout-http.spec.ts#L69) · [交易资源隔离用例](../../test/e2e/bookstore-checkout-http.spec.ts#L129)
- 书店的 `/api/v1` 业务接口以 `{ error: { code, requestId } }` 表示业务失败，页面按语言呈现缺失、输入无效或重试提示。未知书籍在 BFF 返回 `404 BOOK_NOT_FOUND`，页面由 `notFound()` 选择缺失视图。流式页面已发送响应头时，页面请求仍可能是 HTTP 200。[错误码](../../src/shared/api/error.ts) · [HTTP 响应](../../src/server/http/response.server.ts) · [详情缺失页](<../../src/app/%5Blocale%5D/(store)/books/%5BbookId%5D/not-found.tsx>)

### 本地购书接口

演示购物车由浏览器会话区分。两个新标签页同时首次加购时，浏览器若支持 Web Locks，会把两次加购串行执行，让第二次请求能带上第一次响应设置的会话 Cookie。没有 Web Locks 时直接发起加购。首次跨标签加购用例在 Chromium 中验证。[加购实现](../../src/features/checkout/ui/checkout-form.tsx) · [首次跨标签加购用例](../../test/e2e/bookstore-checkout.spec.ts#L6)

加购表达的是「再加一本」。客户端读取当前数量后，使用 `If-Match` 更新已有条目，用 `If-None-Match: *` 创建新条目，遇到 `412` 可重新读取并有限重试。购物车的编辑和删除针对读者看到的具体版本，遇到 `412` 则回到购物车显示最新数量，由读者决定下一次修改。[旧标签页编辑用例](../../test/e2e/bookstore-checkout.spec.ts#L62)

演示下单时，SQLite 在同一事务内创建提交、订单和明细，扣减库存并清理该币种的购物车。首次提交同步完成并返回 `201`，幂等重放返回 `200`。响应的 `Location` 指向同一个提交资源。[交易接口用例](../../test/e2e/bookstore-checkout-http.spec.ts)

### 发布模式购书接口

浏览器沿用同源 `/api/v1` 接口。购物车按登录账户隔离，条件写入使用条目版本。页面用当前价格和库存展示估算，确认与提交以服务端保存的报价为准。

已受理的提交可能返回 `202`。浏览器依据提交状态决定继续查询、等待核对或显示订单。订单列表使用已保存的明细快照和创建时间，取消可通过 `/api/v1/orders/{orderId}/cancellation` 读取或提交。[提交结果与恢复](checkout-contract.md) · [BFF 契约](../../contracts/bff/v1.yaml) · [结算适配决策](../adr/0004-java-integrated-checkout.md)

## 国际化、主题与可访问性

- 页面使用 URL 的 locale 选择翻译，词典以相同的命名空间和键组织。共享控件通过属性接收文案。语言切换保留路由后缀和查询条件。[语言切换](../../src/app/%5Blocale%5D/language-switch.tsx)
- 组件使用背景、前景、边框和焦点等语义色。主题通过 CSS 变量统一切换，主题开关在服务端和首次 hydration 使用相同的默认值，再读取浏览器保存的偏好。[主题开关](../../src/shared/ui/theme-switch.tsx) · [语义色](../../src/app/globals.css)
- 导航使用链接，操作使用按钮和表单。图标按钮提供可访问名称，主题切换按钮暴露 `aria-pressed`，输入关联 `label`，键盘焦点可见。筛选改变结果时，状态摘要包含当前条件，使匹配数量相同的两次查询也可区分。[键盘导航与状态反馈](catalog-navigation.md#结果更新后键盘用户在哪里)

## 约束验证

`pnpm check` 检查类型、Lint、格式和真实源码的依赖方向。新增模块边界时，用小型反例验证规则能拦住越界导入。调整查询规则、适配器或用户操作时，分别验证模型行为、字段映射与页面或 HTTP 上可见的结果。改变模块依赖方向或数据权威来源时，在 ADR 中记录理由。[前端测试体系](../testing-strategy/README.md) · [架构决策索引](../adr/README.md)

### 可视化回归

布局或主题有意改变时，在固定平台上重新比较并评审受影响的基线。对已有预览可单独验证样式和横向溢出。[视觉回归的覆盖与命令](../testing-strategy/README.md#视觉回归)
