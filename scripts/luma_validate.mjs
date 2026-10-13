import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';

const root = path.resolve('delivery/luma-20260919-01');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { IELTSPackSchema } = await server.ssrLoadModule('/src/domain/pack/schemas.ts');
  const { scoreQuestion } = await server.ssrLoadModule('/src/domain/questionScoring.ts');
  const reports = [];
  for (const id of await fs.readdir(path.join(root, 'private/Importable'))) {
    const folder = path.join(root, 'private/Importable', id);
    const manifest = JSON.parse(await fs.readFile(path.join(folder, 'manifest.json'), 'utf8'));
    const modules = await Promise.all(manifest.modules.map(async (type) => JSON.parse(await fs.readFile(path.join(folder, `modules/${type}.json`), 'utf8'))));
    const result = IELTSPackSchema.safeParse({ manifest, modules });
    if (!result.success) {
      const issues = result.error.issues.map(({ path, message }) => ({ path, message }));
      console.log(JSON.stringify({ id, issues }));
      throw new Error(`Schema failed: ${id}`);
    }
    const pack = result.data;
    for (const asset of pack.manifest.mediaAssets) {
      const bytes = await fs.readFile(path.join(folder, asset.relativePath));
      if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Asset mismatch: ${asset.id}`);
    }
    for (const module of pack.modules.filter((m) => m.type !== 'writing')) {
      const questions = module.sections.flatMap((s) => s.questionGroups.flatMap((g) => g.questions));
      let correctPoints = 0;
      for (const q of questions) {
        const answer = q.correctOptionIds ?? q.correctOptionId ?? q.correctAnswer ?? q.acceptableAnswers?.[0];
        const score = scoreQuestion(q, answer);
        if (score.status !== 'correct') throw new Error(`Source key fails scoring: ${q.id}`);
        correctPoints += score.earnedPoints;
      }
      if (correctPoints !== 40) throw new Error(`Not a full 40-point module: ${id}/${module.type}`);
      reports.push({ packId: id, module: module.type, questionObjects: questions.length, scoringUnits: correctPoints, sourceKeysScoreCorrectly: true, resourcesSha256Verified: true });
    }
  }
  await fs.writeFile(path.join(root, 'PACK_VALIDATION.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports));
} finally { await server.close(); }
