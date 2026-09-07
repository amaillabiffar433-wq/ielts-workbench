# Reading 多 Passage 功能与验收记录

更新日期：2026-09-07

## 已完成能力

- Reading 以 `sections[]` 作为 Passage 层；Pane A / B 分别维护文章、题目或整套模式，Passage、题目范围和滚动位置互不覆盖。
- 题目可选全部、指定 Passage、连续题号范围或单题。范围跨 Passage 时保持模块原始顺序，并保留题组标题、说明、字数限制、共享选项及题目自身材料。
- 展示题号与身份分离。`questionId`、`sectionId`、`blockId` 不随筛选改变；旧 Reading v1 缺号时只按完整模块稳定顺序补号，Listening 仍要求显式题号。
- 答案继续以 Session + questionId 持久化；标记继续使用 blockId、offsets、quote、prefix、suffix。同一逻辑内容在两 Pane 的 DOM ID 使用 Pane 前缀，底层状态仍共享。
- Pane 视图状态使用 `reading.viewState.v1.<sessionId>` 写入现有工作区 SQLite settings；等待恢复完成后才允许保存，失效引用会安全回退。
- 整套模式逐 Passage 渲染自身正文和题组，不再出现第一篇正文配全部题目的混合状态。

## 原创验收样本

- 源目录：`D:\Projects\雅思or算法软件项目\samples\original-multi-passage-pack`。
- 结构：3 Passage、Question 1–21；Q14–20 跨 Passage 2/3；Q18 位于 Passage 3；只使用现有题型。
- Passage 1/3 含完全相同句子但使用不同 block ID，用于验证标记不会仅凭文本串联。样本为项目原创，不含 Cambridge 或第三方试题。
- 正常打开方式：导入中心 → 选择题包目录 → 校验预览 → 勾选权利确认 → 确认安装 → 题库展开 Northbridge Field Notes → 打开 Reading。

## 自动化结果

- 最终标准 `npm test` 连续两次：27/27 文件、135/135 测试。
- `npm run lint`：通过，0 warning。
- `npm run build`：通过，2002 modules transformed；仅有既知非阻塞大 chunk 提示。
- `cargo test --manifest-path src-tauri/Cargo.toml`：26/26 通过。
- 覆盖非第一 Passage、四种题目选择、跨 Passage/无效范围、Pane 独立状态、同题同步、标记隔离、唯一 DOM ID、完整 Review 统计、滚动/导航、状态恢复与旧单 Passage 回归。

## Release 原生证据

- EXE：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`；12,631,040 字节；SHA-256 `B04448D8E8D2ABD6068AB124397B31BE7E828A2B3D2BB79BBF12A825BA73FF89`。
- 验收工作区：`D:\IELTS-Workbench-Reading-Acceptance-20260907`；Session `3a372276-af6c-42f0-bf0f-00b132ddc1e0`。
- Vite 1420 关闭时从 `http://tauri.localhost` 独立启动。实际完成 P2/Q18、四种题目切换、独立滚动、目标 Pane 导航、同题答案同步、同 Passage 双 Pane、重复文本标记隔离及整套配对。
- SQLite 写入 Q18=`true`、2 条标记和最终视图状态；正常退出并直接重启后恢复左 Passage 2、右 Q18、答案与 Passage 2 标记。

## 已知限制

- PDF 辅助导入仍只从用户选择页生成一个 Reading Passage；没有 OCR、自动多 Passage 识别或复杂版面拆分。
- IELTSPack v1 的 Reading 正文块当前是 heading/paragraph/instruction/quote 文本块；本轮样本没有新增 Reading 图片块或新题型。
- Pane 滚动位置按内容选择尽量恢复，但不承诺跨题包内容版本变更后的像素级位置一致；失效选择会回退并提示。
- 本轮未重建或安装 MSI/NSIS；交付对象是独立 Release EXE。
