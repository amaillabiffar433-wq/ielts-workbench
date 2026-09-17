import { BookOpenText, Bot, FileInput, Settings } from "lucide-react";
import { NavLink } from "react-router-dom";
import { buildPracticeRoute, type PracticeModuleType, type PracticeRouteIdentity } from "../../features/practice/practiceRoute";

const navigation: readonly { to: string; label: string; moduleType?: PracticeModuleType }[] = [
  { to: "/library", label: "首页" },
  { to: "/practice/reading", label: "阅读", moduleType: "reading" },
  { to: "/practice/listening", label: "听力", moduleType: "listening" },
  { to: "/practice/writing", label: "写作", moduleType: "writing" },
  { to: "/review", label: "错题本" },
];

export function TopNavigation({ identity, examLock, examMode, examPath, examRoute, onOpenAssistant }: {
  identity: PracticeRouteIdentity | null;
  examLock: boolean;
  examMode: boolean;
  examPath: string;
  examRoute: string;
  onOpenAssistant: () => void;
}) {
  return (
    <header className="top-navigation">
      <div className="top-navigation__brand"><BookOpenText aria-hidden="true" size={20} /><span>IELTS Workbench</span></div>
      <nav aria-label="主导航" className="top-navigation__links">
        {navigation.filter(({ to }) => !examLock || to === examPath).map(({ to, label, moduleType }) => (
          <NavLink key={to} className={({ isActive }) => `top-navigation__link${isActive ? " active" : ""}`}
            title={to === "/review" ? "复盘：查看完整练习与错题" : undefined}
            to={examLock ? examRoute : moduleType ? buildPracticeRoute(moduleType, { identity }) : to}>{label}</NavLink>
        ))}
        {!examLock && <NavLink className={({ isActive }) => `top-navigation__link${isActive ? " active" : ""}`} to="/vocabulary">词汇</NavLink>}
      </nav>
      <div className="top-navigation__utilities">
        {examLock && <span className="top-navigation__exam">Exam · 考试进行中</span>}
        {!examLock && <>
          <NavLink aria-label="导入中心" className="top-navigation__utility" title="导入中心" to="/import"><FileInput aria-hidden="true" size={17} /><span>导入</span></NavLink>
          <NavLink aria-label="设置" className="top-navigation__utility" title="设置" to="/settings"><Settings aria-hidden="true" size={17} /></NavLink>
        </>}
        {!examMode && <button aria-label="打开 AI 学习助手" className="top-navigation__utility" onClick={onOpenAssistant} title="AI 助手 · 尚未配置，保持离线" type="button"><Bot aria-hidden="true" size={17} /></button>}
      </div>
    </header>
  );
}
