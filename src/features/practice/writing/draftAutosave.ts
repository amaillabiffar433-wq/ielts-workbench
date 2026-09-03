export type AutosaveController = { cancel: () => void };

export function scheduleDraftAutosave(
  save: () => void | Promise<void>,
  delayMs = 1000,
): AutosaveController {
  const timer = window.setTimeout(() => void save(), delayMs);
  return { cancel: () => window.clearTimeout(timer) };
}

export function countWords(content: string): number {
  return content.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
