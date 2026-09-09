# IELTS Workbench 当前状态

更新日期：2026-09-09

## 当前仓库

- 项目目录：`D:\Projects\雅思or算法软件项目`
- 分支：`feat/pdf-import-mvp`
- Reading 表格／列表上下文源码提交：`affa89d`（Reading module v2、草稿迁移、人工编辑器、共享渲染、表格内作答、标记与原创样本）
- Reading PDF 人工结构化导入源码提交：`a6771d6`（可恢复草稿、稳定 ID、三阶段编辑器、校验/预览、原创 PDF 与回归测试）
- Reading 稳定题组选择源码提交：`1b141d8`（按 `questionGroupId` 精确筛选、双 Pane 独立状态、安全恢复与回归测试）
- 本轮题组选择起始 HEAD：`a19e22358c3e6ce9dcb45dadcb39d91e003a6f2f`
- Reading 多 Passage 源码提交：`91c7e77`（Pane 独立选择、稳定题号/ID、视图恢复、原创三 Passage 样本）
- 本轮 Reading 起始 HEAD：`f7fd42af1584714f1b681f1662ce01a4f799b76e`
- 稳定性与 Release 源码提交：`23527b6`（Rust 首次编译修复、关窗保存、最小权限、D 盘 bundler cache）
- 桌面验收链路提交：`88e84ab`（原生 PDF、原创媒体及测试）
- 基线提交：`bdf9ac76bc71d8fb2d1fd1fbcaf7e977925e65f4`
- 迁移完成时工作树：干净
- 远程状态：本轮不推送

原项目仍保留在 `C:\Users\Exming\Documents\雅思or算法软件项目`，尚未删除，因此迁移核验期间没有释放 C 盘空间。

## 2026-09-09 Reading 结构化表格／列表上下文 MVP

- Reading 题组新增有类型的 `contextBlocks`：段落、单层有序/无序列表、规则矩形表格可按顺序混排。段落、列表项、表格行和单元格均持有稳定 ID；表格单元格只通过当前题组既有 `questionId` 绑定简答或句子填空，不另建答案或评分体系。
- 版本规则为 manifest 仍保持 IELTSPack v1 固定布局，Reading 模块无结构化上下文时继续写 `schemaVersion: 1`，含结构化上下文时写 `schemaVersion: 2`。新版兼容 Reading v1；旧版不保证读取 v2。结构化草稿 v1 读取时确定性迁移为 v2，只补空 `contextBlocks`，不改旧 ID。
- Structured Import 现在可直接新增/编辑/排序段落和列表，设置表格行列、表头/行标题、单元格文本和题目绑定；缩小或删除含绑定结构前必须确认。草稿把结构、ID、绑定和答案映射一起写入原 Repository settings/SQLite，正式安装仍经过既有前端与 Rust 双重校验。
- Reading、导入预览和 Review 复用同一结构化上下文组件。表格内答案继续写 Session + `questionId`；内嵌题不在下方重复。单题 Q18 保留整张表、题组说明和列表，只有 Q18 可编辑，其他题目位置为只读占位；窄 Pane 的表格在自身容器横向滚动。
- 表格/列表文字标记按稳定段落、列表项或单元格 ID 保存，offsets 不跨单元格；相同文字位于两个单元格时不会串标记。双 Pane 显示同一题组时，共用逻辑答案/标记，但 DOM ID 继续带 `left-pane` / `right-pane` 前缀。
- 原创样本为 `local-data\import-samples\original-reading-table-list.pdf`（3 页、6,142 字节、SHA-256 `6347737B634FDA5E2C3D864C9F87C7C799FE9CEC39DE90FE9A335125C85A35A1`）；生成脚本与预期结构位于 `samples\original-table-list-pdf`，未覆盖旧样本，也没有 Cambridge 内容。

### 本轮原生 Release 证据

