import { isAsanaConfigured } from "@/integrations/asana";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const asanaConnected = isAsanaConfigured();
  return <div className="content">
    <div className="page-head"><div><div className="eyebrow">Конфигурация</div><h1>Настройки</h1><p className="muted" style={{margin:0}}>Интеграции и автоматическое обновление</p></div></div>
    <div className="two-col">
      <section className="card panel"><h2>Подключения</h2>
        <div className="recommendation"><span className="status healthy">●</span><div><strong>Рекламные системы</strong><p className="small muted">Подключены кабинеты VK Ads, Яндекс Директ и Яндекс Метрика.</p></div></div>
        <div className="recommendation"><span className="status stale">●</span><div><strong>Google Sheets</strong><p className="small muted">Ключ в проекте не найден. Запись отключена.</p></div></div>
        <div className="recommendation"><span className={`status ${asanaConnected ? "healthy" : "stale"}`}>●</span><div><strong>Asana</strong><p className="small muted">{asanaConnected ? "Подключена. Создание задач через API доступно для сопоставленных проектов." : "Ключ в проекте не найден. Создание задач отключено."}</p></div></div>
      </section>
      <section className="card panel"><h2>Расписание</h2><div className="notice" style={{marginTop:20}}>Автоматический запуск пока не включён: для безопасного Cron потребуется отдельный серверный ключ Supabase и секрет задания.</div><p className="small muted">Рекомендуемое время после подключения: 08:00 Europe/Moscow.</p></section>
    </div>
  </div>;
}
