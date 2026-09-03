# IELTS Workbench 数据格式

本文定义当前实现采用的工作区、`IELTSPack v1`、练习状态和 SQLite 持久化契约。规范性前端校验器位于 `src/domain/pack/schemas.ts`，规范性可执行数据库结构位于 `src-tauri/migrations/`；三处若出现分歧，应先修复分歧再发布题包。

## 1. 通用约定

### 1.1 稳定 ID

Pack、Test、Module、Section、ContentBlock、QuestionGroup、Question、Option、MediaAsset、Session、Annotation 和 WritingVersion 都使用稳定字符串 ID。

- 通用稳定 ID 匹配 `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`；作为目录名的 Pack ID 进一步禁止冒号。
- 同一题包内所有领域实体 ID 全局唯一，不能只在各自数组内唯一。
- Pane 序号、DOM 节点、题号、像素和屏幕坐标都不是领域身份。
- 用户记录使用 UUID 或满足同一稳定 ID 约束的等价字符串。

### 1.2 时间、文本和路径

- 持久化时间使用 ISO 8601 UTC，例如 `2026-09-01T10:30:00.000Z`。
- JSON 使用 UTF-8。
- 题包正文是纯文本结构，不接受不可信 HTML。
- 题包相对路径只能使用 `/`，不能包含空段、`.`、`..`、盘符、UNC 前缀、反斜杠或绝对路径。
- 未知 `schemaVersion` 必须拒绝，不能猜测兼容版本。

## 2. 用户工作区

```text
<workspace>/
├─ workspace.json
├─ ielts-workbench.sqlite3
├─ packs/
├─ imports/
├─ themes/
├─ backups/
└─ logs/
```

`workspace.json` v1：

```json
{
  "schemaVersion": 1,
  "workspaceId": "18acfb68-7ac0-4dbb-a6bf-8fc5c167faad",
  "createdAt": "2026-09-01T10:30:00.000Z",
  "databaseFile": "ielts-workbench.sqlite3"
}
```

题包和主数据库位于用户明确选择的工作区。系统 AppData 中的 `bootstrap.json` 只保存 bootstrap schema 版本和规范化后的工作区路径，不保存题目、作文、音频或密钥。

## 3. `IELTSPack v1`

### 3.1 文件布局与 v1 范围

```text
<pack-id>/
├─ manifest.json
├─ modules/
│  ├─ reading.json
│  ├─ listening.json
│  └─ writing.json
└─ media/
   ├─ audio/
   └─ images/
```

当前固定文件名的 v1 明确限制为：

- 每个 pack 恰好包含一个 Test；
- 每种 module type 最多一个模块；
- `manifest.modules` 决定需要读取哪些 `modules/<type>.json`；
- `tests[0].moduleIds` 必须恰好引用该 pack 中的模块；
- 安装成功后的题包视为只读。

多 Test、同类型多模块和自定义模块文件映射属于后续 schema 版本，不能在 v1 中静默解释。

### 3.2 Manifest

```ts
type ModuleType = "reading" | "listening" | "writing";

type PackManifestV1 = {
  schemaVersion: 1;
  id: string;
  title: string;
  sourceLabel: string;
  edition?: string;
  language: "en";
  modules: ModuleType[];
  createdAt: string;
  attribution?: string;
  tests: [{
    id: string;
    title: string;
    moduleIds: string[];
  }];
  mediaAssets: MediaAsset[];
};

type MediaAsset =
  | {
      id: string;
      type: "audio";
      relativePath: string;
      mimeType: `audio/${string}`;
      durationMs: number;
      sha256?: string;
    }
  | {
      id: string;
      type: "image";
      relativePath: string;
      mimeType: `image/${string}`;
      width?: number;
      height?: number;
      alt: string;
      sha256?: string;
    };
```

仓库中的原创示例 manifest：

