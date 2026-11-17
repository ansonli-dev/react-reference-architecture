# 书籍目录 walkthrough

## 在浏览器重放

按 [运行说明](../../README.md#运行教学目录) 安装、写入种子并启动教学版。访问 `/zh-CN/books`，确认首屏含《React 应用架构》。打开详情查看作者、价格和库存。切换语言仍停在同一本书。

- 直接打开 `/zh-CN/books?page=2` 看第二页。从第 2 页选择分类后应用筛选，URL 回到第 1 页。浏览器后退恢复原来的 URL 和筛选条件。
- `/zh-CN/books?category=Architecture&q=React` 按分类和关键词读教学 SQLite。Java v1 支持分类，历史链接带 `q` 时显示可重置提示。
- `/en/books?page=101` 显示可重置的参数错误。合法但未知的书籍 UUID 显示本地化的缺失页并加 `noindex`。流式页面可能已发送 200 响应头，API 对相同 UUID 明确返回 404。

## 从 URL 到数据源

1. [目录 RSC](<../../src/app/%5Blocale%5D/(store)/books/page.tsx>) 先渲染标题和加载区。在 Suspense 内执行 `connection()`，并读取 `searchParams`。输入进入 [目录模型](../../src/features/catalog/model.ts)。页码为 1–100，每页 12 条。重复值和非法页码在访问数据前被拒绝。
2. [公开 reader](../../src/server/catalog.server.ts) 根据编译 profile 与运行配置选择适配器。RSC 直接调用 reader，两个同源 [BFF 路由](../../src/app/api/v1/catalog/books) 复用 reader 并输出 OpenAPI DTO。BFF 使用 `Cache-Control: no-store`。页面依赖 URL 导航，书籍首屏无需额外浏览器取数。
3. [教学适配器](../../src/server/adapters/demo/catalog.server.ts) 在请求时打开种子生成的 SQLite，按 UUID 排序，读取第 13 条判断下一页。[Java v1 适配器](../../src/server/adapters/java/catalog-v1.server.ts) 使用固定可信 origin，转换为零基页码，执行 2 秒总 deadline，拒绝重定向和不合格的响应。
4. 公开缓存 key 由 profile、契约、数据源地址散列、locale 和标准化查询或 UUID 构成。通过 `catalog:lists` 与 `catalog:book:<id>` 标记，60 秒再验证，300 秒过期。无关键词时，未筛选目录和已配置分类的前十页可缓存。高页码、任意分类值及关键词查询直接读数据源。浏览器身份不进入缓存或 Java 请求。
5. [详情 RSC](<../../src/app/%5Blocale%5D/(store)/books/%5BbookId%5D/page.tsx>) 在 Suspense 内读取同一 reader。页面使用项目内的 SVG 封面和继承的本地化 metadata，构建时无需查找书籍。

## 复验

```bash
pnpm check
pnpm test
pnpm build
pnpm build:demo
pnpm test:e2e catalog-http.spec.ts catalog-journey.spec.ts
```

在 `demo` 生产产物上测试独立 SQLite 种子和目录请求。在 `release` 生产产物上连接可控制延迟和响应的本机 Java HTTP stub。目录用例读取原始 HTTP 响应证明书名由服务端输出，验证延迟上游时 shell 与加载提示先到、第 100 页满页时没有下一页，以及同一 Next 进程的上游计数。隔离实例另验证缺 Java 或 SQLite 时构建仍可启动、健康为 200、就绪为 503。

## Java v1 真实目录 E2E

使用 [后端 main de7ab0c](https://github.com/ansonli-dev/explicit-architecture/tree/de7ab0c373afe1dd3206034bb2e6a2d94b212726) 的 Catalog，以 JDK 21 运行默认 profile。为验收准备独立的 PostgreSQL 和 Redis；按 [目录配置](https://github.com/ansonli-dev/explicit-architecture/blob/de7ab0c373afe1dd3206034bb2e6a2d94b212726/catalog/src/main/resources/application.yml) 设置 `SPRING_DATASOURCE_*` 和 `SPRING_DATA_REDIS_*`。在后端根目录执行：

```bash
(cd seedwork && ./gradlew publishToMavenLocal)
(cd shared-events && ./gradlew publishToMavenLocal)
(cd catalog && ./gradlew bootJar)
SPRING_PROFILES_ACTIVE=default OTEL_SDK_DISABLED=true java --enable-preview \
  -jar catalog/build/libs/catalog-0.0.1-SNAPSHOT.jar \
  --server.address=127.0.0.1 --server.port=8081 \
  --spring.kafka.listener.auto-startup=false --outbox.relay.strategy=disabled
```

Flyway 完成后，按 [后端种子说明](https://github.com/ansonli-dev/explicit-architecture/blob/de7ab0c373afe1dd3206034bb2e6a2d94b212726/demo/README.md#verification)，用 `psql "$LEGACY_CATALOG_DB_URL" -v ON_ERROR_STOP=1 -f demo/seed/catalog.sql` 向该库写入 13 本书。然后在前端仓根目录执行：

```bash
pnpm exec playwright install chromium --only-shell
pnpm build
JAVA_CATALOG_BASE_URL=http://127.0.0.1:8081 pnpm test:e2e:java
```

用例会在本机 3220 端口启动发布构建，检查 Java 的 OpenAPI、分页和详情，将实际 HTTP 响应与 BFF、服务端 HTML 和 Chromium 中的书籍页面对照。默认 `pnpm test:e2e` 继续使用 SQLite 与 HTTP stub。

2026-11-17，前端 [main 0534212](https://github.com/ansonli-dev/react-reference-architecture/commit/053421270f758308f18506ccf8df7b73754a020c) 生产构建对接后端 `de7ab0c`，两条 Playwright 验收通过。Java 首尾页分别返回 12 和 1 本，`Architecture` 返回 6 本。详情显示 `Bounded Contexts`、作者 `Lin Zhao`、CNY 49.00 和库存 30。缺失 UUID 在 Java 与 BFF 都返回 404，浏览器显示缺书页。现场 OpenAPI 的列表和详情 schema 分列，七个响应字段与 [只读快照](../../contracts/java/catalog-v1.yaml) 一致。验证范围为 v1 只读目录。
