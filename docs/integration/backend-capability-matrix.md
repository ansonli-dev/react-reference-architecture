# Java 后端能力矩阵

核对日期为 2026-11-17。源码基线为 [explicit-architecture@14e511a](https://github.com/ansonli-dev/explicit-architecture/tree/14e511a8f361616e166f23daf5184012d501c656)。本页是源码勘察记录，当前阶段尚未启动 Java 环境，也未取得 HTTP 集成验收证据。

| 能力                 | 源码确认的传输契约                                                                                                                    | 前端决策与待验证条件                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 书籍列表             | `GET /api/v1/books?category=&page=0&size=20`，响应为 `BookSummaryResponse[]`，分类按原值匹配，查询未声明排序                          | 真实模式候选。浏览器页码从 1 开始，适配器转换为 0-based。缺少总数、稳定排序、全量关键词检索与分类枚举。真实模式按原值筛选并使用按页浏览语义，不承诺稳定遍历。在受控数据上实测首尾页         |
| 书籍详情             | `GET /api/v1/books/{id}`，UUID。字段为 `id,title,author,category,priceCents,currency,stock`                                           | 真实模式候选。校验响应类型、整数安全范围和缺失书籍的实际 HTTP 状态。价格/库存为观察值。封面资源使用项目内的通用占位图                                                                       |
| 库存查询             | `GET /api/v1/books/{id}/stock`，返回 `bookId,availableStock`                                                                          | 源码确认，仅作为未来真实交易集成证据。BFF 无公开预留或释放库存入口                                                                                                                          |
| 创建订单             | `POST /api/v1/orders` 返回 201。请求含 `customerId,customerEmail,items[]`，每项含 `bookId,bookTitle,unitPriceCents,currency,quantity` | 教学模式实现。处理器从请求构造价格快照，再执行折扣、查库存和预留。未发现可信身份绑定、权威重新报价或写入幂等契约。禁止仅转发用户字段或靠 BFF 重试补足真实下单契约                           |
| 订单列表与详情       | `GET /api/v1/orders?customerId=<uuid>&status=&page=0&size=20` 返回数组。`GET /api/v1/orders/{id}` 返回详情，含客户邮箱与明细          | 教学模式实现。详情按订单号读取，控制器没有把订单绑定到经过认证的调用者。查询依赖异步 Elasticsearch 读模型，部分异常分支返回空结果。真实模式需先证实身份传播、对象级授权及可区分的读视图故障 |
| 取消订单             | `PUT /api/v1/orders/{id}/cancel` 请求 `{reason}` 返回 204。命令由订单 ID 和 reason 构成。发货或已取消的状态会拒绝。库存通过事件释放   | 教学模式实现。真实模式需后端授权与并发语义，后端取消回执与目录库存恢复不能推断为同步                                                                                                        |
| 管理编辑             | `PUT /api/v1/books/{id}` 接受 title、authorName、authorBiography、priceCents、currency、restockQuantity 等可空字段                    | 教学模式实现最小标题编辑。源码未提供前端可消费的版本前置条件或已验证的管理员身份契约。真实模式需核实权限与丢失更新保护                                                                      |
| 登录、结算、分类配置 | 当前勘察范围未找到可直接使用的浏览器会话、报价资源、收货信息或分类枚举契约                                                            | 教学会话、报价及双语界面是项目自身模型。真实 OIDC 示例独立于 Java 订单授权，真实分类可选值由部署配置提供                                                                                    |

源码依据：

- [BookQueryController](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/java/com/example/catalog/interfaces/rest/BookQueryController.java#L20-L45) 与 [BookJpaRepository](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/java/com/example/catalog/infrastructure/repository/jpa/BookJpaRepository.java#L13-L16)。
- [目录服务配置](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/resources/application.yml#L45-L53) 声明默认 8081 端口及 `/v3/api-docs`。
- [OrderCommandController](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/order/src/main/java/com/example/order/interfaces/rest/OrderCommandController.java#L18-L39) 和 [PlaceOrderCommandHandler](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/order/src/main/java/com/example/order/application/command/order/PlaceOrderCommandHandler.java#L32-L95)。
- [OrderQueryController](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/order/src/main/java/com/example/order/interfaces/rest/OrderQueryController.java#L16-L33) 和 [OrderSearchAdapter](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/order/src/main/java/com/example/order/infrastructure/repository/elasticsearch/OrderSearchAdapter.java#L29-L49)。
- [CancelOrderCommandHandler](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/order/src/main/java/com/example/order/application/command/order/CancelOrderCommandHandler.java#L20-L30) 与 [Order.cancel](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/order/src/main/java/com/example/order/domain/model/Order.java#L143-L155)。
- [BookCommandController](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/java/com/example/catalog/interfaces/rest/BookCommandController.java#L25-L56) 与 [UpdateBookRequest](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/java/com/example/catalog/interfaces/rest/request/UpdateBookRequest.java)。
- [目录 HTTP 测试](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/test/java/com/example/catalog/interfaces/rest/BookQueryControllerTest.java) 和 [订单端到端测试目录](https://github.com/ansonli-dev/explicit-architecture/tree/14e511a8f361616e166f23daf5184012d501c656/e2e/src/test/java/com/example/e2e) 提供后续核验入口。

真实目录验收需记录 Java commit、运行配置、seed 来源、OpenAPI 差异、实际请求/状态与脱敏样例、前端适配器和页面通过证据。Java 环境不可用时，保留源码确认状态并在发布记录列明阻塞。本地 HTTP stub 证据单列。私有能力的新增端点与验收方式见[Java 教学集成设计](../superpowers/specs/2026-11-17-java-demo-integration-design.md)。上表只描述基线版本。

## A1 目录源码复核

在固定 SHA `14e511a8f361616e166f23daf5184012d501c656` 上复核控制器、两个响应 record 与 JPA 查询。列表和详情都有相同的 7 个字段。两个 record 的 `priceCents` 为 Java `long`，`stock` 为 `int`。列表从第 0 页开始，`category` 使用精确匹配，查询没有排序子句。前端 v1 兼容范围为公开只读列表与详情，分类可选值由前端部署配置提供。

证据状态为源码确认，真实 Java HTTP 待验。

- [BookSummaryResponse](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/java/com/example/catalog/interfaces/rest/response/BookSummaryResponse.java)
- [BookDetailResponse](https://github.com/ansonli-dev/explicit-architecture/blob/14e511a8f361616e166f23daf5184012d501c656/catalog/src/main/java/com/example/catalog/interfaces/rest/response/BookDetailResponse.java)
