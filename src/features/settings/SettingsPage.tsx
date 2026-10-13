import { useEffect, useState } from "react";
import { Bot, Database, FileOutput, FolderOpen, HardDriveDownload, MonitorCog, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/common/PageHeader";
import { SegmentedControl } from "../../components/common/SegmentedControl";
import { pickBackupDestinationDirectory, pickObsidianVaultDirectory, pickRestoreDestinationDirectory, pickWorkspaceBackupDirectory, pickWorkspaceDirectory } from "../../infrastructure/workspace/folderPicker";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { confirmAction } from "../../infrastructure/window/windowClose";
import { useLearningAnalytics } from "../progress/useLearningAnalytics";
import { localIsoDate } from "./obsidianDailyBrief";
import { syncObsidianSessions } from "./obsidianSessionSync";
import "./SettingsPage.css";

type Theme = "light" | "dark" | "system";
type ListeningSetting = "waveform" | "skipButtons" | "transcript" | "cloze" | "audioMistakeLinks";

export function SettingsPage() {
  const bootstrap = useWorkbenchStore((state) => state.bootstrap);
  const initializeWorkspace = useWorkbenchStore((state) => state.initializeWorkspace);
  const loadSetting = useWorkbenchStore((state) => state.loadSetting);
  const saveSetting = useWorkbenchStore((state) => state.saveSetting);
  const createWorkspaceBackup = useWorkbenchStore((state) => state.createWorkspaceBackup);
  const restoreWorkspaceBackup = useWorkbenchStore((state) => state.restoreWorkspaceBackup);
  const repository = useWorkbenchStore((state) => state.repository);
  const { loading: analyticsLoading } = useLearningAnalytics();
  const [theme, setTheme] = useState<Theme>("light");
  const [fontSize, setFontSize] = useState(18);
  const [lineHeight, setLineHeight] = useState(1.78);
  const [switching, setSwitching] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [obsidianVault, setObsidianVault] = useState("");
  const [obsidianBusy, setObsidianBusy] = useState(false);
  const [obsidianMessage, setObsidianMessage] = useState<string | null>(null);
  const [listeningSettings, setListeningSettings] = useState<Record<ListeningSetting, boolean>>({ waveform: true, skipButtons: true, transcript: true, cloze: true, audioMistakeLinks: true });

  useEffect(() => {
    void Promise.all([
      loadSetting("appearance.theme"), loadSetting("appearance.readingFontSize"), loadSetting("appearance.readingLineHeight"), loadSetting("integration.obsidianVault"),
      loadSetting("listening.waveform"), loadSetting("listening.skipButtons"), loadSetting("listening.transcript"), loadSetting("listening.cloze"), loadSetting("listening.audioMistakeLinks"),
    ]).then(([savedTheme, savedFontSize, savedLineHeight, savedObsidianVault, waveform, skipButtons, transcript, cloze, audioMistakeLinks]) => {
        const nextTheme = savedTheme === "dark" || savedTheme === "system" ? savedTheme : "light";
        const nextFontSize = Number(savedFontSize) || 18;
        const nextLineHeight = Number(savedLineHeight) || 1.78;
        setTheme(nextTheme);
        setFontSize(nextFontSize);
        setLineHeight(nextLineHeight);
        setObsidianVault(savedObsidianVault ?? "");
        setListeningSettings({ waveform: waveform !== "false", skipButtons: skipButtons !== "false", transcript: transcript !== "false", cloze: cloze !== "false", audioMistakeLinks: audioMistakeLinks !== "false" });
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
  const updateListeningSetting = (key: ListeningSetting, enabled: boolean) => {
    setListeningSettings((current) => ({ ...current, [key]: enabled }));
    void saveSetting(`listening.${key}`, String(enabled));
  };

  return (
    <div className="page settings-page">
      <PageHeader description="Settings store only small preferences; packs, media, and the main SQLite database stay in your explicitly selected learning workspace." title="Settings" />
      <section className="settings-section">
        <header><Database aria-hidden="true" size={19} /><div><h2>Learning workspace</h2><p>Current core data location</p></div></header>
        <div className="workspace-details">
          <div><span>Directory</span><strong>{workspace?.path ?? "Not configured"}</strong></div>
          <div><span>Database</span><strong>{workspace?.databasePath ?? "ielts-workbench.sqlite3 inside the workspace"}</strong></div>
          <div><span>Initialized</span><strong>{workspace?.initializedAt ? new Date(workspace.initializedAt).toLocaleString() : "—"}</strong></div>
          <button
            className="button"
            disabled={switching}
            onClick={async () => {
              if (!(await confirmAction("Changing workspace does not migrate current data. A new directory will be initialized and selected; the current workspace remains unchanged. Continue?"))) return;
              const path = await pickWorkspaceDirectory();
              if (!path) return;
              setSwitching(true);
              try { await initializeWorkspace(path); } finally { setSwitching(false); }
            }}
            type="button"
          ><FolderOpen aria-hidden="true" size={15} /> {switching ? "Switching…" : "Choose another workspace"}</button>
        </div>
      </section>
      <section className="settings-section">
        <header><FileOutput aria-hidden="true" size={19} /><div><h2>Obsidian daily brief</h2><p>Explicit, local export with managed-block backup and SHA-256 verification</p></div></header>
        <div className="workspace-details workspace-details--obsidian">
          <div><span>Vault</span><strong>{obsidianVault || "Not configured"}</strong></div>
          <div><span>Destination</span><strong>{obsidianVault ? `Existing IELTS study folder / ${localIsoDate()}.md; exact path appears after sync` : "Choose your existing study vault"}</strong></div>
          <p className="obsidian-details__boundary">Only the Luma marker block is updated. Existing note text is preserved, and changed files are backed up inside the learning workspace before replacement.</p>
          <div className="pdf-actions">
            <button className="button" disabled={obsidianBusy} onClick={async () => {
              const selected = await pickObsidianVaultDirectory();
              if (!selected) return;
              await saveSetting("integration.obsidianVault", selected);
              setObsidianVault(selected);
              setObsidianMessage("Vault selected. No note was written yet.");
            }} type="button"><FolderOpen aria-hidden="true" size={15} />Choose vault</button>
            <button className="button button--primary" disabled={!obsidianVault || obsidianBusy || analyticsLoading} onClick={async () => {
              setObsidianBusy(true); setObsidianMessage(null);
              try {
                setObsidianMessage(await syncObsidianSessions(repository,localIsoDate()));
              } catch (error) {
                setObsidianMessage(`Export failed without changing the note: ${error instanceof Error ? error.message : String(error)}`);
              } finally { setObsidianBusy(false); }
            }} type="button">{obsidianBusy ? "Syncing…" : "Sync today / retry pending"}</button>
          </div>
          {obsidianMessage && <p aria-live="polite" className="workspace-backup-message">{obsidianMessage}</p>}
        </div>
      </section>
      <section className="settings-section">
        <header><MonitorCog aria-hidden="true" size={19} /><div><h2>Appearance &amp; reading</h2><p>Optimize long-form readability first</p></div></header>
        <div className="settings-grid">
          <div className="setting-row"><div><strong>Theme</strong><span>Light, dark, or system</span></div><SegmentedControl label="Theme" onChange={updateTheme} options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }]} value={theme} /></div>
          <label className="setting-row"><div><strong>Reading size</strong><span>{fontSize}px</span></div><input aria-label="Reading font size" max={21} min={15} onChange={(event) => { const value = Number(event.target.value); setFontSize(value); document.documentElement.style.setProperty("--font-size-reading", `${value}px`); void saveSetting("appearance.readingFontSize", String(value)); }} type="range" value={fontSize} /></label>
          <label className="setting-row"><div><strong>Line height</strong><span>{lineHeight.toFixed(2)}</span></div><input aria-label="Reading line height" max={2.1} min={1.5} onChange={(event) => { const value = Number(event.target.value); setLineHeight(value); document.documentElement.style.setProperty("--line-height-reading", String(value)); void saveSetting("appearance.readingLineHeight", String(value)); }} step={0.05} type="range" value={lineHeight} /></label>
        </div>
      </section>
      <section className="settings-section">
        <header><MonitorCog aria-hidden="true" size={19} /><div><h2>Listening study mode</h2><p>Exam mode ignores these aids and remains locked down</p></div></header>
        <div className="settings-grid">
          {([
            ["waveform", "Show decoded waveform", "Display amplitude detail only in Study mode."],
            ["skipButtons", "Show ±5 second buttons", "Keep short rewind and forward controls beside Play."],
            ["transcript", "Show verified transcript", "Display only transcript cues supplied by the installed pack."],
            ["cloze", "Enable transcript cloze", "Allow pack-authored cloze words to be hidden and revealed."],
            ["audioMistakeLinks", "Save audio mistake links", "Attach the section start time when a Listening mistake enters Review."],
          ] as const).map(([key, label, description]) => <label className="setting-row" key={key}><div><strong>{label}</strong><span>{description}</span></div><input checked={listeningSettings[key]} onChange={(event) => updateListeningSetting(key, event.target.checked)} type="checkbox" /></label>)}
        </div>
      </section>
      <section className="settings-section">
        <header><ShieldCheck aria-hidden="true" size={19} /><div><h2>Annotation semantics</h2><p>Names and notes carry meaning in addition to color</p></div></header>
        <div className="highlight-legend">
          <span><i className="yellow" />Yellow · key information</span><span><i className="green" />Green · evidence</span><span><i className="blue" />Blue · structure</span><span><i className="pink" />Pink · review later</span><span><i className="underline" />Underline · vocabulary/phrase</span>
        </div>
      </section>
      <div className="settings-two-column">
        <section className="settings-section"><header><HardDriveDownload aria-hidden="true" size={19} /><div><h2>Backup &amp; restore</h2><p>Consistent SQLite snapshot + packs/resources + SHA-256 manifest</p></div></header><p>Export creates a separate backup directory. Restore verifies every file before creating and switching to a new workspace. It never overwrites the current database or includes source code, node_modules, or target.</p><div className="pdf-actions"><button className="button" disabled={backupBusy || !workspace} onClick={async () => {
          const destination = await pickBackupDestinationDirectory();
          if (!destination) return;
          setBackupBusy(true); setBackupMessage(null);
          try {
            const result = await createWorkspaceBackup(destination);
            setBackupMessage(`Backup complete: ${result.path} · ${result.fileCount} files · SQLite SHA-256 ${result.databaseSha256}`);
          } catch (error) { setBackupMessage(`Backup failed: ${error instanceof Error ? error.message : String(error)}`); }
          finally { setBackupBusy(false); }
        }} type="button">{backupBusy ? "Working…" : "Export full backup"}</button><button className="button" disabled={backupBusy} onClick={async () => {
          const backupPath = await pickWorkspaceBackupDirectory();
          if (!backupPath) return;
          const destination = await pickRestoreDestinationDirectory();
          if (!destination) return;
          if (!(await confirmAction(`Verify the backup and create a separate workspace under:\n${destination}\nThe current workspace will not be overwritten. Switch after a successful restore?`))) return;
          setBackupBusy(true); setBackupMessage(null);
          try { await restoreWorkspaceBackup(backupPath, destination); setBackupMessage("Restore complete and switched to the new workspace. Verify packs and history in Library." ); }
          catch (error) { setBackupMessage(`Restore failed; the current workspace is unchanged: ${error instanceof Error ? error.message : String(error)}`); }
          finally { setBackupBusy(false); }
        }} type="button">Restore into a new workspace</button></div>{backupMessage && <p aria-live="polite" className="workspace-backup-message">{backupMessage}</p>}</section>
        <section className="settings-section settings-section--placeholder"><header><Bot aria-hidden="true" size={19} /><div><h2>AI Provider</h2><p>Not configured · offline by default</p></div></header><p>Future keys enter only the Rust secure-credential layer, never React, localStorage, logs, or ordinary SQLite fields.</p><button className="button" disabled type="button">Provider not enabled</button></section>
      </div>
    </div>
  );
}
