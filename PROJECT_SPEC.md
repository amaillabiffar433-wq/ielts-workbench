# IELTS Workbench — 优化后的产品与技术规格

## 1. 产品定位

IELTS Workbench 是一个本地优先的桌面学习工作台，当前覆盖：

- Academic Listening
- Academic Reading
- Academic Writing

它的核心价值不是“把 PDF 放到窗口里”，而是把用户合法持有的材料转换为可交互、可标记、可复盘、可长期积累的数据。

第一目标平台为 Windows。应用使用 Tauri 提供桌面窗口、文件系统、SQLite 和系统能力；界面由 React/TypeScript 构建，但用户最终看到的是独立桌面 GUI，而不是浏览器网页。

## 2. 对此前方案的优化结论

此前功能方向总体合理，但有四个需要修正的地方：

### 2.1 范围过大

Reading、Listening、Writing、导入、OCR、AI、复盘、词汇、统计、背景主题若同时开发，很容易得到大量半成品页面。

改为纵向切片：

1. 先把桌面壳、本地工作区、数据库和题包规范做稳；
2. Reading 完整验证共享双窗格；
3. Listening/Writing 先实现可用基础链路；
4. 再做复杂导入；
5. 最后接 DeepSeek 和高级复盘。

### 2.2 “双自由 Pane”不应机械套给所有模块

共享 Pane Shell 保留，但模块使用不同预设：

- Reading：Passage / Questions / Whole Test，双 Pane 自由度最高；
- Listening：Questions / Notes / Transcript，播放器位于全局顶部；
- Writing：Prompt/Chart / Editor / Draft/Review，编辑器具有专门状态；
- Review：Answer / Evidence / AI Feedback。

这样既复用底层，又不把不同任务强行变成同一页面。

### 2.3 标记系统应先窄后宽

第一版只把文本标记做扎实：

- stable block ID；
- offsets；
- selected quote；
- prefix/suffix；
- 同步；
- 持久化；
- 恢复。

随后再添加：

- AudioAnchor；
- QuestionAnchor；
- ImageAnchor；
- 手写 Canvas；
- 代码锚点。

### 2.4 AI 与导入都不能成为单点依赖

- 普通 JSON 题包离线可导入；
- 文本 PDF 先规则解析；
- AI 只辅助分块、纠错和复盘；
- DeepSeek 不可用时，做题、保存、Listening、Writing 仍正常；
- AI 输出必须经过结构化 schema 校验。

## 3. 顶层信息架构

```text
App
├─ Home
├─ Library
├─ Import Center
├─ Practice
│  ├─ Reading
│  ├─ Listening
│  └─ Writing
├─ Review
├─ Vocabulary
└─ Settings
```

Practice 时侧栏可折叠，优先给内容区。

## 4. 三种学习模式

### Study

- 可自由切换 Pane；
- 可查词、看 transcript、反复播放；
- 后续可使用 AI；
- 允许即时学习型提示。

### Exam

- Reading 隐藏答案与 AI；
- Listening 禁止 seek、重复、倍速和 transcript；
- Writing 禁用 AI、语法检查、范文；
- 倒计时和提交规则独立记录；
- 结果与 Study Session 分开统计。

### Review

- 显示正确答案；
- 显示用户标记；
- 可跳到 Reading 证据或 Listening 时间点；
- 可比较 Writing Draft；
- 后续允许 AI 分析。

## 5. Library

主要层级：

```text
Pack
└─ Test
   ├─ Listening
   ├─ Reading
   └─ Writing
```

Library 显示：

- 最近继续；
- 题包；
- 每个 Test 的 L/R/W；
- 完成状态；
- 上次时间；
- 导入入口。

公开源码不内置 Cambridge 4–21。用户可以在本地导入自己合法持有并转换的材料。

## 6. Reading

### Exam 预设

```text
Passage | Questions
```

### Study 自由 Pane

每个 Pane 可选择：

- Whole Test
- Passage 1/2/3
- Questions 1–13/14–26/27–40

两个 Pane：

- 可调比例；
- 独立滚动；
- 共享答案；
- 共享 annotation；
- 可选联动滚动后续再做。

### 标记

第一版：

- highlight 4 色；
- underline；
- note；
- 删除；
- 重启恢复。

标记属于 `ContentBlock`，不是某个 Pane。

## 7. Listening

### 基本结构

```text
Global Audio Transport
──────────────────────
Pane A: Questions
Pane B: Notes / Transcript / Questions
```

第一版：

- 本地音频；
- Section 导航；
- 答题；
- 自动保存；
- Study/Exam 播放限制。

后续：

- transcript；
- sentence timestamp；
- A-B repeat；
- playback history；
- `AudioAnchor`；
- 错误类型：拼写、单复数、数字、干扰项、同义替换、未听出。

