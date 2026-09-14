# 2026-09-12 UI / Layout / Navigation 验收

## 范围与实现

基准：`feat/pdf-import-mvp` / `47f7320ed143888fae4c4098afb087d9dd5d8e2d`，开始时工作树干净。开发目录始终为 `D:\Projects\雅思or算法软件项目`。

- `AppShell` 改为 60px 顶部导航 + 居中不透明主工作区，最大宽 1600px，边距 24–32px。提取 `TopNavigation`；首页进入原 Library，错题本进入原 Review，阅读/听力/写作继续携带原 packId/testId。考试锁定逻辑保持。
- `ReadingWorkspace` 只组合显示工具、原有双 Pane、原题号导航及已有标记笔记。单 Pane 隐藏另一侧而不重建逻辑对象；原导航仍选择原目标 Pane，必要时将目标显示出来。新单/双展示及专注是临时 UI 状态，不增加数据库或 Session 字段；Pane 内容选择/滚动和比例仍使用原 settings。
- Reading 暖纸、Georgia 标题与正文、低饱和高亮、暗红题号及更紧凑答题区；字号复用原 `appearance.readingFontSize`。不写入任何默认字体设置。完整 40 题进度来自原完整 Session，不随可见题组缩减。
- Listening 的 Section 选择改为横向局部工具区；Writing 延续原左右写作区。两页仅修改 CSS，不修改音频/Exam 或作文保存实现。
- `wallpaper.css` 是唯一壁纸入口；`src/assets/themes/uchiha/README.md` 说明替换方法。目前无角色图，仅深灰蓝/灰紫/暗红静态底色，无网络图片或新增依赖。
- 原生窗口保留系统标题栏；最小逻辑宽度 1280px。仅增加当前窗口查询/切换全屏的两项精确权限，没有修改 CSP、文件/网络权限。

## 明确未改的业务

题包 schema v1/v2/v3、questionId/questionGroupId/sectionId/blockId/cellId、答案持久化键、标记 offsets/quote/prefix/suffix、评分/提交/Review、PDF 人工结构化导入、Repository、SQLite schema/迁移及 Writing 关窗保存源码均未修改。没有新建词汇、统计、翻译或 Markdown 模型。

视图恢复的唯一修正：依赖当前 Session **ID**，不再因相同 Session 的 elapsedSeconds 更新重复加载 Pane 设置、卸载显示工具。增加专项回归验证：计时更新后 Pane DOM 与专注状态保持。

## 已发现并处理的问题

1. 原生专注模式隐藏导航后，主工作区误落入零高网格行；改为单个自适应内容行，真实点击进入/退出和全屏切换通过。
2. 计时保存更新 Session 引用导致显示工具反复挂载；上述身份依赖修复后原生操作正常，新增专项组件断言。
3. 新测试误用了 Playwright 的 `exact` 参数；Testing Library 本来就是字符串精确匹配，移除不支持的参数后重新执行 typecheck/build，未放宽断言。
4. 与 Rust 优化编译同时执行时，`ReadingMultiPassage` 一条测试触发原有 5000ms 超时；随后与原生自动化并行的一轮也有四个超时（无断言不匹配）。失败分别保留在 `tmp/ui-acceptance-20260912/npm-test-delivery-1.log`、`npm-test-verified-2.log`。不能仅凭这些日志断定唯一原因。结束本任务构建/原生操作后，未修改超时、重试、worker 或断言，标准全量命令连续两次 215/215 通过；不将中间失败抹掉。
5. C 盘 bootstrap 是加密属性文件，`Copy-Item` 跨盘复制失败；改用只读流复制到新建备份文件，源/副本 SHA-256 均为 `4FF981BD9A8A363423781BAD6BEF197CC34311069698FD35488D80D431C66164`，不修改源属性。

## 原生开发窗口验证

验收工作区：`D:\IELTS-Workbench-UI-Acceptance-20260912`；workspaceId `5975444b-24f7-45e1-8c1b-09831dcd4f40`；SQLite：同目录 `ielts-workbench.sqlite3`。原生日志使用真实 IPC 与实际 SQLite；无 mock/IndexedDB 替代。

