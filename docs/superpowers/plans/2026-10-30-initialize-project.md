# Project Initialization Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 上传已确认的指导书并初始化可检查、可构建的 Next.js 工程。
**Architecture:** Next.js App Router，按业务功能划分模块，服务端与客户端分离。
**Tech Stack:** Next.js、React、TypeScript、Tailwind、pnpm、ESLint、Prettier。
**Spec:** docs/project-guide.md

## Global Constraints

不实现完整电商；不声明尚未接入的技术已可用；保留已有仓库历史。

## Review Focus

无依赖锁文件、在线字体导致构建依赖网络、错误的运行版本、文档夸大进度、CI 与本地命令不同。

## Task 1：指导书与仓库约定

- [x] 将指导书保存到 docs/project-guide.md，更新仓库名。
- [x] 补齐 README、AGENTS.md 与 ADR，标记当前实现状态。

## Task 2：可运行工程骨架

- [x] 使用官方脚手架创建 App Router、strict TypeScript、Tailwind 和 Compiler 配置。
- [x] 用本地系统字体替换构建时在线字体，创建架构项目首页。
- [x] 配置格式检查、独立类型检查和 CI；提交 lockfile。

## Task 3：验证与上传

- [x] 运行 pnpm check 与 pnpm build，验证生产 HTTP 页面和健康检查。
- [x] 检查 diff、秘密和文档准确性，提交改动。
- [ ] 上传 GitHub：连接明确返回 403，无写权限；本地保留完整成果。

## 执行记录

- `pnpm check`：类型、ESLint、格式和基础依赖检查通过。
- `pnpm build`：生产构建通过。
- 生产 HTTP 冒烟：首页 200 且包含服务端生成标题；健康接口 200，status=ok。
- `pnpm peers check`：无 peer 冲突。
- 独立审阅：无重要问题；补充 Corepack 安装说明并清理模板注释。
- shadcn 初始化被网络拒绝，未纳入已实现范围。
- 上传被 GitHub integration 403 阻止；不宣称已上传或远程 CI 已运行。
