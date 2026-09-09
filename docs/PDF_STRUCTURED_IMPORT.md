# Reading PDF 人工结构化导入

更新日期：2026-09-09

## 能力边界

该流程把用户合法持有的文本层 PDF 人工整理为 IELTSPack Reading 模块。它支持任意数量 Passage、每篇多个题组、显式题组成员、批量题目/选项/答案录入、可解释的边界候选、可恢复草稿，以及题组内按顺序混排的段落、单层列表、规则矩形表格和 summary/notes completion；作答位置可绑定当前题组已有简答/句子填空题。它不做 OCR、自动表格识别、跨栏视觉重建、AI 推断或复杂 PDF 自动拆分。简单单 Passage 入口继续保留。

## 稳定身份与编辑

- 草稿、pack、test、module、Passage、正文块、questionGroup、共享选项、question、题目选项、上下文块、列表项、表格行与单元格在创建时一次生成 ID。
- 改名、重排、移动不会重新生成 ID；题号是展示/答案录入字段，不作为底层身份。
- 题组成员由稳定 questionGroupId 直接归属，允许非连续题号；最终 Reading Pane 的题组选择可直接使用相同 group ID。
- 来源片段保留页码、文本和处置状态。每个片段必须分配到稳定目标，或由用户明确忽略，才能安装。
- 表格内题目引用保存原 questionId；移动行列、改题号或重命名不改变绑定。每道题在同一题组上下文中最多一个主作答位，不建立表格专用答案或评分记录。

## 表格／列表人工整理

1. 在“来源与结构”选择当前题组，在“题组结构化上下文”中新增段落、列表或表格；来源 PDF 只提供文本核对，不自动猜测布局。
2. 列表可选有序/无序、增删和重排单层条目。表格可设置 1–30 行、1–12 列、首行表头和首列行标题，编辑普通文本/换行，并用下拉框绑定当前题组合法题目。
3. 缩小或删除含题目绑定的表格结构前必须确认；解除绑定仅移除显示位置，不删除题目或已有答案。未绑定题目仍按原方式显示。
4. 导入预览、Reading 和 Review 共用同一语义化渲染组件。窄 Pane 中表格在自身容器横向滚动；PDF 文本作为普通文本渲染，不接受任意 HTML。

## 批量整理与规则建议

1. “批量工具”可一次粘贴多道带题号的题目和 A–H 选项。解析结果先进入可编辑预览；重复题号、与草稿冲突、空题干和未解析行会单独列出，确认前不会创建 questionId。
2. Answer Key 先按完整 Reading 模块的唯一题号预览到稳定 questionId；重复答案、找不到题号或重复题号歧义会阻止整批写入，不做部分匹配，也不会让后续答案整体错位。
3. 题号范围分配先显示实际影响的稳定 questionId，再整体移动到指定 questionGroupId。题组统一设置可批量更新题型、说明、字数限制和共享选项，但不改变 group/question ID、题号或已有答案。
4. 对文本层来源只识别显式 `READING PASSAGE n`、`Questions n-m`、题号行和 A–H 选项行，输出带来源 segmentId、页码和原因的候选。候选不会自动修改草稿；用户可修改、采纳或拒绝，重新生成候选也不会重建已确认对象。

## 草稿、恢复与安装

- 草稿通过现有 `LearningRepository` settings 保存。小型索引与每份 payload 分开，Tauri 中写入用户工作区的 SQLite；不使用 renderer `localStorage`，也不另建数据库。
- 保存 source SHA-256、大小、页数、文本快照、阶段、当前编辑对象、来源选择和全部稳定 ID。恢复后不要求原文件仍在原路径；重选文件必须同时匹配 SHA-256、大小和页数。
- 450 ms 自动保存并在 Tauri 关窗前刷新；保存失败明确提示且不会显示虚假成功。取消文件选择、返回或正常退出均保留草稿，只有“明确丢弃此草稿”会删除草稿。
- 安装前执行结构校验和现有 IELTSPack 校验；安装按钮有单次锁。源 SHA 去重提示与 packId 冲突分开判断，同源可建立不同 packId，不覆盖既有题包。
- 老草稿读取时只做确定性字段补齐，不重建 Passage、题组、题目、选项、上下文或来源 ID。无结构化上下文的旧题包继续按原方式显示。

## 题包版本和校验

- Manifest 保持 IELTSPack v1 的固定目录/文件布局。Reading 无结构化上下文时仍可写模块 schema v1；只含段落/列表/表格时可写 v2；使用 summary/notes completion、YNNG、多选或统一 matching 时写 Reading module schema v3。新版读取 v1/v2/v3；旧版不保证读取较新模块版本。
- 前端 Zod 与 Rust 安装校验都要求矩形表格、全局稳定 ID 唯一、绑定 questionId 属于当前题组、类型为简答/句子填空、且同题不重复绑定。Reading v1 携带 `contextBlocks` 会被拒绝，避免字段被静默丢弃。
- 每题组最多 32 个上下文块、50 个列表项、30×12 表格、每个文本节点 4,000 个 Unicode 字符、总计 512 个上下文持久节点。