```json
{
  "schemaVersion": 1,
  "id": "original-demo-pack",
  "title": "Alderwick Skills Sampler",
  "sourceLabel": "IELTS Workbench original demonstration material",
  "edition": "2026.1",
  "language": "en",
  "modules": ["reading", "listening", "writing"],
  "createdAt": "2026-09-01T00:00:00.000Z",
  "attribution": "Written from scratch for IELTS Workbench. No third-party test content is included.",
  "tests": [
    {
      "id": "demo-test-01",
      "title": "Original Local Practice Test",
      "moduleIds": ["demo-reading-01", "demo-listening-01", "demo-writing-01"]
    }
  ],
  "mediaAssets": [
    {
      "id": "demo-audio-silence-01",
      "type": "audio",
      "relativePath": "media/audio/original-demo-silence.wav",
      "mimeType": "audio/wav",
      "durationMs": 4000,
      "sha256": "bff9ae2d1c0defb0f2b9070f43439fcb723621dbeb1cca5e2dbadcd9bfb13c68"
    }
  ]
}
```

存在 `sha256` 时，它必须是 64 位小写十六进制并与文件内容一致。媒体文件必须位于 `media/` 下，声明的 MIME 家族必须与 asset type 一致。

### 3.3 ContentBlock

```ts
type ContentBlock = {
  id: string;
  kind: "heading" | "paragraph" | "instruction" | "quote";
  text: string;
};
```

第一版标记只能锚定单个稳定 block；跨 block selection 会在 UI 中被拒绝。

### 3.4 QuestionGroup 与 Question

题目直接嵌入 QuestionGroup，不使用位置或题号作为引用：

```ts
type QuestionGroup = {
  id: string;
  title?: string;
  instructions: string;
  questions: Question[];
};

type QuestionBase = {
  id: string;
  number: number;
  prompt: string;
  points?: number;
  explanation?: string;
};

type Question =
  | (QuestionBase & {
      type: "single-choice";
      options: Array<{ id: string; label: string; text: string }>;
      correctOptionId: string;
    })
  | (QuestionBase & {
      type: "true-false-not-given";
      correctAnswer: "true" | "false" | "not-given";
    })
  | (QuestionBase & {
      type: "short-answer";
      acceptableAnswers: string[];
      maxWords?: number;
      caseSensitive?: boolean;
    })
  | (QuestionBase & {
      type: "fill-blank";
      sentence: string;
      acceptableAnswers: string[];
      maxWords?: number;
      caseSensitive?: boolean;
    });
```

`points` 省略时为 1。Fill-blank 的 `sentence` 必须恰好包含一个 `{{blank}}`。`correctOptionId` 必须引用本题唯一 option，`acceptableAnswers` 至少包含一个非空字符串。正确答案属于只读题包；未提交练习，尤其进行中的 Exam，不得通过 UI 暴露。

### 3.5 Module

所有模块都包含 `schemaVersion: 1`、稳定 `id`、与唯一 Test 一致的 `testId`、`type` 和非空 `title`。

```ts
type ReadingModuleV1 = {
  schemaVersion: 1;
  id: string;
  testId: string;
  type: "reading";
  title: string;
  sections: Array<{
    id: string;
    title: string;
    contentBlocks: ContentBlock[];
    questionGroups: QuestionGroup[];
  }>;
};

type ListeningModuleV1 = {
  schemaVersion: 1;
  id: string;
  testId: string;
  type: "listening";
  title: string;
  audioAssetId: string;
  sections: Array<{
    id: string;
    title: string;
    startMs: number;
    endMs?: number;
    contentBlocks: ContentBlock[];
    questionGroups: QuestionGroup[];
  }>;
};

type WritingModuleV1 = {
  schemaVersion: 1;
  id: string;
  testId: string;
  type: "writing";
  title: string;
  sections: Array<{
    id: string;
    title: string;
    tasks: Array<{
      id: string;
      type: "task-1" | "task-2";
      title: string;
      prompt: string;
      minimumWords: number;
      suggestedMinutes?: number;
      imageAssetId?: string;
    }>;
  }>;
};
```

