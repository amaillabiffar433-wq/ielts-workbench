import {
  AnnotationStyleSchema,
  RelativePackPathSchema,
  StableIdSchema,
  TextAnchorSchema,
  cloneJson,
  deepFreeze,
  parseIeltsPack,
  type IELTSPack,
} from "../../domain";
import {
  ORIGINAL_DEMO_AUDIO_PATH,
  ORIGINAL_DEMO_PACK_FOLDER,
  createOriginalDemoSilentWav,
  originalDemoPack,
} from "../demo";
import type {
  AnnotationRecord,
  AnswerRecord,
  BootstrapState,
  CreateSessionInput,
  CreateWritingVersionInput,
  InstalledPackSummary,
  LearningRepository,
  PackValidationReport,
  PracticeSessionSummary,
  SaveAnnotationInput,
  SaveAnswerInput,
  SaveWritingDraftInput,
  SessionSnapshot,
  WorkspaceSummary,
  WritingDraft,
  WritingVersion,
} from "./LearningRepository";
import {
  BootstrapStateSchema,
  CreateSessionInputSchema,
  CreateWritingVersionInputSchema,
  SaveAnnotationInputSchema,
  SaveAnswerInputSchema,
  SaveWritingDraftInputSchema,
  deriveRecentSessionId,
  sortRecentSessionSummaries,
} from "./LearningRepository";

export interface InMemoryLearningRepositoryOptions {
  readonly workspace?: WorkspaceSummary | null;
  readonly packs?: readonly IELTSPack[];
  readonly packInstalledAt?: Readonly<Record<string, string>>;
  readonly sessions?: readonly SessionSnapshot[];
  readonly settings?: Readonly<Record<string, string>>;
  readonly drafts?: readonly WritingDraft[];
  readonly writingVersions?: readonly WritingVersion[];
  readonly packFolders?: Readonly<Record<string, IELTSPack>>;
  readonly media?: Readonly<Record<string, Uint8Array<ArrayBufferLike>>>;
  readonly now?: () => Date;
  readonly idFactory?: () => string;
  readonly stateStore?: InMemoryRepositoryStateStore;
}

export interface InMemoryRepositorySnapshot {
  readonly packs: readonly IELTSPack[];
  readonly packInstalledAt: Readonly<Record<string, string>>;
  readonly sessions: readonly SessionSnapshot[];
  readonly settings: Readonly<Record<string, string>>;
  readonly drafts: readonly WritingDraft[];
  readonly writingVersions: readonly WritingVersion[];
}

export interface InMemoryRepositoryStateStore {
  load(): Promise<InMemoryRepositorySnapshot | null>;
  save(snapshot: InMemoryRepositorySnapshot): Promise<void>;
}

function normalizeFolderKey(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLocaleLowerCase();
}

function mediaKey(packId: string, relativePath: string): string {
  return `${packId}\u0000${relativePath}`;
}

function wordCount(content: string): number {
  const trimmed = content.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/u).length;
}

function toPackSummary(pack: IELTSPack, installedAt = pack.manifest.createdAt): InstalledPackSummary {
  return {
    id: pack.manifest.id,
    title: pack.manifest.title,
    sourceLabel: pack.manifest.sourceLabel,
    ...(pack.manifest.edition === undefined ? {} : { edition: pack.manifest.edition }),
    language: pack.manifest.language,
    modules: [...pack.manifest.modules],
    installedAt,
    ...(pack.manifest.attribution === undefined ? {} : { attribution: pack.manifest.attribution }),
  };
}

function toSessionSummary(session: SessionSnapshot): PracticeSessionSummary {
  const startedAt = session.startedAt ?? session.updatedAt ?? "1970-01-01T00:00:00.000Z";
  const updatedAt = session.updatedAt ?? startedAt;
  return {
    sessionId: session.sessionId,
    ...(session.packId === undefined ? {} : { packId: session.packId }),
    ...(session.testId === undefined ? {} : { testId: session.testId }),
    ...(session.moduleType === undefined ? {} : { moduleType: session.moduleType }),
    mode: session.mode,
    status: session.status,
    startedAt,
    updatedAt,
    ...(session.submittedAt === undefined ? {} : { submittedAt: session.submittedAt }),
    elapsedSeconds: 0,
  };
}

