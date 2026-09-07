import manifest from "../../../samples/original-multi-passage-pack/manifest.json";
import reading from "../../../samples/original-multi-passage-pack/modules/reading.json";
import { parseIeltsPack } from "../../domain";

export const ORIGINAL_MULTI_PASSAGE_PACK_FOLDER = "samples/original-multi-passage-pack";

export const originalMultiPassagePack = parseIeltsPack({
  manifest,
  modules: [reading],
});
