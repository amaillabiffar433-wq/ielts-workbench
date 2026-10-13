import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./AppShell/AppShell";
import { ImportCenterPage } from "../features/import-center/ImportCenterPage";
import { PdfImportPage } from "../features/pdf-import/PdfImportPage";
import { HomePage } from "../features/home/HomePage";
import { LibraryShelfPage } from "../features/library/LibraryShelfPage";
import { ReferenceLibraryPage } from "../features/library/ReferenceLibraryPage";
import { OnboardingPage } from "../features/onboarding/OnboardingPage";
import { ListeningPage } from "../features/practice/listening/ListeningPage";
import { ReadingPage } from "../features/practice/reading/ReadingPage";
import { WritingPage } from "../features/practice/writing/WritingPage";
import { ReviewPage } from "../features/review/ReviewPage";
import { ProgressPage } from "../features/progress/ProgressPage";
import { SettingsPage } from "../features/settings/SettingsPage";
import { VocabularyPage } from "../features/vocabulary/VocabularyPage";
import { SpeakingPage } from "../features/speaking/SpeakingPage";
import { useWorkbenchStore } from "../stores/workbenchStore";

function AppearanceHydrator() {
  const workspace = useWorkbenchStore((state) => state.bootstrap?.workspace);
  const loadSetting = useWorkbenchStore((state) => state.loadSetting);

  useEffect(() => {
    if (!workspace) return;
    void Promise.all([
      loadSetting("appearance.theme"),
      loadSetting("appearance.readingFontSize"),
      loadSetting("appearance.readingLineHeight"),
    ]).then(([theme, fontSize, lineHeight]) => {
      document.documentElement.dataset.theme = theme === "dark" || theme === "system" ? theme : "light";
      if (fontSize && Number.isFinite(Number(fontSize))) document.documentElement.style.setProperty("--font-size-reading", `${Number(fontSize)}px`);
      if (lineHeight && Number.isFinite(Number(lineHeight))) document.documentElement.style.setProperty("--line-height-reading", lineHeight);
    });
  }, [loadSetting, workspace]);

  return null;
}

function WorkspaceGate() {
  const phase = useWorkbenchStore((state) => state.bootstrapPhase);
  const bootstrap = useWorkbenchStore((state) => state.bootstrap);
  const error = useWorkbenchStore((state) => state.error);
  const initialize = useWorkbenchStore((state) => state.initialize);

  if (phase === "idle" || phase === "loading") {
    return <div className="app-loading"><div className="app-loading__panel"><span className="spinner" /><span>Loading the local workspace…</span></div></div>;
  }
  if (phase === "error" && !bootstrap?.workspace) {
    return (
      <div className="app-loading">
        <div className="app-loading__panel">
          <AlertTriangle aria-hidden="true" color="var(--danger)" size={28} />
          <strong>Unable to read workspace state</strong>
          <span>{error ?? "Unknown error"}</span>
          <button className="button" onClick={() => void initialize()} type="button"><RefreshCw aria-hidden="true" size={15} /> Retry</button>
        </div>
      </div>
    );
  }
  if (!bootstrap?.workspace) return <Navigate replace to="/onboarding" />;
  return <AppShell />;
}

function DefaultRoute() {
  const phase = useWorkbenchStore((state) => state.bootstrapPhase);
  const workspace = useWorkbenchStore((state) => state.bootstrap?.workspace);
  if (phase === "idle" || phase === "loading") return <div className="app-loading"><span className="spinner" /></div>;
  return <Navigate replace to={workspace ? "/home" : "/onboarding"} />;
}

export function App() {
  const initialize = useWorkbenchStore((state) => state.initialize);
  useEffect(() => { void initialize(); }, [initialize]);

  return (
    <HashRouter>
      <AppearanceHydrator />
      <Routes>
        <Route element={<OnboardingPage />} path="/onboarding" />
        <Route element={<WorkspaceGate />}>
          <Route element={<HomePage />} path="/home" />
          <Route element={<LibraryShelfPage />} path="/library" />
          <Route element={<ReferenceLibraryPage />} path="/library/references" />
          <Route element={<SpeakingPage />} path="/practice/speaking" />
          <Route element={<ImportCenterPage />} path="/import" />
          <Route element={<PdfImportPage />} path="/import/pdf" />
          <Route element={<ReadingPage />} path="/practice/reading" />
          <Route element={<ListeningPage />} path="/practice/listening" />
          <Route element={<WritingPage />} path="/practice/writing" />
          <Route element={<ReviewPage />} path="/review" />
          <Route element={<ProgressPage />} path="/progress" />
          <Route element={<VocabularyPage />} path="/vocabulary" />
          <Route element={<SettingsPage />} path="/settings" />
        </Route>
        <Route element={<DefaultRoute />} path="/" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </HashRouter>
  );
}