- 新 Release：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`；12,801,536 字节；`2026-09-09 12:21:29.995 +08:00`；SHA-256 `918BB334B962CF91EF52A467EF2FBD0A7000863B2ECF41DFFEB503154F9AA9F4`。旧 EXE 已单文件备份到 `output\release-backup-20260909-121950`；本轮未生成或安装 MSI/NSIS。
- 独立验收工作区：`D:\IELTS-Workbench-Table-List-Acceptance-20260909-122427`；workspaceId `018440a1-4a7f-4f6c-ac59-e0e925678565`；数据库为同目录 `ielts-workbench.sqlite3`。Vite 1420 未监听，Release origin 为 `http://tauri.localhost` 且 Tauri runtime 为真。
- 原生 Windows 文件对话框选取原创 PDF 等哈希副本后，经真实向导新增段落、三项有序列表和 5×3 表格，绑定 Q17/Q18/Q19。正常退出并重开后，三个上下文块、15 个单元格 ID 和三处绑定均未变化；随后通过校验并正式安装 `pdf-reading-6347737b63-c577e79eba1d`。
- Pane A 为 Passage 1，Pane B 为单题 Q18 时，完整表格/列表保留且仅 Q18 可编辑。双 Pane 同题组时，左侧先改成 `west records`、右侧同步，再由右侧改回 `west desk`、左侧同步；左右 Q18 DOM ID 唯一，独立滚动实测为 120/260。
- 在单元格 `question-context-table-cell-619c918a-ada3-4406-ac89-20f09d0eea23` 对 `manual check` 建立黄色标记，另一同文单元格未显示标记。正常退出并直接重启 EXE 后，Passage/Q18 Pane 选择、Q18=`west desk` 和该标记均从 SQLite 恢复。
- Review 实际提交 Q17=`field team`、Q18=`west desk`、Q19=`blue folder`：前两题正确，Q19 因题包未提供标准答案显示“待核对”，没有被默认判错；完整段落、列表和表格均保留。
- 最终自动化：`npm test` 连续两次均为 30 文件、177/177；`npm run lint` 退出码 0；`npm run build` 转换 2009 modules、退出码 0；Cargo 29/29。

## 2026-09-08 Reading PDF 人工结构化导入

- 现有 PDF 导入页新增“多 Passage / 多题组（人工确认）”，简单单 Passage 流程仍保留。结构化草稿支持任意 Passage、题组、题目与来源片段的新增、删除、重排、跨归属移动，并在创建时一次生成稳定 ID。
- 草稿、来源文本快照、SHA-256、页码引用、向导阶段、编辑选择与稳定 ID 通过现有 Repository settings 保存；Tauri 下进入工作区 SQLite。恢复不读取原 PDF，重选时核对 SHA-256、大小与页数；取消或退出保留草稿，只有显式丢弃才删除草稿。
- 预览将不支持题型、重复题号/ID、无归属来源片段、无效答案与缺失必要结构列为阻塞错误；空答案、来源页缺失和“待人工复核”列为警告。安装使用既有原生题包校验/安装链路并防止重复点击；失败不删除草稿。
- 原创验收 PDF 为 7 页文本层、3 Passage、6 题组、Question 1–22；页面 4 同时含 Passage 2 与 Passage 3，三篇均跨页，Question 18 位于 Passage 3。生成脚本和预期结构可提交，生成的 PDF 位于被忽略的 `local-data\import-samples`。
- 浏览器层与真实 Tauri Release 均已走完 PDF 选择/提取、初始建议、显式忽略未分配片段、22 条答案映射、阻断校验、安装和 Reading 打开。原生工作区、草稿、题包、答案、标记和 Pane 选择均有 SQLite 与退出/重启读回证据。

### 本轮原生 Release 证据

