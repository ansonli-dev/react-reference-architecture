# Java v2 与真实联调实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal** 在现有 Java 项目配套实现真实的目录、报价与订单、取消和管理编辑，并经同一套前端完成端到端联调。

**Architecture** Java 新增 v2 和隔离运行 profile。保留 v1 与既有域模型，订单通过耐久提交协调 Catalog 批量预留。Next BFF 经 OIDC token 委托并转换契约。

**Tech Stack** Spring Boot、OAuth2 Resource Server、Keycloak、Java/Gradle、JPA/PostgreSQL、Kafka/Avro、Testcontainers、Better Auth、Next.js。

**Spec** [Java 集成设计](../specs/2026-11-17-java-demo-integration-design.md) 与[前端设计](../specs/2026-11-17-bookstore-reference-design.md)。

## 全局约束

- J1–J6 在 `ansonli-dev/explicit-architecture` 独立分支，从 `14e511a` 所代表的契约起点核对最新主线。J7–J8 在前端仓。允许必要后端改造，保持 legacy profile 启动/契约测试通过。
- Java v2 不引入新的微服务。单 realm、服务端 token、私有网络。符号 `CAT` 等代表相对目录：`CAT=catalog/src/main/java/com/example/catalog`，`ORD=order/src/main/java/com/example/order`，测试目录用相应的 `src/test/java`。
- 交易只支持 CNY。首次提交、重放和待核对严格按设计定义。若无法履行数据库或角色安装前提，交付记录挂起 v2，不增加 v1 写 fallback。
- J1–J6 可与前端 B–D 并行，J7 消费已通过测试的 Java schema 和 D4，J8 汇合。原 Java 各项目有各自 Gradle wrapper，命令从相应项目目录运行。前端 production E2E 的每次 RED/GREEN 都按当前源码构建对应产物，真实联调只使用已核对的两个 Git SHA。

## 评审关注点

| 触发                                                 | 预期                                              | 任务       |
| ---------------------------------------------------- | ------------------------------------------------- | ---------- |
| 错误 issuer/audience，浏览器拿到 OAuth 路径，绕行 v1 | 不暴露 token，旧路径不可写，外部资源不可读        | J1、J7、J8 |
| 最后一件、重复 submit、预留响应丢失、订单进程重启    | 一次库存变化、原订单恢复或明确待核对              | J3–J5      |
| worker 延迟返回时启动补偿                            | fence 阻止旧 worker 完成，晚 reserve 不会再占库存 | J5         |
| Kafka 处理、提交和确认任一点失败或 replay            | v2 释放最终成功且不影响其他订单预留               | J6、J8     |
| 取消后回退 v2 intake，管理后读到缓存旧值             | 已有 v2 可继续取消，公共刷新读到新标题            | J2、J6、J8 |

## Task J1 · 受控联调环境与授权入口（Java）

**文件** `demo/compose.yaml`、`demo/keycloak/realm.json`、`demo/seed/catalog.sql`、`demo/README.md`、`catalog/build.gradle.kts`、`order/build.gradle.kts`、两服务 `src/main/resources/application-demo-integrated.yml`、`CAT/interfaces/rest/security/DemoSecurityConfiguration.java`、`ORD/interfaces/rest/security/DemoSecurityConfiguration.java`、两服务 `interfaces/rest/DemoSecurityTest.java`。

**消费** 现有 Java 配置与 Gradle 服务模块。**产出** `demo-integrated` profile、OIDC claims 及 service identity、fresh volume 的 Compose 基础配置。

