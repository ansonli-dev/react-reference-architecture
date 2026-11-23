# 部署终态回调契约

沿用 VENU-23 的 Actions → 受支持 Autopilot webhook → 原生 Workflow/CLI。现阶段的 `examples/actions/callback.yml.example`、`examples/scripts/callback.mjs` 与 schema 供离线审查。接收能力缺证据时返回 `RECEIVER_CAPABILITY_UNVERIFIED`。

| 配置             | 所需证据                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鉴权、许可范围   | 平台支持的 webhook 授权、签名或等效验证、凭据轮换；接收器凭独立身份回读 GitHub                                                                                                                                         |
| 请求与回读       | 取得未经截断的结构化 payload；固定仓库构造 GitHub REST run/attempt 路径，回读 workflow ID/path/SHA、确切 attempt、job、环境及结论。独立 provenance artifact 绑定部署 SHA、manifest/config digest、配置 refs 和探测回执 |
| 持久 observation | event key 绑定仓库、环境、run/attempt、候选与接收 Issue。每条实施 Issue 有独立回执，同键变载荷留冲突证据                                                                                                               |
| 原子业务转移     | transition key 绑定 Issue、旧步骤、轮次、候选、revision 与 develop 原 owner。用登记值和当前 run/attempt 做条件写，持久保存结果与消费标记                                                                               |
| 发送与取消       | 由受审固定 transport 确认 URL 和支持的去重头；同业务键至多三次，3 秒请求限时，408/429/5xx 退避后重试，401/403 停止。超时或取消后通过受支持终态回读或授权补录复核                                                       |
| 终态与状态       | success 需要实际部署回执。failure、cancelled、timed_out 分开记录，工作项按独立验收收口                                                                                                                                 |

payload 的 `manifest_digest` 与 `config_refs` 绑定候选预期版本。Git 合并事实用 `test_sha`、`prod_sha` 表示。`deployed_sha` 单独表示已核实的部署，合并前取消或部署前失败时为 null。即使已合并，成功推进也要有真实部署回执。失败或取消先留证，与当前等待项匹配后交 `infra_triage`。

develop 回执投向候选清单内的实施 Issue，按 VENU-23 离线预览固定回原 owner。可信接收器提供独立核验的 Dev A/B 身份映射，样例用合成标识验证路由。Dev A 为 `b_a_4_wait` → `b_a_4_smoke`，Dev B 为 `b_b_4_wait` → `b_b_4_smoke`。test/prod 仍投向 Release Issue，`test_deployment` 与 `prod_deployment` 分别对应预览中的 C2/D2 等待，成功去 C3/D3。正式步骤映射等待启用验收。

接收器先校验来源，再持久保存 observation。候选尚未登记时保留待核对，重放可补交尚未完成的步骤转换。已转换的键、旧 run/attempt、旧 revision/round 或旧 owner 只留记录。PR 检查单独记录。

启用时以同一测试发布轮次回放以下情况：重复、相同键变体、先部署后登记、保存 observation 后进程中断、旧失败晚到、未终态、鉴权失败与确切 attempt 漂移。逐项记录部署 job、存储回执与最终转换次数。受支持入口、鉴权/payload 和持久条件写均待实际核验。
