# ADR 0002 公开读取与缓存

已采用。依据书籍目录实现记录。

## 背景

目录页面与同源 HTTP 接口会读取相同的公开结果。查询参数含自由文本和页码，若全量缓存，冷门参数可能生成大量难以复用的键。浏览器接收的 HTTP 响应和应用在服务端复用的结果也有不同的缓存边界。

## 决策

- 页面直接调用服务端目录读取器。Route Handler 将校验后的输入交给同一入口，并为 HTTP 响应设置 `Cache-Control: no-store`。[目录读取器](../../src/server/catalog.server.ts) · [HTTP 响应](../../src/server/http/response.server.ts)
- 列表缓存前十页中无关键词的读取，且分类为空或属于当前配置的分类选项。自由文本、未配置的分类和更深的页码绕过列表缓存。合法的书籍 UUID 可用于详情缓存。
- 缓存参数按运行配置、数据集、locale 和规范化后的查询或 UUID 隔离。缓存只持有公开结果。列表与详情使用各自的标签，`cacheLife` 配置为 `stale: 0`、`revalidate: 60`、`expire: 300` 秒。[Next.js cacheLife](https://nextjs.org/docs/app/api-reference/functions/cacheLife)

## 取舍

缓存常用的公开读取可减少重复调用，页面可能短时间显示先前结果。限制列表缓存的参数范围控制了缓存键的规模。生产 E2E 以服务端读取次数验证页面和 BFF 对详情的复用，以及不同 locale 之间的缓存隔离。[页面缓存测试](../../test/e2e/catalog-journey.spec.ts) · [HTTP 缓存测试](../../test/e2e/catalog-http.spec.ts)
