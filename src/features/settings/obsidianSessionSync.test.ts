import { describe, expect, it, vi } from "vitest";
import { originalDemoPack } from "../../infrastructure/demo";
import { InMemoryLearningRepository } from "../../infrastructure/repositories/InMemoryLearningRepository";
import { localIsoDate } from "./obsidianDailyBrief";
import { queueCompletedSessionSync, syncObsidianSessions } from "./obsidianSessionSync";

describe("completed practice sync", () => {
  it("keeps failed exports queued, retries the same date, and includes source scores", async () => {
    const repository=InMemoryLearningRepository.withOriginalDemo();
    await repository.setSetting("integration.obsidianVault","D:\\isolated-test-vault");
    const session=await repository.createSession({packId:originalDemoPack.manifest.id,testId:originalDemoPack.manifest.tests[0].id,moduleType:"reading",mode:"study"});
    await repository.saveAnswer({sessionId:session.sessionId,questionId:"demo-reading-q01",value:"true"});
    await repository.submitSession(session.sessionId);
    const exportNote=vi.spyOn(repository,"exportObsidianDailyBrief").mockRejectedValueOnce(new Error("read only vault"));
    const day=localIsoDate();
    await queueCompletedSessionSync(repository,day);
    expect(JSON.parse(await repository.getSetting("integration.obsidianPendingDates") ?? "[]")).toEqual([day]);
    expect((await repository.loadSession(session.sessionId))?.status).toBe("submitted");
    await syncObsidianSessions(repository);
    expect(await repository.getSetting("integration.obsidianPendingDates")).toBe("[]");
    const content=exportNote.mock.calls.at(-1)?.[2] ?? "";
    expect(content).toContain(session.sessionId);
    expect(content).toContain("Raw score: 1/6");
    expect(content).toContain("Q2:");
    await syncObsidianSessions(repository,day);
    expect(exportNote.mock.calls.at(-1)?.[2]).toBe(content);
  });
});
