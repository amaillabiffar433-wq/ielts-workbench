import { z } from "zod";

import { deepFreeze, type DeepReadonly } from "../shared/immutability";

export const StableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/,
    "Stable IDs may contain letters, numbers, dot, underscore, colon, and hyphen only",
  );

export const PackIdSchema = StableIdSchema.refine(
  (value) => !value.includes(":"),
  "Pack IDs must also be safe as a single folder name and may not contain a colon",
);

export const IsoUtcDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
    "Expected an ISO 8601 UTC timestamp",
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid timestamp");

export const RelativePackPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => !value.includes("\\"), "Pack paths must use forward slashes")
  .refine(
    (value) => !value.startsWith("/") && !/^[A-Za-z]:/.test(value),
    "Pack paths must be relative",
  )
  .refine(
    (value) => value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    "Pack paths may not contain empty, current-directory, or parent-directory segments",
  );

export const ModuleTypeSchema = z.enum(["reading", "listening", "writing"]);

export const SourcePageRangeSchema = z
  .object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .strict()
  .refine((range) => range.end >= range.start, "Page range end must not precede start");

export const PdfImportMetadataSchema = z
  .object({
    sourceFileName: z.string().trim().min(1),
    sourceFileSize: z.number().int().nonnegative(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    sourceFingerprint: z.string().trim().min(1),
    bookTitle: z.string().trim().min(1),
    testNumber: z.string().trim().min(1),
    module: z.literal("reading"),
    passageNumber: z.number().int().min(1).max(3),
    passagePageRange: SourcePageRangeSchema,
    questionPageRange: SourcePageRangeSchema,
    answerKeyPageRange: SourcePageRangeSchema.optional(),
    importedAt: IsoUtcDateTimeSchema,
    extractionMode: z.enum(["pdf-text-layer", "pdf-visual"]),
    parserVersion: z.string().trim().min(1),
    pageNumberBase: z.literal(1),
    needsReview: z.boolean(),
    dedupeKey: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const ChoiceOptionSchema = z
  .object({
    id: StableIdSchema,
    label: z.string().trim().min(1).max(16),
    text: z.string().trim().min(1),
  })
  .strict();

export const QuestionSourceSchema = z
  .object({
    rawText: z.string().min(1),
    sourcePages: z.array(z.number().int().positive()).min(1),
    sourceBlock: z.string().trim().min(1),
    detectedType: z.enum([
      "single-choice",
      "multiple-choice",
      "true-false-not-given",
      "yes-no-not-given",
      "matching",
      "short-answer",
      "fill-blank",
      "matching-headings",
      "unsupported",
    ]),
    needsReview: z.boolean(),
  })
  .strict();

const questionBaseShape = {
  id: StableIdSchema,
  number: z.number().int().positive(),
  prompt: z.string().trim().min(1),
  points: z.number().int().positive().default(1),
  explanation: z.string().trim().min(1).optional(),
  source: QuestionSourceSchema.optional(),
};

export const SingleChoiceQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("single-choice"),
    options: z.array(ChoiceOptionSchema).min(2),
    correctOptionId: StableIdSchema.optional(),
  })
  .strict();

export const TrueFalseNotGivenQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("true-false-not-given"),
    correctAnswer: z.enum(["true", "false", "not-given"]).optional(),
  })
  .strict();

export const YesNoNotGivenQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("yes-no-not-given"),
    correctAnswer: z.enum(["yes", "no", "not-given"]).optional(),
  })
  .strict();

export const MultipleChoiceQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("multiple-choice"),
    options: z.array(ChoiceOptionSchema).min(2),
    selectionCount: z.number().int().min(2).max(8),
    additionalNumbers: z.array(z.number().int().positive()).max(7).default([]),
    scoringMode: z.enum(["exact-set", "per-correct-option"]),
    correctOptionIds: z.array(StableIdSchema).max(8).default([]),
  })
  .strict();

export const MatchingQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("matching"),
    matchingKind: z.enum(["headings", "information", "features", "sentence-endings"]),
    options: z.array(ChoiceOptionSchema).min(2),
    allowOptionReuse: z.boolean(),
    correctOptionId: StableIdSchema.optional(),
  })
  .strict();

export const ShortAnswerQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("short-answer"),
    acceptableAnswers: z.array(z.string().trim().min(1)).default([]),
    maxWords: z.number().int().positive().max(20).optional(),
    caseSensitive: z.boolean().default(false),
  })
  .strict();

