import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/project-form";
import { getCurrentProjects } from "@/lib/data/projects";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = (await getCurrentProjects()).find((item) => item.id === id);
  if (!project) notFound();

  return <div className="content">
    <div className="page-head">
      <div>
        <div className="eyebrow">Настройки</div>
        <h1>{project.name}</h1>
        <p className="muted" style={{ margin: 0 }}>Данные и целевые показатели проекта</p>
      </div>
    </div>
    <ProjectForm project={project}/>
  </div>;
}
