# ADR 0002 公开读取与缓存

已采用。依据书籍目录实现记录。

## 背景

目录页面与同源 HTTP 接口会读取相同的公开结果。查询参数含自由文本和页码，若全量缓存，冷门参数可能生成大量难以复用的键。浏览器接收的 HTTP 响应和应用在服务端复用的结果也有不同的缓存边界。

## 决策

- 页面直接调用服务端目录读取器。Route Handler 将校验后的输入交给同一入口，并为 HTTP 响应设置 `Cache-Control: no-store`。[目录读取器](../../src/server/catalog.server.ts) · [HTTP 响应](../../src/server/http/response.server.ts)
- 演示模式缓存前十页中无关键词的列表读取，且分类为空或属于当前目录。自由文本、未知分类和更深的页码绕过列表缓存。合法的书籍 UUID 可用于详情缓存。
- 缓存参数按数据集、locale 和规范化后的查询或 UUID 隔离。缓存只持有公开结果。列表与详情使用各自的标签，`cacheLife` 配置为 `stale: 0`、`revalidate: 60`、`expire: 300` 秒。[Next.js cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife)
- 发布模式直接读取 Java Catalog 当前的书目、分类和库存。

## 取舍

缓存常用的公开读取可减少演示模式的重复调用，页面可能短时间显示先前结果。限制列表缓存的参数范围控制了缓存键的规模。发布构建的 HTTP 与页面用例验证当前库存和上游读取。[页面用例](../../test/e2e/catalog-journey.spec.ts) · [HTTP 用例](../../test/e2e/catalog-http.spec.ts)