export const FillBlankQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("fill-blank"),
    sentence: z.string().trim().min(1),
    acceptableAnswers: z.array(z.string().trim().min(1)).default([]),
    maxWords: z.number().int().positive().max(20).optional(),
    caseSensitive: z.boolean().default(false),
  })
  .strict();

export const QuestionSchema = z
  .discriminatedUnion("type", [
    SingleChoiceQuestionSchema,
    MultipleChoiceQuestionSchema,
    TrueFalseNotGivenQuestionSchema,
    YesNoNotGivenQuestionSchema,
    MatchingQuestionSchema,
    ShortAnswerQuestionSchema,
    FillBlankQuestionSchema,
  ])
  .superRefine((question, context) => {
    if (question.type === "single-choice" || question.type === "matching") {
      const optionIds = question.options.map((option) => option.id);
      if (new Set(optionIds).size !== optionIds.length) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Option IDs must be unique within a question",
        });
      }
      if (question.correctOptionId !== undefined && !optionIds.includes(question.correctOptionId)) {
        context.addIssue({
          code: "custom",
          path: ["correctOptionId"],
          message: "correctOptionId must reference one of the question options",
        });
      }
    }

    if (question.type === "multiple-choice") {
      const optionIds = question.options.map((option) => option.id);
      if (new Set(optionIds).size !== optionIds.length) {
        context.addIssue({ code: "custom", path: ["options"], message: "Option IDs must be unique within a question" });
      }
      if (question.selectionCount > optionIds.length) {
        context.addIssue({ code: "custom", path: ["selectionCount"], message: "selectionCount cannot exceed the number of options" });
      }
      const correctIds = question.correctOptionIds;
      if (new Set(correctIds).size !== correctIds.length || correctIds.some((id) => !optionIds.includes(id))) {
        context.addIssue({ code: "custom", path: ["correctOptionIds"], message: "correctOptionIds must be unique references to this question's options" });
      }
      if (correctIds.length !== 0 && correctIds.length !== question.selectionCount) {
        context.addIssue({ code: "custom", path: ["correctOptionIds"], message: "A scorable multiple-choice question requires exactly selectionCount correct options" });
      }
      const numbers = [question.number, ...question.additionalNumbers];
      if (new Set(numbers).size !== numbers.length) {
        context.addIssue({ code: "custom", path: ["additionalNumbers"], message: "Associated question numbers must be unique" });
      }
      if (question.additionalNumbers.length > 0) {
        if (numbers.length !== question.selectionCount || question.scoringMode !== "per-correct-option" || question.points !== question.selectionCount) {
          context.addIssue({
            code: "custom",
            path: ["additionalNumbers"],
            message: "Multiple-number selection sets require per-correct-option scoring and one point/number per required selection",
          });
        }
      }
    }

    if (question.type === "fill-blank") {
      const blankCount = question.sentence.split("{{blank}}").length - 1;
      if (blankCount !== 1) {
        context.addIssue({
          code: "custom",
          path: ["sentence"],
          message: "Fill-blank sentences must contain exactly one {{blank}} marker",
        });
      }
    }
  });

