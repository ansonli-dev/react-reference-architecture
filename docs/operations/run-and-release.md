# 运行与发布手册

本项目提供可独立运行的购书 demo 和只读目录的发布构建。使用 Node 24、pnpm 11.25.0 和锁文件，验证环境固定用 Node 24.15.0。

|                | 演示 `demo`                          | 发布 `release`             |
| -------------- | ------------------------------------ | -------------------------- |
| 数据           | 独立 SQLite 种子                     | 运行环境配置的目录服务     |
| 目录能力       | 分类、关键词、分页、详情             | 分类、分页、详情           |
| 购书能力       | 购物车、演示下单、本浏览器的订单记录 | 只读目录                   |
| 开发           | `pnpm dev:mock`                      | `pnpm dev:real`            |
| 生产构建、启动 | `pnpm build:demo`、`pnpm start:demo` | `pnpm build`、`pnpm start` |
| 产物           | `.next-demo/`                        | `.next/`                   |

两个模式的 `/en` 与 `/zh-CN` 都重定向到对应语言的书籍目录。目录在运行时读取数据，构建可独立执行。启动后，`GET /api/health` 返回进程存活状态，`GET /api/ready` 会实际读一次目录。数据源缺失、不可读或配置不合法时，就绪返回 503 与有限的原因码；进程健康仍可返回 200。已知语言的未匹配路径返回本地化 HTTP 404。书籍详情流式缺失时响应头可能已是 200，同一书号的 BFF 响应仍是 404。

## 配置

| 环境变量                  | 用途                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PORT`                    | 服务端口，默认 3000。演示模式和开发命令监听回环；发布 `start` 默认监听 `0.0.0.0`，可用 `BOOKSTORE_HOST` 指定地址。 |
| `APP_ORIGIN`              | 前端完整 origin，默认 `http://127.0.0.1:3000`。改变访问端口或外部域名时一起设置；演示模式只接受本机 origin。       |
| `DEMO_DATA_DIR`           | 演示模式 SQLite 数据目录的绝对路径。种子命令和前端进程都需收到这个变量。                                           |
| `CATALOG_CATEGORIES_JSON` | 发布模式目录筛选选项，例如 `["Architecture","Engineering"]`，默认空数组。                                          |

发布模式的目录服务地址与服务端凭据从运行环境读取，配置项见 [环境变量模板](../../.env.example)。

