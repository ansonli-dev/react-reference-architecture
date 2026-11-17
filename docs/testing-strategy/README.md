# 前端测试体系

测试层级描述用例需要启动哪些模块和运行环境。测试类型描述它要发现哪一类问题。例如筛选功能可以在组件集成层测，跳过导航后的键盘焦点需要在浏览器测，JSON 字段在同源 HTTP 边界测。

## 依据与分层

模板以静态检查为底座，运行时用例分为单元测试、集成测试和浏览器端到端测试。

Martin Fowler 的测试金字塔根据验证范围组织套件。范围较小的测试提供快速反馈，较大的测试验证多个部分一起运行时的行为。Ham Vocke 提倡把能够在较小范围准确复现的问题放到较低层，把浏览器用例留给只有完整运行环境才能验证的行为。本模板用这个原则选择用例粒度。[Martin Fowler · Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html) · [Ham Vocke · The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html#avoid-test-duplication)

集成范围可以窄到一个边界。目录表单与 URL 生成的协作可以挂载真实组件，只替换导航入口。验证异步 Server Components、流式输出和页面导航时，运行 Next.js 的生产构建。[Martin Fowler · Integration Test](https://martinfowler.com/bliki/IntegrationTest.html) · [Next.js · Vitest](https://nextjs.org/docs/app/guides/testing/vitest) · [Next.js · Playwright](https://nextjs.org/docs/app/guides/testing/playwright#running-your-playwright-tests)

| 层级             | 测什么                                                        | 怎么测                                                                                                                           | 本仓库示例                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 静态检查         | 类型、代码规范、模块依赖方向和契约生成一致性。                | 用 TypeScript、Lint、Prettier、依赖检查和代码生成校验，直接检查源码和产物。                                                      | [依赖规则](../../.dependency-cruiser.cjs) · [架构检查](../../scripts/check-boundaries.mjs) · [契约生成](../../scripts/generate-api.mjs)                                  |
| 单元测试         | 单个规则的输入、输出与边界值。                                | 用 Vitest 直接调用函数。用表驱动输入覆盖合法值、默认值、非法值和边界。                                                           | 目录默认页码、重复参数和第 100 页。[目录查询模型](../../test/unit/catalog-query.test.ts)                                                                                 |
| 集成测试         | 少量组件或模块能否协作，包括表单提交、翻译格式化和同源 HTTP。 | 用 Testing Library 挂载真实组件。用真实翻译器处理词典。测 HTTP 时向运行中的 Route Handler 发请求，用固定数据和本地替身控制依赖。 | [筛选表单](../../test/integration/catalog-filters.test.tsx) · [双语词典](../../test/integration/translations.test.ts) · [同源 HTTP](../../test/e2e/catalog-http.spec.ts) |
| 浏览器端到端测试 | 用户能否完成关键任务，包括首屏加载、交互、导航和恢复。        | 用 Playwright 访问生产构建，通过可访问名称定位控件，执行真实浏览器操作，等待页面达到可观察的状态。                               | [目录旅程](../../test/e2e/catalog-journey.spec.ts) · [键盘筛选](../../test/e2e/catalog-keyboard.spec.ts) · [语言与主题](../../test/e2e/shell.spec.ts)                    |

用目录筛选做例子。`page=101` 是否有效，由模型测试验证。填入含空格和 `&` 的关键词后，提交是否生成正确 URL，由组件集成测试确认。按 Tab 跳过页头、进入目录并提交筛选，需要真实浏览器的焦点和导航证据。

Playwright 也提供 HTTP 请求客户端。`catalog-http.spec.ts` 借用同一套生产服务启动配置，通过请求客户端验证 HTTP 集成边界。[同源 HTTP](../../test/e2e/catalog-http.spec.ts)

## 测试类型

| 类型           | 测什么                                                     | 怎么测                                                                                                                                                                                                                                                     |
| -------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 功能与状态     | 正常操作、空结果、输入无效、故障和恢复。                   | 对模型断言返回值，对组件断言输入或提交结果，对页面断言可见反馈和 URL。[目录旅程](../../test/e2e/catalog-journey.spec.ts)                                                                                                                                   |
| HTTP 契约      | 状态码、媒体类型、响应字段和错误形状。                     | 静态检查核对 OpenAPI 生成类型，HTTP 测试请求实际路由并验证代表性 JSON。[BFF 契约](../../contracts/bff/v1.yaml) · [HTTP 用例](../../test/e2e/catalog-http.spec.ts) · [OpenAPI Responses Object](https://spec.openapis.org/oas/v3.1.0#responses-object)      |
| 国际化         | 词典键、动态参数、语言切换和 URL 状态。                    | 在 Vitest 比较嵌套消息键，让真实翻译器格式化页码和库存。在浏览器检查文档语言与切换后的地址。[词典测试](../../test/integration/translations.test.ts) · [语言与主题](../../test/e2e/shell.spec.ts)                                                           |
| 可访问性       | 可访问名称、控件状态、页面语义、颜色对比度和键盘焦点。     | 用键盘验证跳过导航、焦点顺序和提交。用 axe 扫描目录的明暗主题。[键盘用例](../../test/e2e/catalog-keyboard.spec.ts) · [axe 用例](../../test/e2e/catalog-accessibility.spec.ts)                                                                              |
| 视觉与响应式   | 页面布局、主题、样式资源及视口溢出。                       | 固定浏览器、视口和数据比较截图。通过实际 CSS 响应、网格样式和视口边界验证布局。[视觉用例](../../test/visual/storefront.spec.ts) · [样式检查](../../test/visual/catalog-styles.spec.ts) · [Playwright 视觉比较](https://playwright.dev/docs/test-snapshots) |
| 渲染与性能行为 | 加载外壳是否先到达、重复读取是否命中缓存、超时后能否恢复。 | 在可控延迟下读取流式响应，在固定输入下比较底层请求次数，断言超时状态与后续请求结果。[目录旅程](../../test/e2e/catalog-journey.spec.ts) · [HTTP 用例](../../test/e2e/catalog-http.spec.ts)                                                                  |
| 安全边界       | 请求大小、来源检查和错误信息暴露。                         | 直接构造超限请求、不可接受的来源和带敏感信息的内部错误，检查对外响应。[HTTP 边界单测](../../test/unit/api-boundary.test.ts)                                                                                                                                |
| 兼容性         | 目标浏览器和设备上的关键交互。                             | 用 Playwright 项目表达浏览器支持范围，按视口检查布局。模板默认运行 Chromium，视觉测试包含桌面与移动视口。[端到端配置](../../playwright.config.ts) · [视觉配置](../../playwright.visual.config.ts)                                                          |

目录的 axe 用例等待书卡渲染、主题生效和 CSS 过渡完成，再扫描整页的 WCAG 2.1 A/AA 自动规则。Chromium 键盘用例验证筛选后继续 Tab、浏览器 Back 恢复、结果状态节点原位更新，以及相同数量的关键词变化。自动用例不测读屏播报；目前未运行真实读屏评估。桌面与移动视口均用 Chromium，未覆盖 Firefox、WebKit 或实体移动设备。[Playwright 无障碍测试](https://playwright.dev/docs/accessibility-testing#scanning-for-wcag-violations)

## 编写用例

- 准备输入、执行动作、断言可观察结果。优先使用角色、可访问名称和表单标签。组件集成只替换要隔离的依赖，例如筛选表单外部的导航。[Testing Library 查询优先级](https://testing-library.com/docs/queries/about/#priority)
- 给每个用例独立的初始状态。需要模拟慢响应时，在替身设置延迟，用会重试的断言等待页面达到预期状态。[Playwright 测试实践](https://playwright.dev/docs/best-practices)
- 按失败位置定位问题。模型测试定位解析错误，组件测试定位交互，HTTP 测试定位响应形状，浏览器测试定位生产构建中的真实交互。[The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html#avoid-test-duplication)

## 运行入口

安装依赖后，可直接运行静态检查以及 Vitest 的单元与集成测试。只检查筛选表单时，运行 `pnpm test test/integration/catalog-filters.test.tsx`。

```bash
pnpm install --frozen-lockfile
pnpm peers check
pnpm check
pnpm api:check
pnpm test
```

Playwright 使用 `demo` 和 `release` 生产产物，配置会启动隔离的本地实例和固定数据。可用 `pnpm test:e2e catalog-accessibility.spec.ts` 单独运行目录明暗主题的 axe 检查。普通 E2E 的测试产物写入 `test-results/e2e/`，CI 从同一目录归档失败报告。[Playwright 配置](../../playwright.config.ts) · [CI](../../.github/workflows/ci.yml)

```bash
pnpm build
pnpm build:demo
pnpm exec playwright install chromium --only-shell
unset BOOKSTORE_E2E_DEV
pnpm test:e2e
```

视觉回归用固定的 Linux ARM64 镜像比较截图，报告归档到 `test-results/visual-container/`。失败时查看实际截图和差异，预期的布局改动与基线一起评审。[视觉回归入口](../../scripts/test-visual.sh) · [截图基线](../../test/visual/screenshots)

```bash
bash scripts/test-visual.sh
```

真实 Java 使用 [运行手册](../operations/run-and-release.md#真实-java-v1-复验) 中固定版本和独立数据，运行 `pnpm test:e2e:java`。它通过正式构建对照 Java 的 OpenAPI、BFF、RSC 与浏览器结果；故障、超时和日志关联仍在普通 E2E 的替身上注入。容器交付用 `bash scripts/test-release.sh` 在内部 Docker 网络验证参考镜像。

记录受控缓存基线时用 `pnpm test:e2e --project=release -g 'cold BFF result' --reporter=list,json` 并将 `PLAYWRIGHT_JSON_OUTPUT_NAME` 指到单独报告路径。报告附件 `catalog-cache-baseline.json` 标明 Node 版本、冷 BFF、热页面与热 BFF 的实际耗时和上游调用次数。耗时供同环境对照；门禁依据调用次数、流式外壳顺序和超时分类。生产 E2E 测试启动器还把每个服务的 stdout/stderr 复制到临时目录中的独立日志，供请求 ID 和降级事件断言。