// Crop is immutable source provenance in normalized PDF-page coordinates, never an annotation identity.
export const PdfCropSchema = z.object({
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).strict().refine((crop) => crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001, "Crop must stay inside the source page");

export const VisualSourceSchema = z.object({
  type: z.enum(["snapshot", "image", "figure"]),
  assetId: StableIdSchema,
  sourcePage: z.number().int().positive().optional(),
  crop: PdfCropSchema.optional(),
  altText: z.string().min(1).max(1000),
  ocrText: z.string().max(20_000).optional(),
}).strict();

export const VisualContextBlockSchema = VisualSourceSchema.extend({
  id: StableIdSchema,
  linkedQuestionIds: z.array(StableIdSchema).max(100).optional(),
});
export type VisualSource = DeepReadonly<z.infer<typeof VisualSourceSchema>>;
export type VisualContextBlock = DeepReadonly<z.infer<typeof VisualContextBlockSchema>>;

export const ContentBlockSchema = z
  .object({
    id: StableIdSchema,
    kind: z.enum(["heading", "paragraph", "instruction", "quote"]),
    text: z.string().min(1),
    visual: VisualSourceSchema.optional(),
  })
  .strict();

export const MAX_QUESTION_CONTEXT_BLOCKS = 32;
export const MAX_QUESTION_CONTEXT_LIST_ITEMS = 50;
export const MAX_QUESTION_CONTEXT_TABLE_ROWS = 30;
export const MAX_QUESTION_CONTEXT_TABLE_COLUMNS = 12;
export const MAX_QUESTION_CONTEXT_TEXT_LENGTH = 4_000;
export const MAX_QUESTION_CONTEXT_NODES = 512;

const QuestionContextTextSchema = z.string().max(MAX_QUESTION_CONTEXT_TEXT_LENGTH);

export const QuestionContextParagraphSchema = z
  .object({
    id: StableIdSchema,
    type: z.literal("paragraph"),
    text: QuestionContextTextSchema,
  })
  .strict();

export const QuestionContextListItemSchema = z
  .object({
    id: StableIdSchema,
    text: QuestionContextTextSchema,
  })
  .strict();

export const QuestionContextListSchema = z
  .object({
    id: StableIdSchema,
    type: z.literal("list"),
    style: z.enum(["ordered", "unordered"]),
    items: z.array(QuestionContextListItemSchema).min(1).max(MAX_QUESTION_CONTEXT_LIST_ITEMS),
  })
  .strict();

export const QuestionContextTableCellSchema = z
  .object({
    id: StableIdSchema,
    text: QuestionContextTextSchema,
    questionId: StableIdSchema.optional(),
  })
  .strict();

export const QuestionContextTableRowSchema = z
  .object({
    id: StableIdSchema,
    cells: z
      .array(QuestionContextTableCellSchema)
      .min(1)
      .max(MAX_QUESTION_CONTEXT_TABLE_COLUMNS),
  })
  .strict();

export const QuestionContextTableSchema = z
  .object({
    id: StableIdSchema,
    type: z.literal("table"),
    hasHeaderRow: z.boolean(),
    hasRowHeaders: z.boolean(),
    rows: z
      .array(QuestionContextTableRowSchema)
      .min(1)
      .max(MAX_QUESTION_CONTEXT_TABLE_ROWS),
  })
  .strict()
  .superRefine((table, context) => {
    const columnCount = table.rows[0]?.cells.length ?? 0;
    table.rows.forEach((row, rowIndex) => {
      if (row.cells.length !== columnCount) {
        context.addIssue({
          code: "custom",
          path: ["rows", rowIndex, "cells"],
          message: "Question context tables must remain rectangular",
        });
      }
    });
  });

export const QuestionContextCompletionPartSchema = z.discriminatedUnion("kind", [
  z.object({ id: StableIdSchema, kind: z.literal("text"), text: QuestionContextTextSchema }).strict(),
  z.object({ id: StableIdSchema, kind: z.literal("answer"), questionId: StableIdSchema }).strict(),
]);

export const QuestionContextCompletionSchema = z
  .object({
    id: StableIdSchema,
    type: z.literal("completion"),
    style: z.enum(["summary", "notes"]),
    title: z.string().trim().min(1).max(200).optional(),
    parts: z.array(QuestionContextCompletionPartSchema).min(2).max(100),
  })
  .strict()
  .superRefine((block, context) => {
    if (!block.parts.some((part) => part.kind === "text") || !block.parts.some((part) => part.kind === "answer")) {
      context.addIssue({ code: "custom", path: ["parts"], message: "Completion context requires both text and at least one answer slot" });
    }
  });

export const QuestionContextBlockSchema = z.discriminatedUnion("type", [
  QuestionContextParagraphSchema,
  QuestionContextListSchema,
  QuestionContextTableSchema,
  QuestionContextCompletionSchema,
  VisualContextBlockSchema,
]);

export const QuestionGroupSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1).optional(),
    instructions: z.string().trim().min(1),
    contextBlocks: z.array(QuestionContextBlockSchema).max(MAX_QUESTION_CONTEXT_BLOCKS).optional(),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict()
  .superRefine((group, context) => {
    const questions = new Map(group.questions.map((question) => [question.id, question]));
    const boundQuestionIds = new Set<string>();
    let nodeCount = group.contextBlocks?.length ?? 0;
    (group.contextBlocks ?? []).forEach((block, blockIndex) => {
      if ("assetId" in block) {
        const ids = block.linkedQuestionIds ?? [];
        if (new Set(ids).size !== ids.length || ids.some((id) => !questions.has(id))) {
          context.addIssue({ code: "custom", path: ["contextBlocks", blockIndex, "linkedQuestionIds"], message: "Visual references must be unique questions in this group" });
        }
      }
      if (block.type === "list") nodeCount += block.items.length;
      if (block.type === "completion") {
        nodeCount += block.parts.length;
        block.parts.forEach((part, partIndex) => {
          if (part.kind !== "answer") return;
          const path = ["contextBlocks", blockIndex, "parts", partIndex, "questionId"];
          const question = questions.get(part.questionId);
          if (!question) {
            context.addIssue({ code: "custom", path, message: "A completion answer slot must reference a question in the same question group" });
            return;
          }
          if (question.type !== "short-answer" && question.type !== "fill-blank") {
            context.addIssue({ code: "custom", path, message: "Only short-answer and fill-blank questions can be bound inside completion context" });
          }
          if (boundQuestionIds.has(part.questionId)) {
            context.addIssue({ code: "custom", path, message: "A question may have only one primary answer position in structured context" });
          }
          boundQuestionIds.add(part.questionId);
        });
        return;
      }
      if (block.type !== "table") return;
      nodeCount += block.rows.length + block.rows.reduce((sum, row) => sum + row.cells.length, 0);
      block.rows.forEach((row, rowIndex) => {
        row.cells.forEach((cell, cellIndex) => {
          if (!cell.questionId) return;
          const path = ["contextBlocks", blockIndex, "rows", rowIndex, "cells", cellIndex, "questionId"];
          const question = questions.get(cell.questionId);
          if (!question) {
            context.addIssue({
              code: "custom",
              path,
              message: "A table answer binding must reference a question in the same question group",
            });
            return;
          }
          if (question.type !== "short-answer" && question.type !== "fill-blank") {
            context.addIssue({
              code: "custom",
              path,
              message: "Only short-answer and fill-blank questions can be bound inside a table cell",
            });
          }
          if (boundQuestionIds.has(cell.questionId)) {
            context.addIssue({
              code: "custom",
              path,
              message: "A question may have only one primary answer position in structured context",
            });
          }
          boundQuestionIds.add(cell.questionId);
        });
      });
    });
    if (nodeCount > MAX_QUESTION_CONTEXT_NODES) {
      context.addIssue({
        code: "custom",
        path: ["contextBlocks"],
        message: `Structured question context may contain at most ${MAX_QUESTION_CONTEXT_NODES} persistent nodes`,
      });
    }
  });

