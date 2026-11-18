# 运行与发布手册

本地体验书店用演示模式。验证账户登录、真实库存或异步订单用发布模式。两者共用页面与同源接口，各自构建、各自启动。使用 Node.js 24 和 pnpm 11.25.0。

| 运行方式 | 数据和身份                   | 开发            | 生产构建与启动                        |
| -------- | ---------------------------- | --------------- | ------------------------------------- |
| 演示     | 本地 SQLite、浏览器会话      | `pnpm dev:mock` | `pnpm build:demo` → `pnpm start:demo` |
| 发布     | 外部目录与订单服务、登录账户 | `pnpm dev:real` | `pnpm build` → `pnpm start`           |

演示产物在 `.next-demo/`，发布产物在 `.next/`。启动命令会核对产物记录的模式。遇到 `Expected a … build` 时，在同一工作目录运行该模式的构建命令。连接地址和凭据由进程在运行时读取。[启动脚本](../../scripts/run-app.mjs) · [产物检查](../../scripts/build-profiles.mjs)

## 本地演示

在前端仓库根目录安装依赖、初始化书目并启动前端。

```bash
pnpm install --frozen-lockfile
export DEMO_DATA_DIR="$PWD/.bookstore-demo"
pnpm demo:seed
pnpm dev:mock
```

