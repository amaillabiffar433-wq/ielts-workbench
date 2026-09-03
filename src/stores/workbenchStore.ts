import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { IELTSPack } from "../domain";
import type {
  AnnotationRecord,
  AnswerRecord,
  AnswerValue,
  BootstrapState,
  CreateSessionInput,
  InstalledPackSummary,
  LearningRepository,
  PackValidationReport,
  SaveAnnotationInput,
  SessionSnapshot,
} from "../infrastructure/repositories/LearningRepository";
import { createLearningRepository } from "../infrastructure/repositories/runtime";
import type { SaveState } from "../components/common/SaveStatus";

export type BootstrapPhase = "idle" | "loading" | "ready" | "error";

export type WorkbenchState = {
  repository: LearningRepository;
  bootstrapPhase: BootstrapPhase;
  bootstrap: BootstrapState | null;
  installedPacks: readonly InstalledPackSummary[];
  activePack: IELTSPack | null;
  session: SessionSnapshot | null;
  answers: Readonly<Record<string, AnswerRecord>>;
  annotations: readonly AnnotationRecord[];
  saveState: SaveState;
  error: string | null;
  initialize: () => Promise<void>;
  initializeWorkspace: (path: string) => Promise<void>;
  refreshPacks: () => Promise<void>;
  loadPack: (packId: string) => Promise<IELTSPack | null>;
  ensureSession: (input: CreateSessionInput) => Promise<SessionSnapshot>;
  submitSession: (sessionId: string) => Promise<SessionSnapshot>;
  answerQuestion: (sessionId: string, questionId: string, value: AnswerValue) => Promise<void>;
  addAnnotation: (input: SaveAnnotationInput) => Promise<void>;
  removeAnnotation: (annotationId: string) => Promise<void>;
  loadSetting: (key: string) => Promise<string | null>;
  saveSetting: (key: string, value: string) => Promise<void>;
  validatePack: (path: string) => Promise<PackValidationReport>;
  installPack: (path: string) => Promise<InstalledPackSummary>;
  readPackMedia: (packId: string, relativePath: string) => Promise<Uint8Array<ArrayBuffer>>;
  clearError: () => void;
};

export function answerKey(sessionId: string, questionId: string): string {
  return `${sessionId}:${questionId}`;
}

