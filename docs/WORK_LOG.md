# IELTS Workbench 工作日志

本文件只按时间追加实际执行记录，不回填或虚构过去未记录的操作。

## 2026-09-05 — 项目迁移到 D 盘

- 迁移源：`C:\Users\Exming\Documents\雅思or算法软件项目`
- 迁移目标：`D:\Projects\雅思or算法软件项目`
- 迁移前确认目标不存在，D 盘可用空间为 105.56 GB。
- 检查 1420 端口和项目相关进程，未发现正在运行的 Vite/Tauri/IELTS 开发进程。
- 检查常见 Tauri AppData 配置位置和 bootstrap 文件，未发现项目外工作区或 SQLite 引用。
- 使用复制方式保留 `.git`、源码、配置、文档、`local-data`、`output`、样本及备份；未复制可重建的 `node_modules`、`dist` 和 Rust `target`。
- 复制结果：662 个文件，3,838,842 字节；C/D 逐文件 SHA-256 对比差异为 0。
- D 盘 Git 分支和 HEAD 与源目录一致：`feat/pdf-import-mvp` / `dbfe98a5ecb596e7f12c4e1318f548227c69af3f`，工作树干净。
- 原 C 盘副本保持不变，等待用户在整轮验证结束后确认是否删除；当前尚未释放 C 盘空间。

## 2026-09-05 — D 盘依赖与前端稳定性验证

- 使用 `package-lock.json` 执行 `npm ci`，缓存固定到 `D:\Projects\.npm-cache\ielts-workbench`；安装成功，未改 package 清单。
- 标准 `npm test` 连续执行三次，均为 21/21 个测试文件、106/106 项测试通过；总时长分别为 18.27 秒、20.21 秒和 17.82 秒。
- 未增加全局超时、未配置重试、未使用 `skip`/`only`，也未修改测试源码。C 盘曾出现的 5 个 5 秒超时在 D 盘干净安装后未复现，现有证据不足以断言单一代码根因。
- `npm run lint` 成功，退出码 0。
- `npm run build` 成功，退出码 0；TypeScript 无错误，Vite 完成 1989 个模块转换。仅保留非阻塞的 chunk 大小提示。

## 2026-09-05 — Windows 原生环境复核

- Node `v24.14.0`、npm `11.9.0`、Git `2.54.0.windows.1` 可用。
- `Get-Command` 未发现 `rustup`、`rustc`、`cargo`，默认 `%USERPROFILE%\.cargo\bin` 也不存在。
- `vswhere` 存在，但全部安装实例中只有 `D:\SSMS`；要求 `Microsoft.VisualStudio.Component.VC.Tools.x86.x64` 的查询结果为空。
- Windows Kits 两个注册表位置均不存在；`cl`、`link`、`msbuild` 未发现。因此结论为 Rust/Cargo 和 MSVC/Windows SDK 未安装，而非仅当前终端未加载。
- `npm run tauri -- info` 成功执行并检出 WebView2 `152.0.4191.62`，同时复核了上述 Rust 与 Build Tools 缺失。
- 未获用户安装授权，本轮没有安装工具链、修改全局环境变量或启用 Windows 功能。

## 2026-09-05 — 桌面链路增量实现

- `TauriPdfSourceAdapter` 不再是占位：Tauri 运行时使用 Rust 内部文件对话框和 `select_pdf_file` 命令，一次性返回所选 PDF 的文件名、MIME、长度和 Base64 字节；renderer 不接收路径，也没有任意路径读取命令。
- Rust 读取拒绝链接/重解析点、非普通文件、非 `.pdf`、空文件、超过 64 MiB 和前 1024 字节无 PDF 头的文件；取消对话框返回 `null`，I/O 与解析错误不会回退浏览器 repository。
- PDF.js 浏览器 adapter 继续负责同一套 SHA-256、文本提取、预览与销毁逻辑；生产构建确认 PDF worker 被输出为独立资源。
- 新增原生 adapter 单元测试、原生 picker 页面路由测试和 Tauri/浏览器 repository 选择测试。Rust 也增加正常 PDF 与伪 PDF 测试源码，但因 Rust 不存在而未运行。
- 保留原 4 秒静音 WAV；新增可听原创音阶 WAV 和原创 Task 1 柱状图，写入题包 manifest、Listening/Writing 模块、内存 repository 与 Rust 内嵌题包文件列表。
- 媒体生成脚本、文件大小和 SHA-256 已复核；WAV PCM 峰值 9175，PNG 已目视检查。