- 新 Release：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`；12,642,816 字节；`2026-09-08 13:04:47.712 +08:00`；SHA-256 `5D3AC42913E9F9D7BB2C8F8E68AD9CDC41AD79F1EE29D20D229308F3CF8876C3`。构建命令为 `npm run tauri -- build --no-bundle`；未重建或安装 MSI/NSIS。
- 上一版 EXE 已单文件备份至 `D:\IELTS-Workbench-Releases\rollback-174d892-before-pdf-structured-20260908\ielts-workbench.exe`，12,631,552 字节，SHA-256 `F87A8E2211FF801D8A9BF270920E2D8E2B5EBF99E059C4E8E35ECDBF436F0D9E`；新旧哈希不同。
- 独立工作区：`D:\IELTS-Workbench-PDF-Structured-Acceptance-20260908-130850`；数据库为同目录 `ielts-workbench.sqlite3`；workspaceId `cba6de1f-e785-436d-bf6a-1b34b2c433c4`。Vite 1420 未监听，运行时 origin 为 `http://tauri.localhost` 且 Tauri API 可用。
- 原生 Windows 文件对话框选中 7 页原创 PDF 的等哈希验收副本；来源重新选择通过 SHA-256 校验。草稿 `pdf-structured-91388942-5705-4d24-ad80-763086d6e4e0` 以 45,520 字节 payload 写入 SQLite；退出后重开，3 个 Passage、6 个 questionGroupId、22 个 questionId 与标题原样恢复。
- 人为清空 Question 1 题干得到 `QUESTION_PROMPT_REQUIRED`，此时未安装半成品；修复、复核 22 题并映射答案后才安装 `pdf-reading-43955a0691-763086d6e4e0`。Reading 实际打开 Passage 3 的 Questions 14–18，再切到 Q18；双 Pane 同显 Q18 时答案同步为 `false`。
- Session `e0fa9a32-c695-42a8-bcce-f16072ebd6af` 保存 Q18 和新黄色标记 `mechanical clock`；标记锚点为 `content-block-9578034e-8dbb-4411-9d45-59028ffae26a`、offsets `33..49`。完整退出后进程结束，再次直接启动同一 EXE，Passage 3 / Q18、答案、标记与视图设置全部恢复，随后再次正常退出。

## 迁移验证基准

2026-09-05 采用“复制 → 核验 → 切换”迁移到 D 盘：

- D 盘迁移前可用空间：105.56 GB；目标目录原先不存在。
- 未发现 1420 端口监听或需要停止的 IELTS/Vite/Tauri 开发进程。
- 未发现 Tauri bootstrap、项目外 SQLite 或已配置的外部 IELTS 工作区。
- 复制包含 `.git`、源码、文档、配置、`local-data`、`output`、样本和恢复备份。
- `node_modules`、`dist`、`src-tauri/target` 未复制，改为在 D 盘重新生成。
- C/D 核心文件均为 662 个、3,838,842 字节；逐文件 SHA-256 差异为 0。
- 原创 PDF SHA-256：`2CD82AB886E160F4F64996484FE621860AFEEE774B366353902DB936706ABA48`。
- 原创静音 WAV SHA-256：`BFF9AE2D1C0DEFB0F2B9070F43439FCB723621DBEB1CCA5E2DBADCD9BFB13C68`。
- D 盘仓库 `git fsck --full` 未报告损坏；仅保留原仓库已有的 dangling objects。

## 能力与验证状态

| 范围 | 当前状态 | 证据或说明 |
| --- | --- | --- |
| React/TypeScript/Vite 前端 | D 盘最终验证通过 | 2026-09-09 `npm run lint` 退出码 0；`npm run build` 成功转换 2009 个模块并输出 PDF worker；仅有既知的大 chunk 提示 |
| 默认 `npm test` | 最终源码连续两次通过 | 2026-09-09 两次均为 30/30 文件、177/177 测试；未改超时、重试或全局超时 |
| Reading 多 Passage、稳定题组、双 Pane、答案与文字标记 | Release 原生验证通过 | 题组/单题保留结构化上下文；表格内答案共享，DOM/导航按 Pane 隔离；单元格标记按稳定 ID 隔离并完成 SQLite 退出/重启恢复 |
| Reading PDF 辅助导入 | 简单、人工多 Passage 和表格/列表流程均原生通过 | 新 3 页原创 PDF 经原生对话框和向导人工整理为段落/列表/5×3 表格，草稿重启、正式安装、表格作答与 Review 均通过；不声称自动表格识别 |
| Rust 工作区、SQLite、题包和媒体源码 | 原生编译与测试通过 | 2026-09-09 `cargo test --manifest-path src-tauri/Cargo.toml` 为 29/29；Reading v2、交叉引用、重复绑定和 v1 拒绝新增字段均有测试 |
| 原创 Listening/Writing 媒体 | 原生验证通过 | WAV 在真实 WebView 中播放；Exam 拖动/倍速/重播限制生效；900×560 Task 1 PNG 与 SQLite 草稿/版本均跨重启恢复 |
| Tauri dev | 原生验证通过 | 在真实 Tauri 进程中确认 `window.__TAURI_INTERNALS__`，设置页显示 D 盘工作区和 SQLite；两轮正常退出/重启通过 |
| Release/安装包 | 新 Reading EXE 独立运行通过 | Tauri 生产上下文 `--no-bundle` 生成新 EXE；Vite 关闭时从 `http://tauri.localhost` 启动并完成 Reading 退出/恢复；本轮未重建或安装 MSI/NSIS |
| DeepSeek、Vocabulary、OCR 等 | 未开始 | 明确不在本轮范围 |