Listening 的 `audioAssetId` 必须解析到 audio asset；Writing 的可选 `imageAssetId` 必须解析到 image asset。`endMs` 若存在必须大于 `startMs`。

### 3.6 组装后的只读对象

从文件夹读取后，repository 向前端返回：

```ts
type IELTSPack = {
  manifest: PackManifestV1;
  modules: Array<ReadingModuleV1 | ListeningModuleV1 | WritingModuleV1>;
};
```

该对象通过 Zod 严格校验后深度冻结。未知字段、错误 discriminant、悬空引用、重复 ID 或未声明模块都必须拒绝。

## 4. 校验与安装

导入分成预览和显式安装两步：

1. 检查绝对源目录、reparse point/symlink、文件数量和总大小上限。
2. 校验 manifest、固定模块文件、所有嵌套结构和跨引用。
3. 校验媒体路径、存在性、类型、大小和可选 SHA-256。
4. 只生成错误/警告/元数据预览，不在预览阶段写工作区。
5. 用户确认后再次执行完整校验。
6. 复制到 `packs/.install-<uuid>`，比较复制前后目录 hash，再原子改名。
7. 最后登记 `installed_packs`；任一步失败都清理由应用创建的 staging 目录。

重复 pack ID、目标目录已存在、源目录与工作区 `packs/` 重叠、路径越界或源内容在预览后改变都必须拒绝，绝不覆盖现有题包。

## 5. Session、答案和标记

```ts
type SessionSnapshot = {
  sessionId: string;
  packId?: string;
  testId?: string;
  moduleType?: "reading" | "listening" | "writing";
  mode: "study" | "exam" | "review";
  status: "in-progress" | "submitted" | "abandoned";
  startedAt?: string;
  updatedAt?: string;
  submittedAt?: string;
  answers: AnswerRecord[];
  annotations: AnnotationRecord[];
};

type AnswerRecord = {
  id: string;
  sessionId: string;
  questionId: string;
  value: string | string[];
  updatedAt: string;
};
```

答案唯一键为 `(session_id, question_id)`。两个 Pane 读取相同的 `sessionId + questionId` 记录，不创建 left/right 副本。进行中的 Session 可恢复；提交会持久化状态和时间后才进入 Review。

### 5.1 TextAnchor 与 Annotation

```ts
type TextAnchor = {
  blockId: string;
  startOffset: number;
  endOffset: number;
  quote: string;
  prefix: string;
  suffix: string;
};

type AnnotationRecord = {
  id: string;
  sessionId: string;
  anchor: TextAnchor;
  style:
    | "highlight-yellow"
    | "highlight-green"
    | "highlight-blue"
    | "highlight-pink"
    | "underline";
  note?: string;
  createdAt: string;
  updatedAt: string;
};
```

Offset 使用 JavaScript UTF-16 code unit，`endOffset` 不包含末位。先按 offset 恢复；失败时使用 `quote + prefix + suffix` 搜索，歧义时返回 unresolved，不能静默选择第一个。Annotation 属于 Session/ContentBlock，不属于 Pane，也不保存像素坐标。

## 6. Writing 数据

```ts
type WritingDraft = {
  sessionId: string;
  taskId: string;
  content: string;
  wordCount: number;
  updatedAt: string;
};

type WritingVersion = {
  id: string;
  sessionId: string;
  taskId: string;
  content: string;
  wordCount: number;
  reason: "manual" | "submitted";
  createdAt: string;
};
```

Draft 对 `(sessionId, taskId)` upsert；Version 只能 insert/list。自动保存不得覆盖历史版本，Submit 创建 `submitted` 不可变快照。AI 建议不直接修改 draft 或 version。

## 7. SQLite v1

可执行迁移文件是：

