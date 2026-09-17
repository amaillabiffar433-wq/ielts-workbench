# 10 — Acceptance Report

状态：**2026-09-17 产品级重构已按可安全验证的范围完成。** 源码工作副本为 `D:\Projects\雅思or算法软件项目`，分支为 `codex/product-os-rebuild`。本轮未推送远程、未安装应用、未改动原始 IELTS 资料或 DDDD 安装包。

## Implemented

- 将顶层信息架构重建为 English-first 的 Home / Library / Review / Progress / Settings，Practice 从书架、继续练习和复习深链进入。Home 与 Progress 直接从 repository/SQLite 聚合，不使用截图专用假指标。
- Library 按 Book → Test → Skill 聚合本地题包，使用自制排版封面，不复制 Cambridge 官方封面。第三方与自定义题包保持同级数据身份。
- Reading 重建为默认 54/46 的可拖动双栏工作台，支持双击复位、比例持久化、专注作答、标记、文本批注、生词、自动保存、提交结果和稳定 question ID 深链。未加入 Passage 全文搜索。
- Listening 明确区分 Exam / Study：Exam 不渲染 transcript、波形、倍速、任意 seek 或答案；Study 支持解码波形、±5 秒、倍速、题包内已验证 transcript cue、cloze 和音频错题时间点。五个辅助功能都有 Settings 开关。
- Review 在 migration 0005 中建立去重调度与事件审计。Incorrect 或 Marked 进入队列；Again 回到明天并重置连续次数，Good 为 1→3→7→14 天，Easy 为 3→7→14 天。Reading 可回到精确 question ID，Listening 可带 `sourceStartMs`。
- Progress 提供真实会话数、学习时间、连续天数、总准确率、时间趋势、技能分解、周练习量、题型准确率及强弱项，对无数据状态明确留空。
- Obsidian 日报只在用户显式选择的 vault 中写入 `IELTS/YYYY-MM-DD.md`；只更新 IELTS Workbench marker block，保留其他文本，变更时先备份，写后校验 SHA-256。
- Tauri/Rust 仍掌握工作区路径、SQLite、题包/媒体与 Obsidian 写入；React 只经 repository/service 边界调用。破坏性确认统一使用 Tauri dialog message/OkCancel，避免 legacy `window.confirm` 在桌面 ACL 中失败。

## Cambridge Imported

只列出在隔离工作区中实际安装并经原生窗口打开的私有用户内容：

- **Cambridge IELTS 17 Academic**
  - Test 2 · Reading · Passage 1
  - Test 3 · Listening · Part 1

`D:\downloads\雅思` 只读扫描找到 Cambridge 4–20，未找到 21。Cambridge 20 当前只能证明有扫描 PDF/音频，不能从文件名证明有可靠的 Answer Key/Transcript；因此本轮没有伪造答案或把未校核 OCR 安装为可评分 C20 题包。清单共 889 个文件、214 个目录、15,277,118,798 字节；被 Git 忽略的 CSV 为 `output/rebuild-audit/ielts-materials-inventory.csv`，SHA-256 为 `ADE5224E2DD17309D34932029B02E464647615C760AC16554598BA4F034127F8`。

## DDDD Analysis

- 目标安装器为 NSIS 3 Unicode + Electron/Vue 3，大小 105,587,692 字节，SHA-256 `84DF038DD92A4A695EE49E600263CAF937EE8903E2CDF6DAF101D8F8620FA1B5`，Authenticode 为 `NotSigned`。
- 静态包显示 `.xxpack` 结构中有 manifest、`content.db`、assets 与 hash 校验。本轮仅做静态解包，未运行、未安装、未登录、未触发 API，也未尝试绕过访问控制或解密。
- 本项目只借鉴题包版本/完整性校验、Exam/Review 分层等行为；没有复制第三方源码、资产、题目、图标或 CSS。因未有合法可用的普通数据导出，没有创建 DDDD importer。

详细证据见 `docs/rebuild/02-dddd-analysis.md`。

## Database Migration

- 实时学习工作区在写入验收前备份到 `D:\IELTS-Workbench-Backups\20260917-141606-pre-v5-native-acceptance`：17 个文件、7,042,480 字节，逐文件差异 0；升级前 SQLite SHA-256 为 `E0FF02CBECB56529538AD7130D841E28B8820DABCF37540491675F16FB7C5F6D`。
- 隔离验收库 `D:\IELTS-Workbench-Rebuild-Acceptance-20260917\ielts-workbench.sqlite3`：`PRAGMA integrity_check = ok`，外键违例 0，migration 1–5 齐全；4 个题包、8 个 session、20 条 answer、14 条 annotation、6 个 review item、1 条 review event、15 项 setting。
- 真实指针工作区 `D:\IELTS-Workbench-Daily-Acceptance-20260916`：库完整性 `ok`，外键违例 0，migration 1–5 齐全。验收结束后 bootstrap 已恢复指向该目录，文件 SHA-256 为 `9B7681BF68EAAE653055DDA0849C37B12270E2CFAAF9C67E0E9539290E216EEE`。

