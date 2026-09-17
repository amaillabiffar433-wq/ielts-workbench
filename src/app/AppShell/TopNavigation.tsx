import { BarChart3, BookOpenText, House, LibraryBig, RotateCcw, Settings2 } from "lucide-react";
import { NavLink } from "react-router-dom";

const navigation = [
  { to: "/home", label: "Home", icon: House },
  { to: "/library", label: "Library", icon: LibraryBig },
  { to: "/review?view=queue", label: "Review", icon: RotateCcw },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function TopNavigation({ examLock, examMode, examRoute }: {
  examLock: boolean;
  examMode: boolean;
  examRoute: string;
}) {
  return (
    <header className="top-navigation">
      <div className="top-navigation__brand"><BookOpenText aria-hidden="true" size={20} /><span>IELTS Workbench</span></div>
      <nav aria-label="Primary navigation" className="top-navigation__links">
        {examLock ? <NavLink className="top-navigation__link active" to={examRoute}>Exam</NavLink>
          : navigation.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} className={({ isActive }) => `top-navigation__link${isActive ? " active" : ""}`} to={to}>
              <Icon aria-hidden="true" size={15} />{label}
            </NavLink>
          ))}
      </nav>
      <div className="top-navigation__utilities">
        {examMode
          ? <span className="top-navigation__exam">Exam mode · Focused</span>
          : <span className="top-navigation__offline"><span aria-hidden="true" />Local &amp; offline</span>}
      </div>
    </header>
  );
}
