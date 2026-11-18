# Java 接口快照

这组 Java v2 契约和响应样例固定到 `explicit-architecture` 提交 `4dd0e9dd9f4bf279633a35c186d11fb15f6ba6c7`。使用该提交的 `demo/compose.yaml` 和 `demo/compose.frontend.yaml` 启动联调环境，启动和验收命令见其 `demo/README.md`。

| 快照                                    | 后端源文件                               |
| --------------------------------------- | ---------------------------------------- |
| [目录 v2](catalog-v2.yaml)              | `catalog/contracts/catalog-v2.yaml`      |
| [订单 v2](order-v2.yaml)                | `order/contracts/order-v2.yaml`          |
| [实测订单响应](order-v2-responses.json) | `demo/contracts/order-v2-responses.json` |

后端契约升级时，从同一提交复制这些文件，更新固定提交，再运行 `pnpm api:generate` 和 `pnpm api:check`。适配器测试复用实测响应，浏览器验收通过运行中的 BFF 和 Java 服务执行。
