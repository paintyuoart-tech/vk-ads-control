import { NextResponse } from "next/server";
import { projects } from "@/config/seed";
import { syncProject } from "@/lib/sync/project";

export async function POST() {
  const realProjects = projects.filter((item) => item.connectionType !== "mock");
  const results = await Promise.all(realProjects.map(async (project) => {
    try {
      return await syncProject(project.slug);
    } catch (error) {
      return {
        projectId: project.slug,
        ok: false,
        error: error instanceof Error ? error.message : "Ошибка",
      };
    }
  }));

  return NextResponse.json(
    { ok: results.every((item) => item.ok), results },
    { status: results.some((item) => item.ok) ? 200 : 502 },
  );
}
