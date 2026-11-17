# React Reference Architecture

基于 Next.js App Router 的在线书店参考实现。首个可运行切片包含中英文书籍目录、分类、分页、教学版关键词搜索与书籍详情。页面由服务端渲染，BFF 复用同一目录 reader。

## 运行教学目录

使用 Node.js 24 LTS 和 `package.json` 指定的 pnpm 11.25.0。可用 Corepack 启用 pnpm，也可参考 [pnpm 安装指引](https://pnpm.io/installation)。

```bash
pnpm install --frozen-lockfile
export DEMO_DATA_DIR="$PWD/.bookstore-demo"
pnpm demo:seed
pnpm dev:mock
```

打开 [书籍目录](http://127.0.0.1:3000/zh-CN/books) 或 [英文目录](http://127.0.0.1:3000/en/books)。种子在指定目录创建 SQLite 数据库，重复执行保留已有记录。教学服务器绑定 `127.0.0.1`。可以通过 `PORT` 指定端口。

在同一环境下可用 `pnpm build:demo` 和 `pnpm start:demo` 重放生产教学产物。发布和教学构建分别输出到 `.next` 和 `.next-demo`，同一检出内串行构建。

## Java v1 只读模式

`pnpm dev` 与 `pnpm dev:real` 启动发布配置的开发服务器。`pnpm build` 和 `pnpm start` 用于发布构建。要读取 Java v1，按 [环境变量示例](.env.example) 设置 `JAVA_CATALOG_BASE_URL` 与可选的原值分类数组。前端适配已通过本机 HTTP stub，真实 Java 的 HTTP 验收仍待联调。

`GET /api/health` 检查进程是否存活。`GET /api/ready` 探测已配置的数据源，缺失或不可用时返回 503 和安全原因。两套构建均可在没有 Java、IdP 和 SQLite 的环境中生成。

## 验证

```bash
pnpm exec playwright install chromium --only-shell
pnpm peers check
pnpm api:check
pnpm check
pnpm test
pnpm build
pnpm build:demo
pnpm test:e2e
```

Playwright 对现有生产产物启动隔离实例。只调试开发外壳时可执行 `BOOKSTORE_E2E_DEV=1 pnpm test:e2e shell.spec.ts`。

## 阅读顺序

- [书籍目录 walkthrough](docs/walkthroughs/01-catalog.md)
- [Java 能力与验证矩阵](docs/integration/backend-capability-matrix.md)
- [Superpowers 设计与实施计划](docs/superpowers/README.md)
- [建设指导书](docs/project-guide.md) 与 [工程基线 ADR](docs/adr/0001-application-baseline.md)

购物车、结算、订单与管理属于后续切片。J7–J8 在 Java v2 契约交付后联调。
