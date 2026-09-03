# IELTS Workbench：先读这里

这个启动包用于让 Codex 在 Windows 上开始搭建一个真正的本地桌面 GUI 应用，而不是部署到浏览器中的网站。

## 推荐放置位置

考虑到项目和后续题库、音频、图片会逐渐变大，建议把源码和学习资料放在非 C 盘，例如：

```text
D:\AI\IELTS-Workbench
D:\IELTS-Workbench-Data
```

源码目录与学习资料目录分开：

```text
D:\AI\IELTS-Workbench          # Git 仓库、源码
D:\IELTS-Workbench-Data        # 题库、媒体、SQLite、备份
```

Codex 不应擅自修改全局 npm、Rust 或系统配置，也不应把大型题库复制到 C 盘。

## 使用方法

1. 新建源码目录并进入：

```powershell
mkdir D:\AI\IELTS-Workbench
cd D:\AI\IELTS-Workbench
```

2. 把本启动包里的以下文件复制到项目根目录：

```text
AGENTS.md
PROJECT_SPEC.md
REFERENCE_AUDIT.md
02_NEXT_PHASE_PROMPTS.md
```

3. 在该目录打开 Codex。

4. 将 `01_CODEX_MASTER_PROMPT.md` 的正文完整发送给 Codex。

5. 让 Codex先检查环境、写执行计划，再直接开始实现。不要让它只给方案而不落地。

## 本轮真正要完成什么

第一轮不是一次性做完完整 IELTS 平台，而是交付一个可启动、可打包、数据能持久化的桌面端“纵向切片”：

- Tauri 桌面窗口；
- 本地工作区；
- SQLite 数据库；
- 原创示例题包；
- Library；
- Reading 双自由窗格；
- 两边共享答案和文字标记；
- Listening 基础播放器；
- Writing 自动保存；
- Settings 和 AI Provider 接口占位；
- 单元测试、构建说明和下一步清单。

PDF/DOCX/OCR、DeepSeek 真正联网、复杂题型和完整 Cambridge 4–21 导入在后续阶段增加。

## 重要边界

- 不把任何 Cambridge 真题、音频、图片或答案提交到公开仓库。
- 不抓取或内置第三方盗版题库。
- 不直接复制当前没有明确许可证的候选 GitHub 项目代码。
- 可以参考其产品行为和界面思路，但核心代码应独立实现。
