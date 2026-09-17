import { describe, expect, it } from "vitest";
import { parseIeltsPack } from "../../domain";
import { createOriginalDemoWritingChartPng } from "../../infrastructure/demo";
import { InMemoryLearningRepository, type InMemoryRepositorySnapshot } from "../../infrastructure/repositories/InMemoryLearningRepository";
import { describeImportPng } from "../../infrastructure/repositories/importImageModel";
import { createStructuredImportDraft, buildStructuredReadingPack, StructuredImportDraftSchema, validateStructuredImportDraft, saveStructuredImportDraft, loadStructuredImportDrafts } from "./structuredImportModel";
import { addQuickQuestions, appendVisual, cropFromPoints, fullPageCrop, prepareQuickImport } from "./visualImportModel";

function sample(text = "Original river reading passage. Water is collected in a tank.") {
  return prepareQuickImport(createStructuredImportDraft({ fileName: "original.pdf", fileSize: 5000, sourceSha256: "a".repeat(64), pageCount: 2, pages: [{ pageNumber: 1, text }, { pageNumber: 2, text: "" }] }));
}
async function visualDraft() {
  let draft = sample("");
  const passage = draft.passages[0], group = passage.questionGroups[0];
  draft = addQuickQuestions(draft, group.id, "18-19", "short-answer");
  const bytes = createOriginalDemoWritingChartPng();
  const asset = await describeImportPng(bytes);
  draft = appendVisual(draft, passage.id, asset, { type: "snapshot", assetId: asset.id, altText: "Original passage", sourcePage: 1, crop: fullPageCrop });
  draft = appendVisual(draft, group.id, asset, { type: "figure", assetId: asset.id, altText: "Original flow chart", sourcePage: 2, crop: fullPageCrop, ocrText: "A water tank" });
  return { draft, asset, bytes };
}

