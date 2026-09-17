import { describe, expect, it } from "vitest";

import type { IELTSPack } from "../../domain";
import { originalDemoPack } from "../../infrastructure/demo/originalDemoPack";
import { groupLibraryBooks } from "./libraryBooks";

function cambridgePack(id: string, testNumber: number, moduleType: "reading" | "listening"): IELTSPack {
  const sourceModule = originalDemoPack.modules.find((module) => module.type === moduleType)!;
  const testId = `cambridge-17-test-${testNumber}`;
  const module = { ...sourceModule, id: `${id}-${moduleType}`, testId };
  return {
    manifest: {
      ...originalDemoPack.manifest,
      id,
      title: "Cambridge IELTS 17 Academic",
      edition: "17 Academic",
      modules: [moduleType],
      tests: [{ id: testId, title: `Test ${testNumber}`, moduleIds: [module.id] }],
      mediaAssets: moduleType === "listening"
        ? originalDemoPack.manifest.mediaAssets.filter((asset) => asset.type === "audio")
        : [],
    },
    modules: [module],
  } as IELTSPack;
}

describe("IELTS Library book grouping", () => {
  it("merges technical Cambridge packs into one numbered book without merging originals", () => {
    const books = groupLibraryBooks([
      cambridgePack("cambridge-17-reading", 2, "reading"),
      cambridgePack("cambridge-17-listening", 3, "listening"),
      originalDemoPack,
    ]);

    expect(books).toHaveLength(2);
    expect(books[0]).toMatchObject({
      key: "cambridge-17-academic",
      cambridgeNumber: 17,
      title: "Cambridge IELTS 17 Academic",
    });
    expect(books[0].packs).toHaveLength(2);
    expect(books[1].packs).toHaveLength(1);
  });

  it("orders Cambridge books newest first", () => {
    const books = groupLibraryBooks([
      cambridgePack("cambridge-17-reading", 1, "reading"),
      { ...cambridgePack("cambridge-20-reading", 1, "reading"), manifest: { ...cambridgePack("cambridge-20-reading", 1, "reading").manifest, title: "Cambridge IELTS 20 Academic", edition: "20 Academic" } } as IELTSPack,
    ]);
    expect(books.map((book) => book.cambridgeNumber)).toEqual([20, 17]);
  });
});
