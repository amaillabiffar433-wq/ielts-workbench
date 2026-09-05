# IELTS Workbench 当前状态

更新日期：2026-09-05

## 当前仓库

- 项目目录：`D:\Projects\雅思or算法软件项目`
- 分支：`feat/pdf-import-mvp`
- 本轮起始 HEAD：`dbfe98a5ecb596e7f12c4e1318f548227c69af3f`
- 桌面验收链路提交：`88e84ab`（原生 PDF、原创媒体及测试）
- 基线提交：`bdf9ac76bc71d8fb2d1fd1fbcaf7e977925e65f4`
- 迁移完成时工作树：干净
- 远程状态：本轮不推送

原项目仍保留在 `C:\Users\Exming\Documents\雅思or算法软件项目`，尚未删除，因此迁移核验期间没有释放 C 盘空间。

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
| React/TypeScript/Vite 前端 | D 盘验证通过 | `npm ci` 后，`npm run lint` 与 `npm run build` 均成功；构建仅有既知的大 chunk 提示 |
| 默认 `npm test` | D 盘最终配置连续三次通过 | 三次均为 23/23 文件、114/114 测试；未改超时、重试或测试选择 |
| Reading 双 Pane/共享答案与文字标记 | 浏览器验证通过 | 原有 renderer 冒烟证据保留；原生 SQLite 重启恢复未验证 |
| Reading PDF 辅助导入 | 原生链路已实现但未原生验证 | Rust 命令独占文件选择和一次性字节读取；renderer 不获得任意路径读取入口；浏览器 adapter 保留 |
| Rust 工作区、SQLite、题包和媒体源码 | 已实现但未原生验证 | Rust 测试源码存在；需复核本机工具链 |
| 原创 Listening/Writing 媒体 | 已实现，浏览器边界验证通过 | 新增可听 WAV 与 Task 1 PNG；旧静音 WAV 保留；重启后的原生路径仍未验证 |
| Tauri dev | 环境阻塞 | Rust/Cargo 与 MSVC/Windows SDK 未安装；不以 renderer 结果替代 |
| Release/安装包 | 环境阻塞 | 未生成可执行文件或安装包，也未执行安装 |
| DeepSeek、Vocabulary、OCR 等 | 未开始 | 明确不在本轮范围 |

## 当前阻塞与下一步

1. 经用户明确授权后安装 Rust stable MSVC 与 Visual Studio “Desktop development with C++”工作负载（含 MSVC x64/x86 和 Windows SDK）；本轮没有执行系统安装。
2. 从 `cargo check --manifest-path src-tauri/Cargo.toml` 恢复，随后运行 Rust 测试与 `npm run tauri dev`。
3. 使用新的独立 D 盘测试工作区完成 SQLite、PDF、Reading、Listening、Writing 和两轮完整重启验收。
4. 桌面开发验收通过后再构建 Release；Reading 多 Passage/题段自由选择留到下一轮。

## D 盘前端验证

- 依赖使用锁文件和 D 盘项目专用缓存重新安装：`npm ci --cache D:\Projects\.npm-cache\ielts-workbench --prefer-offline`，退出码 0。
- C 盘审计时出现过 5 个默认 5 秒超时；迁移并干净重装后，D 盘标准 `npm test` 未复现失败。迁移阶段三次为 106/106；最终新增原生边界和媒体测试后，三次均为 114/114，通过时长分别为 19.36 秒、18.82 秒和 20.11 秒。
- 没有证据把旧超时归因于某一个代码缺陷；当前证据只支持环境、磁盘 I/O 或依赖安装状态发生变化。因此没有为了“修绿”而修改测试或业务代码。
- `npm run lint` 退出码 0。
- `npm run build` 退出码 0，TypeScript 检查和 Vite 生产构建成功；最终为 1991 个模块，`dist/assets/pdf.worker.min-Dswkl-cV.mjs` 已生成。仅有非阻塞的大 chunk 提示。

## Windows 原生环境

- Node `v24.14.0`、npm `11.9.0`、Git `2.54.0.windows.1` 可用。
- `rustup`、`rustc`、`cargo` 均不在 PATH，且默认 `C:\Users\Exming\.cargo\bin` 不存在；属于未安装，不是当前 shell 未加载。
- `vswhere` 只发现 `D:\SSMS`，使用 C++ 组件条件查询返回空数组；Windows Kits 注册表根不存在，`cl`、`link`、`msbuild` 也不可用。MSVC/Windows SDK 未安装。
- `npm run tauri -- info` 检出 WebView2 `152.0.4191.62`；WebView2 不构成当前阻塞。

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

若最终确认清理，优先一次性移除整个旧项目副本，避免留下两个容易误操作的仓库；执行前仍需再次核对 C/D 绝对路径、D 盘 HEAD 与工作树。