## 当前阻塞与下一步

1. Reading 规则表格／单层列表上下文与表格内作答已经闭环，没有剩余环境或实现阻塞。
2. 用户可直接双击 `D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`；本轮验收数据位于 `D:\IELTS-Workbench-Table-List-Acceptance-20260909-122427`，不得删除。旧工作区、回退 EXE、C 盘项目和既有样本也保持不变。
3. 当前不支持合并单元格、多层列表/嵌套表格、单元格图片/公式、任意 HTML、复杂跨栏还原、OCR、AI 推断或自动表格识别。下一轮可单独评估“多层表头/合并单元格”的最小 schema，而不是直接扩成电子表格。

## 2026-09-08 Reading 稳定题组 Release 验收摘要

- 题目模式新增“题组”；下拉项以 Passage、题号摘要和题组标题/题型显示，实际 value、筛选及持久化始终使用题包原有 `questionGroupId`。IELTSPack v1 的前端与 Rust 校验本就要求题组 ID 稳定且全局唯一，因此未迁移数据库、未伪造旧 ID。
- 独立工作区：`D:\IELTS-Workbench-QuestionGroup-Acceptance-20260908`；SQLite：同目录 `ielts-workbench.sqlite3`；Session：`b894b975-a6d3-4560-b34c-b04ab0e73f77`。原创样本经真实 Rust `validate_pack_folder` 与 `install_pack` 命令校验、安装，source hash 为 `c9d663898631b8478382cd7d5a8d60bb7be9c94ba972bbb9ab0ba5c263f8d0c5`。
- Release 在 Vite 1420 未监听时从 `http://tauri.localhost` 独立启动。Pane A 选择 Passage 2；Pane B 选择稳定 ID `northbridge-p3-group-01`，只显示 Q16–18 及完整题组说明。切换到 `northbridge-p2-group-02` 时只显示 Q12–15，再切回后状态正常。
- 双 Pane 同显 `northbridge-p3-group-01` 时，Q18 DOM ID 分别为 `left-pane-northbridge-q18-section` 与 `right-pane-northbridge-q18-section`；从左侧改答后右侧同步为 `true`。最终恢复左 `passage/P2`、右 `questions/group/northbridge-p3-group-01`，完整退出并从“最近继续”重启后，选择、Q16–18 视图、Q18=`true` 和完整统计 `已答 1/21` 均恢复。
- 自动化新增 8 项测试，覆盖稳定 ID、同 Passage 多组、非连续题号、双 Pane、答案同步、失效 ID、安全加载旧 v1 状态和旧单 Passage 题包；最终两次标准前端回归均为 143/143，Cargo 26/26、lint、Vite build 均通过。
- 自动化目录框首次没有接受键盘地址，错误选择了上次使用的样本目录。原题包三项源文件未被覆盖；新增的 7 个工作区项在正常退出后完整移动到 `D:\IELTS-Workbench-Releases\accidental-sample-workspace-20260908-100624` 隔离保留，样本目录恢复为 `modules`、`manifest.json`、`README.md`，Git 状态恢复干净。原 bootstrap 备份 SHA-256 `EE4F97D6FF4F4A27A50184E9210762271A4D52333611BA8F7DC8A26A6C8617C0` 已核验，随后由真实 Tauri/Rust 命令初始化正确工作区。

## 2026-09-08 Reading 题组 Release EXE

