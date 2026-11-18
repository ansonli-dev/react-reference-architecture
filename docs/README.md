# 项目文档

| 查阅目的                               | 文档                                            |
| -------------------------------------- | ----------------------------------------------- |
| 阅读架构导读，追踪目录与结算的实现     | [架构概览](architecture/overview.md)            |
| 核对模块职责、公开入口和依赖方向       | [架构规范](architecture/architecture-spec.md)   |
| 查阅浏览器调用的同源接口               | [BFF OpenAPI 契约](../contracts/bff/v1.yaml)    |
| 理解渲染、缓存和模块组合的取舍         | [架构决策记录](adr/README.md)                   |
| 确认测试覆盖和运行命令                 | [前端测试体系](testing-strategy/README.md)      |
| 查阅环境配置、后端联调、镜像发布和回滚 | [运行与发布手册](operations/run-and-release.md) |

## 专题文章

- [目录导航如何保留上下文](architecture/catalog-navigation.md)以一次从英文目录进入详情、切到中文再返回的访问说明，筛选条件如何跨页面保留，以及结果更新后键盘焦点在哪里。
- [浏览器怎样确认一次下单的结果](architecture/checkout-contract.md)从一次响应丢失的提交说起，解释报价、提交、订单三个标识，以及超时、身份过期或等待核对时页面如何恢复。

## 历史记录

以下文件记录基于 `f2e581d` 的评审与实施方案，对应改动已在 [PR #10](https://github.com/ansonli-dev/react-reference-architecture/pull/10) 合入。[基线评审](architecture/reference-example-review.md) · [改进规格](superpowers/specs/2026-11-18-reference-example-improvements-design.md) · [实施计划](superpowers/plans/2026-11-18-reference-example-improvements.md)
