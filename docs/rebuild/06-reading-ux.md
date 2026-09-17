# 06 — Reading UX

## 目标布局

- 默认左右 54/46；拖动时即时反馈并保存到 Session 视图设置。
- 双击分隔条恢复 54/46；键盘可按小步调整并提供可访问标签。
- 左右 Pane 只保存视图状态；正文、答案、批注、词汇与标记属于同一 Session/内容实体。
- 1366px 保留双栏可读性；空间不足时采用明确的单 Pane/切换模式，不以隐藏控件换取宽度。

## 学习闭环

- 选择文本可添加 highlight/note/unknown word；引用使用 blockId + offsets + quote + prefix + suffix。
- Question navigation 支持 All / Unanswered / Marked，并能跳到下一题或下一标记题。
- 自动保存需显示 Saving / Saved / Error，答案、视图和计时分开处理失败。
- 首次提交后答案不可静默变更；结果按 Overview → Question review → Source context 三层展开。
- Exam 模式不显示答案、解释、AI 或禁止的辅助功能。
