# 生产级前端参考实现实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans in the fresh `/goal` chat, or superpowers:subagent-driven-development for task-by-task execution. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 完成只读目录、架构约束、可复跑文档和参考发布路径，分层验收后通过 PR 合并到 main。

**Architecture:** App Router 组合页面和同源 HTTP，公开目录读取器复用业务校验与缓存。演示和发布模式各自通过 `CatalogPort` 装配目录适配器。

**Tech Stack:** Next.js App Router、React 19、TypeScript strict、Node 24、pnpm 11.25.0、Vitest、Playwright、Linux OCI。

**Spec:** [前端架构参考实现完善设计](../specs/2026-11-17-production-reference-design.md)

## 全局约束

- 中英文首页的架构正文随预渲染外壳返回，公共语言切换和主题控件可增强。文案提供介绍和业务状态反馈。只读目录为唯一完整业务范围。
- 维持已锁定的技术栈、现有 BFF 响应形状、双构建档位和公开缓存的数据键。演示使用 SQLite。
- 版本化发布验证留在隔离环境。提交前遵守 AGENTS.md，运行 `pnpm check` 和 `pnpm build`。各任务做定向验证并累积变更，任务 6 整体校验后提交发布基线，任务 7 再提交 CI 描述和实现。最终从无差异的已提交版本验收，结果进入 PR，避免写回被验收的提交。
- Node 生产构建如受宿主端口限制，使用仓库视觉脚本指定的 Playwright Linux ARM64 镜像、Node 24.15.0 和锁定的 pnpm。

## 优先反例

- v1 末页恰好 12 条、探查下一页超时、页码达到 100。任务 1 核对当前内容、调用次数和总截止时间。
- 用户从筛选结果跨页打开详情，直接访问或重复输入参数，并切换语言。任务 2 验证返回 URL 的合法参数与回退。
- 用户用键盘改变分类，随后继续操作。任务 2 验证焦点、URL、状态区域和结果。
- `client.ts` 未被浏览器引用仍重导出服务端模块。任务 3 验证传递依赖和纯类型例外。
- 实际读失败在页面返回 HTTP 200 时仍可定位，响应不泄漏内部错误。任务 4 对照错误 ID 和日志。

---

### 任务 0：纳入已完成的静态首页

**文件：** 当前工作区的 `README.md`、两种语言的 `messages/*.json`、`src/app/[locale]/page.tsx`、`test/e2e/{build-profiles,catalog-journey}.spec.ts`、`test/visual/storefront.spec.ts` 和四个现有截图。另纳入本设计与计划。

- [ ] 查 `git status --short --branch`、`git diff --check` 和 `git worktree list`。当前正常检出为 `main@ff4edaf`。移交文件包含上述已完成修改及设计和计划。保留后来发现的用户修改及原有暂存状态。
- [ ] 在当前检出创建专用分支 `codex/production-reference`。同名分支已存在时先核对其归属。核对原暂存区和工作树。仅提交明确列出的本次文件。已有额外暂存时用指定路径的部分提交，保留其它暂存。如果额外变更与本次文件混合，先在隔离检出中应用可核对的本次差异。为后续 PR 获取远端 main 的实际基线。
- [ ] 扩展 `build-profiles.spec.ts` 验证两个 locale 的构建产物包含架构正文，首页在未配置目录数据源时仍显示正常概览、目录 href 且没有练习入口。用生成的首页外壳或预渲染清单验证正文可预渲染的证据，接受 PPR 公共布局。工作区已有首页与设计计划纳入任务 6 的提交。任务 7 对最终产物重复这些断言。

### 任务 1 确认目录末页

**文件** 发布目录适配器及其集成测试、`test/support/run-built-app.mjs`、`test/e2e/{catalog-http,catalog-journey}.spec.ts`。

**接口** 发布目录适配器实现 `CatalogPort`，在同一个 `readUpstream(signal => ...)` 中处理两次请求。

