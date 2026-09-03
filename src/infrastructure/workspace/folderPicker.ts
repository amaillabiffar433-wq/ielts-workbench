import { isTauri } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export function desktopRuntimeAvailable(): boolean {
  return isTauri();
}

export async function pickWorkspaceDirectory(): Promise<string | null> {
  if (!isTauri()) {
    return "D:\\IELTS-Workbench-Demo";
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 IELTS Workbench 学习工作区",
  });
  return typeof selected === "string" ? selected : null;
}

export async function pickPackDirectory(): Promise<string | null> {
  if (!isTauri()) {
    return null;
  }
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择 IELTSPack v1 文件夹",
  });
  return typeof selected === "string" ? selected : null;
}
