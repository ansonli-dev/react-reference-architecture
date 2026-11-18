# Java v1 OpenAPI 契约

发布构建的服务端适配器使用 Java 仓库中的 v1 接口定义。

| 适配器契约              | Java 仓库源文件                     |
| ----------------------- | ----------------------------------- |
| [目录](catalog-v1.yaml) | `catalog/contracts/catalog-v1.yaml` |
| [订单](order-v1.yaml)   | `order/contracts/order-v1.yaml`     |

更新适配器时，从 Java 源文件原样复制对应 YAML，运行 `pnpm api:generate` 并同步提交生成类型，再用 `pnpm api:check` 核对。浏览器使用独立的 [BFF OpenAPI 契约](../bff/v1.yaml)。[本地联调配置](../../docs/operations/run-and-release.md#java-集成)