export const ReadingSectionSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1),
    contentBlocks: z.array(ContentBlockSchema).min(1),
    questionGroups: z.array(QuestionGroupSchema).min(1),
  })
  .strict();

const moduleIdentityShape = {
  id: StableIdSchema,
  testId: StableIdSchema,
  title: z.string().trim().min(1),
};

export const ReadingModuleSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    ...moduleIdentityShape,
    type: z.literal("reading"),
    sections: z.array(ReadingSectionSchema).min(1),
  })
  .strict()
  .superRefine((module, context) => {
    if (module.schemaVersion < 4) {
      module.sections.forEach((section, sectionIndex) => {
        if (section.contentBlocks.some((block) => block.visual) || section.questionGroups.some((group) => group.contextBlocks?.some((block) => "assetId" in block))) {
          context.addIssue({ code: "custom", path: ["sections", sectionIndex], message: "Visual context requires Reading module schemaVersion 4" });
        }
      });
    }
    if (module.schemaVersion === 1) {
      module.sections.forEach((section, sectionIndex) => {
        section.questionGroups.forEach((group, groupIndex) => {
          if (group.contextBlocks !== undefined) {
            context.addIssue({
              code: "custom",
              path: ["sections", sectionIndex, "questionGroups", groupIndex, "contextBlocks"],
              message: "Structured question context requires Reading module schemaVersion 2",
            });
          }
        });
      });
    }
    if (module.schemaVersion < 3) {
      module.sections.forEach((section, sectionIndex) => {
        section.questionGroups.forEach((group, groupIndex) => {
          group.questions.forEach((question, questionIndex) => {
            if (["multiple-choice", "yes-no-not-given", "matching"].includes(question.type)) {
              context.addIssue({
                code: "custom",
                path: ["sections", sectionIndex, "questionGroups", groupIndex, "questions", questionIndex, "type"],
                message: "Advanced Reading question types require schemaVersion 3",
              });
            }
          });
          (group.contextBlocks ?? []).forEach((block, blockIndex) => {
            if (block.type === "completion") {
              context.addIssue({
                code: "custom",
                path: ["sections", sectionIndex, "questionGroups", groupIndex, "contextBlocks", blockIndex],
                message: "Completion context requires Reading module schemaVersion 3",
              });
            }
          });
        });
      });
    }
  });

export const TranscriptCueSchema = z
  .object({
    id: StableIdSchema,
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive().optional(),
    speaker: z.string().trim().min(1).max(80).optional(),
    text: z.string().trim().min(1),
    clozeAnswers: z.array(z.string().trim().min(1).max(120)).max(12).default([]),
  })
  .strict()
  .superRefine((cue, context) => {
    if (cue.endMs !== undefined && cue.endMs <= cue.startMs) {
      context.addIssue({ code: "custom", path: ["endMs"], message: "Transcript cue endMs must be greater than startMs" });
    }
    const normalizedText = cue.text.toLocaleLowerCase("en-US");
    cue.clozeAnswers.forEach((answer, index) => {
      if (!normalizedText.includes(answer.toLocaleLowerCase("en-US"))) {
        context.addIssue({
          code: "custom",
          path: ["clozeAnswers", index],
          message: "Each cloze answer must occur in the transcript cue text",
        });
      }
    });
  });

