# 04 — Information Architecture

顶层只保留五个长期任务域：

1. **Home** — Today、Continue、Due Review、Recent Activity、Daily Brief。
2. **Library** — Cambridge Book → Test → Skill → Session。
3. **Review** — Due / Mistakes / Marked / Vocabulary / History。
4. **Progress** — 基于真实 Session 的时间、正确率、技能与题型趋势。
5. **Settings** — Workspace、Sources & Import、Appearance、Backup、Obsidian、Privacy。

Reading、Listening、Writing 不再是顶层导航；它们是从 Library 或 Review 进入的任务上下文。导入属于 Settings / Sources，而不是日常学习主路径。Vocabulary 归入 Review，但保留可直达路由用于深链接。

路由需要保留旧入口的兼容重定向，避免已有书签或历史 Session 失效。所有导航目标均由稳定 pack/test/module/session ID 驱动，不使用 DOM 位置或像素作为身份。