describe("Visual PDF import identity and persistence", () => {
  it("normalizes reverse drags, clamps edges and rejects zero-area crops", () => {
    expect(cropFromPoints({ x: 1.2, y: 1.1 }, { x: 0.2, y: 0.3 })).toEqual({ x: 0.2, y: 0.3, width: 0.8, height: 0.7 });
    expect(cropFromPoints({ x: 0.2, y: 0.3 }, { x: 0.2, y: 0.3 })).toBeNull();
  });
  it("allows a scan-only draft to enter the editor but requires body and controls before installation", () => {
    const draft = sample("");
    expect(StructuredImportDraftSchema.parse(draft).source.pages[0].text).toBe("");
    expect(validateStructuredImportDraft(draft).errors.map((issue) => issue.code)).toEqual(expect.arrayContaining(["PASSAGE_TEXT_REQUIRED", "QUESTION_REQUIRED"]));
  });
  it("creates stable controls for a range without overwriting existing question IDs", () => {
    const draft = sample(), groupId = draft.passages[0].questionGroups[0].id;
    const next = addQuickQuestions(draft, groupId, "14–19", "short-answer");
    expect(next.passages[0].questionGroups[0].questions.map((question) => question.number)).toEqual([14, 15, 16, 17, 18, 19]);
    expect(new Set(next.passages[0].questionGroups[0].questions.map((question) => question.id)).size).toBe(6);
    expect(() => addQuickQuestions(next, groupId, "18", "short-answer")).toThrow("已存在");
    for (const range of ["0-3", "20-14", "1-101", "Q18", ""]) expect(() => addQuickQuestions(draft, groupId, range, "short-answer")).toThrow();
  });
  it("validates mixed visual contexts, emits schema 4, keeps IDs and de-duplicates image content", async () => {
    const { draft: visualSource, asset } = await visualDraft();
    const draft = { ...visualSource, coverAssetId: asset.id };
    expect(validateStructuredImportDraft(draft).errors).toEqual([]);
    const pack = await buildStructuredReadingPack(draft);
    expect(pack.modules[0].schemaVersion).toBe(4);
    expect(pack.manifest.mediaAssets).toHaveLength(1);
    expect(pack.manifest.mediaAssets[0].id).toBe(asset.id);
    expect(pack.manifest.coverImageAssetId).toBe(asset.id);
    expect(JSON.stringify(pack)).not.toMatch(/blob:|data:image/u);
    const module = pack.modules[0];
    if (module.type !== "reading") throw new Error("Reading expected");
    expect(module.sections[0].id).toBe(draft.passages[0].id);
    expect(module.sections[0].questionGroups[0].questions[0].number).toBe(18);
    expect(module.sections[0].questionGroups[0].questions[0].id).toBe(draft.passages[0].questionGroups[0].questions[0].id);
    expect(() => parseIeltsPack({ ...pack, modules: [{ ...module, schemaVersion: 3 }] })).toThrow();
  });
  it("retains source pages selected outside the initial text range", async () => {
    const { draft, asset } = await visualDraft();
    draft.source.pages = [draft.source.pages[0]];
    const next = appendVisual(draft, draft.passages[0].questionGroups[0].id, asset, { type: "snapshot", assetId: asset.id, sourcePage: 2, altText: "Question page" });
    expect(next.passages[0].questionGroups[0].sourcePages).toEqual([2]);
    expect((await buildStructuredReadingPack(next)).manifest.importMetadata?.questionPageRange).toEqual({ start: 1, end: 2 });
  });
  it("blocks missing assets, invalid links, duplicate stable IDs and out-of-bounds crops", async () => {
    const { draft } = await visualDraft();
    expect(validateStructuredImportDraft({ ...draft, imageAssets: [] }).errors.some((issue) => issue.code === "VISUAL_ASSET_MISSING")).toBe(true);
    const group = draft.passages[0].questionGroups[0];
    const context = group.contextBlocks[0];
    if (!("assetId" in context)) throw new Error("Visual expected");
    context.linkedQuestionIds = ["unrelated-question"];
    expect(validateStructuredImportDraft(draft).errors.some((issue) => issue.code === "VISUAL_QUESTION_REFERENCE")).toBe(true);
    context.linkedQuestionIds = [];
    context.id = group.questions[0].id;
    expect(validateStructuredImportDraft(draft).valid).toBe(false);
    context.crop = { x: 0.9, y: 0, width: 0.2, height: 1 };
    expect(StructuredImportDraftSchema.safeParse(draft).success).toBe(false);
  });
  it("restores draft metadata, installed images and answers through the same persisted repository", async () => {
    let state: InMemoryRepositorySnapshot | null = null;
    const stateStore = { load: async () => state, save: async (value: InMemoryRepositorySnapshot) => { state = structuredClone(value); } };
    const first = new InMemoryLearningRepository({ stateStore });
    const { draft, asset, bytes } = await visualDraft();
    await first.saveImportImage(draft.id, bytes);
    await saveStructuredImportDraft(first, draft);
    const pack = await buildStructuredReadingPack(draft);
    await first.installImportedPack(pack, draft.id);
    const session = await first.createSession({ packId: pack.manifest.id, testId: pack.manifest.tests[0].id, moduleType: "reading", mode: "study" });
    const questionId = draft.passages[0].questionGroups[0].questions[0].id;
    await first.saveAnswer({ sessionId: session.sessionId, questionId, value: "tank" });
    const second = new InMemoryLearningRepository({ stateStore });
    expect((await loadStructuredImportDrafts(second))[0]).toEqual(draft);
    expect(await second.readImportImage(draft.id, asset.id)).toEqual(bytes);
    expect(await second.readPackMedia(pack.manifest.id, asset.relativePath)).toEqual(bytes);
    expect((await second.loadSession(session.sessionId))?.answers[0]).toMatchObject({ questionId, value: "tank" });
    await expect(second.readImportImage("other-draft", asset.id)).rejects.toThrow();
  });
  it.each([1, 2, 3, 4])("migrates draft v%i without changing identities or overwriting answers", (version) => {
    const draft = sample();
    const legacy = { ...draft, schemaVersion: version, imageAssets: undefined };
    const restored = StructuredImportDraftSchema.parse(legacy);
    expect(restored.schemaVersion).toBe(5);
    expect(restored.passages).toEqual(draft.passages);
    expect(restored.id).toBe(draft.id);
    expect(restored.imageAssets).toEqual([]);
    expect(restored.coverAssetId).toBeNull();
  });
});
