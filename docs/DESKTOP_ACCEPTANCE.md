# IELTS Workbench Windows 桌面验收记录

更新日期：2026-09-08

状态定义：`未开始`、`已实现但未原生验证`、`浏览器验证通过`、`环境阻塞`、`验证失败`、`待人工验收`、`原生验证通过`。

## 验收环境

- 仓库：`D:\Projects\雅思or算法软件项目`
- 分支：`feat/pdf-import-mvp`
- 本轮起始 HEAD：`a2b43d8f9352f4eae3bc70dcf5dc465c758ae985`
- 测试工作区：`D:\IELTS-Workbench-Acceptance-20260905`（独立、可写，不指向用户真实学习数据）。
- SQLite：`D:\IELTS-Workbench-Acceptance-20260905\ielts-workbench.sqlite3`。
- Reading 多 Passage Release 工作区：`D:\IELTS-Workbench-Reading-Acceptance-20260907`；SQLite 位于同目录，未修改上一轮工作区。
- Reading 稳定题组 Release 工作区：`D:\IELTS-Workbench-QuestionGroup-Acceptance-20260908`；SQLite 位于同目录，既有工作区均未修改。

## 验收矩阵

| 项目 | 操作与预期 | 实际结果 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| 原生 Repository 选择 | Tauri 窗口必须使用 `TauriLearningRepository`，失败不得回退 IndexedDB | 实际窗口 `window.__TAURI_INTERNALS__ === true`；运行时工厂选择原生 Repository；真实 SQLite 记录可读 | 设置页 D 盘路径 + SQLite answers/annotations/drafts/versions | 原生验证通过 |
| 工作区与 SQLite | 选择独立 D 盘目录，创建固定目录和数据库 | 已初始化并持续写入 `D:\IELTS-Workbench-Acceptance-20260905` | 设置页显示规范化工作区及数据库路径；数据库 114,688 字节 | 原生验证通过 |
| 原创 PDF 导入 | 原生选择文件、读取字节、解析、安装、重开 | 取消、有效导入、重复去重、无效头拒绝均在 Windows 文件对话框中验证 | 原 PDF SHA-256 `2CD82A…BA48`；题包 `pdf-reading-3380bbb850f80d50` 跨重启存在 | 原生验证通过 |
| Reading | 答案和标记跨 Pane 同步，重启恢复 | q01=`true`、q05=`solar panels` 在两 Pane 即时同步；黄色标记在相同内容两侧出现并重启恢复 | SQLite Session `06237ec2…`、answers 2 条、annotation 1 条 | 原生验证通过 |
| Reading 多 Passage | Passage/全部/按 Passage/范围/单题/整套；Pane 独立滚动、稳定 ID、共享答案/标记、重启恢复 | P2/Q18、Q8–15、Q14–20、Q18、同题/同 Passage、相同文本隔离和整套配对均在新 Release 实际操作；一次退出/重启完整恢复 | SQLite Session `3a372276…`、Q18=`true`、annotations 2 条、视图设置 1 条 | Release 原生验证通过 |
| Reading 稳定题组选择 | 每 Pane 以稳定 `questionGroupId` 选择完整题组；同组/异组、答案同步、失效状态回退、重启恢复 | 左 P2，右 `northbridge-p3-group-01`；切换 `northbridge-p2-group-02` 后只显示 Q12–15；双 Pane 同组 Q18 同步，退出/重启恢复 | SQLite Session `b894b975…`、Q18=`true`、视图设置含右 `questionScope=group` 与 group ID | Release 原生验证通过 |
| Listening | 播放可听原创音频，验证 Study/Exam 限制 | `duration=4`、`readyState=4`，播放时间推进；Exam 无原生 controls/Transcript，拖动回弹、倍速复原、结束禁重播 | 实际 WebView audio 状态与 Exam 控件状态 | 原生验证通过 |
| Writing | 自动保存、版本、提交、Task 1 图片、快速关窗 | 900×560 图表加载；草稿、manual、submitted 均写入 SQLite；快速关窗缺陷修复并复测 | 输入后 120 ms 关窗，445 ms 退出；最后文字重启恢复 | 原生验证通过 |
| 两轮完整重启 | 正常退出后重新启动两次，恢复题包和用户状态 | 两轮均恢复题包、Reading 答案/标记、Writing 草稿与图片并正常退出 | 两次退出分别为 273 ms、281 ms | 原生验证通过 |
| 2026-09-06 Release 独立运行（历史） | 关闭 Vite 后启动 Release，可加载 PDF worker/媒体/SQLite | 1420 未监听时从 `http://tauri.localhost` 启动；PDF worker、WAV、PNG、SQLite 读写和一次退出/恢复均通过 | 历史 EXE SHA-256 `89131796…25CD`；现已单文件备份 | 原生验证通过 |
| Reading Release 独立运行 | 不运行 Vite，直接启动最新 EXE，恢复新 Reading 状态 | 1420 未监听；`http://tauri.localhost`；稳定题组与 SQLite 正常，一次正常退出/重启恢复通过 | 最新 EXE SHA-256 `F87A8E22…F0D9E` | 原生验证通过 |
| Windows 安装包 | 生成安装包；未获授权前不执行系统安装 | 标准 `npm run tauri build` 同时生成 MSI 与 NSIS，未执行安装 | MSI `75E21DB0…29D7`；NSIS `8F1A5A98…36B` | 原生构建通过，安装未授权 |

