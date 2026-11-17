# Java 教学集成设计

本设计扩展[前端参考架构](2026-11-17-bookstore-reference-design.md)。可以为改善 Demo 修改 Java 后端。源码基线为 `14e511a8f361616e166f23daf5184012d501c656`，现有事实见[能力矩阵](../../integration/backend-capability-matrix.md)。

## 1. 方案选择与验收

| 路径                              | 代价                                                                    |
| --------------------------------- | ----------------------------------------------------------------------- |
| 直接复用 v1，由 BFF 补身份和幂等  | 改动少，Java 仍可接收调用者自报的身份和价格，BFF 无法覆盖写入成功后断连 |
| 用新教学后端替换已有 Java 服务    | 可以做单数据库事务，失去现有双服务边界与事件链的示范                    |
| 为现有服务新增 v2，复用领域和存储 | 增加两仓交付及协调成本，保留原有用例，并提供可实际联调的完整路径        |

选第三条。Catalog 与 Order 保留独立数据库与业务所有权。`demo-integrated` 是独立 Java 运行 profile。v1 DTO 与原有测试保留，该 profile 严格封锁旧版绕行写入口。由 Java 仓库维护 v2 OpenAPI 原件，前端按通过验收的 Java SHA 取快照。前端本地模式仍可在不运行 Java、容器或身份服务时完成全部流程。

## 2. 认证、网络和能力启用

- 固定一个 Keycloak 教学 realm。浏览器只连接同源 Next.js 和 Keycloak。Next.js 采用 Better Auth Generic OAuth 和独立 PostgreSQL session DB，要求 state、PKCE、精确 callback 和受信 issuer。OAuth token 仅由服务器取得并加密存储。BFF 将当前 session 对应的唯一 provider account 作为服务端 token 查询条件，浏览器 auth 路由精确 allowlist：Keycloak 登录 POST 与 OAuth callback GET，退出走 `/api/v1/session` 撤销本地会话。下次开始交互登录时发送 `prompt=login`，允许同一浏览器重新选择账号。禁用 account linking 和 provider token cookie，token/refresh/list-account 等端点即使携带合法 session 也返回 404。服务器通过库内部 API 刷新令牌。
- Java 启用 Spring Security Resource Server，验证签名、issuer、audience、有效期以及可信 role/client。该单 realm 的 `sub` 为 UUID，作为 customerId。邮箱从 IdP 已验证 claim 取得。拒绝在 v2 顾客请求体内声明 customerId、email、unitPrice 或 title。
- 顾客角色 `bookstore-reader` 只操作本人订单，目录管理角色 `bookstore-admin` 只授权后台目录能力。Order 到 Catalog 调用独立 client credentials，必须有内部接口的 audience 和服务角色。Java 验证不使用浏览器 Cookie。
- v2 公开目录只放行 GET。集成 profile 拒绝通过 v1 订单、目录写入、库存写入及其他未登记路径绕行，禁止把 Java 端口映射给浏览器。Next 和 IdP 开放 loopback，也核验 issuer URL 与容器内 JWKS 的连接走向。
- 前端默认 `JAVA_CONTRACT=v1-catalog`，提供只读目录。开启 `v2-integrated` 同时要求 OIDC 和 Java 端到端证明。认证/上游缺参导致启动或就绪检查失败，拒绝自动切换 v1 写入或教学身份。独立教学及隔离的本机联调允许 loopback HTTP。其余发布环境采用 HTTPS。Compose 使用固定公开 Keycloak issuer，Java 的 JWK set 与 Next 的 token/userinfo 允许用内部地址，OIDC 安全校验仍使用同一公开 issuer。

## 3. Java v2 接口

