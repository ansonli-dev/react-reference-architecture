# Java v1 OpenAPI 契约

这里保存发布模式服务端适配器使用的上游接口快照。浏览器调用前端自己的同源 BFF，两端的字段由适配器映射。例如，上游订单明细的单价是 `unitPriceMinor`，BFF 提供给页面的是 `priceMinor`。字段转换与运行时校验都在订单适配器中完成。[BFF 契约](../bff/v1.yaml) · [订单适配器](../../src/server/adapters/java/order-v1.server.ts) · [订单映射测试](../../test/integration/java-checkout.test.ts)

| 本仓库快照              | 上游来源                                                                                                                              | 前端使用位置                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| [目录](catalog-v1.yaml) | [catalog/contracts/catalog-v1.yaml](https://github.com/ansonli-dev/explicit-architecture/blob/main/catalog/contracts/catalog-v1.yaml) | [目录读取适配器](../../src/server/adapters/java/catalog-v1.server.ts) |
| [订单](order-v1.yaml)   | [order/contracts/order-v1.yaml](https://github.com/ansonli-dev/explicit-architecture/blob/main/order/contracts/order-v1.yaml)         | [订单与结算适配器](../../src/server/adapters/java/order-v1.server.ts) |

## 更新与验证

对接新的后端修订时，从该修订原样复制有变化的 YAML 到本目录，并在变更记录中注明后端提交。用下面的命令重新生成类型、核对本仓库快照与生成文件，并验证适配器映射。

```bash
pnpm api:generate
pnpm api:check
pnpm test test/integration/java-catalog.test.ts test/integration/java-checkout.test.ts
```

生成脚本同时处理 BFF 定义和这两份上游快照。将更新后的 YAML、对应的生成类型和必要的映射改动一起提交。`api:check` 校验的是本地文件之间的一致性。部署环境的接口兼容性由对应后端修订上的联调验证。[生成脚本](../../scripts/generate-api.mjs) · [生成类型](../../src/server/adapters/java/generated/) · [联调配置](../../docs/operations/run-and-release.md#java-集成)
