# 09 — Migration Plan

当前 SQLite schema 已追加 migration 0005，在 0004 词汇来源上下文之后新建 `review_items` 与 `review_events`。后续只追加 migration，不修改已执行脚本。

本轮已落地的用户数据扩展：

- review item 与只增 review event，包含可选 Listening `source_start_ms`；
- listening playback position 与用户偏好通过 settings 持久化；
- Home/Progress 直接由 Session、Answer、Pack 与 review 快照聚合，不伪造独立埋点；
- Obsidian 简报只在用户选定 vault 后写入 `IELTS/YYYY-MM-DD.md`，替换时先备份到学习工作区，不把 vault 内容副本存入 SQLite。

迁移要求：启动前数据库备份、单事务执行、旧库升级测试、外键检查、失败不部分提交。Listening v1 的 `transcriptCues` 为可选扩展，旧题包解析为空数组；若以后改变必填性或语义，必须提升模块 schema 版本，并同时更新 TypeScript、Rust、导入器与兼容测试。