按 [README](../../README.md#本地启动) 在干净检出执行冻结安装、导出数据目录、种子和开发启动。访问 `/zh-CN/books`，或从另一终端用 `curl -fsS http://127.0.0.1:3000/api/v1/catalog/books` 核对只读结果。

旧版 demo 数据用同一个 `DEMO_DATA_DIR` 重跑 `pnpm demo:seed`，即可应用最新的表结构迁移。种子只补缺失的书籍，已有书目、库存及订单会保留。购物车和订单以浏览器的 `bookstore-shopper` Cookie 区分，使用同一个浏览器和访问域名即可继续试用。结算按币种生成订单，库存和订单在同一 SQLite 事务写入。URL 端口与 `APP_ORIGIN` 要一致，例如 `PORT=3001 APP_ORIGIN=http://127.0.0.1:3001 pnpm dev:mock`。

书籍目录按 1–100 页分页，每页最多 12 本。发布构建收到满页且未达上限时，会在同一个 2 秒截止时间内查询下一页。下一页有书时才显示翻页链接。对公开缓存范围和时间的说明见 [ADR 0002](../adr/0002-public-reads-and-cache.md)。

故障日志中 `event=catalog.read_failed` 记录固定的目录入口、请求 ID、分类状态与耗时。用 BFF 响应里的 `error.requestId` 搜索同一个 ID；页面降级事件按入口和时间定位。页面日志的 `status` 是分类状态，流式 HTML 可能已经发出 200。运行时凭据不进入这些记录。

## 固定 Linux 验证环境

宿主限制 Turbopack 子进程绑定端口时，用下列命令从已提交前端源码运行双档生产 Chromium。镜像与视觉入口使用相同的固定 Linux ARM64 Playwright 环境。

```bash
frontend_sha=$(git rev-parse HEAD)
playwright_image='mcr.microsoft.com/playwright:v1.65.1-noble@sha256:56be08aca06bf736a928da2e3235a3b63ef71ee97313beb18c6019fea791aba4'
git archive "$frontend_sha" | docker run --rm -i --init --ipc=host --platform linux/arm64 \
  -e NEXT_TELEMETRY_DISABLED=1 -w /project "$playwright_image" bash -euc '
    tar -xf -
    npm install --prefix /opt/bookstore-tools --no-audit --no-fund node@24.15.0 pnpm@11.25.0
    export PATH="/opt/bookstore-tools/node_modules/.bin:$PATH"
    pnpm install --frozen-lockfile
    pnpm build
    pnpm build:demo
    pnpm test:e2e
  '
```

从包含 Git 元数据的工作区运行 `bash scripts/test-visual.sh` 可复验截图基线。

更新 Node 或 pnpm 后，同步 `.nvmrc`、`package.json`、锁文件、固定验证环境和镜像基础层。重新跑冻结安装、peer、类型、Lint、格式、架构与生成检查、Vitest、双档生产构建、Chromium、视觉、参考镜像烟测和两版本回滚。[分层测试命令](../testing-strategy/README.md#运行入口)

## 构建并运行发布镜像

从要发布的干净 Git 检出构建。镜像以 Git SHA 命名，同时写入 OCI revision。运行镜像以非 root 用户从 3000 端口执行 `pnpm start`，不需要在启动时安装任何依赖。

```bash
bash scripts/test-release.sh
release_sha=$(git rev-parse HEAD)
docker build --label "org.opencontainers.image.revision=$release_sha" -t "bookstore:$release_sha" .
docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "bookstore:$release_sha"
```

烟测在内部 Docker 网络启动仓库自带的目录替身，核对发布镜像的健康、就绪、双语目录、静态资源与同源 BFF。下例从回环访问发布镜像，`$release_env_file` 提供运行配置，`$catalog_network` 是部署网络。

```bash
docker run -d --name bookstore-current --network "$catalog_network" \
  --env-file "$release_env_file" -p 127.0.0.1:3000:3000 "bookstore:$release_sha"
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
curl -fsS http://127.0.0.1:3000/api/v1/catalog/books
```

等就绪返回 200 再接流量。保留本次和上一版本的镜像引用，记录各自的 SHA 与镜像 ID。

## 切回上一版本

将 `$previous_sha` 设为上一版本已记录的 Git SHA。用相同配置先在另一个端口验证该镜像：

```bash
docker run -d --name bookstore-restore-check --network "$catalog_network" \
  --env-file "$release_env_file" -p 127.0.0.1:3001:3000 "bookstore:$previous_sha"
curl -fsS http://127.0.0.1:3001/api/ready
curl -fsS http://127.0.0.1:3001/api/v1/catalog/books
```

在有反向代理的环境，把稳定入口切到已就绪的上一版本；直接绑定回环端口的参考部署可停下当前容器并把原端口绑定回上一版本：

```bash
docker stop bookstore-current
docker run -d --name bookstore-restored --network "$catalog_network" \
  --env-file "$release_env_file" -p 127.0.0.1:3000:3000 "bookstore:$previous_sha"
curl -fsS http://127.0.0.1:3000/api/ready
curl -fsS http://127.0.0.1:3000/api/v1/catalog/books
test "$(docker inspect --format '{{.Image}}' bookstore-restored)" = \
  "$(docker image inspect --format '{{.Id}}' "bookstore:$previous_sha")"
docker rm -f bookstore-restore-check
```

验证相同入口的就绪、目录响应和容器镜像 ID 后记录切回结果。本仓的演练用前一个可构建提交和当前候选在隔离网络复现该流程。正式部署须先有上一版本产物才能切回。
