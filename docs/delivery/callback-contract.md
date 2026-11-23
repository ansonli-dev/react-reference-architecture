# 部署终态回调契约

沿用 VENU-23 的 Actions → 受支持 Autopilot webhook → 原生 Workflow/CLI。现阶段的 `examples/actions/callback.yml.example`、`scripts/callback.mjs` 与 schema 供离线审查。接收能力缺证据时返回 `RECEIVER_CAPABILITY_UNVERIFIED`。

| 配置             | 所需证据                                                                                                                                                                                                               |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 鉴权、许可范围   | 平台支持的 webhook 授权、签名或等效验证、凭据轮换；接收器凭独立身份回读 GitHub                                                                                                                                         |
| 请求与回读       | 取得未经截断的结构化 payload；固定仓库构造 GitHub REST run/attempt 路径，回读 workflow ID/path/SHA、确切 attempt、job、环境及结论。独立 provenance artifact 绑定部署 SHA、manifest/config digest、配置 refs 和探测回执 |
| 持久 observation | event key 为 repo/environment/run/attempt/candidate；保存 payload fingerprint。相同 key 不同载荷保留冲突证据                                                                                                           |
| 原子业务转移     | transition key 为 Issue/step/round/candidate/revision。用旧步骤、轮次、候选和当前 attempt 做条件写，保存结果与消费标记。单进程锁或 webhook admission 无法证明这一提交                                                  |
| 发送与取消       | 由受审固定 transport 确认 URL 和支持的去重头；同业务键至多三次，3 秒请求限时，408/429/5xx 退避后重试，401/403 停止。超时或取消后通过受支持终态回读或授权补录复核                                                       |
| 终态与状态       | success 需要实际部署回执；failed、cancelled、timed_out 分开。记录结果并交对应角色检查，工作项按独立验收收口                                                                                                            |

接收器先验证来源，再持久写 observation。候选尚未登记时保存待核对。相同 observation 的重放可补交尚未完成的步骤转换；已经转换的键只读回结果。旧 attempt、旧 revision 或旧 round 只留记录，不能覆盖当前结果。失败与取消结论可路由给 Dev B，功能缺陷回原 DevOwner。PR 检查只记录检查。

启用时以同一测试发布轮次回放以下情况：重复、相同键变体、先部署后登记、保存 observation 后进程中断、旧失败晚到、未终态、鉴权失败与确切 attempt 漂移。逐项记录部署 job、存储回执与最终转换次数。受支持入口、鉴权/payload 和持久条件写均待实际核验。
