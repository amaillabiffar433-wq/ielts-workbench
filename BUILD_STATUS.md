# Visual Fidelity PDF Import — BUILD NOT COMPLETE

更新：2026-09-12。开发目录 `D:\Projects\雅思or算法软件项目`，分支 `feat/pdf-import-mvp`，起始 HEAD `47f7320ed143888fae4c4098afb087d9dd5d8e2d`。上一轮 UI 的 21 个修改文件与 8 个新增文件均保留；不回退、不清库、不删除旧 EXE、不推送。

## Completed

- 恢复现场，确认原 Reading v1/v2/v3、双 Pane、SQLite、PDF.js/人工整理器与 no-bundle Release 链路。
- 请求用户提供可合法本地使用的 Cambridge PDF；在收到前使用原创 fixtures，不声称真题十分钟验收通过。
- P0 实现：Reading schema 4 增加 snapshot/image/figure，旧 1/2/3 继续读取；没有新建 Reading 页面或数据库。
- P0 实现：工作区 PNG 哈希资源、大小/解码/路径校验、生成题包复制资源；前端新增原版区域框选、页码/缩放/左右栏、替换保留 blockId、混合上下文和图片独立缩放。
- P0 实现：快速导入、扫描页不再因无文本层拒绝进入草稿；批量题号+现有答案控件，正文块拆分/合并/排序。
- 22:44 第一版 no-bundle EXE 在 1420 无监听时独立启动。A 文字、C 无文本扫描 PDF 已通过 Windows 文件对话框→原图→作答框→答案 Key→校验→安装→双 Pane 共享答案。
- C 的页 OCR 实测 8.466 秒、置信度 95%，只读取 tauri.localhost 下的引擎/模型。原生图片、OCR 文字、高亮 note/flag 已落库；正常关窗进程结束，重开后 IPC 读回答案/标记和图片。

## Current

- 修正验收中发现的旧入口文案及跨初始范围截图的来源页记录；正在重跑门禁，再构建最终 EXE 统一验收 A–F。
- P1：本地 Tesseract.js 6.0.1、固定哈希英文模型随包；页/区域 OCR、进度、取消、90 秒超时与可编辑结果。CSP 仅增加本地 WASM 执行，不开放外网或 JS eval。
- P2：PDF x/y/width/height 基础双栏顺序和启发式置信度；复杂/扫描警告、左右栏/任意区域文本提取与原图兜底。
- 六类原创 PDF A–F 已生成到 `output/visual-pdf-fixtures-20260912`，扫描样本两页均无文本层。B 双栏和 D 合并/嵌套表格已查看渲染图。

## Remaining

- P0：正文和题组混合图片、缩放、资源重启恢复、草稿编辑/安装闭环。
- P1：扫描页检测与离线英文页/区域 OCR，人工修正；OCR 失败不阻止截图导入。
- P2：基础分栏/置信度、手动区域提取。
- P3/P4：用现有答案类型表达图形/流程题，批量题号/选项/答案键与编辑提效。
- 六类原创 PDF fixtures、完整自动化和真实 Windows Release 导入/做题/退出恢复。
- 用户提供 Cambridge 样本后计时验收；缺文件时保留 BUILD NOT COMPLETE 的最终标准边界。

## Tests

- 跨来源页补丁后：22:55:40 / 22:57:02 标准前端连续 234/234（40 文件），退出码均 0；最终 lint、Cargo 36/36 退出码均 0。最终 Tauri beforeBuild 已执行 `npm run build` 并通过（Vite 2049 modules），原生优化编译中。
- 新恢复测试发现 InMemory Repository get/setSetting 未先 hydrate，已补等待，避免首次读取为缺省；Tauri 仍使用原生 Repository，不回退。
- 首轮 Cargo 34/35；新增重启测试遗漏创建隔离 SQLite 文件，导致 Workspace::open 正确拒绝。补测试初始化后 36/36，不放宽生产校验。

## Known Issues

- 草稿 settings 仍有 240 KiB 限制，截图已放工作区文件而非 base64；大篇幅 OCR 文字需选择页段导入。
- Reading schema 4 只用于视觉扩展，旧应用不能读此新内容；新应用保持旧包支持。草稿 1/2/3 升 4 保留 ID。
- 未获得真实 Cambridge PDF；不会联网搜盗版或提交版权内容。

## Next

最终门禁 → 修正文案/来源页后的 EXE → 六类原生导入与真实完整重启、判分、资源哈希 → 统一记录交付。
