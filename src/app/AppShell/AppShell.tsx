import { Navigate, Outlet, useLocation } from "react-router-dom";
import { buildPracticeRoute, type PracticeModuleType } from "../../features/practice/practiceRoute";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { TopNavigation } from "./TopNavigation";
import "../../styles/wallpaper.css";
import "./AppShell.css";

export function AppShell() {
  const location = useLocation();
  const session = useWorkbenchStore((state) => state.session);
  const search = new URLSearchParams(location.search);
  const activeExamLock = session?.mode === "exam" && session.status === "in-progress";
  const examMode = activeExamLock || search.get("mode") === "exam";
  const activeExamModule: PracticeModuleType = session?.moduleType ?? "reading";
  const activeExamPath = buildPracticeRoute(activeExamModule);
  const activeExamRoute = buildPracticeRoute(activeExamModule, {
    identity: session?.packId && session.testId ? { packId: session.packId, testId: session.testId } : null,
    mode: "exam",
  });
  const routeAllowedDuringExam = location.pathname === activeExamPath
    && search.get("mode") === "exam"
    && (!session?.packId || search.get("packId") === session.packId)
    && (!session?.testId || search.get("testId") === session.testId);

  if (activeExamLock && !routeAllowedDuringExam) {
    return <Navigate replace to={activeExamRoute} />;
  }

  return (
    <div className="app-shell">
      <TopNavigation examLock={activeExamLock} examMode={examMode} examRoute={activeExamRoute} />
      <main className="app-shell__main">
        <Outlet />
      </main>
    </div>
  );
}