## 2026-09-05 — 最终前端回归

- 最终标准 `npm test` 连续三次通过：23/23 文件、114/114 项，退出码均为 0；总时长分别为 19.36 秒、18.82 秒、20.11 秒。
- `npm run lint` 退出码 0。
- `npm run build` 退出码 0；TypeScript 和 Vite 构建成功，1991 个模块完成转换，PDF worker 进入 `dist/assets`。仅有非阻塞的大 chunk 提示。
- 由于原生工具链缺失，未运行 `cargo check`、`cargo test`、`npm run tauri dev` 或 `npm run tauri build`；没有生成或启动 Release，也没有创建 SQLite 验收工作区。
- 只读统计 C 盘旧项目为 268.60 MiB，其中 `node_modules` 262.78 MiB、`dist` 2.15 MiB；未删除任何内容，等待用户明确确认。
- 原生 PDF、原创媒体及相关测试已保存为本地提交 `88e84ab`；未推送远程。

## 2026-09-05 — 解除 Windows 原生工具链阻塞

- 安装前 C 盘可用 21.94 GiB、D 盘可用 105.21 GiB；确认当前无 Rust，且 Build Tools 未重复安装。
- 在写入前导出用户环境为 `D:\DevCache\HKCU-Environment-before-ielts-toolchain.reg`。
- 持久化用户变量 `RUSTUP_HOME=D:\DevTools\rustup`、`CARGO_HOME=D:\DevTools\cargo`，并在保留所有原 PATH 条目的前提下加入 `D:\DevTools\cargo\bin`；安装命令同时设置当前进程环境和 D 盘临时目录。
- Rust x64 安装器来自 Rust 官方入口；下载文件 12,721,664 字节，SHA-256 `6F4BEF66261261FCB43131BE8720BAB817D403A09EDEC7455C371974B90BDB7E`，与官方 `.sha256` 完全一致。
- 使用 minimal profile 安装 stable `x86_64-pc-windows-msvc`：`rustc 1.98.1`、`cargo 1.98.1`、`rustup 1.29.1`；只安装默认 x64 MSVC 目标。
- Microsoft Build Tools 引导程序 Authenticode 签名有效，签发者为 Microsoft Corporation。以管理员权限、`--passive --wait --norestart` 安装 `Microsoft.VisualStudio.Workload.VCTools`、`VC.Tools.x86.x64` 和 `Windows11SDK.26100`，退出码 0。
- Build Tools 2022 `17.14.39` 位于 `D:\DevTools\VSBuildTools`，MSVC 工具集为 14.44.35207。已有 SSMS 锁定的 shared/cache 位于 `D:\SSMS共享`、`D:\SSMS缓存`，未强制修改。
- Windows SDK 10.0.26100.0 由官方安装器放在 `C:\Program Files (x86)\Windows Kits\10`；提升后的 SDK 子安装器仍在 C 盘用户 Temp 写入日志，未手工迁移或删除。
- `npm run tauri -- info` 已把 Rust、Cargo、rustup、MSVC 和 WebView2 全部标为可用；没有安装完整 Visual Studio IDE、nightly、交叉目标，也未自动重启。

## 2026-09-06 — 首次 Rust 编译与原生开发验收

