import { useState } from "react";
import { AlertCircle, Database, FolderOpen, HardDrive, Monitor, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { PageHeader } from "../../components/common/PageHeader";
import {
  desktopRuntimeAvailable,
  pickWorkspaceDirectory,
} from "../../infrastructure/workspace/folderPicker";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import "./onboarding.css";

type PickerState = "idle" | "selecting" | "initializing";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const bootstrap = useWorkbenchStore((state) => state.bootstrap);
  const bootstrapPhase = useWorkbenchStore((state) => state.bootstrapPhase);
  const storeError = useWorkbenchStore((state) => state.error);
  const initializeWorkspace = useWorkbenchStore((state) => state.initializeWorkspace);
  const clearError = useWorkbenchStore((state) => state.clearError);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [pickerState, setPickerState] = useState<PickerState>("idle");
  const [localError, setLocalError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const desktop = desktopRuntimeAvailable();
  const workspaceReady = Boolean(bootstrap?.available && bootstrap.workspace);
  const displayedError = localError ?? storeError ?? bootstrap?.error ?? null;
  const busy = pickerState !== "idle" || bootstrapPhase === "loading";

  const chooseDirectory = async () => {
    clearError();
    setLocalError(null);
    setAnnouncement("");
    setPickerState("selecting");
    try {
      const path = await pickWorkspaceDirectory();
      if (path) {
        setSelectedPath(path);
        setAnnouncement(
          desktop
            ? "已选择工作区。初始化时会验证目录可写并创建数据库。"
            : "已准备浏览器演示路径。演示不会写入真实磁盘。",
        );
      } else {
        setAnnouncement("未选择目录，现有数据没有发生变化。");
      }
    } catch (error) {
      setLocalError(`无法打开目录选择器：${errorMessage(error)}`);
    } finally {
      setPickerState("idle");
    }
  };

  const initializeSelectedWorkspace = async () => {
    if (!selectedPath) return;
    clearError();
    setLocalError(null);
    setAnnouncement("");
    setPickerState("initializing");
    try {
      await initializeWorkspace(selectedPath);
      setAnnouncement("工作区已初始化，正在进入题库。");
      navigate("/library", { replace: true });
    } catch (error) {
      setLocalError(
        `无法初始化或写入所选目录。请检查目录权限、磁盘连接和可用空间。${errorMessage(error) ? ` 详情：${errorMessage(error)}` : ""}`,
      );
    } finally {
      setPickerState("idle");
    }
  };

  return (
    <main className="page onboarding-page">
      <PageHeader
        title="设置学习工作区"
        description="IELTS Workbench 把题包、音频、作文和主数据库保存在你明确选择的本地目录。核心练习默认离线。"
      />

      {!desktop && (
        <div className="notice-banner onboarding-browser-notice" role="status">
          <Monitor aria-hidden="true" size={18} />
          <div>
            <strong>当前是浏览器演示模式</strong>
            <span>
              将使用内存 repository 和完全原创的 demo pack；不会访问真实文件夹或 SQLite，刷新页面会恢复演示初始状态。
            </span>
          </div>
        </div>
      )}

      {displayedError && (
        <div className="error-banner" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          <div>
            <strong>工作区尚未就绪</strong>
            <div>{displayedError}</div>
          </div>
        </div>
      )}

      <div className="onboarding-layout">
        <section aria-labelledby="workspace-picker-title" className="workspace-picker-panel">
          <div className="workspace-picker-panel__heading">
            <FolderOpen aria-hidden="true" size={20} />
            <div>
              <h2 id="workspace-picker-title">选择一个可写目录</h2>
              <p>
                推荐使用空间充足、方便备份的位置。应用不会静默把题包和主数据库放进 AppData。
              </p>
            </div>
          </div>

          {workspaceReady && bootstrap?.workspace ? (
            <div className="workspace-current" aria-label="当前工作区">
              <span className="field-label">当前可用工作区</span>
              <strong>{bootstrap.workspace.displayName}</strong>
              <code>{bootstrap.workspace.path}</code>
              <button
                className="button button--primary"
                onClick={() => navigate("/library", { replace: true })}
                type="button"
              >
                继续进入题库
              </button>
            </div>
          ) : (
            <>
              <div className="workspace-selection" aria-live="polite">
                <span className="field-label">准备初始化的位置</span>
                {selectedPath ? (
                  <code>{selectedPath}</code>
                ) : (
                  <span className="workspace-selection__empty">尚未选择目录</span>
                )}
              </div>

              <div className="workspace-picker-actions">
                <button className="button" disabled={busy} onClick={chooseDirectory} type="button">
                  <FolderOpen aria-hidden="true" size={17} />
                  {pickerState === "selecting"
                    ? "正在打开…"
                    : desktop
                      ? "选择工作区目录"
                      : "准备浏览器演示工作区"}
                </button>
                <button
                  className="button button--primary"
                  disabled={!selectedPath || busy}
                  onClick={initializeSelectedWorkspace}
                  type="button"
                >
                  {pickerState === "initializing" ? "正在验证并初始化…" : "验证并初始化"}
                </button>
              </div>
            </>
          )}

          <p aria-live="polite" className="onboarding-announcement">
            {announcement}
          </p>
        </section>

        <aside aria-labelledby="workspace-contents-title" className="workspace-details-panel">
          <h2 id="workspace-contents-title">初始化内容</h2>
          <ul className="workspace-feature-list">
            <li>
              <Database aria-hidden="true" size={18} />
              <div>
                <strong>用户状态数据库</strong>
                <span>答案、标记、Session 和作文版本写入工作区 SQLite。</span>
              </div>
            </li>
            <li>
              <HardDrive aria-hidden="true" size={18} />
              <div>
                <strong>题包与媒体目录</strong>
                <span>创建 packs、imports、themes、backups 和 logs 固定目录。</span>
              </div>
            </li>
            <li>
              <ShieldCheck aria-hidden="true" size={18} />
              <div>
                <strong>受限本地边界</strong>
                <span>Rust 规范化路径并拒绝越过工作区的读写；不会自动上传内容。</span>
              </div>
            </li>
          </ul>
          <p className="workspace-details-panel__footnote">
            原创 demo pack 会用于验证 Reading、Listening 与 Writing，不包含 Cambridge 或其他官方考试内容。
          </p>
        </aside>
      </div>
    </main>
  );
}
