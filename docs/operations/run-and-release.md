# 运行与发布手册

本参考实现提供同一套只读书籍目录的两个构建档位。使用 Node 24、pnpm 11.25.0 和锁文件，验证环境固定用 Node 24.15.0。

|                | 演示 `demo`                          | 发布 `release`             |
| -------------- | ------------------------------------ | -------------------------- |
| 数据           | 独立 SQLite 种子                     | Java v1 Catalog            |
| 目录能力       | 分类、关键词、分页、详情             | 分类、分页、详情           |
| 开发           | `pnpm dev:mock`                      | `pnpm dev:real`            |
| 生产构建、启动 | `pnpm build:demo`、`pnpm start:demo` | `pnpm build`、`pnpm start` |
| 产物           | `.next-demo/`                        | `.next/`                   |

构建时不需要数据源。两个模式的 `/en` 与 `/zh-CN` 概览都可以预渲染。启动后，`GET /api/health` 返回进程存活状态，`GET /api/ready` 会实际读一次目录。数据源缺失、不可读或配置不合法时，就绪返回 503 与有限的原因码；进程健康仍可返回 200。已知语言的未匹配路径返回本地化 HTTP 404。书籍详情流式缺失时响应头可能已是 200，同一书号的 BFF 响应仍是 404。

## 配置

| 环境变量                  | 用途                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PORT`                    | 服务端口，默认 3000。演示模式和开发命令监听回环；发布 `start` 默认监听 `0.0.0.0`，可用 `BOOKSTORE_HOST` 指定地址。 |
| `APP_ORIGIN`              | 前端完整 origin，默认 `http://127.0.0.1:3000`。改变访问端口或外部域名时一起设置；演示模式只接受本机 origin。       |
| `DEMO_DATA_DIR`           | 演示模式 SQLite 数据目录的绝对路径。种子命令和前端进程都需收到这个变量。                                           |
| `JAVA_CONTRACT`           | 发布目录使用默认值 `v1-catalog`。                                                                                  |
| `JAVA_CATALOG_BASE_URL`   | 发布模式 Java HTTP(S) origin，不带路径、凭据、查询或片段。                                                         |
| `CATALOG_CATEGORIES_JSON` | 发布模式目录筛选选项，例如 `["Architecture","Engineering"]`，默认空数组。                                          |
| `JAVA_CATALOG_TOKEN`      | 上游要求时配置服务凭据，由服务端作为 Bearer 发送。通过部署环境注入。                                               |

