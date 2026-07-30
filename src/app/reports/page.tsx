import { getCurrentProjects } from "@/lib/data/projects";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const projects = await getCurrentProjects();
  return <div className="content">
    <div className="page-head"><div><div className="eyebrow">Контроль данных</div><h1>Отчёты</h1><p className="muted" style={{ margin: 0 }}>Доступность источников и готовность метрик</p></div></div>
    <div className="notice" style={{ marginBottom: 15 }}>Отчётные показатели не рассчитываются до подключения корректного endpoint статистики VK Ads. Здесь отображается только подтверждённое состояние источников.</div>
    <div className="card table-card"><table><thead><tr><th>Проект</th><th>Источник</th><th>Кабинет</th><th>Последняя синхронизация</th><th>Статус</th><th>Финансовые KPI</th></tr></thead>
      <tbody>{projects.map((project) => <tr key={project.id}>
        <td><strong>{project.name}</strong></td>
        <td><span className={`status ${project.connectionType !== "mock" ? "healthy" : "paused"}`}>● {project.connectionType === "yandex" ? "Яндекс Директ API" : project.connectionType === "api" ? "VK Ads API" : "Тестовый режим"}</span></td>
        <td>{project.vkAccountId || "—"}</td>
        <td>{project.lastSyncAt ? new Date(project.lastSyncAt).toLocaleString("ru-RU") : "Ещё не запускалась"}</td>
        <td>{project.lastSyncStatus === "success" ? "Успешно" : project.lastSyncStatus === "error" ? "Ошибка" : "Ожидает запуска"}</td>
        <td className="muted">{project.connectionType !== "mock" ? "Данные по API" : "Тестовые данные"}</td>
      </tr>)}</tbody>
    </table></div>
  </div>;
}