## 原生环境（2026-09-05 已安装）

- `RUSTUP_HOME=D:\DevTools\rustup`
- `CARGO_HOME=D:\DevTools\cargo`
- Rust stable `x86_64-pc-windows-msvc` minimal：rustc/cargo 1.98.1，rustup 1.29.1。
- Visual Studio Build Tools 2022 17.14.39：`D:\DevTools\VSBuildTools`。
- MSVC x64/x86 14.44.35207；Windows SDK 10.0.26100.0；WebView2 152.0.4191.62。
- `npm run tauri -- info` 原生环境检查全部通过；编译和运行验收仍需以下步骤证明。

## 环境恢复入口（历史阻塞已解除）

以下安装步骤已在本轮按用户授权完成，保留为来源与恢复记录：

1. 按 [Tauri 官方 Windows 前置要求](https://v2.tauri.app/start/prerequisites/)安装 Visual Studio Build Tools 的 **Desktop development with C++** 工作负载，并确认包含 MSVC x64/x86 编译工具和 Windows 10/11 SDK。
2. 使用 [Rust 官方安装入口](https://www.rust-lang.org/tools/install)的 `rustup-init.exe` 安装 Rust stable MSVC，默认主机应为 `x86_64-pc-windows-msvc`；安装后重开终端。
3. 在 D 盘项目目录依次核验：`rustup show`、`rustc --version`、`cargo --version`、`npm run tauri -- info`。
4. 从以下命令恢复，而不是重新审计或重建项目：

```powershell
Set-Location -LiteralPath 'D:\Projects\雅思or算法软件项目'
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
npm run tauri dev
```

## 原生手工验收步骤

1. 在真实 Tauri 窗口选择 `D:\IELTS-Workbench-Acceptance`，记录实际 `ielts-workbench.sqlite3` 路径和 Repository 类型。
2. 导入 `D:\Projects\雅思or算法软件项目\local-data\import-samples\original-reading-pdf-mvp.pdf`；取消一次选择，再完成一次导入和重开。
3. Reading 左右 Pane 分别操作同一答案和文字标记；查询 SQLite 对应 Session、answer、annotation 记录。
4. Listening 播放 `original-demo-tones.wav`，人工确认四段上行音高，并核对 Study/Exam 控制限制。
5. Writing Task 1 确认柱状图出现，输入正文、等待自动保存、建手动版本、正常快速关闭窗口；重启后验证正文，再创建提交快照。
6. 正常退出并确认应用进程结束，连续完成两轮重新启动与恢复；每轮都核对题包、答案、标记、草稿、版本和媒体。
7. 上述通过后执行 `npm run tauri build`；关闭开发服务器，单独启动 Release 程序并重复 worker/媒体/SQLite 核验。安装包只生成，不在未授权情况下安装。

验收证据必须包含实际数据库路径、读取回的记录摘要、进程退出/启动结果和 Release 文件路径；页面“已保存”提示不能单独作为持久化证据。

## 2026-09-06 持久化证据

- Installed packs：`original-demo-pack`、`pdf-reading-3380bbb850f80d50`。
- Reading Session：`06237ec2-508e-4c7e-8819-3a2f758452b3`；answers 为 `demo-reading-q01="true"`、`demo-reading-q05="solar panels"`。
- Annotation：`block_id=demo-reading-paragraph-01`、offsets `7..35`、quote `fictional town of Alderwick,`、yellow highlight。
- Writing submitted Session：`df74b87c-3243-4115-bdd2-876845ca4f5e`；草稿 30 词，manual 与 submitted 各 1 个版本。
- Debounce close Session：`1b5a95ac-9a11-4bff-92f1-aafa2f6fb109`；关闭请求发生在输入后 120 ms，SQLite `updated_at=2026-09-06T08:46:17.030Z`，下一次启动读回完整 marker。
- 首次快速关窗实测确实发现 `close()` 重入导致窗口不退出；保存本身成功。改用已授权的 `window.destroy` 完成已批准关窗后，同一测试通过，未无限阻止关窗。

## 2026-09-06 Release 证据

- `npm run tauri build` 最终退出码 0；WiX/NSIS 工具缓存通过 `bundle.useLocalToolsDir` 固定到 D 盘 `src-tauri\target\.tauri`。
- Release EXE：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`，12,659,712 字节，SHA-256 `89131796210E52C44AEA591772068B780C8F8D2C5D616BE1854B490280CA25CD`。
- MSI：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\bundle\msi\IELTS Workbench_0.1.0_x64_en-US.msi`，4,857,856 字节，SHA-256 `75E21DB0D806088D408DB1F30327BF099E0A429034475891A46A3B6F2F0529D7`。
- NSIS：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\bundle\nsis\IELTS Workbench_0.1.0_x64-setup.exe`，3,581,782 字节，SHA-256 `8F1A5A9804068063CAE1273618EE1AFF73A9BC54BC93207415B606831E66936B`。
- Release 独立运行时 Vite 1420 未监听，origin 为 `http://tauri.localhost`；两个题包可见，Tauri runtime 为真。
- PDF worker 请求 `http://tauri.localhost/assets/pdf.worker.min-Dswkl-cV.mjs`，传输 1,265,713 字节、解码 1,265,413 字节；原创 PDF 显示 3 页和文本层。
- 原创 WAV 在 Release 中 `duration=4`、`readyState=4` 且播放时间推进；Task 1 图片 `naturalWidth=900`、`naturalHeight=560`。
- Release 关窗前写入 marker，216 ms 后请求正常关闭，574 ms 内进程结束；SQLite 随后读到 20 词草稿并在下一次 Release 启动完整恢复。最终构建产物又执行一次启动与正常退出，仍无 Vite 监听。

## 2026-09-07 Reading 多 Passage Release 证据

- 新工作区：`D:\IELTS-Workbench-Reading-Acceptance-20260907`；数据库：`D:\IELTS-Workbench-Reading-Acceptance-20260907\ielts-workbench.sqlite3`；实际为 Tauri WebView/SQLite，不是浏览器 mock。
- 原创题包从 `D:\Projects\雅思or算法软件项目\samples\original-multi-passage-pack` 经原生目录选择器、校验预览、版权确认和安装按钮导入。安装副本位于新工作区 `packs\original-multi-passage-pack`。
- Pane A 实际选择 Passage 2，显示 ferry 正文而非第一篇；Pane B 实际选择 Q18，保留题号 18、题干、True/False/Not Given 选项和 Passage 3 题组说明。
- 选择结果：全部 Q1–21；Passage 2 为 Q8–15；范围 Q14–20 按顺序跨 Passage 2/3；单题为 Q18。Q18 最终写入 `answer_json="true"`。
- 标记：Passage 2 `block_id=northbridge-p2-paragraph-02`、offsets 53..76、quote=`regional harbour office`、yellow；切换 P1→P3→P2 后仍在。另在 Passage 1 标记重复句，Passage 3 虽含相同句但没有错误标记。
- 独立滚动实测左 180、右 760；Q18 导航 `aria-controls=right-pane-northbridge-q18-section`，焦点进入右 Pane 且左侧保持 180。两 Pane 同显 Q18 时 ID 分别以 `left-pane` / `right-pane` 开头，修改一侧后两侧同步为 `true`。
- 两 Pane 同显 Passage 2 时同一逻辑 block 有两份视图、两侧均显示已有标记，全局 DOM ID 无重复。整套模式为 P1/Q1–7、P2/Q8–15、P3/Q16–21 三个区块。
- 视图设置键 `reading.viewState.v1.3a372276-af6c-42f0-bf0f-00b132ddc1e0` 保存左 `passage/P2`、右 `questions/single/18`。正常关窗后进程和 9230 均结束；直接重启 EXE，从“最近继续”恢复该选择、Q18=`true` 和 Passage 2 标记。
- 新 EXE：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`；修改时间 `2026-09-07 18:26:56.593 +08:00`；12,631,040 字节；SHA-256 `B04448D8E8D2ABD6068AB124397B31BE7E828A2B3D2BB79BBF12A825BA73FF89`。Vite 1420 未监听，origin 为 `http://tauri.localhost`。
- 本轮只生成独立 EXE，`--no-bundle` 未重建 MSI/NSIS，也未执行任何安装程序。最终回归：前端 27 文件、135/135 连续两次；lint 与 Vite build 通过；Cargo 26/26。

## 2026-09-08 Reading 稳定题组 Release 证据

- 新工作区：`D:\IELTS-Workbench-QuestionGroup-Acceptance-20260908`；数据库：`D:\IELTS-Workbench-QuestionGroup-Acceptance-20260908\ielts-workbench.sqlite3`；Session：`b894b975-a6d3-4560-b34c-b04ab0e73f77`。运行时是 `http://tauri.localhost` 的真实 Tauri Release，Vite 1420 未监听。
- 原创 `original-multi-passage-pack` 经 Rust `validate_pack_folder` 校验为 valid、0 errors、0 warnings，再由 `install_pack` 安装到该工作区；source hash `c9d663898631b8478382cd7d5a8d60bb7be9c94ba972bbb9ab0ba5c263f8d0c5`。
- Pane A 实际选择 Passage 2，显示 ferry 正文；Pane B 以稳定 value `northbridge-p3-group-01` 显示 Questions 16–18、Passage 3 归属和完整 TFNG 说明。题组下拉显示 Passage、题号摘要和题型，而持久化字段保持原 group ID。
- Pane B 切换 `northbridge-p2-group-02` 时 DOM 仅含 Q12、Q13、Q14、Q15；没有混入同 Passage 的 Q8–11。切回 group 01 后 Q16–18 恢复。
- 两 Pane 同显 `northbridge-p3-group-01` 时，Q18 节点分别为 `left-pane-northbridge-q18-section` / `right-pane-northbridge-q18-section`；左侧改为 True 后右侧即时同步。随后切回最终状态：左 `passage/northbridge-passage-02`，右 `questions/group/northbridge-p3-group-01`。
- SQLite 在退出前读到 answer `northbridge-q18="true"`，Pane 设置 JSON 含左右各自 `questionGroupId`，且右 scope 为 `group`。正常退出后 PID 与 9231 均结束；重新启动 EXE、点击“继续”后，两 Pane 选择、Q16–18、Q18=True 和 `已答 1/21` 全部恢复，再次正常退出。
- 新 EXE：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`；12,631,552 字节；`2026-09-08 09:57:11.051 +08:00`；SHA-256 `F87A8E2211FF801D8A9BF270920E2D8E2B5EBF99E059C4E8E35ECDBF436F0D9E`。旧 EXE 已单文件备份；本轮没有生成、覆盖或安装 MSI/NSIS。
- 最终自动化：`npm test` 连续两次均为 27 文件、143/143；`npm run lint` 和 `npm run build` 退出码 0（2002 modules）；Cargo 26/26。既有全部、Passage、范围、单题、整套、Writing 关窗等回归继续通过。
- 安全处置：首次系统目录框自动化误选样本源目录后，新增工作区项全部移动至 `D:\IELTS-Workbench-Releases\accidental-sample-workspace-20260908-100624` 隔离保留；原题包源文件未覆盖、样本目录恢复、Git 干净。后续正确工作区通过真实 `initialize_workspace` Rust 命令初始化。