- 可直接运行：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`。
- 修改时间：`2026-09-08 09:57:11.051 +08:00`；大小：12,631,552 字节；SHA-256：`F87A8E2211FF801D8A9BF270920E2D8E2B5EBF99E059C4E8E35ECDBF436F0D9E`。
- 上一版已单文件备份到 `D:\IELTS-Workbench-Releases\rollback-a19e223-before-question-group-20260908\ielts-workbench.exe`，SHA-256 `B04448D8E8D2ABD6068AB124397B31BE7E828A2B3D2BB79BBF12A825BA73FF89`；新旧大小、时间和哈希均不同。本轮使用 `tauri build --no-bundle`，没有生成、覆盖或安装 MSI/NSIS。

## 2026-09-07 Reading 多 Passage Release 验收摘要

- 原创样本：`samples\original-multi-passage-pack`，通过原生系统目录选择器、校验预览、版权确认和安装命令进入新工作区；安装副本包含 manifest、README 与 Reading module，未覆盖源目录或旧题包。
- 独立验收工作区：`D:\IELTS-Workbench-Reading-Acceptance-20260907`；SQLite：`D:\IELTS-Workbench-Reading-Acceptance-20260907\ielts-workbench.sqlite3`；Session：`3a372276-af6c-42f0-bf0f-00b132ddc1e0`。
- 实际选择：Pane A = Passage 2，Pane B = Question 18。Passage 2 正文为 ferry 文章；Q18 保持题号、题干及 Passage 3 题组说明。全部 21 题、Passage 2 的 Q8–15、跨 Passage 的 Q14–20 和单题 Q18 均按原始顺序显示。
- Q18 最终答案为 `true`。标记证据包括 `northbridge-p2-paragraph-02` 的 `regional harbour office`（offsets 53..76）及 Passage 1 重复句标记；Passage 3 含同一句但未错误显示该标记。
- 双 Pane 独立滚动实际设置为左 180、右 760；Q18 导航焦点和 `aria-controls` 只指向 `right-pane-northbridge-q18-section`，左滚动保持 180。两 Pane 同显 Q18 时两个 DOM ID 唯一且答案同步；同显 Passage 2 时两份标记均正常显示且全局 DOM ID 无重复。
- 整套模式得到 3 个顺序区块：Passage 1 对应 Q1–7、Passage 2 对应 Q8–15、Passage 3 对应 Q16–21，不再混合第一篇正文与全部题目。
- 正常退出后进程与 9230 监听均结束；Vite 1420 关闭时重新直接启动 EXE，从“最近继续”恢复 Passage 2 / Q18、Q18=`true` 与 Passage 2 标记。

## 2026-09-07 Reading Release EXE

- 可直接运行：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`。
- 修改时间：`2026-09-07 18:26:56.593 +08:00`；大小：12,631,040 字节；SHA-256：`B04448D8E8D2ABD6068AB124397B31BE7E828A2B3D2BB79BBF12A825BA73FF89`。
- 上一版已单文件备份到 `D:\IELTS-Workbench-Releases\rollback-f7fd42a-20260907\ielts-workbench.exe`，12,659,712 字节，SHA-256 `89131796210E52C44AEA591772068B780C8F8D2C5D616BE1854B490280CA25CD`；新旧哈希不同，证明本次生成了新 EXE。
- 本轮使用 Tauri 生产构建上下文和现有 `dist`，显式 `--no-bundle`；未生成、覆盖或安装 MSI/NSIS。最终 EXE 在 1420 未监听时以 `http://tauri.localhost` 独立启动。

## 2026-09-06 原生桌面验收摘要

