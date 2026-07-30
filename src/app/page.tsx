import { AlertTriangle, CheckCircle2, FolderKanban, Radio } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { SyncButton } from "@/components/sync-button";
import { getCurrentProjects } from "@/lib/data/projects";
import { sortProjectsByKpi } from "@/lib/kpi";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const projects = sortProjectsByKpi(await getCurrentProjects());
  const apiProjects = projects.filter((item) => item.connectionType !== "mock");
  const synced = apiProjects.filter((item) => item.metrics);
  const errors = apiProjects.filter((item) => !item.metrics);

  return <div className="content">
    <div className="page-head">
      <div><div className="eyebrow">Центр управления</div><h1>Обзор рекламы</h1><p className="muted" style={{ margin: 0 }}>Подключения и актуальность данных VK Ads</p></div>
      <SyncButton/>
    </div>

    <section className="summary-grid">
      <div className="card metric"><div className="metric-top"><span>Всего проектов</span><FolderKanban size={18}/></div><div className="metric-value">{projects.length}</div><span className="delta good">В Supabase</span></div>
      <div className="card metric"><div className="metric-top"><span>Реальные кабинеты</span><Radio size={18}/></div><div className="metric-value">{apiProjects.length}</div><span className="delta good">VK Ads + Яндекс Директ</span></div>
      <div className="card metric"><div className="metric-top"><span>Успешно обновлены</span><CheckCircle2 size={18}/></div><div className="metric-value">{synced.length}</div><span className="delta good">Последний запуск</span></div>
      <div className="card metric"><div className="metric-top"><span>Ошибки синхронизации</span><AlertTriangle size={18}/></div><div className="metric-value">{errors.length}</div><span className={errors.length ? "delta bad" : "delta good"}>{errors.length ? "Нужна проверка" : "Нет ошибок"}</span></div>
    </section>

    <div className="section-head"><h2>Проекты</h2><span className="small muted">{projects.length} проектов</span></div>
    <section className="project-grid">{projects.map((project) =>
      <ProjectCard key={project.id} project={project}/>
    )}</section>
  </div>;
}