function defaultIdFactory(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Browser/test adapter with the same behavioral contract as the Tauri adapter.
 * Pack objects are parsed and frozen in a dedicated map; user state is copied
 * into independent maps and never written back into a pack.
 */
export class InMemoryLearningRepository implements LearningRepository {
  private workspace: WorkspaceSummary | null;
  private readonly packs = new Map<string, IELTSPack>();
  private readonly packInstalledAt = new Map<string, string>();
  private readonly sessions = new Map<string, SessionSnapshot>();
  private readonly settings = new Map<string, string>();
  private readonly drafts = new Map<string, WritingDraft>();
  private readonly writingVersions = new Map<string, WritingVersion[]>();
  private readonly packFolders = new Map<string, IELTSPack>();
  private readonly media = new Map<string, Uint8Array<ArrayBuffer>>();
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly stateStore?: InMemoryRepositoryStateStore;
  private hydrationPromise: Promise<void> | null = null;

  constructor(options: InMemoryLearningRepositoryOptions = {}) {
    this.workspace = options.workspace === undefined ? null : cloneJson(options.workspace);
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.stateStore = options.stateStore;

    for (const packInput of options.packs ?? []) {
      const pack = parseIeltsPack(cloneJson(packInput));
      this.packs.set(pack.manifest.id, pack);
      this.packInstalledAt.set(
        pack.manifest.id,
        options.packInstalledAt?.[pack.manifest.id] ?? pack.manifest.createdAt,
      );
    }
    for (const session of options.sessions ?? []) {
      this.sessions.set(session.sessionId, deepFreeze(cloneJson(session)));
    }
    for (const [key, value] of Object.entries(options.settings ?? {})) {
      this.settings.set(key, value);
    }
    for (const draft of options.drafts ?? []) {
      this.drafts.set(`${draft.sessionId}\u0000${draft.taskId}`, deepFreeze(cloneJson(draft)));
    }
    for (const version of options.writingVersions ?? []) {
      const key = `${version.sessionId}\u0000${version.taskId}`;
      this.writingVersions.set(key, [
        ...(this.writingVersions.get(key) ?? []),
        deepFreeze(cloneJson(version)),
      ]);
    }
    for (const [folder, packInput] of Object.entries(options.packFolders ?? {})) {
      this.packFolders.set(normalizeFolderKey(folder), parseIeltsPack(cloneJson(packInput)));
    }
    for (const [key, bytes] of Object.entries(options.media ?? {})) {
      this.media.set(key, new Uint8Array(bytes));
    }
  }

  private async ensureHydrated(): Promise<void> {
    if (!this.stateStore) return;
    this.hydrationPromise ??= (async () => {
      const snapshot = await this.stateStore!.load();
      if (!snapshot) return;
      for (const packInput of snapshot.packs) {
        const pack = parseIeltsPack(cloneJson(packInput));
        this.packs.set(pack.manifest.id, pack);
        this.packInstalledAt.set(
          pack.manifest.id,
          snapshot.packInstalledAt[pack.manifest.id] ?? pack.manifest.createdAt,
        );
      }
      for (const session of snapshot.sessions) {
        this.sessions.set(session.sessionId, deepFreeze(cloneJson(session)));
      }
      for (const [key, value] of Object.entries(snapshot.settings)) {
        this.settings.set(key, value);
      }
      for (const draft of snapshot.drafts) {
        this.drafts.set(`${draft.sessionId}\u0000${draft.taskId}`, deepFreeze(cloneJson(draft)));
      }
      for (const version of snapshot.writingVersions) {
        const key = `${version.sessionId}\u0000${version.taskId}`;
        this.writingVersions.set(key, [
          ...(this.writingVersions.get(key) ?? []),
          deepFreeze(cloneJson(version)),
        ]);
      }
    })();
    await this.hydrationPromise;
  }

  private async persist(): Promise<void> {
    if (this.stateStore) await this.stateStore.save(this.snapshot());
  }

  static withOriginalDemo(options: Omit<InMemoryLearningRepositoryOptions, "packs" | "packFolders" | "media"> = {}) {
    return new InMemoryLearningRepository({
      ...options,
      packs: [originalDemoPack],
      packFolders: { [ORIGINAL_DEMO_PACK_FOLDER]: originalDemoPack },
      media: {
        [mediaKey(originalDemoPack.manifest.id, ORIGINAL_DEMO_AUDIO_PATH)]: createOriginalDemoSilentWav(),
      },
    });
  }

  async getBootstrapState(): Promise<BootstrapState> {
    await this.ensureHydrated();
    const installedPacks = await this.listInstalledPacks();
    const recentSessions = await this.listRecentSessions();
    return BootstrapStateSchema.parse({
      configured: this.workspace !== null,
      available: this.workspace !== null,
      workspace: this.workspace === null ? null : cloneJson(this.workspace),
      error: null,
      installedPacks,
      recentSessions,
      recentSessionId: deriveRecentSessionId(recentSessions),
    });
  }

  async initializeWorkspace(path: string): Promise<BootstrapState> {
    await this.ensureHydrated();
    const normalized = path.trim().replace(/[\\/]+$/, "");
    if (normalized === "") {
      throw new Error("Workspace path cannot be empty");
    }
    const displayName = normalized.split(/[\\/]/).at(-1) ?? normalized;
    const separator = normalized.includes("\\") ? "\\" : "/";
    this.workspace = deepFreeze({
      path: normalized,
      displayName,
      databasePath: `${normalized}${separator}ielts-workbench.sqlite3`,
      initializedAt: this.now().toISOString(),
    });
    await this.persist();
    return this.getBootstrapState();
  }

  async listInstalledPacks(): Promise<InstalledPackSummary[]> {
    return [...this.packs.values()]
      .map((pack) => toPackSummary(pack, this.packInstalledAt.get(pack.manifest.id)))
      .sort((left, right) => left.title.localeCompare(right.title))
      .map((summary) => cloneJson(summary));
  }

  async loadPack(packId: string): Promise<IELTSPack | null> {
    StableIdSchema.parse(packId);
    return this.packs.get(packId) ?? null;
  }

  async validatePackFolder(path: string): Promise<PackValidationReport> {
    const pack = this.packFolders.get(normalizeFolderKey(path));
    if (!pack) {
      return {
        valid: false,
        errors: [
          {
            path,
            code: "PACK_FOLDER_NOT_FOUND",
            message: "No in-memory pack is registered for this folder.",
          },
        ],
        warnings: [],
      };
    }
    return {
      valid: true,
      errors: [],
      warnings: [],
      pack: toPackSummary(pack),
    };
  }

  async installPack(path: string): Promise<InstalledPackSummary> {
    await this.ensureHydrated();
    const pack = this.packFolders.get(normalizeFolderKey(path));
    if (!pack) {
      throw new Error(`Pack folder is not available in memory: ${path}`);
    }
    if (this.packs.has(pack.manifest.id)) {
      throw new Error(`Pack is already installed: ${pack.manifest.id}`);
    }
    const installedAt = this.now().toISOString();
    this.packs.set(pack.manifest.id, pack);
    this.packInstalledAt.set(pack.manifest.id, installedAt);
    await this.persist();
    return cloneJson(toPackSummary(pack, installedAt));
  }

  async installImportedPack(packInput: IELTSPack): Promise<InstalledPackSummary> {
    await this.ensureHydrated();
    const pack = parseIeltsPack(cloneJson(packInput));
    if (this.packs.has(pack.manifest.id)) {
      throw new Error(`Pack is already installed: ${pack.manifest.id}`);
    }
    const installedAt = this.now().toISOString();
    this.packs.set(pack.manifest.id, pack);
    this.packInstalledAt.set(pack.manifest.id, installedAt);
    await this.persist();
    return cloneJson(toPackSummary(pack, installedAt));
  }

  async readPackMedia(packId: string, relativePath: string): Promise<Uint8Array<ArrayBuffer>> {
    const validatedPackId = StableIdSchema.parse(packId);
    const validatedRelativePath = RelativePackPathSchema.parse(relativePath);
    if (!this.packs.has(validatedPackId)) {
      throw new Error(`Pack is not installed: ${validatedPackId}`);
    }
    const bytes = this.media.get(mediaKey(validatedPackId, validatedRelativePath));
    if (!bytes) {
      throw new Error(`Pack media is not registered: ${validatedRelativePath}`);
    }
    return new Uint8Array(bytes);
  }

  async createSession(input: CreateSessionInput): Promise<SessionSnapshot> {
    await this.ensureHydrated();
    const validated = CreateSessionInputSchema.parse(input);
    const pack = this.packs.get(validated.packId);
    if (!pack) {
      throw new Error(`Pack is not installed: ${validated.packId}`);
    }
    const test = pack.manifest.tests.find((candidate) => candidate.id === validated.testId);
    if (!test) {
      throw new Error(`Test does not exist in pack: ${validated.testId}`);
    }
    const hasModule = pack.modules.some(
      (module) => module.testId === validated.testId && module.type === validated.moduleType,
    );
    if (!hasModule) {
      throw new Error(`Test does not contain a ${validated.moduleType} module`);
    }

    const sessionId = validated.sessionId ?? this.idFactory();
    StableIdSchema.parse(sessionId);
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session already exists: ${sessionId}`);
    }
    const timestamp = this.now().toISOString();
    const snapshot: SessionSnapshot = deepFreeze({
      sessionId,
      packId: validated.packId,
      testId: validated.testId,
      moduleType: validated.moduleType,
      mode: validated.mode,
      status: "in-progress",
      startedAt: timestamp,
      updatedAt: timestamp,
      answers: [],
      annotations: [],
    });
    this.sessions.set(sessionId, snapshot);
    await this.persist();
    return deepFreeze(cloneJson(snapshot));
  }

  async listRecentSessions(): Promise<PracticeSessionSummary[]> {
    return sortRecentSessionSummaries(
      [...this.sessions.values()].map(toSessionSummary),
    ).map((summary) => deepFreeze(cloneJson(summary)));
  }

  async loadSession(sessionId: string): Promise<SessionSnapshot | null> {
    const validatedSessionId = StableIdSchema.parse(sessionId);
    const snapshot = this.sessions.get(validatedSessionId);
    return snapshot ? deepFreeze(cloneJson(snapshot)) : null;
  }

  async submitSession(sessionId: string): Promise<SessionSnapshot> {
    const validatedSessionId = StableIdSchema.parse(sessionId);
    const session = this.sessions.get(validatedSessionId);
    if (!session) {
      throw new Error(`Session does not exist: ${validatedSessionId}`);
    }
    if (session.status !== "in-progress") {
      throw new Error(`Only an in-progress session can be submitted: ${validatedSessionId}`);
    }

    const timestamp = this.now().toISOString();
    const submitted: SessionSnapshot = deepFreeze({
      ...session,
      status: "submitted",
      submittedAt: timestamp,
      updatedAt: timestamp,
    });
    this.sessions.set(validatedSessionId, submitted);
    await this.persist();
    return deepFreeze(cloneJson(submitted));
  }

  async saveAnswer(input: SaveAnswerInput): Promise<AnswerRecord> {
    const validated = SaveAnswerInputSchema.parse(input);
    const session = this.sessions.get(validated.sessionId);
    if (!session) {
      throw new Error(`Session does not exist: ${validated.sessionId}`);
    }
    if (session.status !== "in-progress") {
      throw new Error(`Session is immutable after submission: ${validated.sessionId}`);
    }
    const answer: AnswerRecord = deepFreeze({
      id:
        session.answers.find((item) => item.questionId === validated.questionId)?.id ??
        this.idFactory(),
      sessionId: validated.sessionId,
      questionId: validated.questionId,
      value: cloneJson(validated.value),
      updatedAt: this.now().toISOString(),
    });
    const answers = session.answers.filter((item) => item.questionId !== validated.questionId);
    answers.push(answer);
    const nextSession: SessionSnapshot = deepFreeze({
      ...session,
      answers,
      updatedAt: answer.updatedAt,
    });
    this.sessions.set(validated.sessionId, nextSession);
    await this.persist();
    return deepFreeze(cloneJson(answer));
  }

  async saveAnnotation(input: SaveAnnotationInput): Promise<AnnotationRecord> {
    const validated = SaveAnnotationInputSchema.parse(input);
    const session = this.sessions.get(validated.sessionId);
    if (!session) {
      throw new Error(`Session does not exist: ${validated.sessionId}`);
    }
    if (session.status !== "in-progress") {
      throw new Error(`Session is immutable after submission: ${validated.sessionId}`);
    }
    const id = validated.id ?? this.idFactory();
    StableIdSchema.parse(id);
    const anchor = TextAnchorSchema.parse(validated.anchor);
    const style = AnnotationStyleSchema.parse(validated.style);
    const existing = session.annotations.find((annotation) => annotation.id === id);
    const timestamp = this.now().toISOString();
    const annotation: AnnotationRecord = deepFreeze({
      id,
      sessionId: validated.sessionId,
      anchor,
      style,
      ...(validated.note === undefined ? {} : { note: validated.note }),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    });
    const annotations = session.annotations.filter((item) => item.id !== id);
    annotations.push(annotation);
    this.sessions.set(
      validated.sessionId,
      deepFreeze({ ...session, annotations, updatedAt: timestamp }),
    );
    await this.persist();
    return deepFreeze(cloneJson(annotation));
  }

  async deleteAnnotation(annotationId: string): Promise<void> {
    for (const [sessionId, session] of this.sessions) {
      if (!session.annotations.some((annotation) => annotation.id === annotationId)) {
        continue;
      }
      if (session.status !== "in-progress") {
        throw new Error(`Session is immutable after submission: ${sessionId}`);
      }
      this.sessions.set(
        sessionId,
        deepFreeze({
          ...session,
          annotations: session.annotations.filter((annotation) => annotation.id !== annotationId),
          updatedAt: this.now().toISOString(),
        }),
      );
      await this.persist();
      return;
    }
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    if (key.trim() === "") {
      throw new Error("Setting key cannot be empty");
    }
    this.settings.set(key, value);
    await this.persist();
  }

  async loadWritingDraft(sessionId: string, taskId: string): Promise<WritingDraft | null> {
    const draft = this.drafts.get(`${sessionId}\u0000${taskId}`);
    return draft ? deepFreeze(cloneJson(draft)) : null;
  }

  async saveWritingDraft(input: SaveWritingDraftInput): Promise<WritingDraft> {
    const validated = SaveWritingDraftInputSchema.parse(input);
    const session = this.sessions.get(validated.sessionId);
    if (!session) {
      throw new Error(`Session does not exist: ${validated.sessionId}`);
    }
    if (session.status !== "in-progress") {
      throw new Error(`Session is immutable after submission: ${validated.sessionId}`);
    }
    const draft: WritingDraft = deepFreeze({
      sessionId: validated.sessionId,
      taskId: validated.taskId,
      content: validated.content,
      wordCount: wordCount(validated.content),
      updatedAt: this.now().toISOString(),
    });
    this.drafts.set(`${validated.sessionId}\u0000${validated.taskId}`, draft);
    await this.persist();
    return deepFreeze(cloneJson(draft));
  }

  async createWritingVersion(input: CreateWritingVersionInput): Promise<WritingVersion> {
    const validated = CreateWritingVersionInputSchema.parse(input);
    const session = this.sessions.get(validated.sessionId);
    if (!session) {
      throw new Error(`Session does not exist: ${validated.sessionId}`);
    }
    if (session.status !== "in-progress") {
      throw new Error(`Session is immutable after submission: ${validated.sessionId}`);
    }
    const version: WritingVersion = deepFreeze({
      id: this.idFactory(),
      sessionId: validated.sessionId,
      taskId: validated.taskId,
      content: validated.content,
      wordCount: wordCount(validated.content),
      reason: validated.reason,
      createdAt: this.now().toISOString(),
    });
    const key = `${validated.sessionId}\u0000${validated.taskId}`;
    this.writingVersions.set(key, [...(this.writingVersions.get(key) ?? []), version]);
    await this.persist();
    return deepFreeze(cloneJson(version));
  }

  async listWritingVersions(sessionId: string, taskId: string): Promise<WritingVersion[]> {
    return (this.writingVersions.get(`${sessionId}\u0000${taskId}`) ?? [])
      .map((version) => cloneJson(version))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  snapshot(): InMemoryRepositorySnapshot {
    return deepFreeze({
      packs: [...this.packs.values()].map((pack) => cloneJson(pack)),
      packInstalledAt: Object.fromEntries(this.packInstalledAt),
      sessions: [...this.sessions.values()].map((session) => cloneJson(session)),
      settings: Object.fromEntries(this.settings),
      drafts: [...this.drafts.values()].map((draft) => cloneJson(draft)),
      writingVersions: [...this.writingVersions.values()].flat().map((version) => cloneJson(version)),
    });
  }
}

export { mediaKey as createInMemoryMediaKey };
