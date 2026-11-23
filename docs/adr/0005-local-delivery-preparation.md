# ADR 0005 本地三段交付准备

状态为待独立审查。实施项 VENU-24，父项 VENU-23，设计依据为 Spec/Plan `2026-11-02.2`。

## 决策

develop、test、prod 使用本机 Docker Desktop Kubernetes 的三个命名空间。复用书店发布镜像；环境差异由运行期不可变 ConfigMap 和 Secret 引用提供。test 与本地 prod 使用同一 ARM64 单平台 OCI manifest digest。本地 TLS registry 是首选传输路径，需验证 builder 与 CRI 节点各自的信任链和拉取能力。

一条 test 控制记录为 test 部署、QA 窗口和 prod 晋级保留候选。经核实的定向授权将同一候选从上一 run 原子交给下一 run，generation 随接管递增。协调、部署、只读核验分开授予权限。GitHub merge 采用正常 merge，核对源/目标 SHA 与 tree；平台的 head 条件和受保护 writer 协议共同补足预期目标约束。回调经原生入口，核验实际执行事实并用条件写消费结果。

样例保持禁用。现阶段交付 PR、本地 OCI 构建及离线行为证据。真实 runner、分支与回调接入分别通过[启用门禁](../delivery/activation-checklist.md)后再评审执行版。

## 影响

- 源、目标、tree、制品、配置或候选范围改变时重验。同摘要 test 重部署也要重新签核。连续批次沿正向普通 merge；必需检查和独立审批继续绑定源 head。
- 暂停或取消会保留候选锁与在途意图。恢复操作在写入前核验当前执行身份与授权。previous-good 记录以对象 UID 绑定旧配置，恢复镜像和完整 template。
- 投产边界继续采用现有发布构建和真实后端配置。书店业务验收保留独立的 QA/BA 环节。
- 启用角色与权限、验证镜像到节点、运行时回调和真实 CAS，仍需各自的可复核证据。

[样例与验证入口](../delivery/README.md) · [运行与恢复](../delivery/runbook.md)
