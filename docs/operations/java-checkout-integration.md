# Java 后端改造需求

[页间书店前端](https://github.com/ansonli-dev/react-reference-architecture)的购书范围是书籍列表、书籍详情、购物车和我的订单。本地演示使用 SQLite，前端发布模式当前读取 Java v1 目录。真实联调沿用已经交付的 `demo-integrated` Catalog v2、Order v2 和 Keycloak。Java 负责报价、库存及订单，前端 BFF 管理购物车草稿。首期使用 CNY。

## 页面与 REST 资源

| 页面或步骤     | HTTP 资源                                                                                       | 契约                                                                                                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 列表与分类     | `GET /api/v2/books`、`GET /api/v2/categories`                                                   | 支持 `category`、`q`、`page` 和 `size` 查询参数，复用一基分页、稳定排序和 `hasNext`。列表项增加可选的 `coverUrl`。                                                                                           |
| 书籍详情       | `GET /api/v2/books/{bookId}`                                                                    | `200` 返回书名、作者、分类、可用库存、金额最小单位和币种。增加可选的 `description` 和 `coverUrl`，未知书号返回 `404`。                                                                                       |
| 购物车         | BFF `GET /api/v1/cart`、`PUT /api/v1/cart/items/{bookId}`、`DELETE /api/v1/cart/items/{bookId}` | 联调时读取本人的草稿。`PUT` 用 `{ "quantity": 2 }` 设置绝对数量，新条目返回 `201`，更新返回 `200`。删除返回 `204`。重复设置或删除产生相同结果。                                                              |
| 核对结算报价   | `POST /api/v2/me/order-quotes`、`GET /api/v2/me/order-quotes/{quoteId}`                         | 提交书号和数量。创建返回 `201` 和 `Location`，表示中包含 `quoteId`、有效期、行项目快照、金额和币种。新增本人报价查询，供刷新后恢复同一报价。                                                                 |
| 提交和跟踪下单 | `POST /api/v2/me/order-submissions`、`GET /api/v2/me/order-submissions/{submissionId}`          | 发送 `quoteId` 和 UUID `Idempotency-Key`。新受理及处理中重放返回 `202`。终态 `PLACED` 或 `REJECTED` 的重放返回 `200`。两种响应均包含同一提交 ID 和指向提交资源的 `Location`。读取提交返回 `200` 和当前状态。 |
| 订单记录       | `GET /api/v2/me/orders`、`GET /api/v2/me/orders/{orderId}`                                      | 列表、详情新增 `createdAt`。列表按创建时间降序，订单 ID 作同时间的稳定排序。`include=lines` 请求一次返回分页内的书目快照、单价和数量。省略该参数时保留摘要形状。                                             |
| 订单取消       | `PUT /api/v2/me/orders/{orderId}/cancellation`、`GET /api/v2/me/orders/{orderId}/cancellation`  | 取消是每笔订单的单一资源。提交 `reason` 和 `expectedVersion`，首次创建返回 `201` 和 `Location`，同一请求重放返回 `200` 和原结果。订单状态或版本冲突返回 `409`。                                              |

路径标识资源，读取使用 `GET`，创建报价和提交使用 `POST`。报价、提交和订单的归属取自可信 JWT `sub`。其他读者查询这些资源时返回 `404`，缺少认证返回 `401`。金额以最小货币单位和 ISO 4217 币种表达。购物车展示按当前目录信息预估，报价冻结实际下单金额。[HTTP 语义 RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)

## Java 交付项

- [ ] 在订单摘要、提交结果的订单摘要和详情中返回实际创建时间 `createdAt`，使用带时区的 ISO 8601 字符串。同一订单各处时间一致。更新分页排序契约和回归测试。
- [ ] 明确目录的 `coverUrl`、`description` 和订单列表的行项目展开契约。订单明细取下单时保存的快照，目录改名或改价后仍可核对原书名和金额。
- [ ] 补齐报价读取、创建响应的 `Location` 和提交响应的 `Location`，更新现有 v2 OpenAPI。相同读者、报价和 key 重试取得同一提交。同一 key 用于另一份报价时返回 `409 IDEMPOTENCY_CONFLICT`。
- [ ] 为提交的 `202` 和终态重放的 `200` 分别补契约测试。迁移期间前端可识别旧版 `202` 响应中的终态，始终按 `state` 判断是否成立。
- [ ] 提供本人订单的 `cancellation` 资源。读取返回持久化的取消原因和取消时间。回放识别先于版本冲突判断，重复取消只释放一次库存。现有 `/cancel` 客户端可在迁移期继续使用原路径。
- [ ] 补齐可供前端映射的错误和状态样例。请求错误延续现有响应 `code`，包括 `QUOTE_EXPIRED`、`BOOK_NOT_FOUND`、`INSUFFICIENT_STOCK`、`IDEMPOTENCY_CONFLICT` 和 `INTAKE_CLOSED`。异步查询用 `state` 与 `reason` 表达 `PROCESSING`、`PLACED`、`REJECTED`、`RECONCILE_REQUIRED`。只有 `PLACED` 和有效的 `orderId` 一起触发下单成功页面。
- [ ] 固定联调后端提交和 OpenAPI 快照，提供 Compose 启动和幂等 seed 命令、最后一册库存的书目及两个测试读者。对齐 Keycloak 公开 issuer、Catalog 和 Order audience，以及 BFF 回调地址。

## 联调验收

- [ ] 在同一浏览器从列表进入详情，加购，在购物车核对数量和报价后提交，等待 `PLACED`。从导航重新打开订单页并刷新，核对同一订单的书名、数量、金额、币种和创建时间。
- [ ] 丢失提交响应后沿用原 key，返回同一提交和订单，库存只扣减一次。复用 key 提交另一报价得到明确冲突。
- [ ] 对同一笔订单重复提交相同取消请求，核对相同的取消结果与一次库存释放。其他读者访问取消资源时收到 `404`。
- [ ] 两个读者同时购买最后一册，只有一笔订单成立。失败方收到库存不足，购物车保留相应条目。另一读者访问报价、提交和订单时收到 `404`。
- [ ] 验证缺书、价格变化、报价过期、暂停接单和待核对场景。保留固定版本的脱敏响应，供前端生成类型和端到端测试。

参考 [Catalog v2 OpenAPI](https://github.com/ansonli-dev/explicit-architecture/blob/main/catalog/contracts/catalog-v2.yaml)、[Order v2 OpenAPI](https://github.com/ansonli-dev/explicit-architecture/blob/main/order/contracts/order-v2.yaml) 和 [后端联调环境](https://github.com/ansonli-dev/explicit-architecture/blob/main/demo/README.md)。

## 本地演示接口

演示的 BFF 用 `GET /api/v1/cart`、`PUT /api/v1/cart/items/{bookId}` 和 `DELETE /api/v1/cart/items/{bookId}` 管理购物车。加购先读取条目，再用 `If-Match` 设置下一数量，首次创建使用 `If-None-Match: *`。同一浏览器的标签页依次加购，以便共用首次加购建立的会话。购物车按页面读取到的条目版本更新和删除，版本变化时返回 `412`，页面提示核对最新数量。页面用 `POST /api/v1/order-quotes` 创建报价，客户端可读取 `Location` 指向的快照。确认页从 URL 恢复同一个报价。演示前端以报价 ID 作为稳定的幂等键。

SQLite 在同一事务内创建下单提交、订单和明细，扣减库存并清理该币种的购物车。首次提交同步完成并返回 `201`，重放返回 `200`。响应提供下单提交的 `Location`。订单集合和单笔订单可通过 `GET /api/v1/orders` 与 `GET /api/v1/orders/{orderId}` 读取。[BFF OpenAPI 契约](../../contracts/bff/v1.yaml)