- 在 D 盘 Rust/Cargo home、D 盘临时目录和 VS Build Tools x64 环境中实际执行 `cargo check --manifest-path src-tauri/Cargo.toml`，退出码 0；首次生成并保留应用级 `src-tauri/Cargo.lock`。
- 首次 `cargo test --manifest-path src-tauri/Cargo.toml` 暴露一条内嵌媒体数量旧断言和一条无效 fill-blank 来源校验；做最小修复并补回归后，Rust 测试为 24/24。
- Codex 宿主的 AppData 重命名跨卷行为触发 `CrossesDevices`；保留正常原子 rename，只有该错误时才执行同步复制并保留备份/恢复语义，新增替换 bootstrap 测试通过。
- 创建隔离工作区 `D:\IELTS-Workbench-Acceptance-20260905`，实际数据库为 `ielts-workbench.sqlite3`；设置页显示规范化 D 盘路径，运行时确认 `window.__TAURI_INTERNALS__ === true`。
- Windows 原生 PDF 对话框验证取消、有效 3 页原创 PDF、重复导入与隔离伪 PDF。有效文件仍为 4,497 字节、SHA-256 `2CD82AB886E160F4F64996484FE621860AFEEE774B366353902DB936706ABA48`；重复项未创建，伪 PDF 明确报告缺少 PDF header。
- Reading 在两个 Pane 同步 q01=`true` 与 q05=`solar panels`，并同步 quote=`fictional town of Alderwick,` 的黄色标记；SQLite answers/annotations 实际记录与两轮重启读回一致。
- Listening 原创 4 秒 WAV 在真实 WebView 中 `readyState=4` 且播放时间推进；Exam 模式隐藏原生 controls/Transcript，拖动被回弹、倍速复原为 1，结束后播放按钮禁用。
- Writing Task 1 图表实际为 900×560；30 词草稿、manual 版本和 submitted 快照均写入 SQLite。
- 快速关窗首次暴露 `close()` 再次触发 close-requested 的重入问题：草稿保存成功但进程不退出。改为 flush 成功后调用 `destroy()` 并添加最小权限；复测在输入后 120 ms 请求关窗，445 ms 内退出，最后内容跨重启恢复。
- 随后连续完成两轮完整 Tauri 启动、持久化读回与正常退出；两轮退出分别耗时 273 ms、281 ms。未删除或清空任何用户数据，未触碰 C 盘旧副本。

## 2026-09-06 — 最终门槛与 Windows Release

