# 00 — Current State

审计日期：2026-09-17

权威源码：`D:\Projects\雅思or算法软件项目`

分支：`codex/product-os-rebuild`

## 可保留

- Tauri 2 + React + TypeScript + Rust + SQLite 的本地优先架构，以及前端 repository/service 接口。
- `IELTSPack`、稳定领域 ID、只读题包与可变用户数据分离、工作区路径校验和 SQLite migration。
- Reading 多 Passage/题组/题型、双 Pane、批注、题目标记、可靠计时、首次提交不可变、Review 与历史 Session。
- 本地 PDF/图片导入、离线 OCR、可视保真模式、结构化人工确认、工作区备份/恢复。
- Cambridge 书架聚合、词汇持久化与 Markdown/JSON/CSV 导出。

## 需要重构

- 顶层导航仍按“阅读/听力/写作”等练习入口组织，不符合 Home / Library / Review / Progress / Settings 的长期产品信息架构。
- 页面语言混合中英文；视觉基底已经接近暖纸张，但层级、密度、响应式和跨页面一致性不足。
- Library 已具备 Book → Test → Skill 聚合，但书序、最近学习、进度和空状态仍需统一。
- Reading 分栏默认值和窄屏策略与目标 54/46 不一致，缺少双击复位的显式交互。
- Listening 仍以基础播放器为主；缺少波形、音频位置恢复、±5 秒、精听填空和可审计转写时间轴。
- Review 目前偏 Session 结果页，没有跨 Session 的待复习队列和调度模型。
- Progress、Home 仪表盘与 Obsidian 日报尚未形成真实数据闭环。

## 应移除或降级

- 顶层“Practice/阅读/听力/写作”式导航；练习入口应下沉到 Library 的 Book → Test → Skill。
- 对尚未实现或没有真实数据支持的统计占位、装饰性指标与不可操作入口。
- 任何把网页预览、mock IPC 或截图外观当作 Windows 原生验收的表述。

## 当前验证基线

- `npm test`：43 个文件、242 项通过。
- `npm run lint`：通过。
- `npm run build`：通过，OCR 模型哈希校验成功；仅有既存 chunk size 警告。
- `cargo test --manifest-path src-tauri/Cargo.toml`：38 项通过；仅有链接器的既存警告。

这些结果只证明重构前检查点可编译和测试通过，不代表本轮终态验收。
