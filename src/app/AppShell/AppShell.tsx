import { useState } from "react";
import {
  BookOpenText,
  Bot,
  ChevronLeft,
  ChevronRight,
  FileInput,
  Headphones,
  Highlighter,
  Library,
  PanelLeftClose,
  PenLine,
  Settings,
  X,
  type LucideIcon,
} from "lucide-react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  buildPracticeRoute,
  parsePracticeRouteIdentity,
  type PracticeModuleType,
} from "../../features/practice/practiceRoute";
import { useWorkbenchStore } from "../../stores/workbenchStore";
import "./AppShell.css";

type PrimaryNavigationItem = {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly moduleType?: PracticeModuleType;
};

const primaryNavigation: readonly PrimaryNavigationItem[] = [
  { to: "/library", label: "题库", icon: Library },
  { to: "/practice/reading", label: "阅读", icon: BookOpenText, moduleType: "reading" },
  { to: "/practice/listening", label: "听力", icon: Headphones, moduleType: "listening" },
  { to: "/practice/writing", label: "写作", icon: PenLine, moduleType: "writing" },
  { to: "/review", label: "复盘", icon: Highlighter },
  { to: "/import", label: "导入中心", icon: FileInput },
  { to: "/settings", label: "设置", icon: Settings },
];

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
  const [collapsed, setCollapsed] = useState(false);
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
    <div className={`app-shell${collapsed ? " app-shell--collapsed" : ""}`}>
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar__brand">
          <div aria-hidden="true" className="brand-mark">W</div>
          <div className="brand-copy">
            <strong>IELTS Workbench</strong>
            <span>Local learning workspace</span>
          </div>
        </div>
        <nav className="sidebar__nav">
          {primaryNavigation
            .filter(({ to }) => !activeExamLock || to === activeExamPath)
            .map(({ to, label, icon: Icon, moduleType }) => (
            <NavLink
              aria-label={collapsed ? label : undefined}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              key={to}
              title={collapsed ? label : undefined}
              to={activeExamLock
                ? activeExamRoute
                : moduleType
                  ? buildPracticeRoute(moduleType, { identity: navigationIdentity })
                  : to}
            >
              <Icon aria-hidden="true" size={19} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
            ))}
        </nav>
        <footer className="sidebar__footer">
          <span className="sidebar__footer-copy">本地优先 · 默认离线</span>
          <button
            aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            className="icon-button"
            onClick={() => setCollapsed((value) => !value)}
            title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
            type="button"
          >
            {collapsed ? <ChevronRight aria-hidden="true" size={18} /> : <PanelLeftClose aria-hidden="true" size={18} />}
          </button>
        </footer>
      </aside>
      <main className="app-shell__main">
        <Outlet />
      </main>
      {!examMode && (
        <button
          aria-label="打开 AI 学习助手"
          className="button ai-launcher"
          onClick={() => setAiOpen(true)}
          type="button"
        >
          <Bot aria-hidden="true" size={17} />
          AI 助手
          <ChevronLeft aria-hidden="true" size={15} />
        </button>
      )}
      {aiOpen && !examMode && <AiDrawer onClose={() => setAiOpen(false)} />}
    </div>
  );
}
