# 前端架构文档

| 文档                                            | 查阅内容                                           |
| ----------------------------------------------- | -------------------------------------------------- |
| [架构概览](architecture/overview.md)            | 应用结构、浏览器和服务端职责、渲染与状态归属。     |
| [架构规范](architecture/architecture-spec.md)   | 目录布局、模块公开入口、依赖方向、接口与 UI 约定。 |
| [架构决策记录](adr/README.md)                   | 工程基线、公开读取缓存与模块组合的设计取舍。       |
| [前端测试体系](testing-strategy/README.md)      | 各层测什么、怎么测，以及仓库中的对应测试。         |
| [运行与发布手册](operations/run-and-release.md) | 模式配置、构建验证、镜像发布和切回上一版本。       |

按目的选择文档：从根目录 README 入手，按手册执行操作，遇到边界问题查规范，理解取舍时读 ADR。组织方式参考 [Diátaxis](https://diataxis.fr/)。

[参考示例评审](architecture/reference-example-review.md)记录书店案例的适用条件、验证范围和待改进事项。

[参考示例改进计划](superpowers/plans/2026-11-18-reference-example-improvements.md)列出改进顺序和验收标准。
