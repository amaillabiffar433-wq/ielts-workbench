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