- 最终环境复核：`rustc 1.98.1`、`cargo 1.98.1`、`rustup 1.29.1`，唯一工具链/目标为 stable `x86_64-pc-windows-msvc`；`npm run tauri -- info` 全部可用，WebView2 为 152.0.4191.66。
- `cargo check --manifest-path src-tauri/Cargo.toml` 退出码 0；`cargo test --manifest-path src-tauri/Cargo.toml` 为 24/24，退出码 0。
- `npm run lint` 退出码 0；最终源码标准 `npm test` 连续两次为 24/24 文件、117/117 项，退出码均为 0，时长 23.54 秒和 33.87 秒。
- 首次最终 `npm run build` 捕获关闭监听反注册函数的 TypeScript 返回类型推断错误；显式声明 `() => void` 后重跑全部门槛。最终 `npm run build` 退出码 0，1997 modules transformed，PDF worker 输出成功，仅有非阻塞大 chunk 提示。
- 首次全量 Tauri build 已成功生成 Release 和 MSI，但 NSIS 下载解压因工具缓存位于 C 盘而 TEMP 位于 D 盘，`rename` 返回 os error 17。项目启用 Tauri 官方 `bundle.useLocalToolsDir=true`，将 WiX/NSIS 缓存固定到 D 盘 `src-tauri\target\.tauri`；随后 NSIS 单独打包成功，最终标准 `npm run tauri build` 同时生成 MSI/NSIS 并退出码 0。
- 最终产物：Release EXE 12,659,712 字节、SHA-256 `89131796210E52C44AEA591772068B780C8F8D2C5D616BE1854B490280CA25CD`；MSI 4,857,856 字节、SHA-256 `75E21DB0D806088D408DB1F30327BF099E0A429034475891A46A3B6F2F0529D7`；NSIS 3,581,782 字节、SHA-256 `8F1A5A9804068063CAE1273618EE1AFF73A9BC54BC93207415B606831E66936B`。
- 停止 Vite 后独立启动 Release；1420 未监听，origin 为 `http://tauri.localhost`。内嵌 PDF worker 实际加载并解析 3 页 PDF；WAV、PNG 与 SQLite 正常。一次 Release 关窗写回/重启恢复和最终产物再次启动/退出均通过；未执行安装。
- 收尾磁盘：C 盘可用 19.14 GiB（相对安装前约减少 2.80 GiB），D 盘可用 95.88 GiB（相对安装前约减少 9.33 GiB）。`src-tauri\target` 当前逻辑文件 8.03 GiB；失败尝试留下的 C 盘 Tauri 工具缓存 123.10 MiB 未删除，列入待确认清理项。
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` 因 minimal profile 未安装 rustfmt 而不能执行；未为非必需门槛临时扩展工具链。Rust 源码已通过 `cargo check`、24/24 测试和人工 diff 格式检查。
- 稳定性与 Release 源码保存为本地提交 `23527b6`；构建产物、工具链、隔离数据库和私有/原创导入样本均未提交。

## 2026-09-06 — Reading 多 Passage 实现与针对性回归

- 从干净的 `feat/pdf-import-mvp` / `f7fd42af1584714f1b681f1662ce01a4f799b76e` 恢复；确认 `ReadingModule.sections[]` 是 Passage 层，Section 内持有稳定 `contentBlocks[]` 和 `questionGroups[]`。旧页面正文固定取 `sections[0]`，但题目跨所有 Section 展平，形成“第一篇正文 + 所有篇题目”的结构缺陷。
- 新增完整 Reading 题目索引与选择模型。题目按模块原始顺序建立稳定展示号；全部、按 Passage、连续范围、单题均返回原 `questionId`、`sectionId`、题组及原始顺序，范围缺失、越界、反向和重复题号明确报错。
- Reading Pane 现在分别保存模式、Passage、题目选择和每个内容选择的滚动位置；设置键为 `reading.viewState.v1.<sessionId>`，复用工作区 SQLite 的 settings，不写入 Session 快照。只有 Session 和设置读取完成后才开始保存，失效旧状态会安全回退并提示。
- 题目局部视图保留题组标题、说明、字数限制和选择项；整套视图逐 Passage 渲染其自身正文和题组。题目 DOM ID 继续以 `left-pane` / `right-pane` 为前缀，导航只滚动目标 Pane；答案统计始终基于完整 Reading 模块。
- 新增原创、可按标准 IELTSPack 文件夹流程安装的 `samples/original-multi-passage-pack`：3 个 Passage、Question 1–21，Q14–20 跨 Passage 2/3，Q18 位于 Passage 3；Passage 1/3 含相同句子但使用不同 block ID。未覆盖原 demo、PDF 或任何用户数据。
- 前端针对性测试为 5/5 文件、33/33 项通过；随后继续完成全量回归和 Release 验收，最终结果见 2026-09-07 记录。

## 2026-09-07 — Reading 多 Passage Release 与原生验收

- 将 React fast-refresh 不应导出的 Pane 辅助函数移到 `readingPaneIdentity.ts`；前端构建与 lint 恢复通过。Rust 只允许旧 Reading v1 缺省题号，Listening 缺号继续明确拒绝，并新增对应测试；未改数据库 schema。
- 全量测试曾有 2 个组件测试在并发 I/O 下撞到默认 5 秒门槛；未提高超时或开启重试，而是拆分过长用例、减少无关题目渲染。最终标准 `npm test` 连续两次均为 27 文件、135/135；`npm run lint`、`npm run build`（2002 modules）和 Cargo 26/26 均通过。
- 构建前把上一版 EXE 单独复制到 `D:\IELTS-Workbench-Releases\rollback-f7fd42a-20260907\ielts-workbench.exe`，大小 12,659,712 字节，SHA-256 `89131796210E52C44AEA591772068B780C8F8D2C5D616BE1854B490280CA25CD`，未复制整个 target。
- 首个长时间 `tauri build --no-bundle` 进程结束但没有更新 EXE；直接 `cargo build --release` 虽生成新二进制，却仍指向 `http://localhost:1420`，因此明确判定为不可交付并正常关闭。随后用 Tauri 生产构建上下文、覆盖 `beforeBuildCommand=null` 复用已完成的 dist，显式 `--no-bundle`，生成可独立运行的新 EXE；未生成或安装 MSI/NSIS。
- 新 EXE：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`，修改时间 `2026-09-07 18:26:56.593 +08:00`，12,631,040 字节，SHA-256 `B04448D8E8D2ABD6068AB124397B31BE7E828A2B3D2BB79BBF12A825BA73FF89`。Vite 1420 关闭时直接启动，target 为 `http://tauri.localhost`。
- 备份原 bootstrap（94 字节，SHA-256 `6C6779157B01A854F691FBA6E27B4979F6D09B73625F1DFFD644288AE49A3BBC`）后，通过原生目录选择器初始化 `D:\IELTS-Workbench-Reading-Acceptance-20260907`。上一轮 `D:\IELTS-Workbench-Acceptance-20260905` 保持不变。
- 原创 `original-multi-passage-pack` 通过系统目录选择、原生预览校验、版权确认和安装命令进入工作区。实际验证全部 21 题、Passage 2 Q8–15、跨 Passage Q14–20、单题 Q18、Pane 独立选择/滚动、目标 Pane 导航、同题答案同步、同 Passage 双份 DOM、相同文本不串标记，以及整套 P1/Q1–7、P2/Q8–15、P3/Q16–21 配对。
- SQLite Session `3a372276-af6c-42f0-bf0f-00b132ddc1e0` 实际写入 Q18=`true`；`northbridge-p2-paragraph-02` 的 `regional harbour office` 标记为 offsets 53..76。视图设置保存为左 Passage 2、右 single Q18。正常退出后进程结束，再直接启动 Release，从“最近继续”完整恢复选择、答案和标记。
- 功能源码与原创样本已保存为本地提交 `91c7e77`；未 push、未打 tag，验收数据库、构建产物和工具链未提交。

