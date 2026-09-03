# 后续阶段可直接交给 Codex 的提示词

这些提示词要在第一轮纵向切片真正通过测试后再使用。每次只执行一个阶段。

---

# A. Phase 2：导入中心与 Cambridge 本地材料转换

你现在负责 IELTS Workbench 的 Import Center Phase 2。先阅读根目录 `AGENTS.md`、`PROJECT_SPEC.md`、`docs/DATA_FORMAT.md`、当前迁移和现有测试。不要破坏已经可用的 Reading/Listening/Writing 流程。

目标：让用户把自己合法持有的本地文件转换为 `IELTSPack v1`，但不在仓库中内置、上传或传播任何 Cambridge 内容。

## 约束

- 默认离线；
- AI 不是必需依赖；
- 解析结果是 draft，用户确认后才能 commit；
- 不实现网站抓取；
- 不把源文件复制到日志或测试快照；
- 测试夹具必须原创；
- 路径访问遵守工作区和用户显式选择范围；
- 导入失败不能污染已安装题包。

## 流水线

实现可恢复的 import job：

```text
Acquire
→ Extract
→ Segment
→ Map
→ Validate
→ Preview/Edit
→ Commit
```

每一步保存状态、警告和错误，可从中断处继续。

## 本阶段优先实现

1. PDF 文本型文件：
   - 使用 `pdfjs-dist` 或合理的本地方案；
   - 保存 page index、文本块和基础位置信息；
   - 不把页面简单拼成一条大字符串；
   - 对双栏、页眉页脚、断词给出可编辑结果。
2. DOCX：
   - 提取段落、表格和图片引用；
   - 保留顺序；
   - 失败时给明确提示。
3. 本地媒体映射：
   - MP3/WAV/M4A；
   - PNG/JPG/WebP；
   - 检查引用；
   - 将文件复制到 draft sandbox，确认后进入 pack。
4. Manual Mapping UI：
   - 左侧源 block；
   - 右侧结构树；
   - 用户可把 block 指定为 title/passage/instruction/question/option/answer/transcript；
   - 合并、拆分、重排；
   - question number 和 answer key 可修正；
   - 实时 schema validation。
5. Import Report：
   - errors 阻止 commit；
   - warnings 允许用户确认；
   - 重复 ID、缺媒体、题号跳跃、答案缺失、非法路径均检测。
6. Commit：
   - 原子写入；
   - 失败回滚；
   - 对原始导入文件生成 hash；
   - 重新导入可识别重复；
   - 不覆盖已有 pack，除非进入明确 update flow。

## AI 预留

定义 `ImportStructureAssistant` 接口，但默认实现为 disabled。它只能基于用户明确选择的 extracted blocks 提出结构建议，不得直接写入正式 pack。

## 测试

使用原创 PDF/DOCX/图片/音频 fixture，覆盖：

- 正常 PDF；
- 双栏/页眉噪声；
- 缺答案；
- 重复题号；
- 路径穿越；
- 中途中断恢复；
- commit 失败回滚；
- 重新导入重复检测。

完成后运行全部 lint/test/build，并报告真实结果。

---

# B. Phase 3：DeepSeek Provider 与学习型 AI

你现在负责 IELTS Workbench 的 DeepSeek 集成。先阅读 `AGENTS.md`、`PROJECT_SPEC.md`、`docs/SECURITY.md` 和现有 `AiProvider` 接口。

目标：加入可选的 DeepSeek Provider，但所有非 AI 功能离线可用，Exam 模式绝不能调用 AI。

## 架构

```text
React UI
→ AiAction Service
→ Context Builder
→ Context Preview
→ Tauri Command
→ Rust HTTP Client
→ DeepSeek-compatible API
→ JSON validation
→ ai_runs
```

## 强制要求

- API 请求由 Rust 发出，不由 renderer 直接发出；
- API Key 使用 Tauri Stronghold、系统凭据库或经安全评估的等效方案；
- Key 不得进入 localStorage、普通 SQLite、前端状态快照、错误日志或 Git；
- Base URL 和 model 由用户配置，不把某个当前模型名写死；
- 支持 OpenAI-compatible 请求形式；
- 每个 action 有独立输入/输出 schema；
- 返回 JSON 必须经过 Rust/TypeScript 双边必要校验；
- 支持取消、超时、有限重试、友好错误；
- 不记录完整 prompt/response，默认只记录 action、时间、状态、输入 hash、token/费用元数据（若可得）；
- 用户点击发送前必须看到 Context Preview；
- 默认最小上下文；
- Exam 模式服务层和 UI 层双重拒绝调用；
- AI 不得偷偷修改 essay、答案或 annotation。

## Action

至少实现：

1. `lookup_word`
   - word、IPA、context meaning、中文释义、collocations、synonym differences；
   - 保存到 vocabulary 时保留来源。
2. `explain_selection`
   - 解释句法、指代、逻辑与语境；
   - 不泄露未提交考试答案。
3. `review_question`
   - 用户答案、正确答案、相关原文和用户标记；
   - 输出 errorType、evidence、reasoningSummary、nextRule；
   - AI 的推断与题包确定答案分开显示。
4. `review_listening_mistake`
   - transcript/timestamp 可用时分析拼写、单复数、同义替换、干扰项；
   - 不可用时明确不确定。
5. `evaluate_writing`
   - TR/TA、CC、LR、GRA；
   - 结果始终标注 “AI estimate”；
   - 给 evidence-backed feedback；
   - suggestion 需要用户逐项接受。
6. `overall_review`
   - 只在用户明确选择 Session 后运行；
   - 列出优先级，而不是生成泛泛鼓励。

## 安全测试

- renderer 无法读取明文 key；
- 日志中无 key；
- Exam 模式请求被拒；
- context preview 与实际 payload 一致；
- schema-invalid response 被拒；
- timeout/cancel；
- provider unavailable 不影响核心功能；
- malicious markdown/HTML 不执行脚本。

完成后运行全部检查并更新安全文档。

---

# C. Phase 4：Listening 深化

在现有 Listening v0 上实现：

- transcript block schema；
- sentence/segment timestamp；
- 点击 transcript seek；
- `AudioAnchor`；
- Q ↔ audio range 关联；
- A-B repeat；
- 逐句播放；
- Study 与 Exam 播放策略；
- Listening error taxonomy；
- Review 页面直达错误时间点；
- ASR Provider 抽象，但不绑定 DeepSeek；
- 导入已有 transcript 和时间轴；
- 可选本地 Whisper/远程 ASR 以后再接。

所有音频和 transcript 默认本地，不上传。

为播放器状态机、seek 限制、anchor 恢复和 Session 恢复写测试。

---

# D. Phase 5：主题、背景、备份与发布

实现：

- Theme Profile；
- 用户背景图；
- brightness/blur/overlay/pane opacity；
- 可读性保护；
- workspace backup；
- 导出用户状态；
- 恢复演练；
- Windows installer；
- 更新检查必须 opt-in；
- crash log 默认本地；
- 发布包绝不包含用户题库或 Cambridge 内容。

背景图只允许本地选取，复制到 workspace/themes；删除主题时处理引用。正文对比度不足时自动增加 overlay，并提供一键恢复 Clean Light。
