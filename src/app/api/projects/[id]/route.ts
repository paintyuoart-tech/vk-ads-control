import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  primary_conversion: z.string().trim().min(1).max(120),
  target_cpl: z.number().finite().min(0),
  daily_budget: z.number().finite().min(0),
  monthly_budget: z.number().finite().min(0),
  spreadsheet_id: z.string().trim().max(300).nullable(),
  asana_project_id: z.string().trim().max(300).nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await createClient();
  if (!client) return NextResponse.json({ error: "База данных не подключена" }, { status: 503 });

  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Сессия истекла. Войдите снова." }, { status: 401 });

  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте заполненные поля" }, { status: 400 });
  }

  const { id } = await params;
  const { data, error } = await client
    .from("projects")
    .update(parsed.data)
    .eq("user_id", user.id)
    .eq("slug", id)
    .select("slug")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Проект не найден в базе данных" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
