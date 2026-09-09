import { useEffect, useState } from "react";
import { Bot, Database, FolderOpen, HardDriveDownload, MonitorCog, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/common/PageHeader";
import { SegmentedControl } from "../../components/common/SegmentedControl";
import { pickBackupDestinationDirectory, pickRestoreDestinationDirectory, pickWorkspaceBackupDirectory, pickWorkspaceDirectory } from "../../infrastructure/workspace/folderPicker";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import "./SettingsPage.css";

type Theme = "light" | "dark" | "system";

export function SettingsPage() {
  const bootstrap = useWorkbenchStore((state) => state.bootstrap);
  const initializeWorkspace = useWorkbenchStore((state) => state.initializeWorkspace);
  const loadSetting = useWorkbenchStore((state) => state.loadSetting);
  const saveSetting = useWorkbenchStore((state) => state.saveSetting);
  const createWorkspaceBackup = useWorkbenchStore((state) => state.createWorkspaceBackup);
  const restoreWorkspaceBackup = useWorkbenchStore((state) => state.restoreWorkspaceBackup);
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSize] = useState(17);
  const [lineHeight, setLineHeight] = useState(1.78);
  const [switching, setSwitching] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([loadSetting("appearance.theme"), loadSetting("appearance.readingFontSize"), loadSetting("appearance.readingLineHeight")])
      .then(([savedTheme, savedFontSize, savedLineHeight]) => {
        const nextTheme = savedTheme === "dark" || savedTheme === "system" ? savedTheme : "light";
        const nextFontSize = Number(savedFontSize) || 17;
        const nextLineHeight = Number(savedLineHeight) || 1.78;
        setTheme(nextTheme);
        setFontSize(nextFontSize);
        setLineHeight(nextLineHeight);
        document.documentElement.dataset.theme = nextTheme;
        document.documentElement.style.setProperty("--font-size-reading", `${nextFontSize}px`);
        document.documentElement.style.setProperty("--line-height-reading", String(nextLineHeight));
      });
  }, [loadSetting]);

  const updateTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    void saveSetting("appearance.theme", nextTheme);
  };

  const workspace = bootstrap?.workspace;

  return (
    <div className="page settings-page">
      <PageHeader description="设置只保留小型偏好；题包、媒体与主 SQLite 始终位于你明确选择的学习工作区。" title="设置" />
      <section className="settings-section">
        <header><Database aria-hidden="true" size={19} /><div><h2>学习工作区</h2><p>当前核心数据位置</p></div></header>
        <div className="workspace-details">
          <div><span>目录</span><strong>{workspace?.path ?? "未配置"}</strong></div>
          <div><span>数据库</span><strong>{workspace?.databasePath ?? "工作区内的 ielts-workbench.sqlite3"}</strong></div>
          <div><span>初始化时间</span><strong>{workspace?.initializedAt ? new Date(workspace.initializedAt).toLocaleString() : "—"}</strong></div>
          <button
            className="button"
            disabled={switching}
            onClick={async () => {
              if (!window.confirm("更换工作区不会自动迁移当前数据。第一版将初始化并切换到新目录；原工作区保持不变。继续？")) return;
              const path = await pickWorkspaceDirectory();
              if (!path) return;
              setSwitching(true);
              try { await initializeWorkspace(path); } finally { setSwitching(false); }
            }}
            type="button"
          ><FolderOpen aria-hidden="true" size={15} /> {switching ? "正在切换…" : "重新选择工作区"}</button>
        </div>
      </section>
      <section className="settings-section">
        <header><MonitorCog aria-hidden="true" size={19} /><div><h2>外观与阅读</h2><p>优先保证长文可读性</p></div></header>
        <div className="settings-grid">
          <div className="setting-row"><div><strong>主题</strong><span>浅色、深色或跟随系统</span></div><SegmentedControl label="主题" onChange={updateTheme} options={[{ value: "light", label: "浅色" }, { value: "dark", label: "深色" }, { value: "system", label: "系统" }]} value={theme} /></div>
          <label className="setting-row"><div><strong>正文字号</strong><span>{fontSize}px</span></div><input aria-label="阅读正文字号" max={21} min={15} onChange={(event) => { const value = Number(event.target.value); setFontSize(value); document.documentElement.style.setProperty("--font-size-reading", `${value}px`); void saveSetting("appearance.readingFontSize", String(value)); }} type="range" value={fontSize} /></label>
          <label className="setting-row"><div><strong>正文行距</strong><span>{lineHeight.toFixed(2)}</span></div><input aria-label="阅读正文行距" max={2.1} min={1.5} onChange={(event) => { const value = Number(event.target.value); setLineHeight(value); document.documentElement.style.setProperty("--line-height-reading", String(value)); void saveSetting("appearance.readingLineHeight", String(value)); }} step={0.05} type="range" value={lineHeight} /></label>
        </div>
      </section>
      <section className="settings-section">
        <header><ShieldCheck aria-hidden="true" size={19} /><div><h2>标记颜色语义</h2><p>颜色之外同时保留样式名称与备注</p></div></header>
        <div className="highlight-legend">
          <span><i className="yellow" />黄色 · 关键信息</span><span><i className="green" />绿色 · 证据</span><span><i className="blue" />蓝色 · 结构</span><span><i className="pink" />粉色 · 待复盘</span><span><i className="underline" />下划线 · 生词/短语</span>
        </div>
      </section>
      <div className="settings-two-column">
        <section className="settings-section"><header><HardDriveDownload aria-hidden="true" size={19} /><div><h2>数据备份与恢复</h2><p>一致性 SQLite 快照 + 题包/资源 + SHA-256 清单</p></div></header><p>导出会新建独立备份目录；恢复会先校验全部文件，再新建工作区并切换。不会覆盖当前数据库，也不包含源码、node_modules 或 target。</p><div className="pdf-actions"><button className="button" disabled={backupBusy || !workspace} onClick={async () => {
          const destination = await pickBackupDestinationDirectory();
          if (!destination) return;
          setBackupBusy(true); setBackupMessage(null);
          try {
            const result = await createWorkspaceBackup(destination);
            setBackupMessage(`备份完成：${result.path} · ${result.fileCount} 个文件 · SQLite SHA-256 ${result.databaseSha256}`);
          } catch (error) { setBackupMessage(`备份失败：${error instanceof Error ? error.message : String(error)}`); }
          finally { setBackupBusy(false); }
        }} type="button">{backupBusy ? "处理中…" : "导出完整备份"}</button><button className="button" disabled={backupBusy} onClick={async () => {
          const backupPath = await pickWorkspaceBackupDirectory();
          if (!backupPath) return;
          const destination = await pickRestoreDestinationDirectory();
          if (!destination) return;
          if (!window.confirm(`将校验备份并在以下父目录中新建独立工作区：\n${destination}\n当前工作区不会被覆盖。恢复成功后切换到新工作区，继续吗？`)) return;
          setBackupBusy(true); setBackupMessage(null);
          try { await restoreWorkspaceBackup(backupPath, destination); setBackupMessage("恢复完成并已切换到新工作区；请从题库核对题包和历史。" ); }
          catch (error) { setBackupMessage(`恢复失败，当前工作区保持原状：${error instanceof Error ? error.message : String(error)}`); }
          finally { setBackupBusy(false); }
        }} type="button">从备份恢复到新工作区</button></div>{backupMessage && <p aria-live="polite" className="workspace-backup-message">{backupMessage}</p>}</section>
        <section className="settings-section settings-section--placeholder"><header><Bot aria-hidden="true" size={19} /><div><h2>AI Provider</h2><p>未配置 · 默认离线</p></div></header><p>密钥未来只进入 Rust 安全凭据层，不进入 React、localStorage、日志或普通 SQLite 字段。</p><button className="button" disabled type="button">Provider 尚未启用</button></section>
      </div>
    </div>
  );
}
