"use client";

import { useEffect, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import type { Project } from "@/types";

type ViewMode = "grid" | "rows";

export function DashboardProjectGrid({ projects }: { projects: Project[] }) {
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    const saved = window.localStorage.getItem("dashboard-project-view");
    if (saved === "grid" || saved === "rows") setView(saved);
  }, []);

  function changeView(next: ViewMode) {
    setView(next);
    window.localStorage.setItem("dashboard-project-view", next);
  }

  return <>
    <div className="section-head">
      <h2>Проекты</h2>
      <div className="project-view-actions">
        <span className="small muted">{projects.length} проектов</span>
        <div className="view-switch" aria-label="Вид проектов">
          <button
            type="button"
            className={view === "grid" ? "active" : ""}
            onClick={() => changeView("grid")}
            title="Плитки"
            aria-label="Показать плитками"
          ><LayoutGrid size={15}/><span>Плитки</span></button>
          <button
            type="button"
            className={view === "rows" ? "active" : ""}
            onClick={() => changeView("rows")}
            title="Строки"
            aria-label="Показать строками"
          ><Rows3 size={15}/><span>Строки</span></button>
        </div>
      </div>
    </div>
    <section className={`project-grid ${view === "rows" ? "rows-view" : ""}`}>
      {projects.map((project) => <ProjectCard key={project.id} project={project}/>)}
    </section>
  </>;
}
