import { z } from "zod";

import { IELTSPackSchema, IsoUtcDateTimeSchema } from "../../domain";
import {
  SessionSnapshotSchema,
  ReviewItemSchema,
  VocabularyItemSchema,
  WritingDraftSchema,
  WritingVersionSchema,
} from "./LearningRepository";
import type {
  InMemoryRepositorySnapshot,
  InMemoryRepositoryStateStore,
} from "./InMemoryLearningRepository";

const BrowserRepositorySnapshotSchema = z
  .object({
    packs: z.array(IELTSPackSchema),
    packInstalledAt: z.record(z.string(), IsoUtcDateTimeSchema),
    sessions: z.array(SessionSnapshotSchema),
    settings: z.record(z.string(), z.string()),
    drafts: z.array(WritingDraftSchema),
    writingVersions: z.array(WritingVersionSchema),
    vocabularyItems: z.array(VocabularyItemSchema).optional(),
    reviewItems: z.array(ReviewItemSchema).optional(),
  })
  .strict();

const DATABASE_NAME = "ielts-workbench-browser";
const STORE_NAME = "repository-state";
const STATE_KEY = "state-v1";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

export class IndexedDbLearningStateStore implements InMemoryRepositoryStateStore {
  private readonly databasePromise: Promise<IDBDatabase>;

  constructor(indexedDb: IDBFactory) {
    const request = indexedDb.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    this.databasePromise = requestResult(request);
  }

  async load(): Promise<InMemoryRepositorySnapshot | null> {
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_NAME, "readonly");
    const raw = await requestResult(transaction.objectStore(STORE_NAME).get(STATE_KEY));
    await transactionComplete(transaction);
    if (raw === undefined) return null;
    return BrowserRepositorySnapshotSchema.parse(raw) as InMemoryRepositorySnapshot;
  }

  async save(snapshot: InMemoryRepositorySnapshot): Promise<void> {
    const validated = BrowserRepositorySnapshotSchema.parse(snapshot);
    const database = await this.databasePromise;
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(validated, STATE_KEY);
    await transactionComplete(transaction);
  }
}

export function createIndexedDbLearningStateStore(): InMemoryRepositoryStateStore | undefined {
  return typeof indexedDB === "undefined" ? undefined : new IndexedDbLearningStateStore(indexedDB);
}