function answersByKey(answers: readonly AnswerRecord[]): Record<string, AnswerRecord> {
  return Object.fromEntries(answers.map((answer) => [answerKey(answer.sessionId, answer.questionId), answer]));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createWorkbenchStore(repository: LearningRepository): StoreApi<WorkbenchState> {
  const answerSaveQueues = new Map<string, Promise<AnswerRecord>>();
  const answerRevisions = new Map<string, number>();
  const sessionLoadPromises = new Map<string, Promise<SessionSnapshot>>();
  let activePackLoadRevision = 0;
  let activeSessionLoadRevision = 0;

  return createStore<WorkbenchState>((set, get) => ({
    repository,
    bootstrapPhase: "idle",
    bootstrap: null,
    installedPacks: [],
    activePack: null,
    session: null,
    answers: {},
    annotations: [],
    saveState: "idle",
    error: null,

    initialize: async () => {
      if (get().bootstrapPhase === "loading") return;
      set({ bootstrapPhase: "loading", error: null });
      try {
        const bootstrap = await repository.getBootstrapState();
        set({
          bootstrap,
          installedPacks: bootstrap.installedPacks,
          bootstrapPhase: "ready",
        });
        const firstPack = bootstrap.installedPacks[0];
        if (firstPack) {
          const revision = activePackLoadRevision + 1;
          activePackLoadRevision = revision;
          const pack = await repository.loadPack(firstPack.id);
          if (activePackLoadRevision === revision) set({ activePack: pack });
        } else {
          activePackLoadRevision += 1;
          set({ activePack: null });
        }
      } catch (error) {
        set({ bootstrapPhase: "error", error: errorMessage(error) });
      }
    },

    initializeWorkspace: async (path) => {
      set({ bootstrapPhase: "loading", error: null });
      try {
        const bootstrap = await repository.initializeWorkspace(path);
        const firstPack = bootstrap.installedPacks[0];
        const revision = activePackLoadRevision + 1;
        activePackLoadRevision = revision;
        const activePack = firstPack ? await repository.loadPack(firstPack.id) : null;
        set({
          bootstrap,
          installedPacks: bootstrap.installedPacks,
          ...(activePackLoadRevision === revision ? { activePack } : {}),
          bootstrapPhase: "ready",
        });
      } catch (error) {
        set({ bootstrapPhase: "error", error: errorMessage(error) });
        throw error;
      }
    },

    refreshPacks: async () => {
      try {
        const installedPacks = await repository.listInstalledPacks();
        set({ installedPacks });
      } catch (error) {
        set({ error: errorMessage(error) });
      }
    },

    loadPack: async (packId) => {
      const revision = activePackLoadRevision + 1;
      activePackLoadRevision = revision;
      try {
        const activePack = await repository.loadPack(packId);
        if (activePackLoadRevision === revision) set({ activePack });
        return activePack;
      } catch (error) {
        if (activePackLoadRevision === revision) set({ error: errorMessage(error) });
        return null;
      }
    },

    ensureSession: async (input) => {
      const revision = activeSessionLoadRevision + 1;
      activeSessionLoadRevision = revision;
      const settingKey = `activeSession.${input.packId}.${input.testId}.${input.moduleType}.${input.mode}`;
      const legacySettingKey = `activeSession.${input.packId}.${input.moduleType}.${input.mode}`;
      const loadPromise = sessionLoadPromises.get(settingKey) ?? (() => {
        const createdPromise: Promise<SessionSnapshot> = (async () => {
          const currentId = await repository.getSetting(settingKey);
          const legacyId = currentId ? null : await repository.getSetting(legacySettingKey);
          const existingId = currentId ?? legacyId;
          const session = existingId ? await repository.loadSession(existingId) : null;
          if (session
            && session.packId === input.packId
            && session.testId === input.testId
            && session.moduleType === input.moduleType
            && session.mode === input.mode
            && session.status === "in-progress") {
            if (!currentId) await repository.setSetting(settingKey, session.sessionId);
            return session;
          }
          const createdSession = await repository.createSession(input);
          await repository.setSetting(settingKey, createdSession.sessionId);
          return createdSession;
        })();
        sessionLoadPromises.set(settingKey, createdPromise);
        void createdPromise.then(
          () => { if (sessionLoadPromises.get(settingKey) === createdPromise) sessionLoadPromises.delete(settingKey); },
          () => { if (sessionLoadPromises.get(settingKey) === createdPromise) sessionLoadPromises.delete(settingKey); },
        );
        return createdPromise;
      })();
      try {
        const session = await loadPromise;
        if (activeSessionLoadRevision === revision) {
          set({
            session,
            answers: answersByKey(session.answers),
            annotations: session.annotations,
            saveState: "idle",
            error: null,
          });
        }
        return session;
      } catch (error) {
        if (activeSessionLoadRevision === revision) set({ error: errorMessage(error) });
        throw error;
      }
    },

    submitSession: async (sessionId) => {
      if (get().session?.sessionId === sessionId) set({ saveState: "saving", error: null });
      try {
        await Promise.all([...answerSaveQueues.values()]);
        const session = await repository.submitSession(sessionId);
        if (get().session?.sessionId === sessionId) {
          set({
            session,
            answers: answersByKey(session.answers),
            annotations: session.annotations,
            saveState: "saved",
          });
        }
        return session;
      } catch (error) {
        if (get().session?.sessionId === sessionId) {
          set({ saveState: "error", error: errorMessage(error) });
        }
        throw error;
      }
    },

    answerQuestion: async (sessionId, questionId, value) => {
      const key = answerKey(sessionId, questionId);
      const previous = get().answers[key];
      const revision = (answerRevisions.get(key) ?? 0) + 1;
      answerRevisions.set(key, revision);
      const optimistic: AnswerRecord = {
        id: previous?.id ?? `answer:${sessionId}:${questionId}`,
        sessionId,
        questionId,
        value,
        updatedAt: new Date().toISOString(),
      };
      set((state) => ({ answers: { ...state.answers, [key]: optimistic }, saveState: "saving", error: null }));
      const earlierSave = answerSaveQueues.get(key);
      const waitForEarlierSave = earlierSave
        ? earlierSave.then(() => undefined, () => undefined)
        : Promise.resolve();
      const savePromise = waitForEarlierSave.then(() =>
        repository.saveAnswer({ sessionId, questionId, value }),
      );
      answerSaveQueues.set(key, savePromise);
      try {
        const saved = await savePromise;
        if (answerRevisions.get(key) === revision) {
          set((state) => ({ answers: { ...state.answers, [key]: saved }, saveState: "saved" }));
        }
      } catch (error) {
        if (answerRevisions.get(key) === revision) {
          set((state) => {
            const answers = { ...state.answers };
            if (previous) answers[key] = previous;
            else delete answers[key];
            return { answers, saveState: "error", error: errorMessage(error) };
          });
        }
      } finally {
        if (answerSaveQueues.get(key) === savePromise) {
          answerSaveQueues.delete(key);
        }
      }
    },

    addAnnotation: async (input) => {
      const optimisticId = input.id ?? `annotation:${crypto.randomUUID()}`;
      const timestamp = new Date().toISOString();
      const optimistic: AnnotationRecord = {
        ...input,
        id: optimisticId,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      set((state) => ({ annotations: [...state.annotations, optimistic], saveState: "saving", error: null }));
      try {
        const saved = await repository.saveAnnotation({ ...input, id: optimisticId });
        set((state) => ({
          annotations: state.annotations.map((annotation) => annotation.id === optimisticId ? saved : annotation),
          saveState: "saved",
        }));
      } catch (error) {
        set((state) => ({
          annotations: state.annotations.filter((annotation) => annotation.id !== optimisticId),
          saveState: "error",
          error: errorMessage(error),
        }));
      }
    },

    removeAnnotation: async (annotationId) => {
      const previous = get().annotations;
      set({ annotations: previous.filter((annotation) => annotation.id !== annotationId), saveState: "saving" });
      try {
        await repository.deleteAnnotation(annotationId);
        set({ saveState: "saved" });
      } catch (error) {
        set({ annotations: previous, saveState: "error", error: errorMessage(error) });
      }
    },

    loadSetting: (key) => repository.getSetting(key),

    saveSetting: async (key, value) => {
      try {
        await repository.setSetting(key, value);
      } catch (error) {
        set({ error: errorMessage(error) });
        throw error;
      }
    },

    validatePack: (path) => repository.validatePackFolder(path),

    installPack: async (path) => {
      try {
        const installed = await repository.installPack(path);
        const installedPacks = await repository.listInstalledPacks();
        set({ installedPacks });
        return installed;
      } catch (error) {
        set({ error: errorMessage(error) });
        throw error;
      }
    },

    readPackMedia: (packId, relativePath) => repository.readPackMedia(packId, relativePath),

    clearError: () => set({ error: null }),
  }));
}

const workbenchStore = createWorkbenchStore(createLearningRepository());

export function useWorkbenchStore<T>(selector: (state: WorkbenchState) => T): T {
  return useStore(workbenchStore, selector);
}

export { workbenchStore };