- [ ] 用 MSW 在集成层加入有 12 本的末页与 12+1 的非末页。请求参数分别断言当前页零基值和下一页零基值，`size=12`，分类与认证头相同。断言 `expect(page.books).toHaveLength(12)`，前者 `hasNext=false`，后者 `hasNext=true`。不足 12 和第 100 页均只有一次调用。前探坏响应返回 `UPSTREAM_FAILURE`。用受控截止信号在第二次请求开始后触发 abort，断言只有一次 `AbortSignal.timeout(2000)` 且前探结束为 `UPSTREAM_TIMEOUT`。Request 可以克隆 signal 对象，测试观察 abort 传播。加错误媒体类型、无 Content-Length 超限流、过大的上游 404 详情，验收 502 或既有 404 映射且取消读取。
- [ ] 运行 `pnpm test test/integration`，先看到满末页、前探或调用数相关断言对旧实现失败。
- [ ] 在适配器的 fetch 边界先检查 200 和媒体类型，用最大 256 KiB 的缓冲限制实际读入量，超限或早退时取消流。为非 200 返回无正文的同状态响应，保留详情 404 映射。用受限正文构造供 openapi-fetch 解析的响应。在 list 内提取读页操作，复用现有字段和重复 UUID 校验。仅在当前页满且 `page < maxCatalogPage` 查询下一页。调用同一个 `catalogPage` 生成结果。保留既有工厂接口和异常映射。
- [ ] 新增可缓存的 stub 分类 `Exact shelf`，固定恰好一满页。BFF 12 本且 `hasNext:false`，同 locale 的 RSC 没有下一页链接。记录冷 BFF 两次 底层请求，温 RSC/BFF 在同样条件下均零新增。把慢上游流式用例换到已有 `Full shelf` 的第 100 页，保留首块与最终书名断言，并核对一次 `page=99` 请求，避免意外把两次 950ms 延迟放入总截止时间。运行所有相关测试。

### 任务 2：目录返回、语言 404 和键盘旅程

**文件：** `src/features/catalog/ui/links.ts`、`src/features/catalog/ui/catalog-filters.tsx`、`src/app/[locale]/(store)/books/page.tsx`、`src/app/[locale]/(store)/books/[bookId]/page.tsx`、新建 `src/app/[locale]/[...rest]/page.tsx`、`messages/{zh-CN,en}.json`、`test/e2e/{catalog-journey,catalog-keyboard,shell}.spec.ts`。

**接口：** `catalogHref(base: string, query: CatalogQuery)` 可应用到同一语言的根目录和详情路径。抽取目录返回规则时保持函数无浏览器和框架依赖。语义状态使用已有 `Catalog` 文案命名空间。

- [ ] 在 Playwright 用例写三组期望。其一在 `/en/books?page=2` 打开第二页书，返回到原 URL。使用种子中实际有详情的记录，双档分别测没有筛选的第二页和 `category=Architecture` 第一页，demo 测 `category=Architecture&q=React` 第一页。切换语言保留上下文。用未缓存的 release 书号注入故障，检查返回和重试保留参数，恢复替身后从原链接重试成功。对同 locale 和 bookId 请求两个合法来源参数，回链不同且底层只读一次。直接详情或重复、非法页码回到同语言默认目录，陌生参数和外部 URL 不能成为返回目的地。其二 `/zh-CN/does-not-exist` 与 `/en/does-not-exist` 返回 404，包含正确 `html[lang]`、本地化提示及该语言首页链接，并验证嵌套未知路径。复跑已存在的未知 locale、release 未知 API POST 404、详情与静态资产。其三由未筛选 12 本变为 Architecture 的 7 本，核对书目、稳定的 `role=status` 节点及更新文字，焦点保留在应用筛选按钮，下一次 Tab 到首条可见结果链接。回退时控件值与 URL 相符。在 demo 将 `q=React` 切到 `q=Web`，两边均为 2 本但书目不同，核对原状态节点的文字仍随已提交关键词更新。
- [ ] 在两个既有浏览器生产配置运行失败用例，确认失败源为详情返回、404 或真实键盘交互。
- [ ] 列表用 `catalogHref` 构建详情 href。详情 RSC 在现有异步内容边界解析 searchParams，投影已知字段并验证，发布模式在解析前忽略 `q`。用相同的合法参数生成目录链接和本页重试地址。catch-all 校验支持的 locale、设置请求语言并调用 `notFound()`。
- [ ] 用可见的本地化结果状态覆盖非空与空结果，包含已提交的分类和关键词（如有）。让状态区域和表单在同一路径筛选时保持节点，更新其内容与已提交值，保留原生 GET、输入名称和键盘控件。需要重置的输入可以各自跟随已提交值。以 Playwright 证明用户实际修改分类后的焦点与结果，读屏结果仅在运行后记录。更新受影响的截图并运行同一视觉基线。

### 任务 3：架构检查和决策记录

**文件：** `scripts/check-boundaries.mjs`、`eslint.config.mjs`、`test/unit/architecture.test.ts`、`docs/architecture/architecture-spec.md`、新建 `docs/adr/0003-frontend-module-composition.md` 并更新 ADR 索引。

