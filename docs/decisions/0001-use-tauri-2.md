# ADR 0001：采用 Tauri 2 构建桌面应用

- 状态：Accepted
- 日期：2026-09-01

## 背景

IELTS Workbench 必须是 Windows 优先、未来可扩展到 macOS 的本地桌面 GUI。核心练习需要离线访问用户选择的工作区、SQLite 和本地媒体，同时需要明确的文件权限与未来的安全凭据边界。它不是需要注册、云账户或常驻 HTTP 服务的托管网站。

## 决策

采用 Tauri 2 作为桌面壳：

- React + TypeScript + Vite 负责应用内 GUI；
- 使用系统 WebView 和标准操作系统标题栏；
- Rust 负责路径验证、工作区、SQLite、本地媒体、IPC 校验及未来网络与密钥访问；
- renderer 只通过明确的 repository/service 接口调用受限 Tauri command；
- 核心功能不依赖本地 HTTP 后端、Spring Boot 或 MySQL；
- capability 和 CSP 按最小权限配置，不加载远程页面。

## 结果

正面结果：

- 可交付独立桌面程序，同时保留 React 的组件与测试生态；
- 文件、数据库和秘密能力集中在 Rust 信任边界；
- 核心使用系统 WebView，安装体积和常驻资源小于捆绑完整浏览器的方案；
- Windows/macOS 可共享大部分领域与 UI 代码。

代价与风险：

- Windows 构建依赖 Rust MSVC、Microsoft C++ Build Tools、Windows SDK 和 WebView2；
- IPC DTO、Tauri capabilities 与资源协议需要额外安全审计；
- renderer 单独在浏览器中运行不能证明桌面路径、SQLite 或权限链路正确。

当前机器的 WebView2 可用，但 Rust/Cargo 与 MSVC toolchain 缺失；在补齐前不能声称 Tauri 开发启动、Rust 测试或打包通过。

## 未采用方案

- 托管 Web 应用或本地 Spring Boot/MySQL：超出个人离线桌面工具需求，并扩大部署与隐私面。
- Electron：可以实现需求，但本项目选择 Tauri 以使用系统 WebView，并把原生能力收束到 Rust；这不是对 Electron 的通用否定。
- 纯浏览器/PWA：无法满足受控的本地工作区、SQLite 和独立桌面交付要求。
