import { invoke, isTauri } from "@tauri-apps/api/core";
import { z } from "zod";

const ReferenceSchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/u), title: z.string(), category: z.string(), sourceLabel: z.string(),
  relativePath: z.string(), format: z.string(), size: z.number().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/u), status: z.string(),
}).strict();
export type ReferenceMaterial = z.infer<typeof ReferenceSchema>;
export interface ReferenceLibraryService {
  list(): Promise<ReferenceMaterial[]>;
  open(id: string): Promise<void>;
}
export const referenceLibrary: ReferenceLibraryService = {
  async list() { return isTauri() ? z.array(ReferenceSchema).parse(await invoke("list_reference_materials")) : []; },
  async open(id) {
    z.string().regex(/^[a-f0-9]{64}$/u).parse(id);
    if (!isTauri()) throw new Error("Open reference material from the installed desktop app.");
    await invoke("open_reference_material", { id });
  },
};