按 [README](../../README.md#本地启动) 在干净检出执行冻结安装、导出数据目录、种子和开发启动。访问 `/zh-CN/books`，或从另一终端用 `curl -fsS http://127.0.0.1:3000/api/v1/catalog/books` 核对只读结果。

Java v1 返回零基分页数组，没有总数。前端将其转为 1–100 页，每页 12 本。未达上限的满页会在同一个 2 秒截止时间内再查询下一页，只有收到非空下一页才给出翻页链接。v1 未保证稳定排序，也没有跨请求的快照；并发变化时探查与随后浏览可能看到不同结果。对公开缓存范围和时间的说明见 [ADR 0002](../adr/0002-public-reads-and-cache.md)。

故障日志中 `event=catalog.read_failed` 记录固定的目录入口、请求 ID、分类状态与耗时。用 BFF 响应里的 `error.requestId` 搜索同一个 ID；页面降级事件按入口和时间定位。页面日志的 `status` 是分类状态，流式 HTML 可能已经发出 200。运行时凭据不进入这些记录。

## 真实 Java v1 复验

[OpenAPI 只读快照](../../contracts/java/catalog-v1.yaml) 的源码参考是 `14e511a8f361616e166f23daf5184012d501c656`。真实 provider 复验使用 [后端 de7ab0c](https://github.com/ansonli-dev/explicit-architecture/tree/de7ab0c373afe1dd3206034bb2e6a2d94b212726)。以下步骤需要 JDK 21（令 `JAVA_HOME` 和 `PATH` 指向它）、Docker，以及可下载 Gradle 和后端依赖的环境。确认 8081 空闲。只向本节创建的数据库写入种子。

```bash
java_verify_dir=$(mktemp -d)
git clone https://github.com/ansonli-dev/explicit-architecture.git "$java_verify_dir/backend"
cd "$java_verify_dir/backend"
git checkout --detach de7ab0c373afe1dd3206034bb2e6a2d94b212726
java -version
java_maven_repo="$java_verify_dir/maven"
(cd seedwork && ./gradlew "-Dmaven.repo.local=$java_maven_repo" publishToMavenLocal)
(cd shared-events && ./gradlew "-Dmaven.repo.local=$java_maven_repo" publishToMavenLocal)
(cd catalog && ./gradlew "-Dmaven.repo.local=$java_maven_repo" bootJar)

catalog_pg="catalog-v1-pg-$$"
catalog_redis="catalog-v1-redis-$$"
docker run --rm -d --name "$catalog_pg" -p 127.0.0.1::5432 \
  -e POSTGRES_DB=catalog -e POSTGRES_USER=bookstore -e POSTGRES_PASSWORD=catalog-fixture \
  postgres:16-alpine
docker run --rm -d --name "$catalog_redis" -p 127.0.0.1::6379 redis:7-alpine
pg_endpoint=$(docker port "$catalog_pg" 5432/tcp)
redis_port=$(docker port "$catalog_redis" 6379/tcp | cut -d: -f2)
until docker exec "$catalog_pg" pg_isready -h 127.0.0.1 -U bookstore -d catalog; do sleep 1; done
until docker exec "$catalog_redis" redis-cli ping; do sleep 1; done

SPRING_DATASOURCE_URL="jdbc:postgresql://$pg_endpoint/catalog" \
SPRING_DATASOURCE_USERNAME=bookstore SPRING_DATASOURCE_PASSWORD=catalog-fixture \
SPRING_DATA_REDIS_HOST=127.0.0.1 SPRING_DATA_REDIS_PORT="$redis_port" \
SPRING_PROFILES_ACTIVE=default OTEL_SDK_DISABLED=true java --enable-preview \
  -jar catalog/build/libs/catalog-0.0.1-SNAPSHOT.jar \
  --server.address=127.0.0.1 --server.port=8081 \
  --spring.kafka.listener.auto-startup=false --outbox.relay.strategy=disabled \
  >"$java_verify_dir/catalog.log" 2>&1 &
catalog_pid=$!
curl --fail --retry 30 --retry-connrefused --retry-delay 1 \
  http://127.0.0.1:8081/actuator/health
```

确认健康为 `UP` 后，Flyway 已准备好表结构。在同一个 shell 用数据库容器内的客户端导入，宿主无需安装 `psql`：

```bash
docker exec -i "$catalog_pg" psql -U bookstore -d catalog -v ON_ERROR_STOP=1 \
  < demo/seed/catalog.sql
git rev-parse HEAD
shasum -a 256 catalog/build/libs/catalog-0.0.1-SNAPSHOT.jar
curl -fsS 'http://127.0.0.1:8081/api/v1/books?page=1&size=12'
```

然后在前端仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install chromium --only-shell
pnpm build
JAVA_CATALOG_BASE_URL=http://127.0.0.1:8081 pnpm test:e2e:java
```

Playwright 在 3220 端口启动发布构建，只读校验现场 OpenAPI、翻页、分类、详情和缺书。种子共 13 本，末页 1 本，Architecture 6 本，首本已知书为 `Bounded Contexts`。复验后从启动后端的 shell 运行 `kill "$catalog_pid"` 和 `docker rm -f "$catalog_pg" "$catalog_redis"` 结束这三个隔离进程。

历史记录：2026-11-17，前端 [0534212](https://github.com/ansonli-dev/react-reference-architecture/commit/053421270f758308f18506ccf8df7b73754a020c) 对接后端 `de7ab0c`，两条 Playwright 用例通过。首尾页分别为 12 和 1 本，Architecture 为 6 本，`Bounded Contexts` 为作者 Lin Zhao、CNY 49.00、库存 30。缺书在 Java 和 BFF 都返回 404。现场 OpenAPI 列表和详情 schema 分列，七个响应字段与快照一致。新候选版本的结果记录在各自 PR。

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

验收真实 Java 时，保留 `pnpm build`，将 demo 构建与普通 E2E 两行换成 `JAVA_CATALOG_BASE_URL=http://host.docker.internal:8081 pnpm test:e2e:java`（Docker Desktop 网关）。其他环境使用容器可以直接访问的隔离 Java origin。视觉命令 `bash scripts/test-visual.sh` 从有 Git 元数据的检出运行。

更新 Node 或 pnpm 后，同步 `.nvmrc`、`package.json`、锁文件、固定验证环境和镜像基础层。重新跑冻结安装、peer、类型、Lint、格式、架构与生成检查、Vitest、双档生产构建、Chromium、视觉、真实 Java、参考镜像烟测和两版本回滚。[分层测试命令](../testing-strategy/README.md#运行入口)

## 构建并运行发布镜像

从要发布的干净 Git 检出构建。镜像以 Git SHA 命名，同时写入 OCI revision。运行镜像以非 root 用户从 3000 端口执行 `pnpm start`，不需要在启动时安装任何依赖。

```bash
bash scripts/test-release.sh
release_sha=$(git rev-parse HEAD)
docker build --label "org.opencontainers.image.revision=$release_sha" -t "bookstore:$release_sha" .
docker image inspect --format '{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}' "bookstore:$release_sha"
```

烟测创建无外网出站的内部 Docker 网络，用临时 Java 替身验证已配置和未配置模式的就绪边界、双语首页、实际 CSS 或 JS 资源与同源 BFF，然后清理测试资源。部署时让镜像加入可访问 Java 的网络，从受保护的运行配置注入上游 origin 与凭据。以下示例用回环访问，并假定 `$release_env_file` 是已准备的配置文件，`$catalog_network` 是已有的网络：

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
