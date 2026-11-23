# 本地三段交付运行手册

以下操作顺序是启用预案。当前审批范围限离线检查和 Draft PR。实际启用按[检查表](activation-checklist.md)逐项过门禁。

## 记录与身份

- DevOwner 保留自测 run、确切源码 SHA/tree、OCI manifest/config digest，以及本候选全部 Issue、原负责人和验证范围。QA 决定批次并覆盖实际进入候选的完整集合。版本字段和阶段见 `examples/contracts/candidate.schema.json`。
- TL 独立核对当前 PR head、检查和自测。QA 签核包含 test SHA/tree、部署的 run/attempt 和验证回执、同一 manifest digest、完整 items 哈希、test/prod 配置引用及差异审核、签核人和有效期。即使 SHA、摘要和 revision 相同，test 重部署后也须重新签核。
- C 为候选和 revision，T/P/F 为各自 GitHub run/attempt。test 协调者是控制记录唯一写身份。独立 deployer 用自己的 Deployment 写身份加 test 只读锁凭据。协调者登记 intent，指定 job 执行，协调者核清结果。

## 正常路径

1. develop push 绑定确切 SHA，用根 Dockerfile 发布构建。记录 OCI revision 与 descriptor。目标是 `docker-desktop/rra-develop`。DevOwner 验证部署和业务变更后提交 develop → test PR。
2. test 协调者核对 PR 非作者审批、必需检查、源和目标 SHA、合并 tree 与制品证明。先 CAS 从 `available` 进入 `test_active(T,g)`。逐项登记 merge/deploy intent。使用正常 merge 的 head 条件，读回确切 merge SHA、两个 parents 和 tree，核对后部署到 `rra-test`。
3. test 部署通过后进入 `qa_window(T,g)`。保留候选及 holder；其他候选等待。QA 在实际 test 部署版本上核对范围、签核并请求晋级。受支持授权入口在获知新 P 的实际 attempt 后生成定向 grant。
4. test 协调 job 核对旧 attempt 终态、所有 writer job 和在途请求已核清、最新签核和定向 grant。单次携带原 resourceVersion 的 CAS 写入 `prod_active(P,g+1)`。候选预留连续。409 时先回读，精确同一接管可确认成功，写入 intent 的竞争方退出。
5. P 持锁登记正常 test → prod merge，核对实际父提交、tree 和当前 refs，登记部署意图。调度前回读 QA 签核和 grant。prod 实际 writer 用独立认证的执行身份核对仓库、workflow、run、当前 attempt、job、generation 和 operation ID，并在写入前再核对当前授权。使用 test 已验证的单平台 manifest digest。显式 job 依赖串起合并、部署与回执。协调者核清结果后留在 `prod_qa_window`。
6. QA 在本地 prod 做工程冒烟。最终结论与定向释放 grant 绑定已部署版本，新协调 run F CAS 接管进入 `finalizing`。在持久归档回执完成后释放，下一候选方可获取。

必需检查使用非严格模式，以容纳连续批次普通 merge 的分支历史。每批仍校验独立审批、当前源 head 的必需检查、源及目标 SHA、实际 merge tree 与 test 签核。分支写入，包括首次初始化，都使用同一控制记录。初始化需另获 owner 对明确 base SHA、bootstrap ID 和不存在的 test/prod refs 的授权，先 CAS 进入 `bootstrap_active`，再逐条登记、验证、归档。已有候选时拒绝。develop 集成照常；涉及 test/prod 的写入必须满足 [writer 排他规则](activation-checklist.md)。

## 部署核验

启用适配器需独立认证当前 job。读取 GitHub 的 workflow、run 和最新 attempt，按该 workflow 的许可 job 映射 writer 角色，并用已认证的调度信封取得 generation 与 operation ID。执行前的授权回读与 Kubernetes 写入分属不同系统，撤销时序需随真实控制锁和 writer 限制一同验收。

确认 context `docker-desktop`、授权 API 与集群身份，以及准确 namespace UID。清点最新 Deployment UID、resourceVersion、待测 digest 和配置引用。首次部署无上一版本时显式记 null。有上一版本时保存已知正常的完整 Pod template、digest、配置引用（种类、名称、版本及对象 UID）、namespace UID 与验证回执。线上 update 只更换预置 `Deployment/bookstore` 的受控 template，保留 resourceVersion；超时上限 180 秒。

等待新 ReplicaSet 与 Pod Ready。逐个核对 Deployment owner、revision、实际 imageID 和版本化 ConfigMap/Secret 引用。若 runtime 报 config digest，凭受信任的 OCI manifest → config 描述符关联确认；签核仍绑定 manifest digest。保留观察到的 imageID。

用绑定 `127.0.0.1` 的 service port-forward，develop/test/prod 端口分别为 3100/3200/3300。启用前检查冲突。检查 `/api/health` 200 与 `{"status":"ok"}`、`/api/ready` 200 与 `{"status":"ready"}`、两种语言目录路径及 HTML 的 locale/导航标记。结束时关闭本次验证自己的 port-forward，记录失败和耗时。需要真实登录、库存、订单或账户验证时按 [发布手册](../operations/run-and-release.md) 单列联调证据。

## 失败与恢复

- 合并前版本、审批、准入或锁失配，返回拒绝。合并后 parents/tree 失配，留下真实 merge SHA 与已合并事实，阻断部署。GitHub merge API 的 `sha` 只约束 head，目标排他由受核验的规则及 writer 协议提供。[GitHub 合并契约](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)
- 取消、超时、网络中断或响应未收到，让协调者保留候选及 intent，记录 `recovery_required`。按 operation ID 核对 refs、应用 Deployment、GitHub run/attempt 与 writer job 的终态。结果不明时保留现场；请求取消本身不足以证明没有在途变更。
- 用经核实的定向恢复 grant 接管并递增 generation。恢复操作需要绑定该代次、operation ID 和已核清 merge 凭据的单独批准。登记与实际写入前均校验该操作批准。恢复部署只消费已记录的 merge SHA/tree，已成功的 merge 禁止重放。最终释放仍需对应版本的 QA 或放弃授权及持久归档。
- `NO_PREVIOUS_GOOD` 表示首部署故障，保留证据和锁，交 owner 决定停服动作。`CONFIG_VERSION_MISSING` 表示旧对象缺失、版本或不可变性不匹配。`CONFIG_IDENTITY_MISMATCH` 表示同名配置与记录的 UID 不同，停止写入并复核。配置授权身份需提供 ConfigMap 和 Secret 的对象身份与不可变性证据。Dev B 按批准记录恢复完整旧 template（镜像及旧配置/密钥引用）并重验；QA 提供失败证据，代码修复交原 DevOwner 沿 develop → test → prod。BFF 或后端数据库迁移另设恢复方案。
- 向父 VENU-23 区分记录已合并、已部署、QA 工程冒烟和 BA 验收。持久回调接收能力通过前，按原责任步骤人工核对真实终态。
