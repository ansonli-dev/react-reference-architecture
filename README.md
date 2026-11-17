# React Reference Architecture

这是一个基于 Next.js App Router 的 React 架构教学项目。在线书店目录展示了如何按业务功能组织模块，以及如何为路由、服务端渲染、浏览器交互和同源 HTTP 接口划分职责。

页面通过 React Server Components 获取并呈现目录数据。浏览器负责筛选交互和导航，已提交的查询条件由 URL 持有。应用的模块依赖和客户端到服务端的边界都有仓库内的检查规则。

从架构概览了解各部分如何协作，再查阅目录约定、依赖规则和设计取舍。[前端架构文档](docs/README.md)
