export interface WritingCloseRequest {
  preventDefault: () => void;
}

export type WritingCloseOutcome = "saved" | "discarded" | "cancelled";

export interface WritingCloseDependencies {
  flushDraft: () => Promise<void>;
  closeWindow: () => Promise<void>;
  confirmDiscard: (message: string) => Promise<boolean>;
  onSaveError: (error: unknown) => void;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

export async function handleWritingCloseRequest(
  event: WritingCloseRequest,
  dependencies: WritingCloseDependencies,
): Promise<WritingCloseOutcome> {
  event.preventDefault();
  try {
    await dependencies.flushDraft();
  } catch (error) {
    dependencies.onSaveError(error);
    if (!await dependencies.confirmDiscard(errorMessage(error))) return "cancelled";
    await dependencies.closeWindow();
    return "discarded";
  }
  await dependencies.closeWindow();
  return "saved";
}