export const ListeningSectionSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive().optional(),
    contentBlocks: z.array(ContentBlockSchema).default([]),
    transcriptCues: z.array(TranscriptCueSchema).default([]),
    questionGroups: z.array(QuestionGroupSchema).min(1),
  })
  .strict()
  .superRefine((section, context) => {
    if (section.contentBlocks.some((block) => block.visual)) {
      context.addIssue({ code: "custom", path: ["contentBlocks"], message: "Visual source blocks are supported only in Reading" });
    }
    if (section.endMs !== undefined && section.endMs <= section.startMs) {
      context.addIssue({
        code: "custom",
        path: ["endMs"],
        message: "endMs must be greater than startMs",
      });
    }
    section.transcriptCues.forEach((cue, cueIndex) => {
      if (cue.startMs < section.startMs || (section.endMs !== undefined && cue.startMs >= section.endMs)) {
        context.addIssue({
          code: "custom",
          path: ["transcriptCues", cueIndex, "startMs"],
          message: "Transcript cue startMs must fall inside its Listening section",
        });
      }
      if (section.endMs !== undefined && cue.endMs !== undefined && cue.endMs > section.endMs) {
        context.addIssue({
          code: "custom",
          path: ["transcriptCues", cueIndex, "endMs"],
          message: "Transcript cue endMs must not exceed its Listening section",
        });
      }
      if (cueIndex > 0 && cue.startMs < section.transcriptCues[cueIndex - 1].startMs) {
        context.addIssue({
          code: "custom",
          path: ["transcriptCues", cueIndex, "startMs"],
          message: "Transcript cues must be ordered by startMs",
        });
      }
    });
  });

export const ListeningModuleSchema = z
  .object({
    schemaVersion: z.literal(1),
    ...moduleIdentityShape,
    type: z.literal("listening"),
    audioAssetId: StableIdSchema,
    sections: z.array(ListeningSectionSchema).min(1),
  })
  .strict()
  .superRefine((module, context) => {
    module.sections.forEach((section, sectionIndex) => {
      section.questionGroups.forEach((group, groupIndex) => {
        group.questions.forEach((question, questionIndex) => {
          if (["multiple-choice", "yes-no-not-given", "matching"].includes(question.type)) {
            context.addIssue({
              code: "custom",
              path: ["sections", sectionIndex, "questionGroups", groupIndex, "questions", questionIndex, "type"],
              message: "Advanced question types are currently supported only by Reading module schemaVersion 3",
            });
          }
        });
        if (group.contextBlocks !== undefined) {
          context.addIssue({
            code: "custom",
            path: ["sections", sectionIndex, "questionGroups", groupIndex, "contextBlocks"],
            message: "Structured question context is supported only by Reading module schemaVersion 2",
          });
        }
      });
    });
  });

export const WritingTaskSchema = z
  .object({
    id: StableIdSchema,
    type: z.enum(["task-1", "task-2"]),
    title: z.string().trim().min(1),
    prompt: z.string().trim().min(1),
    minimumWords: z.number().int().positive(),
    suggestedMinutes: z.number().int().positive().optional(),
    imageAssetId: StableIdSchema.optional(),
  })
  .strict();

export const WritingSectionSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1),
    tasks: z.array(WritingTaskSchema).min(1),
  })
  .strict();

export const WritingModuleSchema = z
  .object({
    schemaVersion: z.literal(1),
    ...moduleIdentityShape,
    type: z.literal("writing"),
    sections: z.array(WritingSectionSchema).min(1),
  })
  .strict();

export const PackModuleSchema = z.union([
  ReadingModuleSchema,
  ListeningModuleSchema,
  WritingModuleSchema,
]);

