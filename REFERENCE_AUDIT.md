# 候选 GitHub 项目审计结论

审计日期：2026-09-01。

## 1. `lincohlesteban-art/ielts-academic-platform`

### 可借鉴

- Reading 左文右题；
- draggable split；
- 多种题型；
- 高亮、下划线、删除线和自由绘制；
- Listening/Writing 入口；
- 倒计时。

### 不适合作为本项目底座

- 单页 HTML/CSS/JavaScript；
- 主要内容运行时从第三方网站经多个 CORS proxy 获取；
- 稳定性和离线能力不足；
- annotation/drawing 只保存在当前内存 Session；
- 不具备本项目所需的共享稳定锚点、SQLite、本地工作区和桌面安全边界；
- GitHub API 未识别到许可证。

结论：只参考 Reading 交互，不复制代码或内容。

## 2. `Pandlagon/IELTS-Studio`

### 可借鉴

- PDF/DOC/DOCX/图片导入思路；
- pdf.js + OCR fallback；
- 左文右题；
- DeepSeek 写作评分、翻译、问答；
- 词汇与错题；
- 较完整的功能清单。

### 不适合直接改造成个人桌面端

- 当前架构是 Vue 前端 + Spring Boot + MySQL 的网站系统；
- 用户注册/JWT/服务端数据库对单机个人使用过重；
- 直接套入 Tauri 仍需保留复杂后端，或者进行大规模拆除；
- 双自由 Pane、跨 Pane 共用 annotation、本地 portable workspace 不是其核心；
- 仓库根目录未发现许可证文件，GitHub API 的 license 字段为 null；README 中的 badge 不能单独视为完整授权依据。

结论：参考导入、AI 和复盘功能分解；本项目独立实现。

## 3. `SherzodAxadov2/IELTS-CDI-converter`

### 可借鉴

- Vue/TypeScript；
- PDF.js 提取；
- Reading split layout；
- schema/组件化的轻量思路。

### 不足

- 主要集中 Reading；
- 问题生成而非可靠地解析现有完整试卷；
- Listening/Writing、本地持久化、桌面能力不足；
- GitHub API 未识别到许可证。

结论：可参考轻量 PDF 文本提取流程，不作为底座。

## 4. `Leamon-Lee/IELTS-Desk`

### 可借鉴

- Tauri 2 + React + TypeScript；
- local-first；
- Listening/Reading/Writing；
- 本地媒体和 JSON 题包；
- practice/timed/mock；
- 保存 Session 和成绩；
- 可执行桌面程序方向与本项目最接近。

### 不足与风险

- 项目体量很小、成熟度未知；
- README 明确使用 JSON-only、无 SQLite，与本项目长期状态管理目标不同；
- 当前 practice 主页面集中在一个较大的 `PracticePage.tsx`；
- 未发现本项目最重要的共享 annotation、自由双 Pane、AI、复杂导入；
- GitHub API 未识别到许可证。

结论：这是最值得参考的“桌面骨架”，但仍不直接 fork/复制。独立实现可避免继承其数据限制和单页耦合。

## 5. 最终路线

采用：

```text
Tauri 2 + React + TypeScript + Rust + workspace SQLite
```

从零搭建核心架构，并仅参考候选项目的产品行为：

- `ielts-academic-platform`：标记和 split UX；
- `IELTS-Studio`：导入、AI、词汇、复盘；
- `IELTS-Desk`：Tauri/local-first/本地媒体；
- `IELTS-CDI-converter`：轻量 PDF.js 流程。

除非某个仓库后来补充了明确许可证并完成兼容性核查，否则不得复制其实现。

## 6. 法律与内容边界

公开 GitHub 仓库不等于任意可复制的开源项目。没有许可证时，默认版权仍然适用。即便 GitHub 提供 fork 按钮，也不等于获得在 GitHub 服务之外自由分发衍生软件的完整许可。

因此：

- 参考功能思想；
- 自己写代码；
- 自己制作 demo；
- 用户本地管理自己合法持有的材料；
- 公共仓库只发布程序和格式规范。