打开[中文目录](http://127.0.0.1:3000/zh-CN/books)或[英文目录](http://127.0.0.1:3000/en/books)。购物车和订单按浏览器 Cookie 隔离，按币种结算，下单和扣库存由同一 SQLite 事务完成。

再次运行时沿用原来的 `DEMO_DATA_DIR`。种子命令会执行缺少的迁移，并按书籍 ID 补齐种子书目。需要恢复初始库存时，选择一个新的空数据目录再运行种子命令。[种子脚本](../../scripts/demo-seed.mjs)

## 配置

| 变量             | 何时设置                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| `DEMO_DATA_DIR`  | 演示数据目录使用绝对路径。种子命令与前端进程使用同一目录。                                               |
| `PORT`           | 默认 3000。更换端口时同步调整浏览器地址和 `APP_ORIGIN`。                                                 |
| `APP_ORIGIN`     | 浏览器实际访问的 origin，默认 `http://127.0.0.1:3000`。用于同源写入校验和登录回调。                      |
| `BOOKSTORE_HOST` | 发布模式的 `pnpm start` 默认监听 `0.0.0.0`，可用此变量指定监听地址。开发服务和演示服务绑定 `127.0.0.1`。 |

例如用 `PORT=3001 APP_ORIGIN=http://127.0.0.1:3001 pnpm dev:mock` 启动后，浏览器也应访问 `http://127.0.0.1:3001`。端口、主机或协议不一致，都可能让页面可以打开、购物车写入却返回 `403`。[运行配置](../../src/server/config/runtime.server.ts) · [同源校验](../../src/server/http/origin.server.ts)

## Java 集成

**使用现成的联调环境。** 后端仓库的 Compose 和前端 overlay 一起启动目录、订单、登录服务、前端与数据库，并为新建的前端数据库初始化表结构。默认从同级的前端仓库构建，可通过 `BOOKSTORE_FRONTEND_DIR` 指向其他检出目录。按联调手册构建后端并启动环境，从 `http://localhost:3000` 访问前端，域名要与已注册的登录回调一致。[后端联调手册](https://github.com/ansonli-dev/explicit-architecture/blob/main/demo/README.md#frontend-handoff) · [接口契约](../../contracts/java/README.md)

**接入已有服务。** 在 BFF 专用 PostgreSQL 数据库执行会话和购物车建表脚本，将下列变量提供给前端运行进程。开发时执行 `pnpm dev:real`，运行已构建的发布产物时执行 `pnpm start`。[会话表](../../database/auth.sql) · [账户购物车表](../../database/cart.sql) · [环境变量模板](../../.env.example)

| 变量                                           | 运行时用途                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| `JAVA_CATALOG_BASE_URL`、`JAVA_ORDER_BASE_URL` | BFF 可访问的两个服务 origin，适配器自行拼接 API 路径。                                  |
| `AUTH_DATABASE_URL`                            | BFF 的 PostgreSQL 连接。会话令牌、账户购物车和报价行版本关联保存在此处。                |
| `APP_ORIGIN`                                   | 浏览器访问前端的 origin。回调注册为 `${APP_ORIGIN}/api/auth/oauth2/callback/keycloak`。 |
| `OIDC_ISSUER`                                  | 浏览器可达的公开 realm URL，也是令牌的签发者。                                          |
| `OIDC_INTERNAL_BASE_URL`                       | 可选。BFF 在独立网络内访问同一个 realm 的地址，默认取公开 issuer。                      |
| `OIDC_CLIENT_ID`、`OIDC_CLIENT_SECRET`         | BFF 的客户端 ID 和服务端密钥，默认 ID 为 `bookstore-bff`。                              |

回环联调可使用 HTTP。对外部署用 HTTPS 提供前端、公开 issuer 和内部 realm 地址。通过部署环境注入数据库连接与客户端密钥。浏览器持有会话 Cookie，BFF 在服务端换取令牌并携带用户凭据访问订单接口。[会话实现](../../src/server/auth.server.ts)

自建 realm 时配置已验证邮箱、读者角色和订单服务所需的令牌受众。启用注册、邮箱验证及密码重置后，配置 SMTP，安装书店登录主题，并把客户端 Home URL 设为书店根地址。Compose 使用 Mailpit 接收测试邮件。用隔离种子运行真实浏览器用例可以同时检查邮箱流程、账户草稿和异步订单。[本地收件箱](http://localhost:8025) · [真实联调用例](../testing-strategy/README.md#真实-java-与-keycloak-联调)

## 运行诊断

`GET /api/health` 检查前端进程能否响应。`GET /api/ready` 进一步解析运行配置，并通过当前适配器读取第一页目录。就绪失败时，响应 JSON 的 `reason` 给出下表的原因码。账户登录、会话数据库和订单提交由独立联调验证。[就绪路由](../../src/app/api/ready/route.ts) · [目录探测](../../src/server/catalog.server.ts) · [真实联调](../testing-strategy/README.md#真实-java-与-keycloak-联调)

| 现象                                     | 定位依据                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/ready` 返回 `503 CONFIG_INVALID`   | 核对当前模式要求的环境变量、origin 和 issuer 的格式，以及回环或 HTTPS 条件。                                                                                           |
| `503 CATALOG_NOT_CONFIGURED`             | 演示进程没有收到 `DEMO_DATA_DIR`。导出种子使用的绝对路径并重启。                                                                                                       |
| `503 CATALOG_UNAVAILABLE`                | 演示模式检查种子、数据库读权限和表结构版本。发布模式从 BFF 所在网络检查目录服务及其响应。                                                                              |
| 读取目录、创建或读取报价与提交时返回 5xx | 用响应中的 `error.requestId` 查服务端日志。目录事件为 `catalog.read_failed`，报价和提交事件为 `checkout.request_failed`。日志记录入口或操作、错误码、HTTP 状态和耗时。 |

已经开始流式返回的 HTML 可能保留 HTTP 200。定位页面故障时看界面反馈和对应入口日志。核对书籍是否存在时可直接查看详情 BFF 的 HTTP 状态。[目录日志](../../src/server/observability/catalog.server.ts) · [结算日志用例](../../test/unit/checkout-observability.test.ts)

## 构建并运行发布镜像

在要发布的干净检出中，先运行独立的镜像烟测。烟测使用目录替身验证双语目录、静态资源、探针和匿名购物车边界，并清理本次测试镜像。随后构建用于部署的镜像，以 Git SHA 标记版本并记录 OCI revision。[镜像烟测](../../scripts/test-release.sh) · [Dockerfile](../../Dockerfile)

```bash
bash scripts/test-release.sh
release_sha=$(git rev-parse HEAD)
docker build --label "org.opencontainers.image.revision=$release_sha" -t "bookstore:$release_sha" .
docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "bookstore:$release_sha"
```

将 `release_env_file` 设为发布环境文件的路径，`catalog_network` 设为能访问所配服务的 Docker 网络。下例把非 root 的前端进程发布到本机 3000 端口。就绪返回 200 后再接入流量。

```bash
docker run -d --name bookstore-current --network "$catalog_network" \
  --env-file "$release_env_file" -p 127.0.0.1:3000:3000 "bookstore:$release_sha"
curl --retry 15 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:3000/api/ready
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/v1/catalog/books
```

## 切回上一版本

保留本次和上一版本的镜像及其 SHA、镜像 ID。将 `previous_sha` 设为上一版本的 Git SHA，先在备用端口用当前配置验证它。

```bash
docker run -d --name bookstore-restore-check --network "$catalog_network" \
  --env-file "$release_env_file" -p 127.0.0.1:3001:3000 "bookstore:$previous_sha"
curl --retry 15 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:3001/api/ready
curl -fsS http://127.0.0.1:3001/api/v1/catalog/books
```

使用反向代理时，可将流量切到已经验证的上一版本实例。直接绑定回环端口的部署，确认备用端口就绪后再切换原端口。

```bash
docker stop bookstore-current
docker run -d --name bookstore-restored --network "$catalog_network" \
  --env-file "$release_env_file" -p 127.0.0.1:3000:3000 "bookstore:$previous_sha"
curl --retry 15 --retry-delay 1 --retry-connrefused -fsS http://127.0.0.1:3000/api/ready
curl -fsS http://127.0.0.1:3000/api/v1/catalog/books
test "$(docker inspect --format '{{.Image}}' bookstore-restored)" = \
  "$(docker image inspect --format '{{.Id}}' "bookstore:$previous_sha")"
```

验证通过后可用 `docker rm -f bookstore-restore-check` 清理备用实例。若原端口恢复失败，停止 `bookstore-restored` 后可用 `docker start bookstore-current` 重新启动切换前的实例。

## 固定 Linux 验证环境

宿主限制 Turbopack 子进程绑定端口时，用下列命令基于已提交的前端源码验证演示和发布产物的 Chromium 端到端用例。镜像与视觉入口使用相同的固定 Linux ARM64 Playwright 环境。

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

固定环境使用 Node.js 24.15.0 和 pnpm 11.25.0。升级验证工具时同步检查镜像摘要、浏览器版本与仓库运行基线。截图比较由 `bash scripts/test-visual.sh` 在同版本镜像运行。[测试命令](../testing-strategy/README.md#运行入口) · [视觉验证脚本](../../scripts/test-visual.sh)