| 服务    | HTTP 与输入/输出                                                                                         | 主约束                                                                                             |
| ------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Catalog | `GET /api/v2/books?category=&q=&page=1&size=12` → `{books,page,hasNext}`                                 | 公开。UUID 稳定排序，分类 exact，标题/作者使用转义的大小写无关子串。相同 offset/limit 作 lookahead |
| Catalog | `GET /api/v2/books/{bookId}` 与 `GET /api/v2/categories`                                                 | 公开详情、分类原值。未知详情 404。v2 从权威库读，Redis 只服务原 v1                                 |
| Catalog | `GET /api/v2/admin/books/{bookId}`、`PATCH /api/v2/admin/books/{bookId}`。写入 `{title,expectedVersion}` | 管理员。读写返回 `Book & {version}`，过期版本 409                                                  |
| Catalog | `POST /api/v2/internal/checkout/snapshots`，`{lines:[{bookId,quantity}]}`                                | Order 服务角色，返回权威标题、价格、库存                                                           |
| Catalog | `PUT /api/v2/internal/checkout/reservations/{submissionId}`，body 为规范化报价项及确认的单价、币种       | Order 服务角色，稳定 ID 和内容重放原结果，内容不同 409                                             |
| Catalog | `DELETE /api/v2/internal/checkout/reservations/{submissionId}` → 204                                     | Order 服务角色。受控补偿使用，原子释放。无记录也写拒绝后续预留的 tombstone                         |
| Order   | `POST /api/v2/me/order-quotes`，`{lines:[{bookId,quantity}]}` → 201 `Quote`                              | 顾客，使用 Catalog 快照和已有定价服务，保存归属及 10 分钟有效期                                    |
| Order   | `POST /api/v2/me/order-submissions`，`{quoteId}` + `Idempotency-Key` → 202 `Submission`                  | 顾客，提交先持久化，重复提交重放同一 submissionId                                                  |
| Order   | `GET /api/v2/me/order-submissions/{submissionId}` → 200 `Submission`                                     | 仅本人，PROCESSING、PLACED、REJECTED、RECONCILE_REQUIRED                                           |
| Order   | `GET /api/v2/me/orders`、`GET /api/v2/me/orders/{orderId}`                                               | 权威读本人订单，缺失/他人均 404，按 `orders.id DESC` 分页                                          |
| Order   | `PUT /api/v2/me/orders/{orderId}/cancel`，`{reason,expectedVersion}` → 204                               | 仅本人，事务校验状态与版本，并同事务写 Outbox                                                      |

`Book`、`Quote`、`Submission` 与页面可见订单字段遵循[前端设计](2026-11-17-bookstore-reference-design.md)的共享语义。Java v2 书籍字段使用 `priceMinor`，CNY/USD 两位小数的目录展示，交易仅 CNY，USD 报价返回 `UNSUPPORTED_CURRENCY`。版本从 0 起单调递增。Java OpenAPI 记录认证 scheme、状态、归属和白名单错误码，例如 `PRICE_CHANGED`、`INSUFFICIENT_STOCK`、`VERSION_CONFLICT`、`QUOTE_EXPIRED`、`IDEMPOTENCY_CONFLICT`。下单折扣在 Java 计算并随报价持久化。CNY 单项数量 ≥5 先下取整九折，组合小计 ≥50000 再下取整九五折。严格检查乘加与最终金额在 JS 安全整数范围。重放已受理报价不按新规则重新定价。

## 4. 跨服务写入、恢复和取消

1. Order 在本地事务先检查 `UNIQUE(owner,idempotency_key)`，再锁本人的报价或使用等价条件约束，先检查有无其它 key 消费，再检查有效期和接单开关。持久化 `UNIQUE(quote_id)` 提交记录。submissionId 是最终 orderId，接受提交时持久化归属、已验证邮箱与报价快照。后台重启无需用户会话或用户 token，邮箱仅作订单服务内部数据，响应及日志不得包含。接受提交时记录的报价有效性不随后台处理时间变化。相同 key 与 quote 返回同 ID 的当前状态与 202，报价过期后仍可查已有提交。key 复用到其他 quote 返回 409。用 `INSERT ... ON CONFLICT DO NOTHING` 或事务回滚后重读获胜行，分别处理相同/不同 key 的竞争，不在已 abort 的 PG 事务继续查询。
2. Order 调度器在短事务内 claim 到期任务并写入 10 秒 lease 与递增 fencing 版本，提交后才调用 Catalog。持久化 `attemptCount,nextAttemptAt,leaseUntil,claimVersion`，到期 claim 可回收。单次 token 和 Catalog HTTP 总预算 4 秒。重复执行持有相同 submissionId。Catalog 先以 `INSERT ... ON CONFLICT DO NOTHING` 建立预留行，再用 SELECT FOR UPDATE 锁该行，之后按 UUID 顺序锁书籍。reserve 初始行和扣减在同一事务。release 可用同样的唯一键先插入 tombstone，避免只锁不存在的行。事务内比对 payload hash、当前单价/币种、库存，全部扣减或确定性拒绝。写入 `HELD|REJECTED|RELEASED` 耐久记录。已释放 tombstone 阻止旧请求重新扣减。v1 HTTP 写在联调 profile 禁用且旧 profile 不共享联调 DB。联调中仍启用的 Kafka 释放、新预留、新标题编辑采用共同的 load→check→mutate→flush 事务/锁顺序。
3. Order 在本地事务比对 claim fencing version，使用同一 ID、已确认的预留及报价中的冻结总价构造订单，保存协议 provenance、既有领域事件/Outbox 与 `PLACED` 状态。校验使用已确认的预留，避免用预留后的 0 可售库存再次拒绝最后一册。明确的上游业务拒绝才将提交持久化为 `REJECTED`。Catalog 提交后响应丢失时，重复 reserve 同 ID 得到已有判定。Order 提交后响应丢失时，从提交表返回已有结果。
4. 网络失败后按 1/2/4/8/16 秒用原 ID 有界退避，仍失败转 `RECONCILE_REQUIRED` 并记录报警。此时保留原提交及预留状态，页面展示待核对。运行手册按提交 ID 查询双方记录并由操作方用原 ID 恢复。若需要停止，从未成功的待核对行 CAS 切为内部 `COMPENSATING` 并递增 fence，使旧 worker 不能 place。然后调用幂等 DELETE，若无 HELD 也持久写 RELEASED tombstone。释放确认后标记 REJECTED/PLACEMENT_ABORTED，中途崩溃以同 ID 重做。对浏览器内部补偿仍表现为 RECONCILE_REQUIRED。
5. 取消只对本人 PLACED/CONFIRMED 订单允许，按 owner 及 expectedVersion 事务性修改，写入现有 OrderCancelled Outbox。在现有 OrderCancelled Avro 增加向后兼容的 `reservationProtocol` 字段（整数，默认 1）。订单存入协议版本，映射 v2 的消息为 2。v2 消费者绝不回退 legacy 逐条释放。v2 分支走处理成功事务提交后 ack 的 `processSimple`，释放失败向容器抛出并重投，不能在旧逐条处理器里捕获吞掉。无预留记录写 tombstone 并告警，以事务和持久幂等防重复。v2 集成 profile 暂停 legacy auto-confirm listener，状态变更只来自受控的写入与 seed。原 profile 维持原行为。库存最终恢复，页面不在 204 时宣称已经恢复。
6. v2 私域读与原有 ES 投影隔离。使用按 owner 和 id 限定的 JPA 查询和 `orders(customer_id,id)` 索引，允许写后可见。v1 继续展示原 CQRS/ES 模型。SQL、事件、HTTP 状态与权限可分别验证。

