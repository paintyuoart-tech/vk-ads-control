import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { campaigns, daily, projectSummaries, projects, recommendations } from "@/config/seed";
import { DashboardChart } from "@/components/dashboard-chart";
import { SyncButton } from "@/components/sync-button";
import { ProjectRecommendations, WhyResultsButton } from "@/components/project-insights";
import { ProjectAiChat } from "@/components/project-ai-chat";
import { getAdsProvider } from "@/integrations/vk-ads";
import type { CampaignMetric, DailyMetric } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  if (!project) notFound();

  const summary = projectSummaries[id];
  let campaignRows: CampaignMetric[] = [];
  let liveDaily: DailyMetric[] = [];
  let liveError = "";

  if (project.connectionType !== "mock") {
    try {
      campaignRows = (await getAdsProvider(id).getCampaigns()).map((item) => ({
        ...item,
        projectId: id,
      }));
      const dateTo = new Date().toISOString().slice(0, 10);
      liveDaily = (await getAdsProvider(id).getStatistics({
        dateFrom: `${dateTo.slice(0, 8)}01`, dateTo,
        campaignIds: campaignRows.map((item) => item.id),
      })).rows;
      const totals = new Map<string, { spend: number; impressions: number; clicks: number; results: number }>();
      for (const row of liveDaily) {
        if (!row.campaignId) continue;
        const total = totals.get(row.campaignId) || { spend: 0, impressions: 0, clicks: 0, results: 0 };
        total.spend += row.spend; total.impressions += row.impressions || 0;
        total.clicks += row.clicks || 0; total.results += row.results;
        totals.set(row.campaignId, total);
      }
      campaignRows = campaignRows.map((item) => {
        const total = totals.get(item.id) || { spend: 0, impressions: 0, clicks: 0, results: 0 };
        return { ...item, ...total, cpl: total.results ? total.spend / total.results : 0 };
      });
    } catch (error) {
      liveError = error instanceof Error ? error.message : "Не удалось получить кампании VK Ads";
    }
  } else {
    campaignRows = campaigns.map((item) => ({
      ...item,
      projectId: id,
      name: item.name.replace("Аэротон", project.name),
    }));
  }

  const isLive = project.connectionType !== "mock";
  const liveSummary = liveDaily.reduce((total, row) => ({
    spend: total.spend + row.spend,
    impressions: total.impressions + (row.impressions || 0),
    clicks: total.clicks + (row.clicks || 0),
    results: total.results + row.results,
  }), { spend: 0, impressions: 0, clicks: 0, results: 0 });
  const liveCtr = liveSummary.impressions ? liveSummary.clicks / liveSummary.impressions * 100 : 0;
  const liveGoals = campaignRows.reduce<Record<string, { results: number; spend: number }>>((acc, campaign) => {
    const goal = campaign.resultType || "Другие результаты";
    acc[goal] ||= { results: 0, spend: 0 };
    acc[goal].results += campaign.results;
    acc[goal].spend += campaign.spend;
    return acc;
  }, {});
  const liveLocations = campaignRows.reduce<Record<string, { spend: number; goals: Record<string, { results: number; spend: number }> }>>((acc, campaign) => {
    if (!campaign.location) return acc;
    const goal = campaign.resultType || "Другие результаты";
    acc[campaign.location] ||= { spend: 0, goals: {} };
    acc[campaign.location].spend += campaign.spend;
    acc[campaign.location].goals[goal] ||= { results: 0, spend: 0 };
    acc[campaign.location].goals[goal].results += campaign.results;
    acc[campaign.location].goals[goal].spend += campaign.spend;
    return acc;
  }, {});
  const chartData = Object.values(liveDaily.reduce<Record<string, DailyMetric>>((acc, row) => {
    acc[row.date] ||= { date: row.date.slice(8, 10), spend: 0, results: 0, cpl: 0 };
    acc[row.date].spend += row.spend;
    acc[row.date].results += row.results;
    acc[row.date].cpl = acc[row.date].results ? acc[row.date].spend / acc[row.date].results : 0;
    return acc;
  }, {}));
  const projectRecommendations = isLive ? [] : recommendations.filter((item) => item.projectId === id);

  return <div className="content">
    <Link href="/" className="small muted" style={{ display: "flex", gap: 5, alignItems: "center", marginBottom: 15 }}>
      <ArrowLeft size={14}/>К обзору
    </Link>

    <div className="page-head">
      <div>
        <div className="project-title">
          <span className="dot" style={{ background: project.color }}/>
          <h1>{project.name}</h1>
          <span className={`status ${project.status}`}>● {project.status === "healthy" ? "В норме" : "Требует внимания"}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>{project.description} · {project.primaryConversion}</p>
      </div>
      <div className="actions">
        {project.connectionType !== "mock" && <ProjectAiChat projectId={id} projectName={project.name}/>}
        {project.connectionType !== "mock" && <WhyResultsButton projectId={id} projectName={project.name}/>}
        <Link href={`/projects/${id}/edit`} className="btn">Настройки</Link>
        {project.connectionType !== "mock" && <SyncButton projectId={id}/>}
      </div>
    </div>

    <div className="tabs">
      <Link className="active" href={`/projects/${id}`}>Показатели</Link>
      <Link href={`/projects/${id}?tab=campaigns`}>Кампании</Link>
      <Link href={`/projects/${id}?tab=recommendations`}>Рекомендации</Link>
    </div>

    {!isLive && <div className="notice" style={{ marginBottom: 15 }}>
      Тестовый режим: кампании и показатели этого проекта являются демонстрационными.
    </div>}
    {liveError && <div className="notice" style={{ marginBottom: 15 }}>
      <AlertTriangle size={16}/>{liveError}
    </div>}

    <section className="summary-grid">
      <div className="card metric"><div className="metric-top">Расход за месяц</div><div className="metric-value">{isLive ? `${liveSummary.spend.toLocaleString("ru-RU")} ₽` : `${summary.month.toLocaleString("ru-RU")} ₽`}</div></div>
      {isLive && id === "emalis" && Object.keys(liveLocations).length ? Object.entries(liveLocations).map(([city, value]) =>
        <div className="card metric" key={city}><div className="metric-top">{city}</div><div className="metric-value">{value.spend.toLocaleString("ru-RU")} ₽</div>
          {Object.entries(value.goals).filter(([, goal]) => goal.results > 0).map(([name, goal]) => <div className="small muted" style={{ marginTop: 6 }} key={name}>{name}: {goal.results.toLocaleString("ru-RU")} · {(goal.spend / goal.results).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽</div>)}
        </div>
      ) : isLive ? Object.entries(liveGoals).filter(([, value]) => value.results > 0).map(([goal, value]) =>
        <div className="card metric" key={goal}><div className="metric-top">{goal}</div><div className="metric-value">{value.results.toLocaleString("ru-RU")}</div><div className="small muted" style={{ marginTop: 6 }}>{(value.spend / value.results).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ за результат</div></div>
      ) : <div className="card metric"><div className="metric-top">{project.primaryConversion}</div><div className="metric-value">{summary.results}</div></div>}
      <div className="card metric"><div className="metric-top">{isLive ? "Клики" : "Стоимость результата"}</div><div className="metric-value">{isLive ? liveSummary.clicks.toLocaleString("ru-RU") : `${summary.cpl.toLocaleString("ru-RU")} ₽`}</div></div>
      <div className="card metric"><div className="metric-top">CTR</div><div className="metric-value">{isLive ? `${liveCtr.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%` : "1,26%"}</div></div>
    </section>

    <div className="two-col" style={{ marginBottom: 15 }}>
      <div className="card panel">
        <div className="section-head"><div><h2>Динамика</h2><div className="small muted" style={{ marginTop: 5 }}>Расход по дням</div></div><span className="small muted">{isLive ? chartData.length : daily.length} дней</span></div>
        <DashboardChart data={isLive ? chartData : undefined}/>
      </div>
      <div className="card panel">
        <div className="section-head"><h2>Рекомендации</h2></div>
        {isLive ? <ProjectRecommendations projectId={id}/> : projectRecommendations.length ? projectRecommendations.map((item) =>
          <div className="recommendation" key={item.id}>
            <span className={`rec-icon ${item.severity}`}><AlertTriangle size={15}/></span>
            <div><strong style={{ fontSize: 13 }}>{item.title}</strong><p className="small muted">{item.description}</p>
              <div className="small muted">Действия станут доступны после подключения Asana.</div>
            </div>
          </div>
        ) : <div style={{ textAlign: "center", padding: "35px 10px" }}><CheckCircle2 size={28} color="#2eb67d"/><p>Открытых рекомендаций нет</p></div>}
      </div>
    </div>

    <div className="section-head"><h2>Кампании</h2><span className="small muted">{campaignRows.length} кампаний</span></div>
    <div className="card table-card">
      <table>
        <thead><tr><th>Кампания</th><th>Статус</th><th className="text-right">Расход</th><th className="text-right">Показы</th><th className="text-right">Клики</th><th className="text-right">Результаты</th><th className="text-right">CPL</th><th className="text-right">Изменение</th></tr></thead>
        <tbody>{campaignRows.map((item) => <tr key={item.id}>
          <td><strong>{item.name}</strong><div className="small muted">{id === "emalis" && item.location ? `${item.location} · ` : ""}{item.resultType} · ID {item.id}</div></td>
          <td><span className={`status ${item.status === "active" ? "healthy" : item.status === "paused" ? "paused" : "stale"}`}>● {item.status === "active" ? "Активна" : item.status === "paused" ? "Пауза" : "Не указан"}</span></td>
          <td className="text-right">{isLive && item.spend === 0 ? "—" : `${item.spend.toLocaleString("ru-RU")} ₽`}</td>
          <td className="text-right">{isLive && item.impressions === 0 ? "—" : item.impressions.toLocaleString("ru-RU")}</td>
          <td className="text-right">{isLive && item.clicks === 0 ? "—" : item.clicks.toLocaleString("ru-RU")}</td>
          <td className="text-right">{isLive && item.results === 0 ? "—" : item.results}</td>
          <td className="text-right">{isLive && item.cpl === 0 ? "—" : `${item.cpl.toLocaleString("ru-RU")} ₽`}</td>
          <td className="text-right">{isLive && item.change === 0 ? "—" : `${item.change > 0 ? "+" : ""}${item.change}%`}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
