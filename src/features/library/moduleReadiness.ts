import type { IELTSPack, PackModule } from "../../domain";
import { scoreQuestion } from "../../domain/questionScoring";

export function moduleReadiness(pack: IELTSPack, module: PackModule): string {
  if (pack.manifest.sourceLabel.startsWith("SOURCE REVIEW PENDING")) return "Incomplete · source review pending";
  if (module.type === "writing") return "Self-assessed practice";
  const questions = module.sections.flatMap((section) => section.questionGroups.flatMap((group) => group.questions));
  const numbers = questions.flatMap((q) => [q.number, ...(q.type === "multiple-choice" ? q.additionalNumbers : [])]);
  if (module.type === "listening" && !pack.manifest.mediaAssets.some((a) => a.id === module.audioAssetId && a.type === "audio")) return "Missing audio";
  if (questions.some((q) => scoreQuestion(q, undefined).status === "unscored")) return "Missing answers";
  if (/cambridge/iu.test(pack.manifest.title)) {
    if (numbers.length !== 40 || new Set(numbers).size !== 40 || numbers.some((n) => n < 1 || n > 40)
      || module.sections.length !== (module.type === "reading" ? 3 : 4)) return "Incomplete";
    return "Ready · 40 scored questions";
  }
  return "Original / demo material";
}
