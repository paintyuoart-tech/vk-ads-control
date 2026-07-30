"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, FolderKanban, LayoutDashboard, History, Settings } from "lucide-react";

const links = [
  ["/", "Обзор", LayoutDashboard], ["/projects", "Проекты", FolderKanban], ["/reports", "Отчёты", BarChart3], ["/logs", "Журнал", History], ["/settings", "Настройки", Settings],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/login") return <main>{children}</main>;
  return <div className="shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brandmark">VK</span><span>Ads Control</span></Link>
      <nav className="nav">{links.map(([href,label,Icon]) => <Link className={path === href ? "active" : ""} key={href} href={href}><Icon size={18}/>{label}</Link>)}</nav>
      <div className="side-bottom"><div className="user"><span className="avatar">A</span><div><strong style={{fontSize:13}}>Владелец</strong><div className="small muted">Администратор</div></div></div></div>
    </aside>
    <main className="main"><header className="topbar"><span className="small muted">Рекламные проекты</span><div className="actions"><span className="status healthy">● Все системы работают</span></div></header>{children}</main>
    <nav className="mobile-nav">{links.slice(0,5).map(([href,label,Icon]) => <Link key={href} href={href}><Icon size={18}/><span>{label}</span></Link>)}</nav>
  </div>;
}