ASR 与 LLM 分离：

```text
ASR Provider -> audio to transcript/timestamps
LLM Provider -> explanation/review
```

DeepSeek 不承担整个音频播放或必需的转写链路。

## 8. Writing

默认：

```text
Prompt / Chart | Plain-text Editor
```

第一版：

- Task 1/2；
- 图片缩放基础；
- word count；
- debounce autosave；
- 手动版本；
- submit snapshot；
- 未完成稿恢复。

AI 原则：

- 只能给 suggestion；
- 用户明确接受后才修改；
- 保留 Original / Suggestion / Reason；
- AI Band 必须标注为 estimate；
- 不能伪装成官方评分。

## 9. Review 与 Vocabulary

Review 最初基于确定数据：

- 正误；
- 未答；
- 用时；
- 用户答案；
- 正确答案；
- 标记；
- Writing 版本。

Vocabulary 来源：

- 用户主动将选词加入；
- 保存来源 Pack/Test/Module/Block；
- 保存上下文；
- 学习状态；
- 后续由 AI 补充释义，而不是让 AI 生成来源。

## 10. 数据模型

### Source data

`IELTSPack v1`：

- versioned manifest；
- stable IDs；
- JSON modules；
- media index；
- read-only after install；
- checksum 可选。

### User data

SQLite：

- settings；
- installed pack registry；
- sessions；
- answers；
- annotations；
- drafts；
- versions；
- vocabulary；
- AI records。

源题更新时不得覆盖用户答案或标记。需要通过 stable IDs 与 anchor recovery 做兼容。

## 11. 导入流水线

长期目标：

```text
Acquire local files
→ Extract
→ Segment
→ Map
→ Validate
→ Preview & manually correct
→ Commit as IELTSPack
```

每一步都可查看和重做。

优先级：

1. JSON/文件夹题包；
2. 可提取文本 PDF；
3. DOCX；
4. 本地音频和图片绑定；
5. 扫描 PDF OCR；
6. AI 视觉/结构辅助。

AI 解析结果永远是草稿，用户确认后才写入正式题包。

## 12. AI 架构

Provider Adapter：

```text
AiAction
→ Context Builder
→ User-visible Context Preview
→ AiProvider
→ Structured Output Validation
→ Domain Record
→ UI
```

首个 Provider 为 DeepSeek，但：

- Base URL 可配置；
- model 可配置；
- 不写死某个模型；
- 请求在 Rust 层；
- API Key 安全保存；
- JSON 输出校验；
- 超时、取消、重试；
- Exam 模式禁用；
- 用户知道发送了什么。

主要 Action：

- lookup_word；
- explain_selection；
- review_question；
- review_listening_mistake；
- evaluate_writing；
- compare_drafts；
- overall_review。

## 13. 自定义 GUI 与背景

第一阶段先建立 design tokens：

- surface；
- text；
- border；
- focus；
- highlight palette；
- typography；
- spacing。

后续 Theme Profile：

- Clean Light；
- Dark Reading；
- Custom Background。

自定义背景需提供：

- 图片选择；
- 亮度；
- 模糊；
- overlay；
- Pane opacity；
- 一键恢复默认。

正文阅读层必须保证对比度，不允许背景损害可读性。

## 14. 安全

- 最小 Tauri permissions；
- 不加载远程网页；
- 文件只在工作区和用户明确选择的导入源中访问；
- 规范化路径；
- 防路径穿越；
- 主数据库在用户选择工作区；
- API Key 不进入前端；
- 日志脱敏；
- 默认离线；
- AI 发送上下文可见；
- 不自动上传题库。

## 15. 路线图

### Phase 0–1：桌面纵向切片

- Tauri；
- workspace；
- SQLite；
- demo pack；
- Library；
- Reading 双 Pane + 答案/标记同步；
- Listening v0；
- Writing v0；
- basic Review/Settings；
- AI interface only。

### Phase 2：导入中心

- JSON folder；
- PDF text extraction；
- preview/editor；
- media mapping；
- validation report。

### Phase 3：DeepSeek

- secure provider；
- lookup/explain；
- question review；
- writing evaluation；
- context preview；
- structured output。

### Phase 4：Listening 深化

- transcript；
- timestamps；
- A-B repeat；
- ASR adapter；
- listening error profile。

### Phase 5：体验与数据

- vocabulary review；
- analytics；
- backup/export；
- custom backgrounds；
- updater；
- packaging。

## 16. 第一阶段不做

- Speaking UI；
- 云同步；
- 多用户；
- 付费系统；
- 完整 Cambridge 内容；
- 抓取器；
- 所有 IELTS 题型；
- 手写 Canvas；
- 自动 OCR 全流程；
- AI 自动改作文；
- 复杂 Band 趋势统计；
- 自定义无边框窗口。
