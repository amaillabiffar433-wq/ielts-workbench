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
    extractionMode: z.literal("pdf-text-layer"),
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
      "true-false-not-given",
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
    TrueFalseNotGivenQuestionSchema,
    ShortAnswerQuestionSchema,
    FillBlankQuestionSchema,
  ])
  .superRefine((question, context) => {
    if (question.type === "single-choice") {
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

export const ContentBlockSchema = z
  .object({
    id: StableIdSchema,
    kind: z.enum(["heading", "paragraph", "instruction", "quote"]),
    text: z.string().min(1),
  })
  .strict();

export const QuestionGroupSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1).optional(),
    instructions: z.string().trim().min(1),
    questions: z.array(QuestionSchema).min(1),
  })
  .strict();

export const ReadingSectionSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1),
    contentBlocks: z.array(ContentBlockSchema).min(1),
    questionGroups: z.array(QuestionGroupSchema).min(1),
  })
  .strict();

const moduleBaseShape = {
  schemaVersion: z.literal(1),
  id: StableIdSchema,
  testId: StableIdSchema,
  title: z.string().trim().min(1),
};

export const ReadingModuleSchema = z
  .object({
    ...moduleBaseShape,
    type: z.literal("reading"),
    sections: z.array(ReadingSectionSchema).min(1),
  })
  .strict();

export const ListeningSectionSchema = z
  .object({
    id: StableIdSchema,
    title: z.string().trim().min(1),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().positive().optional(),
    contentBlocks: z.array(ContentBlockSchema).default([]),
    questionGroups: z.array(QuestionGroupSchema).min(1),
  })
  .strict()
  .superRefine((section, context) => {
    if (section.endMs !== undefined && section.endMs <= section.startMs) {
      context.addIssue({
        code: "custom",
        path: ["endMs"],
        message: "endMs must be greater than startMs",
      });
    }
  });

export const ListeningModuleSchema = z
  .object({
    ...moduleBaseShape,
    type: z.literal("listening"),
    audioAssetId: StableIdSchema,
    sections: z.array(ListeningSectionSchema).min(1),
  })
  .strict();

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
    ...moduleBaseShape,
    type: z.literal("writing"),
    sections: z.array(WritingSectionSchema).min(1),
  })
  .strict();

export const PackModuleSchema = z.discriminatedUnion("type", [
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
export type WritingModule = DeepReadonly<z.infer<typeof WritingModuleSchema>>;
export type ContentBlock = DeepReadonly<z.infer<typeof ContentBlockSchema>>;
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
