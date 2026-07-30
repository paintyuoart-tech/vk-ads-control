import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LogsPage() {
  const client = await createClient();
  let logs: Array<Record<string, unknown>> = [];
  if (client) {
    const { data: { user } } = await client.auth.getUser();
    if (user) {
      const { data } = await client.from("sync_logs").select("*, projects!inner(name,user_id)").eq("projects.user_id", user.id).order("started_at", { ascending: false }).limit(100);
      logs = data || [];
    }
  }
  return <div className="content">
    <div className="page-head"><div><div className="eyebrow">Система</div><h1>Журнал синхронизаций</h1><p className="muted" style={{ margin: 0 }}>Фактическая история запусков из Supabase</p></div></div>
    {!logs.length ? <div className="card panel"><h2>Запусков пока нет</h2><p className="muted">Нажмите «Обновить данные» на обзоре или странице проекта.</p></div> :
      <div className="card table-card"><table><thead><tr><th>Начало</th><th>Проект</th><th>Статус</th><th className="text-right">Получено</th><th className="text-right">Записано</th><th>Сообщение</th></tr></thead>
        <tbody>{logs.map((item) => {
          const linked = item.projects as { name?: string } | null;
          const status = String(item.status);
          return <tr key={String(item.id)}>
            <td>{new Date(String(item.started_at)).toLocaleString("ru-RU")}</td><td><strong>{linked?.name || "Проект"}</strong></td>
            <td><span className={`status ${status === "success" ? "healthy" : status === "running" ? "warning" : "critical"}`}>● {status === "success" ? "Успешно" : status === "running" ? "Выполняется" : "Ошибка"}</span></td>
            <td className="text-right">{String(item.records_received ?? 0)}</td><td className="text-right">{String(item.records_written ?? 0)}</td>
            <td className="small muted">{String(item.error_message || "Без ошибок")}</td>
          </tr>;
        })}</tbody>
      </table></div>}
  </div>;
}