- `src-tauri/migrations/0001_initial.sql`
- `src-tauri/migrations/0002_indexes.sql`
- `src-tauri/migrations/0003_session_immutability.sql`

每个连接启用 `foreign_keys = ON`、WAL 和 busy timeout。迁移在事务中执行，并写入 `schema_migrations`；重复执行必须幂等。

第三个迁移用数据库 trigger 阻止对已提交/已放弃 Session 的答案、标记、草稿和新写作版本继续写入，避免 UI 隐藏失效时破坏提交快照。

| 表 | 当前关键约束 |
| --- | --- |
| `schema_migrations` | `version` 主键，记录名称和应用时间 |
| `app_settings` | `key` 主键；值为受大小限制的 JSON；疑似密钥 key 被 repository 拒绝 |
| `installed_packs` | pack `id` 主键；`install_path` 唯一；保存 manifest、source hash 和安装时间 |
| `practice_sessions` | pack 外键；module/mode/status CHECK；UTC 时间；elapsed 非负 |
| `answers` | `(session_id, question_id)` 复合主键；Session 级联删除 |
| `annotations` | 稳定 ID 主键；Session 外键；block/offset/quote/context；Pane 无关 |
| `writing_drafts` | `(session_id, task_id)` 复合主键；当前文本与 word count |
| `writing_versions` | 只增版本；kind 仅 `manual`/`submitted` |
| `vocabulary_items` | 预留词汇、来源与学习状态字段 |
| `ai_runs` | 只保留动作、provider/status/元数据，不保存 API Key |

索引覆盖 Session 恢复、Annotation block 查询、Writing version 时间线和词汇规范化检索。字段的最终名称与 CHECK 定义以迁移 SQL 为准，不在本文复制第二份可能漂移的 DDL。

## 8. PDF 导入来源元数据

PDF 辅助导入只生成现有 `IELTSPack`，不建立平行数据库。为保持旧题包兼容，v1 增加的字段均为可选字段：旧 demo 和既有用户题包无需补写即可继续通过校验。

`manifest.importMetadata` 记录导入来源：源文件名、字节数、SHA-256 指纹、资料名、Test/Passage、1-based inclusive 的 Passage/Questions/Answer Key 页码范围、导入时间、提取方式、解析器版本、页码基准、复核状态和去重键。绝对路径和网盘 token 不属于该结构。

`question.source` 记录：

- `rawText`：识别前的题目文本，避免暂不支持的题型丢失内容；
- `sourcePages`：1-based inclusive 来源页范围；
- `sourceBlock`：稳定的解析块标识，而不是 DOM、Pane 或像素坐标；
- `detectedType`：识别出的题型或 `unsupported`；
- `needsReview`：题型、选项或答案仍需人工确认。

导入题目的标准答案可以暂缺：`single-choice.correctOptionId` 与 `true-false-not-given.correctAnswer` 为可选，简答/填空的 `acceptableAnswers` 可以为空。缺答案表示“未评分/待核对”，不是错误答案；Review 不得据此把用户作答标红。导入后题包仍然只读，实际答案记录和标记仍由 Session/SQLite 所有。

生成题包在 Tauri 中先写入工作区 `imports/.install-generated-*` 的应用自有暂存目录，只包含 `manifest.json` 和一个 Reading 模块，再复用现有校验与安装事务。重复 pack ID 或去重键不覆盖既有题包。

## 9. 演进规则

- 会改变既有字段含义、必填性或读取行为的题包格式变化必须提升 `schemaVersion`。只增加可选、可忽略的来源元数据时可保持 v1，但必须保留旧数据回归测试并同步 Rust/TypeScript 校验器。
- 数据库结构变化必须新增迁移，不能修改已发布迁移。
- 破坏性迁移前先备份工作区数据库；若备份失败则中止。
- 新版本读取旧锚点时必须保留显式 unresolved 状态。
- `speaking`、多 Test、自定义模块映射、OCR 和远程 AI 都不属于 v1。
