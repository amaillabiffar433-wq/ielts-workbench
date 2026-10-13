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
    title: "选择 Luma 学习工作区",
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

export async function pickBackupDestinationDirectory(): Promise<string | null> {
  if (!isTauri()) return "D:\\IELTS-Workbench-Backups";
  const selected = await open({ directory: true, multiple: false, title: "选择备份导出位置（将新建独立备份文件夹）" });
  return typeof selected === "string" ? selected : null;
}

export async function pickWorkspaceBackupDirectory(): Promise<string | null> {
  if (!isTauri()) return "D:\\IELTS-Workbench-Backups\\ielts-workbench-backup-memory";
  const selected = await open({ directory: true, multiple: false, title: "选择包含 backup-manifest.json 的备份文件夹" });
  return typeof selected === "string" ? selected : null;
}

export async function pickRestoreDestinationDirectory(): Promise<string | null> {
  if (!isTauri()) return "D:\\IELTS-Workbench-Restores";
  const selected = await open({ directory: true, multiple: false, title: "选择恢复目标父目录（将新建独立工作区）" });
  return typeof selected === "string" ? selected : null;
}

export async function pickObsidianVaultDirectory(): Promise<string | null> {
  if (!isTauri()) return null;
  const selected = await open({ directory: true, multiple: false, title: "Choose your Obsidian vault" });
  return typeof selected === "string" ? selected : null;
}
