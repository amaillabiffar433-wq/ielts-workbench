# Reading PDF 人工结构化导入

更新日期：2026-09-08

## 能力边界

该流程把用户合法持有的文本层 PDF 整理为 `IELTSPack v1` Reading 模块。它支持任意数量 Passage、每篇多个题组、显式题组成员、答案映射和可恢复草稿；不做 OCR、跨栏/表格视觉重建、AI 推断或复杂 PDF 自动拆分。简单单 Passage 入口继续保留。

## 稳定身份与编辑

- 草稿、pack、test、module、Passage、正文块、questionGroup、共享选项、question 与题目选项在创建时一次生成 ID。
- 改名、重排、移动不会重新生成 ID；题号是展示/答案录入字段，不作为底层身份。
- 题组成员由稳定 questionGroupId 直接归属，允许非连续题号；最终 Reading Pane 的题组选择可直接使用相同 group ID。
- 来源片段保留页码、文本和处置状态。每个片段必须分配到稳定目标，或由用户明确忽略，才能安装。

## 草稿、恢复与安装

- 草稿通过现有 `LearningRepository` settings 保存。小型索引与每份 payload 分开，Tauri 中写入用户工作区的 SQLite；不使用 renderer `localStorage`，也不另建数据库。
- 保存 source SHA-256、大小、页数、文本快照、阶段、当前编辑对象、来源选择和全部稳定 ID。恢复后不要求原文件仍在原路径；重选文件必须同时匹配 SHA-256、大小和页数。
- 450 ms 自动保存并在 Tauri 关窗前刷新；保存失败明确提示且不会显示虚假成功。取消文件选择、返回或正常退出均保留草稿，只有“明确丢弃此草稿”会删除草稿。
- 安装前执行结构校验和现有 IELTSPack 校验；安装按钮有单次锁。源 SHA 去重提示与 packId 冲突分开判断，同源可建立不同 packId，不覆盖既有题包。

## 校验语义

阻塞错误包括：草稿/schema 无效、缺少 Passage 正文/题组说明/题目、重复稳定 ID、重复或无效题号、来源目标失效、仍有未分配片段、不支持题型、选择项/答案无效、填空标记不合法。警告包括：空答案（按未评分处理）、缺少来源页以及题目仍标记为待人工复核。

Answer Key 以完整 Reading 模块中的唯一题号定位，再写入稳定 questionId。重复答案行、找不到题号或重复题号歧义会让整批操作失败，不做部分写入。

## 原创验收材料

- 生成脚本：`samples\original-structured-pdf\scripts\generate_original_structured_pdf.py`
- 预期结构：`samples\original-structured-pdf\expected-structure.json`
- 生成 PDF（Git 忽略）：`local-data\import-samples\original-reading-structured.pdf`
- 结构：7 页、3 Passage、6 题组、Question 1–22；Q18 位于 Passage 3；页面 4 同时出现 Passage 2 题目与 Passage 3 开始；三篇均跨页。
- 内容完全原创，包含共享选项、字数限制和跨 Passage 重复句，未包含 Cambridge 或第三方试题。

## 当前证据与限制

- 模型/页面自动化覆盖稳定 ID、任意 Passage、同页/跨页分配、移动/删除、答案歧义、校验、草稿恢复、来源核验、失败保留和旧简单流程。
- 浏览器层已从生成 PDF 走完选择、提取、3 Passage/6 题组/22 题确认、答案映射、预览安装和打开 Reading；该证据不替代 Tauri 原生文件对话框、SQLite 和 Release 重启验收。
- 当前 IELTSPack v1 没有独立 Reading 表格对象；必要表格/列表上下文只能保存在题组说明与共享选项。不能无损表达的版式必须人工调整或等待 schema 扩展。