## 2026-09-08 — Reading 稳定 questionGroupId 选择与 Release 验收

- 从干净的 `feat/pdf-import-mvp` / `a19e22358c3e6ce9dcb45dadcb39d91e003a6f2f` 恢复。复核前端 schema、Rust `QuestionGroupV1` 和全局 ID 注册器后确认：合法 IELTSPack v1 已要求稳定、全局唯一的题组 ID；因此没有数据库/schema 迁移，也没有为非法缺失值生成数组下标或标题派生 ID。
- Reading 题目选择 union 新增 `group/questionGroupId`。Pane 顶部加入紧凑“题组”下拉，选项显示 Passage、题号摘要和标题/题型；完整题组继续复用原 `QuestionGroup` 渲染，保留说明、字数限制、选项和全部原题目。非连续题号按 ID 精确筛选，不转成 min–max 范围。
- 两 Pane 分别在现有 `reading.viewState.v1.<sessionId>` 中保存 `questionScope` 与 `questionGroupId`；旧 v1 状态缺少这个未激活字段时静默补默认值，激活题组引用已删除 ID 时保留题组模式、回退到首个有效组并触发现有恢复提示。答案、标记、Review/提交统计身份未改。
- 新增 8 项测试。开发中两条定向断言曾失败：一条误把包含 short-answer 与 fill-blank 的样本组写成单一 Short Answer，另一条取到了 Q17 的 radio；只修正断言定位，未放宽业务逻辑、测试时间或重试。最终 `npm test` 连续两次均为 27 文件、143/143；`npm run lint` 退出码 0；`npm run build` 转换 2002 modules、退出码 0；Cargo 26/26。
- 构建前把旧 EXE 复制到 `D:\IELTS-Workbench-Releases\rollback-a19e223-before-question-group-20260908\ielts-workbench.exe`，SHA-256 `B04448D8E8D2ABD6068AB124397B31BE7E828A2B3D2BB79BBF12A825BA73FF89`。`tauri build --no-bundle` 生成新 EXE 12,631,552 字节，时间 `2026-09-08 09:57:11.051 +08:00`，SHA-256 `F87A8E2211FF801D8A9BF270920E2D8E2B5EBF99E059C4E8E35ECDBF436F0D9E`；未生成或安装 MSI/NSIS。
- 首次目录选择自动化未把键盘地址写入系统对话框，误选上次浏览的样本源目录。应用正常退出后，将此次新增的 `backups/imports/logs/packs/themes`、SQLite 和 `workspace.json` 七项完整移动至 `D:\IELTS-Workbench-Releases\accidental-sample-workspace-20260908-100624`；未删除数据，原样本目录恢复为原有三项且 Git 状态干净。EFS bootstrap 使用原始字节备份/恢复，备份 SHA-256 `EE4F97D6FF4F4A27A50184E9210762271A4D52333611BA8F7DC8A26A6C8617C0`。
- 随后通过 Release WebView 的真实 Tauri/Rust `initialize_workspace` 命令初始化 `D:\IELTS-Workbench-QuestionGroup-Acceptance-20260908`，并经 Rust `validate_pack_folder` / `install_pack` 安装原创多 Passage 题包。Vite 1420 始终未监听，origin 为 `http://tauri.localhost`。
- 原生实际操作：左 P2，右 `northbridge-p3-group-01`（Q16–18）；右侧切到 `northbridge-p2-group-02` 时只显示 Q12–15，再切回。双 Pane 同显 P3 group 01 时 Q18 的左右 DOM ID 唯一，从左改答后右侧同步为 `true`。最终回到左 `passage/P2`、右 `questions/group/northbridge-p3-group-01`。
- SQLite Session `b894b975-a6d3-4560-b34c-b04ab0e73f77` 写入 `northbridge-q18="true"` 和包含稳定 group ID 的 Pane 设置。正常退出后进程及 9231 监听结束；再次直接启动同一 EXE，从“最近继续”恢复两 Pane 选择、Q16–18、Q18=`true` 和完整模块统计 `已答 1/21`，随后再次正常退出。
- 功能源码提交为 `1b141d8`。未 push、未打 tag；验收工作区、隔离备份、工具链和构建产物均未提交。