- [ ] 在 README 记录 Java/Gradle 和现有依赖启动证明。按原项目说明从 seedwork、shared-events 分别 `./gradlew publishToMavenLocal`。Catalog/Order 各自在模块工作目录运行原 `./gradlew test`。列出需要 Docker 的任务与实际状态。
- [ ] 写 Spring MockMvc 集成测试，无 token、wrong iss/aud、过期、普通用户打 internal/admin、legacy v1 写均拒绝。public GET 可达。缺少安全配置拒绝启动。验证至少一条真 IdP 签名 token，不以 mocked JwtDecoder 代替 issuer/audience 校验。
- [ ] 新 profile 初始化最小 Keycloak realm（两个顾客、管理员、独立 Order service client）。固定 issuer，Java 用内部 JWKS 与外部 issuer 校验。防止 role or client 伪造。配置 PostgreSQL/Redis/Kafka/Registry/现有读模型和仅必要暴露的端口，设置 Order scheduler relay，初始化共享事件 topics/schema。Flyway 后由一次性 seed job 插入 13+ 固定 ID、两分类、CNY 独立最后一册的 SKU。INSERT 冲突保留持久数据，重复 seed 不复位。真实版创建可取消订单通过真实旅程。不映射 Java 容器端口到浏览器。
- [ ] 两服务 `./gradlew test --tests '*DemoSecurityTest'` 和 `docker compose -f demo/compose.yaml config`。服务起好后给出可达性与真实非法 token 拒绝证据。验证空库两次 seed 数量、库存、title/version 稳定。为已有 v1 单独记录在隔离本机通过创建书接口或受控 SQL 导入同一目录数据及查询的命令。提交 `feat: isolate authenticated bookstore demo profile`。

## Task J2 · 稳定目录及版本编辑（Java）

**文件** `CAT/interfaces/rest/v2/BookV2Controller.java`、`CAT/application/query/book/ListBooksV2Query.java`、`CAT/application/command/book/UpdateBookTitleV2Command.java`、`CAT/infrastructure/repository/jpa/BookJpaRepository.java` 与实体/适配器、`catalog/contracts/catalog-v2.yaml`、`catalog/src/test/java/com/example/catalog/interfaces/rest/BookV2ControllerTest.java`。

**消费** J1 的 principal 和 path ACL。**产出** `GET /api/v2/books`、详情、categories、admin GET/PATCH，兼容 v1。