## Native Acceptance

- Release 原生窗口中完成原创 demo Reading 提交：Session `8ded124b-ca5c-4ee7-82e6-01f35c25f03b`，6/6，14 秒。
- 另一个隔离 Reading 提交生成 6 个 Review item；对其中 1 题选 Good 后显示 5 due + 1 Scheduled Later，数据库记录 interval 1 天、repetitions 1。
- Review 回源链接实际打开 `#/practice/reading?...&sourceQuestionId=demo-reading-q01`，跳到精确 Q1，没有使用 pane 序号或 DOM 位置作身份。
- Obsidian 写入 `D:\Obsidian\warehouse\IELTS\2026-09-17.md`，531 字节，SHA-256 `CC4CB58C39D5E7A0C11BBB638C004093E8E75880C66A1C16B7745B0A31FDC765`；第二次导出返回 Already current，hash 不变。目标原本不存在，所以首次不会产生旧文件备份。
- 最终 Release 又在恢复后的真实工作区指针上启动。Settings 显示正确 workspace/database；从该页触发“Choose another workspace”确认流后取消，原生控制台 0 error / 0 warning，未再出现 dialog ACL 错误，且 bootstrap hash 不变。

## Tests

| 命令 | 结果 |
| --- | --- |
| `npm run lint` | 通过，0 warning / 0 error |
| `npm test -- --run` | 47/47 测试文件，258/258 测试通过 |
| `npm run build` | `tsc --noEmit` 与 Vite 8.2.2 通过，2063 modules transformed |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 41/41 Rust 测试通过，doc tests 0/0 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 通过 |
| `npm run tauri -- build --no-bundle` | 通过，产物 `src-tauri/target/release/ielts-workbench.exe` |
| `npm run tauri dev` | Vite 8.2.2 在 `http://localhost:1420/` 就绪，Rust dev profile 完成并启动 `target/debug/ielts-workbench.exe`；冒烟后以 Ctrl+C 正常停止 |
| `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 未能执行：当前 stable toolchain 未安装 `rustfmt`；按项目规则未擅自安装全局 component |

Vite 仍报告主 chunk 超过 500 kB（约 796 kB，gzip 约 243 kB）；这是性能优化提示，本地 Release 构建与功能验收未被阻断。

## Screenshots

`docs/rebuild/screenshots/` 共 19 张 PNG：

- 1366×768：Home、Library、Book Detail、Reading、Listening、Results、Review、Progress、Settings。
- 1920×1080：同上 9 页。
- `native-window-proof.png`：带 Windows 系统标题栏的 Tauri 窗口证据；不是 Vite/浏览器预览。

截图均来自隔离工作区的原生 Release。`1366×768` 与 `1920×1080` 两组文件名/尺寸检查无缺失。

## How to Run

```powershell
cd D:\Projects\雅思or算法软件项目
npm install
npm run tauri dev
```

已验证的无安装包 Release：`D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`。首次运行需显式选择学习工作区。大型题包、媒体和 SQLite 都保存在该目录，不是源码仓库或默认 AppData 数据库。

## How to Import New IELTS Materials

1. 保留原始 PDF/音频不变，先用 SHA-256 建立来源身份。
2. 在 Settings 的工具入口使用现有 PDF/IELTSPack 导入链。有文本层的 PDF 可按页取文；扫描页可使用离线英文 OCR，但 OCR 结果只是候选。
3. 人工确认 Book/Test/Skill、Passage/Part、QuestionGroup、题号、题型、选项、答案和媒体映射。没有可靠答案时，保留为未评分/待核对，不生成答案。
4. 安装前由 TypeScript/Rust 双边校验 ID、引用、MIME、hash 和工作区边界；重复 pack ID 不覆盖。
5. 安装后在 Library 中按 Book → Test → Skill 打开，至少验证作答、提交、重启恢复、Review 和媒体离线读取。私有内容只留在用户工作区，不进 Git。

## Remaining Issues

1. Cambridge 20 仍需可追溯的 Answer Key/Transcript 与人工校核；Cambridge 21 源文件未找到。本轮安全地保留为“未导入”。
2. DDDD 的可用数据导出与授权状态未能仅靠静态证据建立；因此不实施第三方题库提取。
3. `rustfmt` component 未安装，所以不宣称 formatting gate 通过。
4. 本轮仅构建并原生验收 `--no-bundle` Release EXE，未重建或安装 MSI/NSIS。
5. 前端主 chunk 尚可进一步按路由分割；当前是已记录的非阻断 warning。
