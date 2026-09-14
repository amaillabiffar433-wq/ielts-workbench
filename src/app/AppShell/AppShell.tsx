import { useState } from "react";
import { X } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import {
  buildPracticeRoute,
  parsePracticeRouteIdentity,
  type PracticeModuleType,
} from "../../features/practice/practiceRoute";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import { TopNavigation } from "./TopNavigation";
import "../../styles/wallpaper.css";
import "./AppShell.css";

function AiDrawer({ onClose }: { onClose: () => void }) {
  return (
    <>
      <button
        aria-label="关闭 AI 助手"
        className="ai-drawer-backdrop"
        onClick={onClose}
        type="button"
      />
      <aside aria-label="AI 学习助手" className="ai-drawer" role="dialog">
        <header className="ai-drawer__header">
          <strong>AI 学习助手</strong>
          <button aria-label="关闭 AI 助手" className="icon-button" onClick={onClose} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="ai-drawer__body">
          <div>
            <span className="status-badge status-badge--warning">尚未配置</span>
            <h2 style={{ marginTop: 14 }}>当前保持完全离线</h2>
            <p className="page-description">
              第一轮只建立 Provider 接口。没有请求会被发送，API Key 也不会保存在界面或普通设置中。
            </p>
          </div>
          <section className="ai-context-card" aria-labelledby="context-preview-title">
            <strong id="context-preview-title">未来发送前将显示</strong>
            <ul>
              <li>你主动选择的操作类型</li>
              <li>最小必要题目或选中文本</li>
              <li>是否包含你的答案或作文片段</li>
              <li>Provider 与取消状态</li>
            </ul>
          </section>
          <button className="button" disabled type="button">
            前往配置 Provider
          </button>
        </div>
      </aside>
    </>
  );
}

export function AppShell() {
  const [aiOpen, setAiOpen] = useState(false);
  const location = useLocation();
  const session = useWorkbenchStore((state) => state.session);
  const search = new URLSearchParams(location.search);
  const activeExamLock = session?.mode === "exam" && session.status === "in-progress";
  const examMode = activeExamLock || search.get("mode") === "exam";
  const activeExamModule: PracticeModuleType = session?.moduleType ?? "reading";
  const activeExamPath = buildPracticeRoute(activeExamModule);
  const sessionIdentity = parsePracticeRouteIdentity(session?.packId, session?.testId);
  const currentRouteIdentity = location.pathname.startsWith("/practice/")
    ? parsePracticeRouteIdentity(search.get("packId"), search.get("testId"))
    : null;
  const navigationIdentity = currentRouteIdentity ?? sessionIdentity;
  const activeExamRoute = buildPracticeRoute(activeExamModule, { identity: sessionIdentity, mode: "exam" });
  const routeAllowedDuringExam = location.pathname === "/review"
    || (
      location.pathname === activeExamPath
      && search.get("mode") === "exam"
      && (!session?.packId || search.get("packId") === session.packId)
      && (!session?.testId || search.get("testId") === session.testId)
    );

  if (activeExamLock && !routeAllowedDuringExam) {
    return <Navigate replace to={activeExamRoute} />;
  }

  return (
    <div className="app-shell">
      <TopNavigation identity={navigationIdentity} examLock={activeExamLock} examMode={examMode}
        examPath={activeExamPath} examRoute={activeExamRoute} onOpenAssistant={() => setAiOpen(true)} />
      <main className="app-shell__main">
        <Outlet />
      </main>
      {aiOpen && !examMode && <AiDrawer onClose={() => setAiOpen(false)} />}
    </div>
  );
}
