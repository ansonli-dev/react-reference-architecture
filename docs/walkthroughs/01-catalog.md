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

## Java v1 真实 HTTP 核验入口

后端源码基线为 `14e511a8f361616e166f23daf5184012d501c656`。按该提交的 [后端运行说明](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/README-zh.md) 发布本地共享模块，配置 PostgreSQL、Redis 和 Kafka，再在 `catalog/` 运行 `./gradlew bootRun`。[目录配置](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/resources/application.yml) 提供 8081 端口，以及数据库、Schema Registry、Flyway 和 OpenAPI 的配置入口。

```bash
curl -fsS http://127.0.0.1:8081/v3/api-docs
curl -fsS 'http://127.0.0.1:8081/api/v1/books?page=0&size=12'
```

用该环境的受控 seed 查到首尾页及已知 UUID，再分别请求详情和未知 UUID。将 OpenAPI 与 [适配快照](../../contracts/java/catalog-v1.yaml) 对照，记录 Java 和前端提交、数据来源、实际请求与脱敏结果。确认分类大小写与后端原值一致，并检查 Java v1 无排序或总量时的尾页行为。服务未启动、Flyway 或依赖配置出错时先检查 Java 健康和日志。超时和契约漂移在 BFF 分别表现为 504 和 502。

本次证据覆盖教学 SQLite 和本机 HTTP stub。真实 Java HTTP 待验，J7–J8 依赖后续契约。
