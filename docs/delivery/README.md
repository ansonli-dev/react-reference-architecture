# 本地 K8s 交付准备

VENU-24 交付未激活的配置样例，供 RRA TL 独立审查。develop、test 和 prod 均指本地 Docker Desktop Kubernetes。prod 用于交付验证。

| 入口                                                  | 内容                                                    |
| ----------------------------------------------------- | ------------------------------------------------------- |
| [运行手册](runbook.md)                                | 从 develop 自测到 test 签核、同制品晋级、部署验证与恢复 |
| [启用检查表](activation-checklist.md)                 | 对象、身份、外部前置、验收证据和配置回退                |
| [回调契约](callback-contract.md)                      | 真实 GitHub attempt 回读、持久幂等、接收能力待验        |
| [ADR 0005](../adr/0005-local-delivery-preparation.md) | 本地交付的边界和决策                                    |
| [样例](examples/)                                     | 版本契约、离线校验与恢复脚本、K8s 和 Actions 配置       |

## 评审基线

Spec/Plan `2026-11-02.2` 原件与 TL 结论保存在 VENU-24。Spec SHA256 为 `03074b5629171f083b0b7d09f88197146bfa936139962f698a1bd8773234e6ff`，Plan 为 `fb31de48ac9b448a6b3f2a2069dd5fcbb6f9d1140f3cea1262d99a70231896af`。原设计基线是 `9caf4a0264f4450725431b90fb4e22502d53da47`。

按 TL 续作指令，本 PR 基线为 `62851594b055159acd93103bfd0f175982f88e98`。该版本已经有书店发布构建、根 Dockerfile 与 release-image CI。复用现有构建与 [镜像烟测入口](../../scripts/test-release.sh)。存活用 `/api/health`，可服务性分别核对 `/api/ready`、`/zh-CN/books` 和 `/en/books`。ADR 编号顺延为 0005。现有 CI、根 Dockerfile、.dockerignore 和应用源码保持原样。

## 离线检查

在仓库根目录使用 Node 24 和固定 pnpm 11.25.0。

```bash
pnpm install --frozen-lockfile
node --test docs/delivery/examples/tests/*.test.mjs
pnpm check
pnpm build
node docs/delivery/examples/scripts/guard.mjs docs/delivery/examples/fixtures/valid/activation-blocked.json --environment test
```

plan 模式只返回命令预览与 blocker。改用 `--mode execute` 可观察拒绝原因。脚本接口通过注入的读写依赖验证协议，命令行没有已接通的凭据、网络或 K8s adapter。样例里的版本、签核、配置和传输响应都是合成数据。

配置校验使用任务内工具 Python 3.12、PyYAML 6.0.3、jsonschema 4.25.1、kubeconform 0.8.0、actionlint 1.7.12。先准备 Kubernetes 1.36.1 schema 缓存。下面命令只解析文件；kubeconform 在缓存缺失时下载公开 schema。将 `example_workflow_dir` 指向空的本地临时目录，文件名去掉 `.example` 后交给 linter。

```bash
python docs/delivery/examples/tests/check-config.py
kubeconform -strict -kubernetes-version 1.36.1 -cache "$k8s_schema_cache" -summary docs/delivery/examples/k8s
for example in docs/delivery/examples/actions/*.yml.example; do
  filename=${example##*/}
  cp "$example" "$example_workflow_dir/${filename%.example}"
done
actionlint -ignore 'constant expression "false" in condition' \
  -config-file docs/delivery/examples/actions/actionlint.yaml "$example_workflow_dir"/*.yml
```

actionlint 仅豁免固定 false 的诊断，配置检查另外断言每个 job 保持禁用。

| 验收                           | 证据入口                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| 版本、错误目标、授权缺失       | `tests/contracts.test.mjs` 与 JSON Schema                       |
| 镜像可构建                     | 根 Dockerfile 的本地 OCI 导出与 descriptor 摘要，独立于节点拉取 |
| Runner、权限预览               | 固定禁用的 Actions、bootstrap RBAC 和启用检查表                 |
| 跨 run 接管、源/目标/树漂移    | `tests/lock.test.mjs`、`tests/promotion.test.mjs`               |
| Pod 摘要、就绪、配置版本与回滚 | `tests/deployment.test.mjs` 与三个命名空间 manifest             |
| 回调终态、重放、冲突           | `tests/callback.test.mjs` 与回调契约                            |

实际运行结果附在 Draft PR。启用需另行审批并在目标环境测量。
