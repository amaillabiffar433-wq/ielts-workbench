# 03 — Cambridge Import Plan

## 原则

- 原始 PDF/音频始终只读；生成物进入用户工作区或 `local-data/`，不得提交 Git。
- 内容来源、文件 SHA-256、页码/音频片段、OCR 版本和人工确认状态必须可追溯。
- OCR 只提供候选文本；题号、题型、选项、答案、段落顺序和媒体对应关系都需要人工确认。
- Question pack 安装后不可变；用户答案、批注、词汇和复习状态只写 SQLite。

## 分阶段

1. 用 Cambridge 20 Test 1 建立单本闭环：渲染、OCR、模块切分、Reading/Listening 数据映射、人工校正、安装与练习。
2. 对同书 Test 2–4 复用模板，但逐份核验边界和音频映射。
3. 扩展至 Cambridge 19→17，再根据扫描质量向早期卷扩展。
4. Cambridge 21 仅在本机确有合法源文件时纳入；当前状态为缺失。

## 去重与身份

源文件以 SHA-256 去重；题包、Book、Test、Module、Passage/Section、QuestionGroup、Question 和 Asset 均使用稳定 ID。相同哈希只记录一个规范源和多个别名，不删除副本。

## 发布门槛

所有阻断错误清零、答案不在 Exam UI 泄漏、媒体可离线读取、Rust/TypeScript 双边校验一致、重启恢复通过后，才允许安装到正式用户工作区。
