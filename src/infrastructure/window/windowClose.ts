import { isTauri } from "@tauri-apps/api/core";
import { confirm } from "@tauri-apps/plugin-dialog";
import { getCurrentWindow, type CloseRequestedEvent } from "@tauri-apps/api/window";

export type CloseRequestListener = (event: CloseRequestedEvent) => void;
export type UnlistenCloseRequest = () => void;

export async function listenForCloseRequested(
  listener: CloseRequestListener,
): Promise<UnlistenCloseRequest> {
  if (!isTauri()) return () => undefined;
  return getCurrentWindow().onCloseRequested(listener);
}

export async function closeCurrentWindow(): Promise<void> {
  // The close-requested listener has already prevented the original close so
  // the draft can be flushed. Calling close() here would emit another
  // close-requested event and recurse indefinitely; destroy() completes the
  // already-approved close without firing that event again.
  await getCurrentWindow().destroy();
}

export async function confirmAction(message: string): Promise<boolean> {
  if (!isTauri()) return window.confirm(message);
  return confirm(message, { title: "IELTS Workbench", kind: "warning" });
}

export async function confirmDiscardAfterSaveFailure(message: string): Promise<boolean> {
  return confirmAction(
    `最后的作文内容保存失败：${message}\n\n是否放弃这次未保存的修改并退出？`,
  );
}