## 校验语义

阻塞错误包括：草稿/schema 无效、缺少 Passage 正文/题组说明/题目、重复稳定 ID、重复或无效题号、来源目标失效、仍有未分配片段、不支持题型、选择项/答案无效、填空标记不合法，以及非矩形/超限表格、未知节点、跨题组或悬空 questionId、同题重复绑定。警告包括：空答案（按未评分处理）、缺少来源页以及题目仍标记为待人工复核。

Answer Key 以完整 Reading 模块中的唯一题号定位，再写入稳定 questionId。重复答案行、找不到题号或重复题号歧义会让整批操作失败，不做部分写入。

## 原创验收材料

- 生成脚本：`samples\original-structured-pdf\scripts\generate_original_structured_pdf.py`
- 预期结构：`samples\original-structured-pdf\expected-structure.json`
- 生成 PDF（Git 忽略）：`local-data\import-samples\original-reading-structured.pdf`
- 结构：7 页、3 Passage、6 题组、Question 1–22；Q18 位于 Passage 3；页面 4 同时出现 Passage 2 题目与 Passage 3 开始；三篇均跨页。
- 内容完全原创，包含共享选项、字数限制和跨 Passage 重复句，未包含 Cambridge 或第三方试题。

本轮独立表格／列表样本没有覆盖上述多 Passage 样本：

- 生成脚本：`samples\original-table-list-pdf\scripts\generate_original_table_list_pdf.py`
- 预期结构：`samples\original-table-list-pdf\expected-structure.json`
- 生成 PDF（Git 忽略）：`local-data\import-samples\original-reading-table-list.pdf`
- 结构：3 页原创文本层；5×3 表格、表头、行标题、Q17–19（含 Q18）、三项有序列表、字数限制和两个不同单元格中的相同 `manual check`。
- 文件：6,142 字节；SHA-256 `6347737B634FDA5E2C3D864C9F87C7C799FE9CEC39DE90FE9A335125C85A35A1`；三页均已渲染并目视检查。

本次合并交付另提供不进入生产默认数据的完整原创工程样本：

- 可直接安装题包：`samples\original-daily-reading-pack`，Reading schema v3，3 Passage、40 个稳定题目，覆盖 TFNG、YNNG、单选、多选、四类 matching、简答、句子/summary/notes/table completion。
- 文本层 PDF 生成器：`samples\original-daily-reading-pdf\scripts\generate_original_daily_reading_pdf.py`；预期结构为同目录 `expected-structure.json`。
- 生成 PDF（Git 忽略）：`local-data\import-samples\original-daily-reading-complete.pdf`；11 页、18,310 字节、SHA-256 `4C229ABE42DC96CC8D927DB90E54CDE4687DAB97C55308B3B8E8ABE6CC7DE308`。已提取文本并逐页渲染目视检查。
- 样本全部原创，不是 Cambridge 真题，也不能替代用户实际材料的私有验收。

## 当前证据与限制

- 自动化覆盖旧题包/旧草稿、批量映射防错、稳定 ID/绑定、Reading v3 题型和评分、计时、历史/新 Session、备份篡改/恢复、表格内答案、双 Pane、Review 及 Writing 关窗回归。最终为 34 文件、204/204；Rust 33/33，lint 和 2013-module production build 通过。
- 真实 Tauri Release 在 `D:\IELTS-Workbench-PDF-Daily-Acceptance-20260909-1745` 从原创 11 页 PDF 走完系统文件选择、source 1–9/answer 10–11 页范围、可解释建议、3 Passage/11 题组/40 题人工修正、40 个答案确认、校验和正式安装。初始 105 个校验错误及 4 个非答案行均明确阻止安装，没有静默猜测或部分写入。
- 另在 `D:\IELTS-Workbench-Daily-Acceptance-20260909-1703` 验证完整题包练习、提交、Review、历史、新 Session 和一致性备份；恢复到新工作区后旧提交与当前练习均可读。路由切换后的陈旧关窗监听竞态已修复并在最终 EXE 原生复验正常退出。
- 日常交付 EXE 为 `D:\IELTS-Workbench-Releases\daily-use-20260909-191124\ielts-workbench.exe`，13,193,728 字节，SHA-256 `8BEEAACB85C301EC671157269FFE9D70B954ED895C9E90DA3E4BE909119F17A8`。
- 当前不支持合并单元格、嵌套表格、多层列表、单元格图片/公式、任意 HTML、复杂跨栏还原、OCR、AI 推断或自动表格识别。一次文字标记只能位于一个稳定段落、列表项或单元格内；跨单元格选择会提示且不保存。
