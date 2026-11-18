# React Reference Architecture

「页间书店」是一个 React 前端架构参考实现，展示如何按业务组织代码、在服务端渲染页面，并通过同源 BFF 完成浏览目录、加购、报价、下单和查看订单。

## 本地启动

使用 Node 24 和 pnpm 11.25.0。在仓库根目录初始化 SQLite 演示数据并启动前端。

```bash
pnpm install --frozen-lockfile
export DEMO_DATA_DIR="$PWD/.bookstore-demo"
pnpm demo:seed
pnpm dev:mock
```

打开 [中文书籍目录](http://127.0.0.1:3000/zh-CN/books) 或 [英文书籍目录](http://127.0.0.1:3000/en/books)。

## Java 集成

发布构建接入真实的 Java v1 目录和订单 API。读者通过 Keycloak 登录，BFF 在 PostgreSQL 中保存账户的购物车草稿。配置和启动方式见 [Java 集成手册](docs/operations/run-and-release.md#java-集成)。

![页间书店目录](docs/screenshots/catalog.png)

[架构与开发文档](docs/README.md) · [API 契约](contracts/java/README.md) · [测试入口](docs/testing-strategy/README.md#运行入口)