- 独立验收工作区：`D:\IELTS-Workbench-Acceptance-20260905`；数据库：`D:\IELTS-Workbench-Acceptance-20260905\ielts-workbench.sqlite3`（设置页显示规范化的 `\\?\` 路径）。
- Repository 证据：实际窗口中 `window.__TAURI_INTERNALS__ === true`；运行时工厂因此选择 `TauriLearningRepository`。answers、annotations、writing_drafts、writing_versions 均在上述 SQLite 中查到真实记录，没有回退 IndexedDB。
- 原生 PDF：取消选择不改变页面；原创 3 页 PDF 导入为 `pdf-reading-3380bbb850f80d50`；重复导入没有创建第二份题包；隔离伪 PDF 显示 “The selected file does not contain a PDF header.”。
- Reading：Session `06237ec2-508e-4c7e-8819-3a2f758452b3` 保存 q01=`true`、q05=`solar panels`，并保存 quote=`fictional town of Alderwick,` 的黄色标记；两 Pane 即时同步且重启读回。
- Listening：原创 4 秒音频 `duration=4`、`readyState=4`，播放期间 `currentTime>0`；Exam 隐藏原生 controls 和 Transcript，禁止拖动、倍速和重播。
- Writing：Task 1 图表实际加载为 900×560；Session `df74b87c-3243-4115-bdd2-876845ca4f5e` 写入 30 词草稿、manual 与 submitted 两个不可变版本。
- 快速关窗修复：首次实测发现保存后再次 `close()` 会递归触发 close-requested，窗口不能退出；改为保存完成后 `destroy()`。复测在输入后 120 ms 请求正常关窗，445 ms 内进程结束，最后内容已写入 SQLite 并在重启后恢复。
- 两轮完整重启：两次均恢复已导入题包、Reading 答案/标记、Writing 草稿和本地图片；随后正常退出，进程分别在 273 ms 和 281 ms 内结束。

## 2026-09-06 Release 与安装包（历史基准）

- 标准 `npm run tauri build` 最终退出码 0，同时完成 MSI 与 NSIS；`bundle.useLocalToolsDir=true` 将 Tauri bundler 的 WiX/NSIS 缓存放在 D 盘 `src-tauri\target\.tauri`。
- 当时的 EXE 为 12,659,712 字节，SHA-256 `89131796210E52C44AEA591772068B780C8F8D2C5D616BE1854B490280CA25CD`；2026-09-07 构建前已备份到 `D:\IELTS-Workbench-Releases\rollback-f7fd42a-20260907\ielts-workbench.exe`，target 中的同名路径现为上方新 Reading Release。
- MSI：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\bundle\msi\IELTS Workbench_0.1.0_x64_en-US.msi`，4,857,856 字节，SHA-256 `75E21DB0D806088D408DB1F30327BF099E0A429034475891A46A3B6F2F0529D7`。
- NSIS：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\bundle\nsis\IELTS Workbench_0.1.0_x64-setup.exe`，3,581,782 字节，SHA-256 `8F1A5A9804068063CAE1273618EE1AFF73A9BC54BC93207415B606831E66936B`。
- Vite 1420 端口关闭时，最终 Release 从 `http://tauri.localhost` 启动且 Tauri runtime 为真；两个题包可见。内嵌 PDF worker 实际加载 1,265,413 字节并解析 3 页 PDF，WAV 播放、900×560 PNG、SQLite 均正常。
- Release 输入最后 marker 后 216 ms 发出关窗请求，574 ms 内退出；SQLite 写入后再次独立启动完整读回，再次正常退出。安装包仅生成，未执行安装。

## 磁盘占用（2026-09-06 收尾）

- C 盘可用空间从安装前约 21.94 GiB 变为 19.14 GiB，净减少约 2.80 GiB；其中 Windows SDK 目录当前逻辑文件大小 1.67 GiB，失败打包尝试留下的可重建 Tauri 工具缓存为 123.10 MiB。
- D 盘可用空间从安装前约 105.21 GiB 变为 95.88 GiB，净减少约 9.33 GiB。主要目录逻辑大小：Rustup 575.97 MiB、Cargo 570.55 MiB、Build Tools 2.84 GiB、`src-tauri\target` 8.03 GiB、`node_modules` 262.96 MiB、npm cache 64.83 MiB。逻辑文件大小之和与卷净占用不直接等价（NTFS 硬链接、压缩和同期系统写入会造成差异）。
- `src-tauri\target` 是可重建产物但包含本次可直接双击的 Release 与两个安装包；在另行保存这些交付文件前不要删除。Rustup、Cargo、Build Tools、Windows SDK、WebView2 和当前验收工作区是继续开发/运行所需内容，不得清理。

## D 盘前端验证（2026-09-06 基准）