export const AudioMediaAssetSchema = z
  .object({
    id: StableIdSchema,
    type: z.literal("audio"),
    relativePath: RelativePackPathSchema,
    mimeType: z.string().regex(/^audio\/[A-Za-z0-9.+-]+$/),
    durationMs: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict();

export const ImageMediaAssetSchema = z
  .object({
    id: StableIdSchema,
    type: z.literal("image"),
    relativePath: RelativePackPathSchema,
    mimeType: z.string().regex(/^image\/[A-Za-z0-9.+-]+$/),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    alt: z.string().trim().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict();

export const MediaAssetSchema = z.discriminatedUnion("type", [
  AudioMediaAssetSchema,
  ImageMediaAssetSchema,
]);

export const PackTestDescriptorSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1),
    moduleIds: z.array(StableIdSchema).min(1),
  })
  .strict()
  .superRefine((test, context) => {
    if (new Set(test.moduleIds).size !== test.moduleIds.length) {
      context.addIssue({
        code: "custom",
        path: ["moduleIds"],
        message: "A test may reference each module ID only once",
      });
    }
  });

export const PackManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: PackIdSchema,
    title: z.string().trim().min(1),
    sourceLabel: z.string().trim().min(1),
    edition: z.string().trim().min(1).optional(),
    language: z.literal("en"),
    modules: z.array(ModuleTypeSchema).min(1),
    createdAt: IsoUtcDateTimeSchema,
    attribution: z.string().trim().min(1).optional(),
    tests: z.array(PackTestDescriptorSchema).min(1),
    mediaAssets: z.array(MediaAssetSchema).default([]),
    coverImageAssetId: StableIdSchema.optional(),
    importMetadata: PdfImportMetadataSchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (new Set(manifest.modules).size !== manifest.modules.length) {
      context.addIssue({ code: "custom", path: ["modules"], message: "Module types must be unique" });
    }

    const testIds = manifest.tests.map((test) => test.id);
    if (new Set(testIds).size !== testIds.length) {
      context.addIssue({ code: "custom", path: ["tests"], message: "Test IDs must be unique" });
    }

    const mediaIds = manifest.mediaAssets.map((asset) => asset.id);
    if (new Set(mediaIds).size !== mediaIds.length) {
      context.addIssue({
        code: "custom",
        path: ["mediaAssets"],
        message: "Media asset IDs must be unique",
      });
    }
    if (
      manifest.coverImageAssetId !== undefined
      && manifest.mediaAssets.find((asset) => asset.id === manifest.coverImageAssetId)?.type !== "image"
    ) {
      context.addIssue({
        code: "custom",
        path: ["coverImageAssetId"],
        message: "coverImageAssetId must reference an image media asset",
      });
    }
  });

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Early IELTSPack v1 drafts did not always persist Reading question numbers.
 * Normalize only those missing values from the complete module order before
 * strict validation, so view filtering can never renumber a question.
 */
function normalizeLegacyReadingQuestionNumbers(input: unknown): unknown {
  if (!isPlainRecord(input) || !Array.isArray(input.modules)) return input;
  let packChanged = false;
  const modules = input.modules.map((module) => {
    if (!isPlainRecord(module) || module.type !== "reading" || !Array.isArray(module.sections)) {
      return module;
    }
    let questionOrder = 0;
    let moduleChanged = false;
    const sections = module.sections.map((section) => {
      if (!isPlainRecord(section) || !Array.isArray(section.questionGroups)) return section;
      let sectionChanged = false;
      const questionGroups = section.questionGroups.map((group) => {
        if (!isPlainRecord(group) || !Array.isArray(group.questions)) return group;
        let groupChanged = false;
        const questions = group.questions.map((question) => {
          questionOrder += 1;
          if (!isPlainRecord(question) || question.number !== undefined) return question;
          groupChanged = true;
          return { ...question, number: questionOrder };
        });
        if (!groupChanged) return group;
        sectionChanged = true;
        return { ...group, questions };
      });
      if (!sectionChanged) return section;
      moduleChanged = true;
      return { ...section, questionGroups };
    });
    if (!moduleChanged) return module;
    packChanged = true;
    return { ...module, sections };
  });
  return packChanged ? { ...input, modules } : input;
}

