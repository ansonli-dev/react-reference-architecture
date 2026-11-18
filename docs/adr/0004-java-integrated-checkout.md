# ADR 0004 Java 集成结算

已采用，2026-11-18。

发布构建按运行环境装配 Java v1 只读目录或 Java v2 集成书店。语言布局、路由和同源接口沿用相同的入口。依赖运行环境或会话的组件在请求到达后于 `Suspense` 内渲染，发布产物可在无服务凭据的环境构建。

- Java Catalog v2 提供公开目录。BFF 每次读取实时结果，使库存和管理员修改可在下一次读取时显示。
- Keycloak 管理登录。BFF 通过私有 PostgreSQL 会话关联 JWT 主体和令牌，浏览器接收不透明的 HttpOnly Cookie。
- BFF 保存每个主体的购物车草稿。每次实际数量变化生成新的行版本，用于 ETag 和结算清理。Java Order 管理报价、提交、订单明细和取消。
- BFF 创建报价时保存请求中的行版本。读取成功的提交后，BFF 在同一 PostgreSQL 事务内标记该提交并删除版本仍相同的购物车行，并发修改会保留。已知的待处理提交可以在打开购物车时重新查询，丢失提交响应时可用原报价和幂等键重试。

[运行配置](../operations/run-and-release.md#java-v2-集成) · [BFF 契约](../../contracts/bff/v1.yaml)