- [ ] 写 13+ 条 seed、页 1/2 与 page=100、重复标题、q 包含 `%_\`、不存在详情、普通用户 PATCH 403、竞态同 version 越权/冲突。冻住一个写事务以证明另一个不能覆盖库存/标题。先跑 `cd catalog && ./gradlew test --tests '*BookV2ControllerTest'`。
- [ ] 目录读权威 JPA，按 id 排序做 lookahead，保留 1-based page 快照。不使用 v1 Redis 缓存。复用基线 V0100 的 version 与 BookJpaEntity 的 @Version，审计有关行的 writer。编辑只改变 title，expectedVersion 以同事务锁/CAS 校验。`DEMO_V2_ADMIN_WRITES_ENABLED=false` 仅禁 PATCH。保持旧 DTO。
- [ ] 提交 OpenAPI 3.1 原件，发布测试使用排序、分页、响应版本及稳定错误码。验证空库和基线历史库无需新增 version 列即可迁移启动。测试通过即提交 `feat: add versioned catalog demo API`。

## Task J3 · Java 报价与持久提交契约（Java）

**文件** `ORD/interfaces/rest/v2/CheckoutV2Controller.java`、`ORD/application/command/order/{QuoteOrderV2,SubmitOrderV2}.java`、`ORD/infrastructure/repository/jpa/{OrderQuoteJpaEntity,OrderSubmissionJpaEntity}.java` 及 repositories、`ORD/infrastructure/client/CatalogCheckoutHttpClient.java`、`CAT/interfaces/rest/v2/CheckoutInventoryController.java` 快照路由、`order/src/main/resources/db/migration/V0104__checkout_submissions.sql`、`order/contracts/order-v2.yaml`、`order/src/test/java/com/example/order/component/CheckoutSubmissionTest.java`。

**消费** J1 身份与 J2 Book 价格/读库。**产出** 报价快照、原子接受 `submit(owner,quoteId,key)`，`getSubmission(owner,id)`。本阶段提交状况为 PROCESSING，worker 在 J5 接线。

- [ ] 对 PG 写失败测试：固定 CNY 折扣及舍入（5×4900 加 1×31000，最终 50397 分）、USD 和不安全整数拒绝、过期/外部 quote、三个 unique 冲突场景（同 key/同报价同 ID，其余两类 409）。另模拟持久化后丢响应，切 `DEMO_V2_INTAKE_ENABLED=false`，同一 key 可取原 202，新 key 无现有记录则 503 INTAKE_CLOSED。分别核验经证实的邮箱和严格请求字段。命令 `cd order && ./gradlew test --tests '*CheckoutSubmissionTest'`。
- [ ] 使用内部 service-token 快照报价，保存规范化 lines、价格和已核验总价、owner、expiry。事务内按唯一约束原子接受提交，生成稳定 ID，记录 retry/lease、owner、已验证 email、quoteId 和冻结的报价项/金额。唯一冲突回滚后读取获胜行，owner/key 已存在的正确重放先于有效期与停接单门禁，只有新记录受门禁。
- [ ] 用业务角色和 `sub` 绑定行为，严格区分 POST quote 201、POST submit 202（包括重放）和 owner 范围 GET submission 200。测试确认提交尚未扣库存，保留下一任务执行边界。提交 `feat: persist authoritative quotes and checkout submissions`。

## Task J4 · 批量原子预留和补偿（Java）

**文件** `CAT/interfaces/rest/v2/CheckoutInventoryController.java`、`CAT/application/command/book/CheckoutReservationService.java`、`CAT/infrastructure/repository/jpa/CheckoutReservationRepository.java`、`catalog/src/main/resources/db/migration/V0102__checkout_reservations.sql`、`catalog/src/test/java/com/example/catalog/component/CheckoutReservationTest.java`、catalog OpenAPI。

**消费** J2 版本和共用锁约定，J3 规范化 item/price DTO。**产出** `reserve(submissionId,items)` 与 `release(submissionId)` 的幂等原子结果。

- [ ] 在 PG/Testcontainers 写并发 barrier：两个 submit 争最后一册，第二条缺货整批回滚，两次同 ID 同 payload 不重复扣，异 payload 409，释放先于预留/预留先于释放均无剩余扣减，管理员改标题和同书预留并发保留双方结果。
- [ ] 先插入或取得唯一预留行并锁定，锁书籍集合按 UUID，记录 HELD/REJECTED/RELEASED 及 hash。用同一唯一约束原子处理无记录时的 tombstone。服务身份限制到内部接口。不吞业务/数据库失败。预留结果给出构造订单所需的可信 payload，避免再按已减少库存判错。
- [ ] `cd catalog && ./gradlew test --tests '*CheckoutReservationTest'` 与旧 profile 测试通过。提交 `feat: reserve and release checkout inventory atomically`。

## Task J5 · 提交 worker 和故障后恢复（Java）

**文件** `ORD/application/command/order/ResolveCheckoutSubmission.java`、`ORD/infrastructure/jobs/CheckoutSubmissionWorker.java`、`ORD/infrastructure/client/CatalogCheckoutHttpClient.java`、`ORD/interfaces/event/OrderPlacedAutoConfirmListener.java`、订单 JPA 与 `order/src/main/resources/db/migration/V0105__order_reservation_protocol.sql`、`order/src/test/java/com/example/order/component/CheckoutRecoveryTest.java`、`demo/recovery.md`。

**消费** J3 submission、J4 reserve/release。**产出** `claimDue(now)`、`finish(id,fence,result)`、`beginCompensation(id,fence)`、`resume(id)` 和可审计操作入口。

- [ ] 注入 Catalog commit 后响应丢失、挂起 socket 及订单提交后断连。重启后不带用户 session/token 消费既有已验证邮箱和报价，数据库观察同一 hold/订单/outbox 只生成一次，响应/日志无邮箱。测试过期 lease、超预算后仍可用原 ID恢复、补偿前故障和 fence 之后的迟到 worker。先执行 `cd order && ./gradlew test --tests '*CheckoutRecoveryTest'`。
- [ ] claim 后释放 DB 锁再 RPC，token+HTTP ≤4 秒，lease 10 秒。按设计持久化尝试及退避。先持久化订单协议 provenance，使用已有订单 id/customer_id/version 映射。处理确认预留后同事务存聚合、Outbox、结果。终止流程先 durable fence，再释放 tombstone，完成后标记确定拒绝。保留真正未知的状态并出日志/指标。
- [ ] 集成 profile 禁用 legacy auto-confirm，接受报价的价格与折扣来自冻结快照。取消/确认仍在原 profile 按既有测试流程。通过故障 tests 记录观测和恢复 CLI/手工操作步骤。提交 `feat: recover committed and interrupted order submissions`。

## Task J6 · 私域读取与可靠取消（Java）

**文件** `ORD/interfaces/rest/v2/MyOrdersV2Controller.java`、`ORD/application/command/order/CancelOrderV2Command.java`、`ORD/infrastructure/repository/jpa/OrderJpaRepository.java`、`ORD/infrastructure/messaging/outbox/OrderOutboxMapper.java`、`order/src/main/resources/db/migration/V0106__order_owner_read_index.sql`、`CAT/interfaces/messaging/consumer/{OrderEventConsumer,OrderCancelledHandler}.java`、`shared-events/src/main/avro/com/example/events/v1/OrderCancelled.avsc`、`shared-events/{build.gradle.kts,helm/scripts/register-schemas.sh}`、两服务 Gradle 与相应测试与 `e2e/src/test/java/com/example/e2e/OrderV2CancellationE2ETest.java`、`demo/compose.yaml` 的 verify runner。

**消费** J2/J4 Catalog 安全 writer，J5 v2 订单/Outbox。**产出** 本人列表/详情/取消，带默认值的 reservationProtocol 及可靠释放。

- [ ] 并发 owner/version、他人 404、查询 read-your-write、跨版本 schema 解码和 outbox 对照。在旧 Registry volume 上运行 schema 初始化之后启用新 writer，检查新 ID、旧 schema 兼容和真实 cancel。另在消费者制造 release 失败/断连/重放，确认消息只在 DB 提交后 ack。关闭 v2 新提交后仍取消已存在 v2 订单，同一书的 legacy 预留不受影响。
- [ ] 使用 Java 设计规定的 v2 DTO、owner 过滤和已有 JPA version，添加 `orders(customer_id,id)` 索引。使用 J5 已持久化的标记，不在这一阶段补写订单 provenance。取消与 outbox 同事务。明确 v2 provenance，先向已有 subject 提交目标 schema 的兼容性检查，再注册并核对 schema ID 与内容。修正初始化脚本按 schema 内容判断是否已注册，仅查 subject 存在不足。随后部署消费者，再启用 v2 producer。v2 release 分支单独走 `processSimple`，异常必须传播且重投。验证 broker 的 error handler 不把暂态失败当“已恢复”而推进 offset。v1 profile 保留原测试，禁止回退消费者接管 v2 DB/群组。
- [ ] 将 shared-events 发布为新的本地/CI 版本（候选 0.1.1），catalog/order 显式锁到同一产物并重建。用隔离 Maven Local 或 CI 仓库。先 `(cd shared-events && ./gradlew test publishToMavenLocal)`，随后 catalog 与 order 各跑 `./gradlew test`，检查依赖解析版本。`docker compose -f demo/compose.yaml --profile verify run --rm e2e ./gradlew test --tests '*OrderV2CancellationE2ETest'` 在 Compose 私有网络执行（工作目录 /repo/e2e，显式传 Catalog、Order、IdP 地址和测试 token fixture），对真实消息链通过，记录 Kafka topic、单次库存变动与重投证据。提交 `feat: authorize order queries and release v2 inventory reliably`。

## Task J7 · Next.js 真实身份与适配器（前端）

**文件** `contracts/java/{catalog-v2,order-v2}.yaml` 及生成目录、`src/server/adapters/java/{catalog-v2,checkout-v2,orders-v2,book-management-v2}.server.ts`、`src/server/auth/oidc.server.ts`、`src/app/api/auth/[...all]/route.ts`、已有功能装配层、`src/server/config/runtime.server.ts`、`test/integration/java-v2-adapters.test.ts`、`test/e2e/oidc-boundaries.spec.ts`。

**消费** J1–J6 的受验证契约与 D4 前端功能。**产出** `JAVA_CONTRACT=v2-integrated`、授权 scope 与 server-only bearer adapter。v1 继续只读。

- [ ] 用可编程 HTTP stub 验证 v2 的 202→PLACED、终态重放仍 202、view DTO 金额与明细单位、非法 state/order 组合、未知订单、并发、超时、409 错误码、price/currency 映射，模拟身份错误无 fallback。对带真实 session 的 token/refresh/link/list-account 路径要求 404 且无凭证，服务器内部刷新仍有效。
- [ ] 将 Java schema 以完整 SHA 固定并生成客户端。请求逻辑复用前端端口，Java 真实 BFF 不重算交易。代理只转发 server-held bearer、目标路径的受信 id 和有界 trace，禁止接受浏览器客户或价格字段。v2 仍转发停接单状态下的合法原 key 重放，不在 BFF 用通用能力开关截断已有提交。
- [ ] Better Auth 对浏览器使用精确方法/路径 allowlist。令牌及 DB 初始化放在 Node 服务器。`/api/v1/session` 输出最小展示信息，注销撤销本地会话，登录携带 `prompt=login`。J8 用同一真实浏览器 A→注销→B，再测 Back 与旧标签恢复。前端缓存和路由在身份变化后清理。J1 真 token 验证至同一授权链。
- [ ] `pnpm api:generate && pnpm check && pnpm test && pnpm build`，生产运行 release 的 auth boundary E2E。更新两个 SHA 与 Java 安全配置准入。提交 `feat: connect storefront to authenticated Java v2 APIs`。

## Task J8 · 双仓真实演示与回退证明（前端与 Java）

**文件** 两仓 `demo/README.md` 的运行说明、前端 `test/e2e/integrated-java.spec.ts`、`docs/integration/backend-capability-matrix.md`、`docs/integration/demo-evidence.md`。

**消费** J7、D4。发布容器构建在 E1。**产出** fresh volumes 的 Compose 运行及可复现集成验收。

- [ ] 用部署文档启动，两 Java 服务、IdP、依赖和 Next，探测 liveness/readiness。对真实用户旅程记录目录→购物车→202→订单→取消→最终库存，以及管理员编辑后首次公开读取。验证他人订单、错误 token、预留超时后重放、丢失 POST 响应后停接单仍可经 BFF 重放、停接单只拒绝新单并保留既有订单取消。
- [ ] `pnpm exec playwright test integrated-java.spec.ts --project=integrated-java` 需真实 endpoint 与通过结果。执行时通过 env 输入密钥。另测 default v1 只读与 demo 两套路径。日志、trace、请求等出示脱敏证据和双方 SHA。
- [ ] 更新能力矩阵和 README，按“源码”“stub”“真实联调”标注。若依赖或验证失败，列明失败命令与阻塞，功能验收保持待验证。已存在 v2 订单及其取消靠兼容 consumer 继续服务，回退仅关闭新接单和管理修改，保留现有 key 重放与取消，继续使用 v2 兼容 consumer。提交 `docs: verify the dual-repository bookstore demo`。