- 原创题包通过 Rust 校验和安装：`samples/original-daily-reading-pack`，3 Passage / 40 题。左 Passage 2，右 `rivermark-p2-g2`（Q18–19）。
- Q18 真实勾选 A/C，在两侧相同题组中修改并即时同步；切换 Passage/题组后保持。相同 Passage 标记共享，另一 Passage 无该标记，DOM ID 无重复。
- 左/右 scrollTop 分别 130/160，单 Pane → 双 Pane 后分别仍为 130/160；题号导航仅滚动并聚焦原目标右 Pane。
- 标记 note 实时出现在底部“我的笔记”。调试验收过程实际生成两条同位置标记，未删除；不是题包内容。
- Listening 原创 4 秒音频实际播放，readyState=4，currentTime>0，Study controls=true。
- Writing 原创图表 900×560 正常显示；填写原创验收正文，自动保存并创建手动版本。
- 1366×768 与 1600×900 逻辑客户区无页面横向溢出；顶部导航高度为 60，纸张背景为 `rgb(250,249,246)`。本机 Windows 缩放 200%，截图物理像素是逻辑尺寸两倍；宽窗口可能超出物理屏幕，WebView 截图仍来自实际原生窗口，不是另建浏览器。

## 最终交付验证

### 自动化及编译

| 实际命令 | 最终结果 | 证据 |
| --- | --- | --- |
| `npm test` 第一次 | 36 文件，215/215，退出码 0；21:12:40 开始，40.77s | `tmp/ui-acceptance-20260912/npm-test-quiet-1.log` |
| `npm test` 紧接第二次 | 36 文件，215/215，退出码 0；21:13:22 开始，43.31s | `tmp/ui-acceptance-20260912/npm-test-quiet-2.log` |
| `npm run lint` | 退出码 0，零 warning | `tmp/ui-acceptance-20260912/lint-quiet.log` |
| `npm run build` | TypeScript + Vite，2017 modules，退出码 0 | 本轮命令输出；随后 Tauri beforeBuild 再次成功 |
| `cargo test --manifest-path src-tauri/Cargo.toml` | 33/33，0 ignored/filtered，退出码 0 | `tmp/ui-acceptance-20260912/cargo-test-final.log` |
| `npm run tauri -- build --no-bundle` | 优化编译 2m02s，退出码 0；无安装包 | 本轮命令输出及下述新 EXE 指纹 |

现有构建警告未隐藏：Vite 主 JS 大于 500kB；Rust 链接器报告创建 DLL import library。两者不导致失败。本轮未改依赖、锁文件、测试重试/超时/并发配置。新增 11 个测试覆盖顶部路由、单/双 Pane DOM/导航/答案、计时更新不重挂载、字体只在用户操作时保存、现有笔记及全屏错误反馈。原 PDF、Reading v1/v2/v3、Writing 快速关窗等回归继续保留。

仅当前进程配置 `RUSTUP_HOME=D:\DevTools\rustup`、`CARGO_HOME=D:\DevTools\cargo`、D 盘 Cargo PATH、`TEMP/TMP=D:\DevCache\Temp`、`CARGO_TARGET_DIR=D:\Projects\雅思or算法软件项目\src-tauri\target`；通过已有 VS Developer PowerShell 初始化 MSVC。恢复命令见忽略目录 `tmp/ui-acceptance-20260912/env.ps1`；没有新装工具或改全局配置。

### 独立 Release 及恢复

- 可双击：`D:\IELTS-Workbench-Releases\ui-layout-20260912-2107\ielts-workbench.exe`；构建源副本为 `D:\Projects\雅思or算法软件项目\src-tauri\target\release\ielts-workbench.exe`。
- 两份均为 **13,198,848 字节**，修改时间 **2026-09-12 21:05:47 +08:00**，SHA-256 **`74557BC2652FDD967953ABAF78C5E7EAB7784D991C29B9C5E325898CBA414D34`**。旧版 `daily-use-20260909-191124` 的 EXE 原样保留，旧指纹 `8BEEAACB85C301EC671157269FFE9D70B954ED895C9E90DA3E4BE909119F17A8`；不是旧 EXE 重新标注。
- Vite 已结束且 1420 未监听，从交付目录直接启动新 EXE。`http://tauri.localhost` + 真实 Tauri runtime + Rust IPC；不是 localhost:1420 的浏览器预览。前端/壁纸样式嵌入 EXE，不要求 Vite 或额外前端目录，仍需保留 WebView2 和用户工作区。
- 在上述独立 UI 验收工作区，重新执行 Reading 双 Pane 同题双向同步、P1/P3/P2 与不同题组切换、标记隔离、独立滚动、原目标 Pane 导航、单/双切换、专注/全屏。Q14–20 保持完整 7 题，Q18 单题保留题号；Q24 表格内输入 `earlier photographs`；整套正确配对 3 Passage 和各自 13/13/14 题。
- 完整正常退出 Release PID 19092，确认其结束，再直接启动同一交付 EXE（PID 12776）。Reading 恢复左 P2、右 `rivermark-p2-g2`，Session `caad4a2b-6ca1-47c0-9ebd-bf8940ce090a` 的 Q18 A/C、Q24、两条 blockId/offsets 标记及 note 均由 SQLite 读回。证据：`output/playwright/ui-20260912/reading-recovery.json`。
- Writing 在 debounce 完成前追加最后一句并正常关窗；重启后最后一句仍在，手动版本仍存在。证据：`quick-recovery.json`、`writing-recovery.json`，Session `ea298c24-57d7-403f-9ff4-dd7875a141d8`。Listening 原创音频、Writing 图表也在新 Release 实际播放/显示。
- 本轮只在原生窗口打开并检查 Import Center/PDF 导入页布局，没有重复整轮 PDF 文件导入/结构化/安装验收；该业务源码未改，自动化覆盖继续通过，前轮原生证据保留。本轮也不把 Study 音频检查说成完整 Exam 人工验收。
- 最后通过原生工作区接口恢复正式指针到 `D:\IELTS-Workbench`。其数据库前后 SHA-256 均为 `D3081159697E950F0B412B5445C960768A7453BC8766416C749FCEF7739690F4`，未向正式学习数据写入验收答案。完成后正常退出验收进程，9246 调试端口与 1420 均无监听。

