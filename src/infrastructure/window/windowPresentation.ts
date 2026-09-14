import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export async function toggleWindowFullscreen(): Promise<void> {
  if (isTauri()) {
    const window = getCurrentWindow();
    await window.setFullscreen(!await window.isFullscreen());
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
}