- 依赖使用锁文件和 D 盘项目专用缓存重新安装：`npm ci --cache D:\Projects\.npm-cache\ielts-workbench --prefer-offline`，退出码 0。
- C 盘审计时出现过 5 个默认 5 秒超时；迁移并干净重装后，D 盘标准 `npm test` 未复现失败。迁移阶段三次为 106/106；最终新增原生边界和媒体测试后，三次均为 114/114，通过时长分别为 19.36 秒、18.82 秒和 20.11 秒。
- 没有证据把旧超时归因于某一个代码缺陷；当前证据只支持环境、磁盘 I/O 或依赖安装状态发生变化。因此没有为了“修绿”而修改测试或业务代码。
- `npm run lint` 退出码 0。
- `npm run build` 退出码 0，TypeScript 检查和 Vite 生产构建成功；最终为 1991 个模块，`dist/assets/pdf.worker.min-Dswkl-cV.mjs` 已生成。仅有非阻塞的大 chunk 提示。

## Windows 原生环境

- Node `v24.14.0`、npm `11.9.0`、Git `2.54.0.windows.1` 可用。
- 用户级 `RUSTUP_HOME=D:\DevTools\rustup`、`CARGO_HOME=D:\DevTools\cargo` 已持久化；`D:\DevTools\cargo\bin` 已在保留原条目的前提下加入用户 PATH。
- Rust minimal stable MSVC 已安装：`rustc 1.98.1`、`cargo 1.98.1`、`rustup 1.29.1`，唯一目标为 `x86_64-pc-windows-msvc`。
- Visual Studio Build Tools 2022 `17.14.39` 位于 `D:\DevTools\VSBuildTools`；`vswhere` 已确认 `VC.Tools.x86.x64` 和 `Windows11SDK.26100`，MSVC 工具集为 `14.44.35207`。
- Windows SDK 10.0.26100.0 按官方安装器要求位于 `C:\Program Files (x86)\Windows Kits\10`；现有 VS shared/cache 继续使用 `D:\SSMS共享` 与 `D:\SSMS缓存`，未移动或卸载 SSMS。
- `npm run tauri -- info` 的 Environment 全部通过，WebView2 为 `152.0.4191.62`。
- 安装前用户环境已备份至 `D:\DevCache\HKCU-Environment-before-ielts-toolchain.reg`；没有全局修改 TEMP/TMP、没有自动重启。

## 原创验收资源

- 保留旧静音 WAV：`samples/original-demo-pack/media/audio/original-demo-silence.wav`，SHA-256 `BFF9AE2D1C0DEFB0F2B9070F43439FCB723621DBEB1CCA5E2DBADCD9BFB13C68`。
- 新增 4 秒可听上行音阶 WAV：`samples/original-demo-pack/media/audio/original-demo-tones.wav`，128,044 字节，峰值 PCM 9175，SHA-256 `86D7C2CD3128A2DD61F097B082201A9D0E91D3F989ECC086F62B55C194140CE6`。
- 新增 900×560 Task 1 分组柱状图：`samples/original-demo-pack/media/images/original-workshop-attendance.png`，16,445 字节，SHA-256 `99305E2FF07D8864508CF7252D51E1211C8D656404B78A4C4B3199ADECB5330D`；已目视确认标题、月份、数值和图例可读。
- 原创 PDF 仍为原文件，SHA-256 未变化；未加入 Cambridge 内容，也未启用 OCR。

## C 盘待确认清理项

本轮没有删除任何 C 盘内容，当前仍未释放 C 盘空间。只在用户明确确认后处理以下旧副本：

- 整个旧项目目录 `C:\Users\Exming\Documents\雅思or算法软件项目`：14,674 个文件，281,646,168 字节（268.60 MiB）。它仍处于原始 `feat/pdf-import-mvp` / `dbfe98a` 且工作树干净，不包含迁移后在 D 盘继续完成的新提交。
- 其中可重建的 `node_modules`：14,006 个文件，275,548,191 字节（262.78 MiB）。
- 其中可重建的 `dist`：6 个文件，2,259,135 字节（2.15 MiB）。
- C 盘旧副本没有 `src-tauri/target`。
- 首次打包失败留下的 `C:\Users\Exming\AppData\Local\tauri` 工具缓存：661 个文件、129,081,000 字节（123.10 MiB）；项目已改用 D 盘本地工具缓存，因此它属于可重建候选，但本轮未删除。

若最终确认清理，优先一次性移除整个旧项目副本，避免留下两个容易误操作的仓库；执行前仍需再次核对 C/D 绝对路径、D 盘 HEAD 与工作树。
