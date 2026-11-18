# 前端测试体系

目录页和同源 API 应当给出一致的书目，筛选条件应当经得起刷新和后退，同一笔结算在重试时应当只扣一次库存。这些承诺涉及不同的边界。书店用模型和组件测试定位输入与交互问题，用生产构建验证页面和 HTTP 行为，用独立联调核对账户与交易的最终结果。

## 业务模块的依赖方向

购物车页可以在应用层组合目录的书封与结算的视图，两个 feature 之间直接导入则会让它们一起变化。`pnpm check` 对真实源码检查公开入口和依赖方向。另有一组很小的反例专门测试规则本身，覆盖跨 feature 导入、绕过公开入口，以及客户端经中间模块引入服务端代码。纯类型导入也有单独的正例。[架构规范](../architecture/architecture-spec.md#公开入口与依赖方向) · [规则与反例](../../test/unit/architecture.test.ts)

## 同一个筛选条件经过哪些边界

| 问题                     | 怎样观察结果                                                                                                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 查询规则是否正确？       | 直接调用目录模型，验证缺省页码为 1，第 100 页有效，第 101 页和重复页码会被拒绝。[查询模型测试](../../test/unit/catalog-query.test.ts)                                                       |
| 浏览器何时改变 URL？     | 挂载真实筛选表单，只替换路由的 `push`。编辑关键词时导航调用数为零，点击提交后才得到正确编码的 URL，并回到第一页。[组件集成测试](../../test/integration/catalog-filters.test.tsx)            |
| 用户能否恢复相同的目录？ | 在生产构建中直接打开筛选地址、翻页并后退，检查地址、表单和结果。另用同一组筛选条件请求页面与 JSON 接口，比较书名。[目录导航与接口一致性](../../test/e2e/catalog-journey.spec.ts)            |
| 较慢的读取是否阻塞首屏？ | 给发布模式的目录替身设置延迟，逐块读取真实 HTML 响应。先到的内容含标题和加载提示，随后才出现目标书名。这里验证的是响应交付顺序。[流式响应用例](../../test/e2e/catalog-journey.spec.ts#L279) |

键盘用例在 Chromium 中检查跳过导航、表单提交和结果区更新。axe 扫描明暗两种主题下的目录，覆盖 WCAG 2.1 A/AA 的自动规则。读屏软件的实际播报仍需人工评估。双语词典测试则直接格式化消息，并检查所有可显示的结算提示在两种语言中都有文案。[键盘导航](../../test/e2e/catalog-keyboard.spec.ts) · [无障碍扫描](../../test/e2e/catalog-accessibility.spec.ts) · [双语词典](../../test/integration/translations.test.ts)

## 结算失败后，核对哪些状态

- **旧购物车覆盖新数量。** 两个标签页读到同一条目，再通过 HTTP 将数量更新为 2。旧页面尝试改成 3 或删除时，页面提示购物车已变化，并重新显示数量 2。[跨标签页用例](../../test/e2e/bookstore-checkout.spec.ts#L62)
- **订单已成交，浏览器却丢了响应。** 演示用例先让真实 SQLite 交易完成，再丢弃首次响应。刷新后用原报价提交，核对两次请求的幂等键、同一条订单记录，以及最终库存只减少一本。[丢响应后重试](../../test/e2e/bookstore-checkout.spec.ts#L387)
- **订单仍在处理。** 演示交易同步完成，测试可把成功响应替换为 `202 PROCESSING`，观察浏览器是否查询提交资源。持续返回 `PROCESSING` 时核对轮询上限，返回 `RECONCILE_REQUIRED` 时核对页面提示等待核对、停止自动轮询并保留原报价。真实异步受理由独立联调验证。[浏览器状态处理](../../test/e2e/bookstore-checkout.spec.ts) · [真实服务联调](#真实-java-与-keycloak-联调)
- **接口返回异常。** 浏览器测试注入错误的 `Location`、提交 ID 或超时，检查报价是否仍能恢复。服务端另用可控的依赖错误调用报价与提交入口，核对 5xx 响应和日志共享同一个 `requestId`。[浏览器请求边界](../../test/e2e/checkout-transport.spec.ts) · [服务端故障关联](../../test/unit/checkout-observability.test.ts)

## 运行入口

静态检查覆盖类型、格式、Lint 和模块边界。`pnpm api:check` 另行核对契约生成结果。Vitest 运行 `test/unit` 与 `test/integration`，单看筛选表单可用 `pnpm test test/integration/catalog-filters.test.tsx`。[Vitest 配置](../../vitest.config.mts)

```bash
pnpm install --frozen-lockfile
pnpm peers check
pnpm check
pnpm api:check
pnpm test
```

### 生产构建与同源 HTTP

Playwright 启动演示、发布两种生产构建。演示项目使用隔离的 SQLite 种子，发布项目使用可控的目录服务替身，可观察上游请求次数、注入超时，并检查匿名访问。HTTP 用例直接请求 Route Handler，浏览器用例检查页面上的可见结果。用例按所需环境运行，失败 trace 写入 `test-results/e2e/`。[浏览器配置](../../playwright.config.ts) · [服务启动与替身](../../test/support/run-built-app.mjs) · [HTTP 用例](../../test/e2e/catalog-http.spec.ts)

```bash
pnpm build
pnpm build:demo
pnpm exec playwright install chromium --only-shell
unset BOOKSTORE_E2E_DEV
pnpm test:e2e
```

发布镜像另由 `bash scripts/test-release.sh` 在 Docker 内部网络中启动，核对存活、就绪、双语目录、静态资源和匿名购物车。`/api/ready` 返回 200 表示运行配置可解析且目录可读。CI 分别运行常规检查、视觉回归和镜像烟测。[镜像烟测](../../scripts/test-release.sh) · [CI 工作流](../../.github/workflows/ci.yml)

### 视觉回归

截图基线使用固定的 Linux ARM64 Playwright 容器、演示种子和 Chromium，覆盖桌面与移动视口的目录，以及深色详情、购物车和订单页。每次运行的结果位于 `test-results/visual-container/run.*/`。预期的视觉改动用 `bash scripts/test-visual.sh --update-snapshots` 生成新图，脚本会再比较一次，并把基线复制回仓库供评审。[视觉配置](../../playwright.visual.config.ts) · [截图基线](../../test/visual/screenshots)

```bash
bash scripts/test-visual.sh
```

已有预览可直接检查 CSS 响应、书卡布局和横向溢出。安装 Chromium 后把地址传给 `BOOKSTORE_VISUAL_URL`，此模式只运行桌面和移动视口的样式断言。[样式检查](../../test/visual/catalog-styles.spec.ts)

```bash
BOOKSTORE_VISUAL_URL=http://127.0.0.1:3000 pnpm test:e2e:visual
```

### 真实 Java 与 Keycloak 联调

这套独立用例使用已运行的发布前端、实际身份服务和订单服务。准备隔离的账户、书目和库存后执行 `pnpm test:e2e:java`。用例会下单并消费种子库存，两人争购的前提是指定书目只剩一本。[联调配置](../../playwright.java.config.ts) · [环境与启动](../operations/run-and-release.md#java-集成)

登录恢复用例注入一次操作 `401`，随后实际经过 Keycloak 回跳，在原报价上手动继续，核对浏览器收到的 BFF `202 PROCESSING`、状态查询和最后生成的订单。另一条用例在报价后修改一行购物车，下单成功及重放后都检查未改动的行已清除、改过的行仍保留。注册与邮件找回密码、成交后丢失响应、两账户争购最后一本也在此环境验证。[真实浏览器用例](../../test/live-java/checkout.spec.ts)