### 真实窗口截图

最终文件均在 `D:\Projects\雅思or算法软件项目\output\playwright\ui-20260912`（Git 忽略），已逐张目视检查：

- `reading-single.png`、`reading-dual.png`、`listening.png`、`writing.png`：本轮最终交付 EXE 的真实 WebView 截图，不是设计稿或 Vite。
- `reading-dark.png`、`reading-table.png`、`import-center.png`、`pdf-import.png`：深色、表格与导入页面补充。
- `reading-dual-1920x1080.png`、`reading-dual-1600x900.png`、`reading-dual-1440x900.png`、`reading-dual-1366x768.png`、`reading-dual-1280x768.png`：通过 OS 窗口调整后的实际逻辑客户区，配套 JSON 记录尺寸、60px 导航、无整页横向溢出和无重复 DOM ID。本机 DPR=2；不等同于在五种物理显示器上检查。
- `reading-native-window.png` 是 OS 截图 helper 返回的全黑图，已目视发现，**不作为有效截图或验收证据**；保留以追溯工具限制。正式交付上述真实 WebView 截图。带 `-dev` 的早期截图也不冒充 Release。

## 修改文件清单

新增：`src/app/AppShell/TopNavigation.tsx`、`src/features/practice/reading/ReadingWorkspace.tsx` / `.test.tsx`、`src/infrastructure/window/windowPresentation.ts` / `.test.ts`、`src/styles/wallpaper.css`、`src/assets/themes/uchiha/README.md`、本记录。

修改：`src/app/AppShell/AppShell.tsx` / `.css` / `.test.tsx`；`src/components/SplitWorkspace/SplitWorkspace.tsx` / `.css`；`src/components/TextDocument/TextDocument.css`；`src/components/QuestionRenderer/QuestionRenderer.css`；`src/features/practice/reading/ReadingWorkbench.tsx`、`ReadingPage.css`、`ReadingPage.test.tsx`；Listening/Writing 各自 `*Page.css`；`src/styles/global.css`、`tokens.css`；`src-tauri/capabilities/default.json`、`tauri.conf.json`；`docs/CURRENT_STATE.md`、`EXECUTION_PLAN.md`、`WORK_LOG.md`、`DESKTOP_ACCEPTANCE.md`、`TESTING.md`。

本轮按 UI 请求提供工作树 diff，未自动提交/暂存。分支与 HEAD 保持上述基准，未 push/tag；旧 Release、数据库、题包、缓存和 C 盘旧项目均不删除。

## 使用与边界

顶部进入阅读，沿用 Pane A/B 的文章、题目、整套及原 Passage/题组/题段/单题选择。单 Pane 后可在 A/B 之间切换；底部题号会显示原目标 Pane。“错题本”仍是现有完整复盘页，不是新建的错题筛选系统。

原项目没有独立 Markdown 笔记本；底部只显示已有标记的 note，创建/删除仍走原标记操作。词汇为明确不可用标签，未提供假统计、头像、翻译或富文本按钮。PDF 导入边界完全沿用原实现，不新增 OCR 或复杂版面自动解析。若要角色背景，需用户提供有使用权的本地图片并按资源 README 接入。