const IELTSPackStrictSchema = z
  .object({
    manifest: PackManifestSchema,
    modules: z.array(PackModuleSchema).min(1),
  })
  .strict()
  .superRefine((pack, context) => {
    if (pack.manifest.tests.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["manifest", "tests"],
        message: "IELTSPack v1 supports exactly one test per pack",
      });
    }

    const declaredTypes = new Set(pack.manifest.modules);
    const actualTypes = new Set(pack.modules.map((module) => module.type));

    for (const moduleType of ["reading", "listening", "writing"] as const) {
      if (pack.modules.filter((module) => module.type === moduleType).length > 1) {
        context.addIssue({
          code: "custom",
          path: ["modules"],
          message: `IELTSPack v1 supports at most one ${moduleType} module per pack`,
        });
      }
    }

    for (const declaredType of declaredTypes) {
      if (!actualTypes.has(declaredType)) {
        context.addIssue({
          code: "custom",
          path: ["modules"],
          message: `Manifest declares a ${declaredType} module, but none was provided`,
        });
      }
    }
    for (const actualType of actualTypes) {
      if (!declaredTypes.has(actualType)) {
        context.addIssue({
          code: "custom",
          path: ["manifest", "modules"],
          message: `Module type ${actualType} is present but not declared in the manifest`,
        });
      }
    }

    const moduleById = new Map(pack.modules.map((module) => [module.id, module]));
    const testById = new Map(pack.manifest.tests.map((test) => [test.id, test]));
    pack.manifest.tests.forEach((test, testIndex) => {
      test.moduleIds.forEach((moduleId, moduleIndex) => {
        const module = moduleById.get(moduleId);
        if (!module) {
          context.addIssue({
            code: "custom",
            path: ["manifest", "tests", testIndex, "moduleIds", moduleIndex],
            message: `Unknown module ID: ${moduleId}`,
          });
        } else if (module.testId !== test.id) {
          context.addIssue({
            code: "custom",
            path: ["manifest", "tests", testIndex, "moduleIds", moduleIndex],
            message: `Module ${moduleId} belongs to test ${module.testId}, not ${test.id}`,
          });
        }
      });
    });

    const referencedModuleIds = new Set(pack.manifest.tests.flatMap((test) => test.moduleIds));
    pack.modules.forEach((module, moduleIndex) => {
      if (!testById.has(module.testId)) {
        context.addIssue({
          code: "custom",
          path: ["modules", moduleIndex, "testId"],
          message: `Unknown test ID: ${module.testId}`,
        });
      }
      if (!referencedModuleIds.has(module.id)) {
        context.addIssue({
          code: "custom",
          path: ["modules", moduleIndex, "id"],
          message: `Module ${module.id} is not referenced by a manifest test`,
        });
      }
    });

    const mediaById = new Map(pack.manifest.mediaAssets.map((asset) => [asset.id, asset]));
    pack.modules.forEach((module, moduleIndex) => {
      if (module.type === "reading") {
        module.sections.forEach((section, sectionIndex) => {
          const visuals = [...section.contentBlocks.flatMap((block) => block.visual ? [block.visual] : []),
            ...section.questionGroups.flatMap((group) => (group.contextBlocks ?? []).filter((block) => "assetId" in block))];
          for (const visual of visuals) {
            if (mediaById.get(visual.assetId)?.type !== "image") {
              context.addIssue({ code: "custom", path: ["modules", moduleIndex, "sections", sectionIndex], message: "Visual assetId must reference an image media asset" });
            }
          }
        });
      }
      if (module.type === "listening") {
        const asset = mediaById.get(module.audioAssetId);
        if (!asset || asset.type !== "audio") {
          context.addIssue({
            code: "custom",
            path: ["modules", moduleIndex, "audioAssetId"],
            message: "audioAssetId must reference an audio media asset",
          });
        }
      }
      if (module.type === "writing") {
        module.sections.forEach((section, sectionIndex) => {
          section.tasks.forEach((task, taskIndex) => {
            if (task.imageAssetId !== undefined) {
              const asset = mediaById.get(task.imageAssetId);
              if (!asset || asset.type !== "image") {
                context.addIssue({
                  code: "custom",
                  path: ["modules", moduleIndex, "sections", sectionIndex, "tasks", taskIndex, "imageAssetId"],
                  message: "imageAssetId must reference an image media asset",
                });
              }
            }
          });
        });
      }
    });

    const seenIds = new Map<string, string>();
    const recordId = (id: string, path: (string | number)[]) => {
      const printablePath = path.join(".");
      const previousPath = seenIds.get(id);
      if (previousPath !== undefined) {
        context.addIssue({
          code: "custom",
          path,
          message: `Stable ID ${id} is already used at ${previousPath}`,
        });
      } else {
        seenIds.set(id, printablePath);
      }
    };

    recordId(pack.manifest.id, ["manifest", "id"]);
    pack.manifest.tests.forEach((test, testIndex) =>
      recordId(test.id, ["manifest", "tests", testIndex, "id"]),
    );
    pack.manifest.mediaAssets.forEach((asset, assetIndex) =>
      recordId(asset.id, ["manifest", "mediaAssets", assetIndex, "id"]),
    );
    pack.modules.forEach((module, moduleIndex) => {
      recordId(module.id, ["modules", moduleIndex, "id"]);
      if (module.type === "writing") {
        module.sections.forEach((section, sectionIndex) => {
          recordId(section.id, ["modules", moduleIndex, "sections", sectionIndex, "id"]);
          section.tasks.forEach((task, taskIndex) =>
            recordId(task.id, ["modules", moduleIndex, "sections", sectionIndex, "tasks", taskIndex, "id"]),
          );
        });
        return;
      }
      module.sections.forEach((section, sectionIndex) => {
        recordId(section.id, ["modules", moduleIndex, "sections", sectionIndex, "id"]);
        section.contentBlocks.forEach((block, blockIndex) =>
          recordId(
            block.id,
            ["modules", moduleIndex, "sections", sectionIndex, "contentBlocks", blockIndex, "id"],
          ),
        );
        if (module.type === "listening") {
          module.sections[sectionIndex].transcriptCues.forEach((cue, cueIndex) =>
            recordId(
              cue.id,
              ["modules", moduleIndex, "sections", sectionIndex, "transcriptCues", cueIndex, "id"],
            ),
          );
        }
        section.questionGroups.forEach((group, groupIndex) => {
          recordId(
            group.id,
            ["modules", moduleIndex, "sections", sectionIndex, "questionGroups", groupIndex, "id"],
          );
          group.questions.forEach((question, questionIndex) =>
            recordId(
              question.id,
              [
                "modules",
                moduleIndex,
                "sections",
                sectionIndex,
                "questionGroups",
                groupIndex,
                "questions",
                questionIndex,
                "id",
              ],
            ),
          );
          if (module.type === "reading" && module.schemaVersion >= 2) {
            (group.contextBlocks ?? []).forEach((block, blockIndex) => {
              const blockPath = [
                "modules", moduleIndex, "sections", sectionIndex,
                "questionGroups", groupIndex, "contextBlocks", blockIndex,
              ];
              recordId(block.id, [...blockPath, "id"]);
              if (block.type === "list") {
                block.items.forEach((item, itemIndex) =>
                  recordId(item.id, [...blockPath, "items", itemIndex, "id"]),
                );
              }
              if (block.type === "table") {
                block.rows.forEach((row, rowIndex) => {
                  recordId(row.id, [...blockPath, "rows", rowIndex, "id"]);
                  row.cells.forEach((cell, cellIndex) =>
                    recordId(cell.id, [...blockPath, "rows", rowIndex, "cells", cellIndex, "id"]),
                  );
                });
              }
              if (block.type === "completion") {
                block.parts.forEach((part, partIndex) =>
                  recordId(part.id, [...blockPath, "parts", partIndex, "id"]),
                );
              }
            });
          }
        });
      });
    });
  });

