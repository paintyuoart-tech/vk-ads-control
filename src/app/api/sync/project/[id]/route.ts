import { NextResponse } from "next/server";
import { syncProject } from "@/lib/sync/project";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await syncProject(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка синхронизации";
    const status = message === "Требуется вход" ? 401 : message.includes("не найден") ? 404 : 502;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