## 5. 发布与故障验收

- 调整既有 catalog、order、e2e、共享事件 schema 与联调部署配置。迁移只追加。先部署能读新旧协议的 Catalog consumer 再启用 v2，任何 v2 订单仍可取消或事件可重放时保留该消费者和 tombstone，旧程序不得接同一联调 DB/Kafka 消费组。回退保留 v2 契约。Order 的 `DEMO_V2_INTAKE_ENABLED=false` 关闭新报价和新提交，优先允许已记录的 key 重放，并继续认领在途、查询、取消。Catalog 的 `DEMO_V2_ADMIN_WRITES_ENABLED=false` 仅关闭后台 PATCH。已受理订单继续走预留、读取与释放。
- 集成启动环境复用既有 Java/Gradle 工具链、PostgreSQL、Redis、Kafka/Schema Registry、ES。现有目录 seed 主要是测试数据。本地联调额外执行显式、幂等的 fixture seed，至少 13 本、两分类、CNY 的最后一册 SKU，固定 UUID，不覆盖已存在版本或库存。启动时先 Flyway 再 seed。新 Compose 把依赖、版本、readiness、Keycloak realm 和数据入口固定到可复现配置。复用 topic/schema 初始化，Order 文档化开启 scheduler relay 以免依赖 Debezium CDC，主题与兼容 schema 注册通过后再启动业务。联调 Gradle 测试走同一 Compose 私有网络，注入 Catalog、Order 与 IdP 的内部 URL。签发测试 token 的 fixture 仅在一次性 verify 环境启用，浏览器联调用正式 OIDC Code + PKCE。在已有 Registry volume 上核验目标 schema 内容，兼容检查后注册并验证返回 ID。现有同名 subject 不代表新 schema 可取得。生成新的 shared-events 版本并在消费者和生产者显式固定，先构建和运行旧 writer + 新 reader 的配对，再启用新 writer。先核实本地已有依赖与测试启动方式再锁版本。
- 验证真实四条浏览器流程，记录前端与 Java SHA、实际 HTTP、事务后订单/库存和事件证据。故障注入包含错误 issuer/audience、同浏览器真实 A 退出后登录 B（历史和旧 tab 无 A 的私有内容）、他人订单、重复提交、抢最后一本、跨服务提交后断连、相同取消消息重放与管理冲突。
- 浏览器为已接受的提交按 ID 最长轮询 30 秒，超时提供继续检查，刷新后恢复。出现 `RECONCILE_REQUIRED` 留存上下文和原 key。恢复前保留草稿，只有确知 REJECTED 才可以对原购物意图重新报价。
- v1 只读环境、合同 stub 与真实 v2 分别记录验收状态。Stub 没有验证 Java 持久事务、事件或 OIDC。

参考 [Spring Security JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html)、[Keycloak Server Administration](https://www.keycloak.org/docs/latest/server_admin/)、[Better Auth OAuth](https://better-auth.com/docs/concepts/oauth)。
