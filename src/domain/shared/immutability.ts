export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

/**
 * Recursively freezes JSON-shaped domain data at runtime. Source packs are
 * intentionally immutable; user state lives behind repository methods.
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value as DeepReadonly<T>;
  }

  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return Object.freeze(value) as DeepReadonly<T>;
}

/** Creates a detached copy suitable for crossing a repository boundary. */
export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}