- [ ] 在临时工程 fixture 增加浏览器公开入口仅被 RSC 引用却传递重导 server-only 的用例。期望检查退出非零且包含 `no-client-to-server`。同样验证 type-only 仍通过。用真实 ESLint 配置验证 feature model 源中直接 `fetch` 与 `globalThis.fetch` 被拒绝，适配器 fetch 仍可用。先运行新增反例。
- [ ] 将 `src/features/<feature>/client.ts` 纳入传递检查根，并用 Set 或同一次条件判断确保同一模块只发起一次检查。对 model 入口和 model 目录设置 scoped ESLint 静态约束。测试用精确规则与文件范围验收。
- [ ] 写 ADR 对照设计列出的来源、实际路径和已有/新增反例。架构文档明确全局 fetch 的 lint 保证限 model 入口及 model 目录源码中的直接调用，现有传递图识别框架、Node 与已标记的服务端模块。运行 `pnpm test test/unit/architecture.test.ts`、`pnpm lint`、`pnpm check:architecture`。

### 任务 4：给目录故障加可查的日志

**文件：** 新建 `src/server/observability/catalog.server.ts`，修改 `src/server/http/response.server.ts`、列表及详情 Route Handler、列表及详情 RSC，相关测试为 `test/unit/api-boundary.test.ts` 和 `test/e2e/catalog-http.spec.ts`，测试捕获经过 `test/support/run-built-app.mjs` 和 `playwright.config.ts`。

**接口：** `reportCatalogFailure(entry: CatalogEntry, failure: ApiFailure, startedAt: number, requestId = crypto.randomUUID()): void`。`CatalogEntry` 的四个值见设计。`apiErrorResponse(error: unknown, observe?: (failure: ApiFailure, requestId: string) => void)` 只新增通用可选回调。由调用方闭包持有当前目录入口和计时。

- [ ] 先加测试并检查旧代码失败。传入敏感文本的异常并读取 BFF 响应。捕获传给日志记录器的 JSON。断言两处 `requestId` 一致，固定字段、502/504 正确、非负毫秒，应用自己的日志不含输入 URL、凭据、内部异常字符串和栈。400/404 不生成 5xx 记录。测试启动器可将生产子进程 stdout 和 stderr 同时转发并写入每个运行的日志。日志文件用测试运行独立临时目录和 server 名称或端口隔离，测试轮询 JSON 行。BFF 按响应 ID 匹配，页面用新日志增量匹配相同分类并确认有重试提示。
- [ ] 在各入口选择固定的 entry，捕获 `performance.now()`。RSC 在 `connection()` 后的请求时内容中开始计时。在 BFF 现有错误响应里生成一次 ID 并复用给日志。日志用固定字段的一行 JSON，按 5xx 分类输出。RSC 已有降级分支调用该函数。缓存函数与公开键保持无请求数据。
- [ ] 运行 `pnpm test test/unit/api-boundary.test.ts` 和相关 Playwright 故障用例。确保 API 快照生成无差异。用任务 1 的可缓存满页测试，从同 locale、无关键词且尚未缓存的 BFF 请求开始，记录 +2 次 底层请求，再测 RSC/BFF 热读新增 0 次。记录响应耗时、环境和采集命令。慢上游首块、缓存和总截止时间由行为断言验收，耗时记录只作环境基线。

### 任务 5 整理运行与验证文档

**文件：** `README.md`、`docs/README.md`、`docs/testing-strategy/README.md`、新建 `docs/operations/run-and-release.md`。

- [ ] README 给出 Node 24、pnpm 11.25.0、`pnpm install --frozen-lockfile`、`DEMO_DATA_DIR="$PWD/.bookstore-demo"` 需导出、`pnpm demo:seed`、`pnpm dev:mock` 和 locale URL。明确用户创建种子和启动进程是开发操作。浏览器内的内容维持静态架构参考。
- [ ] 运行手册列出 demo/release 环境变量、能力差异、实测条件、健康与就绪、release 构建部署以及回滚。
- [ ] 地方性构建限制放在开发/验证说明，提供固定 Linux 容器入口。测试文档标明每层的运行命令、浏览器覆盖及 CI 失败产物。架构页给出新增功能和契约改动时查找对外入口、生成类型和测试层级的路径。记录 Node/pnpm 升级后应重做的门禁。通过一次干净目录的 demo 启动和只读验证。

### 任务 6：构建、启动和切回版本化 release 镜像

**文件：** `Dockerfile`、`.dockerignore`、`scripts/test-release.sh`、`docs/operations/run-and-release.md`。

**接口：** `bash scripts/test-release.sh` 从当前检出构建唯一临时标签，退出时清理它创建的临时测试容器与网络。`docker build --label org.opencontainers.image.revision=<SHA> -t bookstore:<SHA> .` 是文档支持的构建方法。