export const IELTSPackSchema = z.preprocess(
  normalizeLegacyReadingQuestionNumbers,
  IELTSPackStrictSchema,
);

type MutableQuestion = z.infer<typeof QuestionSchema>;
type MutablePackManifest = z.infer<typeof PackManifestSchema>;
type MutablePackModule = z.infer<typeof PackModuleSchema>;
type MutableIELTSPack = z.infer<typeof IELTSPackSchema>;

export type Question = DeepReadonly<MutableQuestion>;
export type PackManifest = DeepReadonly<MutablePackManifest>;
export type PackModule = DeepReadonly<MutablePackModule>;
export type ReadingModule = DeepReadonly<z.infer<typeof ReadingModuleSchema>>;
export type ListeningModule = DeepReadonly<z.infer<typeof ListeningModuleSchema>>;
export type TranscriptCue = DeepReadonly<z.infer<typeof TranscriptCueSchema>>;
export type WritingModule = DeepReadonly<z.infer<typeof WritingModuleSchema>>;
export type ContentBlock = DeepReadonly<z.infer<typeof ContentBlockSchema>>;
export type QuestionContextBlock = DeepReadonly<z.infer<typeof QuestionContextBlockSchema>>;
export type QuestionContextTable = DeepReadonly<z.infer<typeof QuestionContextTableSchema>>;
export type MediaAsset = DeepReadonly<z.infer<typeof MediaAssetSchema>>;
export type IELTSPack = DeepReadonly<MutableIELTSPack>;

export function parsePackManifest(input: unknown): PackManifest {
  return deepFreeze(PackManifestSchema.parse(input));
}

export function parsePackModule(input: unknown): PackModule {
  return deepFreeze(PackModuleSchema.parse(input));
}

export function parseIeltsPack(input: unknown): IELTSPack {
  return deepFreeze(IELTSPackSchema.parse(input));
}

export function safeParseIeltsPack(input: unknown) {
  const result = IELTSPackSchema.safeParse(input);
  if (!result.success) {
    return result;
  }
  return { success: true as const, data: deepFreeze(result.data) };
}
