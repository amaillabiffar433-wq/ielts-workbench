# 02 — DDDD Static Audit

目标安装器：`D:\downloads\jiufenxuezhang-ielts-setup-0.9.15-rc.1.exe`

## 安全与来源边界

- 文件版本 `0.9.15-rc.1`，产品名“九分学长考雅机考平台”，公司字段 `9fnnn`。
- 大小 105,587,692 字节；SHA-256 `84DF038DD92A4A695EE49E600263CAF937EE8903E2CDF6DAF101D8F8620FA1B5`。
- Authenticode 状态为 `NotSigned`。本次未运行安装器、未安装软件、未登录、未调用在线接口。
- 使用与 winget 清单 SHA-256 一致的便携 7-Zip，只对 NSIS 和内部 `app-64.7z` 做静态解包。

## 技术结构

- NSIS 3 Unicode 安装器；内部为 Electron 应用。
- Electron 包名 `xxgg-ielts`，Vue 3 + Vue Router，主进程使用 `better-sqlite3-multiple-ciphers`。
- 无应用 source map；仅对 `app.asar` 做常规静态提取和格式化，没有尝试绕过混淆、授权或加密。
- 本地题包扩展名为 `.xxpack`，至少含 `manifest.json`、`content.db`、`assets/` 和 `export-report.md`。
- 导入时校验整包 SHA-256、`content.db` SHA-256、首个资源 SHA-256，并记录 pack/release/part/content hash。

## 可借鉴的产品行为

- 本地题包的版本、覆盖范围与哈希完整性验证。
- Reading/Listening/Writing 的考试页与 Review 页分离。
- Listening Exam 与 Intensive Listening 的模式区分。
- Review 中题号状态、书签、高亮、笔记和解释面板的组合方式。

## 明确不移植

- 登录、微信回调、授权证明上传、在线 API、自动更新与远程题库。
- 任何源码、图标、图片、音频、题目、文案或 CSS 数值的复制。
- 将主数据库或题包默认放入 AppData 的做法；IELTS Workbench 继续以用户选择的工作区为权威存储。

本审计只产生独立事实记录和行为启发，不构成对第三方代码或内容的再利用。