- [ ] 写 smoke 并先验证没有发布路径时失败。使用仓库自带的目录替身。使用禁止外网出站的 Docker 内部网络，从同网验证容器发起实际请求。fixture 在 `/api/v1/books` 返回 `application/json` 和合法列表，核对镜像能通过 HTTP 读取目录。分别启动已配置目录替身和未配置数据源的发布镜像。确认健康 200、就绪分别为 200 和 503、两个 locale 首页 200 且语言正确。从首页 HTML 取实际 `/_next/static/` CSS 或 JS URL，校验 200 和对应 MIME。同源目录响应体对应 fixture。正式启动器作为容器命令的一部分。
- [ ] 基于 `node:24.15.0-bookworm-slim` 两阶段构建。在共有基础层用 npm 预装固定 `pnpm@11.25.0` 并确认与仓库声明一致，运行时无需外网。builder 严格按锁安装并运行正式构建。runtime 拷贝实际启动所需的配置、启动脚本、安装依赖、`public` 与 `.next`，以 Node 用户、端口 3000 和 `pnpm start` 运行。构建和镜像不得带入本地环境文件、已有产物和 demo 数据。Docker smoke 验证期望行为、实际进程用户的 UID 非零与镜像版本标签。
- [ ] 发布指南在旧容器或旧镜像仍保留时，用上一版本镜像标识启动同一配置，独立完成就绪检查，再切换流量。本任务通过 `pnpm check` 和 `pnpm build` 后提交一份可构建的实现基线。任务 7 用基线提交及最终提交分别构建两个不同的镜像 ID 和 SHA 标签。在隔离网络中让最终版提供固定访问入口。切回基线，使同一入口确实由基线容器服务，再查就绪与 BFF。用 `docker inspect` 确认入口对应容器的镜像 ID 与基线一致。这是一份参考演练，发布第一版之后才有可切回的历史产物。

### 任务 7：分层验收与合并

**文件：** `.github/workflows/ci.yml`、PR 描述及本地忽略的测试产物。

- [ ] 在 CI 增加独立 `release-image` job，运行任务 6 的隔离烟测。先执行 `pnpm check` 和 `pnpm build`，再提交 CI 改动。最终验收从干净已提交 HEAD 执行。若工作区含用户改动，使用临时、保有 Git 元数据的干净检出运行验收并保留用户工作树。`git archive <SHA>` 仅用于镜像或纯源码打包并显式传入 SHA。视觉脚本需要 Git 元数据。
- [ ] 冻结安装后运行 `pnpm peers check`、`pnpm check`、`pnpm api:check`、`pnpm test`。通过条件为命令退出 0、生成契约一致，记录实际测试数。
- [ ] 执行 `pnpm build` 与 `pnpm build:demo`，再在清除 `BOOKSTORE_E2E_DEV` 的环境运行全量 `pnpm test:e2e`，核对报告实际运行 demo 和 release 两个配置。使用 `bash scripts/test-visual.sh` 在仓库指定镜像运行全部视觉用例。截图预期改变时用同一脚本的 `--update-snapshots` 生成并重跑。运行固定环境里的 `bash scripts/test-release.sh` 验收部署产物，由最终发布候选和任务 6 的已提交版本完成回滚演练。
- [ ] 对实际 diff 做独立对抗性代码审查。复核上面各层的证据与当前 HEAD 一致，修完所有确认为本次范围的可操作问题，再按受影响的层重跑。创建 PR，正文包含七项目标的改变和各层结果。用 GitHub 的最新 PR 状态、合并性、checks 和 review threads 作为合并依据。
- [ ] 所有验收通过后，核对最新 PR HEAD 的 `checks`、`visual`、`release-image` 三个 PR job 均为 success，检查未解决评审和 GitHub 合并条件。用 `gh pr merge --match-head-commit <verified SHA>` 或 GitHub 等价的 expected head SHA 合并到 `main`。以 PR 的 merged 状态、合并 SHA 和远端 main 的历史复核。保留项目目录中本次以外的修改。

## 对抗评审与验收记录

首轮独立评审核对了架构和契约、目录体验、运维交付。修订覆盖满页对既有流式和缓存用例的影响、总截止与正文限制、双语首页的实际合约、详情来源与键盘断言、通用 HTTP 边界及日志捕获、最终提交隔离、离线发布和两版本回滚、CI 验收。复核后加入相同数量下改关键词的播报、同入口回滚和 Git 检出验收。终轮核对修订版是否还有可执行缺口。实现会话在 PR 中记录最终各层命令、结果与发布镜像烟测。
