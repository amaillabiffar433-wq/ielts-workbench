# 03 — Content Import Plan

## 原则

- 原始 PDF/音频始终只读；生成物进入用户工作区或被 Git 忽略的 `local-data/`，不提交私有题库内容。
- 内容来源、文件 SHA-256、页码/音频片段、OCR 版本与人工确认状态必须可追溯。
- OCR 只提供候选文本；题号、题型、选项、答案、段落顺序和媒体对应关系都需人工确认。
- Question pack 安装后不可变；用户答案、批注、词汇和复习状态只写 SQLite。

## 实施顺序

1. 以已核对的 Cambridge 17 私有题包继续验证 Reading/Listening 完整链路。
2. Cambridge 20 只在 Answer Key/Transcript 来源可靠后，选 Test 1 做渲染、离线 OCR、模块切分、人工校正、安装和作答闭环。
3. 对同书 Test 2–4 复用结构模板，但逐份校验页面边界、题号、答案和音频映射。
4. 再向 Cambridge 19→4 扩展。Cambridge 21 仅在本机确有合法源文件时纳入；当前缺失。
5. DDDD 或其他来源必须先得到普通、已授权的本地导出；任何受访问控制、加密或付费权限保护的提取路线都停止。

## 去重与身份

源文件以 SHA-256 去重；Source、Collection/Book、Test、Module、Passage/Section、QuestionGroup、Question 与 Asset 均使用稳定 ID。相同内容 hash 只记录一个规范源与多个别名，不删除源文件。

## 发布门槛

阻断校验错误清零、答案不在 Exam UI 泄漏、媒体可离线读取、TypeScript/Rust 双边校验一致、提交与重启恢复通过后，才允许安装到正式用户工作区。
