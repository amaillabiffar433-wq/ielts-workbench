import type { IELTSPack } from "../../domain";

export interface BookEntry {
  readonly key: string;
  readonly title: string;
  readonly edition?: string;
  readonly cambridgeNumber?: number;
  readonly packs: readonly IELTSPack[];
}

function bookIdentity(pack: IELTSPack) {
  const importedBookTitle = pack.manifest.importMetadata?.bookTitle?.trim();
  const candidate = importedBookTitle || pack.manifest.title.replace(/\s*[·-]\s*Test\s+\d+.*$/iu, "").trim();
  const match = candidate.match(/Cambridge\s+IELTS\s+(\d+)/iu);
  const title = match ? candidate : pack.manifest.title;
  return {
    key: match
      ? `cambridge-${match[1]}-${/general/iu.test(candidate) ? "general" : "academic"}`
      : `pack-${pack.manifest.id}`,
    title,
    cambridgeNumber: match ? Number(match[1]) : undefined,
  };
}

export function groupLibraryBooks(packs: readonly IELTSPack[]): BookEntry[] {
  const groups = new Map<string, { title: string; edition?: string; cambridgeNumber?: number; packs: IELTSPack[] }>();
  packs.forEach((pack) => {
    const identity = bookIdentity(pack);
    const existing = groups.get(identity.key);
    if (existing) existing.packs.push(pack);
    else groups.set(identity.key, {
      title: identity.title,
      ...(pack.manifest.edition ? { edition: pack.manifest.edition } : {}),
      ...(identity.cambridgeNumber ? { cambridgeNumber: identity.cambridgeNumber } : {}),
      packs: [pack],
    });
  });
  return [...groups.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((left, right) => {
      if (left.cambridgeNumber && right.cambridgeNumber) return right.cambridgeNumber - left.cambridgeNumber;
      if (left.cambridgeNumber) return -1;
      if (right.cambridgeNumber) return 1;
      return left.title.localeCompare(right.title);
    });
}