## 2026-09-08 — Reading PDF 人工确认式多 Passage / 多题组导入

- 从干净的 `feat/pdf-import-mvp` / `174d89266bef4f4816fd075b3614709fb87325d6` 恢复，先复核现有 PDF adapter、IELTSPack v1、Repository settings、Tauri SQLite 和关闭保存边界。确认旧 PDF MVP 只生成单 Section/单题组，草稿仅在组件内存，领域 ID 到最终构建时才生成。
- 新增版本化结构化草稿模型：来源文本快照按页/片段保留，Passage、正文块、题组、共享选项、题目和题目选项在创建时获得稳定 ID；重排、改名和跨 Passage/题组移动不重建 ID。建议器只识别通用 `READING PASSAGE` / `Questions` 标题，未确定片段保持未分配，不含原创样本特判。
- 导入页新增三阶段编辑器：来源与结构、答案映射、校验预览。支持同页拆分、跨页合并、任意 Passage/题组/题目增删重排、非空删除警告、题组说明/字数限制/共享选项、显式题组成员和每题人工复核标记；保留原简单单 Passage 入口。
- 草稿经现有 Repository settings 按“索引 + 单草稿 payload”写入；Tauri 使用当前工作区 SQLite。保存前检查 256 KiB 原生设置边界，恢复不重读原 PDF，重选要求 SHA-256/大小/页数一致。取消/退出保留，显式丢弃只删草稿；安装失败和重复源检查都不会产生半成品或删除草稿。
- 答案先按完整 Reading 层级显示，再按无歧义题号映射到稳定 questionId；重复答案行、重复题号歧义和无效选项会整批阻止，不做部分应用。空答案作为未评分警告；不支持题型必须人工改为现有类型，不能伪装成简答。
- 原创样本脚本生成 7 页文本层 PDF：3 Passage、每篇 2 题组、Question 1–22、Q18 位于 Passage 3、页面 4 混合区域、跨页正文、共享选项和字数限制。PDF 已用 `pdfinfo`/`pdftotext` 检查并逐页渲染目视复核，不含 Cambridge 或第三方内容。
- 浏览器层通过正常文件选择/提取链路生成 3 Passage/6 题组/22 题，映射全部答案，显式忽略 7 个未分配片段后结构校验通过；安装后 Reading 显示 Passage 3 的 Q14–18 题组。浏览器证据不计作 Tauri 原生验收。
- 最终自动化门槛：`npm test` 连续两次均为 28 文件、163/163；`npm run lint` 退出码 0；`npm run build` 转换 2004 modules、退出码 0；Cargo 26/26。未改测试重试、断言或全局超时。
- 结构化导入实现、测试、原创样本和首轮文档已提交为 `a6771d6`。构建前只备份上一版 EXE 到 `D:\IELTS-Workbench-Releases\rollback-174d892-before-pdf-structured-20260908\ielts-workbench.exe`；未复制约 8 GiB target，未重建或安装 MSI/NSIS。
- `npm run tauri -- build --no-bundle` 退出码 0，生成 12,642,816 字节的新 EXE，时间 `2026-09-08 13:04:47.712 +08:00`，SHA-256 `5D3AC42913E9F9D7BB2C8F8E68AD9CDC41AD79F1EE29D20D229308F3CF8876C3`；与备份旧 EXE 的 `F87A8E…F0D9E` 不同。
- 新建 `D:\IELTS-Workbench-PDF-Structured-Acceptance-20260908-130850`，Rust 返回 workspaceId `cba6de1f-e785-436d-bf6a-1b34b2c433c4` 和同目录 SQLite。Vite 1420 关闭，Release origin 为 `http://tauri.localhost`、Tauri runtime 为真。
- 使用真实 Windows 文件对话框选择原创 PDF 等哈希验收副本。草稿 `pdf-structured-91388942-5705-4d24-ad80-763086d6e4e0` 写入 SQLite settings（payload 45,520 字节）；先退出并重开后，3 Passage、6 group、22 question 的全部稳定 ID 与标题一致，随后重新选择来源并通过 SHA-256/大小/页数核验。
- 原生向导明确忽略未处理片段后，故意清空 Question 1 题干得到 `QUESTION_PROMPT_REQUIRED`；原生 pack 列表没有半成品。恢复题干、完成 22 题人工复核和答案映射后，结构校验通过并安装 `pdf-reading-43955a0691-763086d6e4e0`。
- Reading 实际查看 Passage 3、Questions 14–18 和单题 Q18；双 Pane 同显 Q18 时一侧写入 `false`，另一侧同步。随后在 Passage 3 新建黄色标记 `mechanical clock`。SQLite Session `e0fa9a32-c695-42a8-bcce-f16072ebd6af` 读到稳定 questionId 的答案与 `blockId + offsets 33..49 + quote/prefix/suffix` 标记。
- 完整正常退出后 PID 和 WebView 调试监听结束；再次直接启动同一 EXE，从“最近继续”恢复左 Passage 3、右 Q18、Q18=`false`、黄色标记和 Pane 设置，随后第二次正常退出。另一次在恢复的结构化草稿编辑器内直接关闭也正常结束进程，没有删除草稿。
