"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clock3, Copy, FileText, Sparkles, X } from "lucide-react";
import type { Project } from "@/types";
import { getProjectKpiHealth, getProjectKpiProgress } from "@/lib/kpi";
import { ProjectAiChat } from "@/components/project-ai-chat";

const statusText = {
  healthy: "В норме",
  warning: "Требует внимания",
  critical: "Критично",
  stale: "Нет данных",
  paused: "На паузе",
};

type ProjectVariant = {
  label: string;
  project: Project;
};

type ProjectCardProps = {
  project: Project;
  title?: string;
  variants?: ProjectVariant[];
};

type ImprovementResult = {
  period: string;
  analyzedCampaigns: number;
  best: Array<{ id: string; name: string; resultType: string; results: number; cpl: number }>;
  tasks: Array<{ title: string; description: string; priority: "high" | "medium" | "low" }>;
};

const weeklyReportProjects = new Set<string>();
const weeklyReportAsanaLinks: Partial<Record<string, string>> = {};

function formatRubles(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} руб`;
}

function buildWeeklyReport(project: Project) {
  const spend = Number(project.metrics?.weeklySpend || 0);
  const goals = Object.entries(project.metrics?.weeklyGoals || {})
    .filter(([, value]) => value.results > 0 || value.spend > 0)
    .sort(([nameA], [nameB]) => {
      const preferred = project.primaryConversion.toLocaleLowerCase("ru-RU");
      return Number(nameB.toLocaleLowerCase("ru-RU") === preferred) - Number(nameA.toLocaleLowerCase("ru-RU") === preferred);
    })
    .slice(0, 2);
  const metricLines = goals.length
    ? goals.map(([name, value]) =>
        `— ${name} ${value.results.toLocaleString("ru-RU")} по ${value.results > 0 ? formatRubles(value.spend / value.results) : "—"}`
      )
    : ["— Метрика1 — по — руб", "— Метрика2 — по — руб"];
  const asanaLink = weeklyReportAsanaLinks[project.id] || project.asanaProjectId;
  const planLine = asanaLink
    ? `— Сделаем ЭТО, чтобы получить ЭТО (диалог 500 руб), задача внутри поставлена ${asanaLink}`
    : "— Сделаем ЭТО, чтобы получить ЭТО (диалог 500 руб)";

  return `@ИМЯ, на связи ваш таргетолог. Посмотрите недельный отчет

📊 Сводка:
— Бюджет ${formatRubles(spend)}
${metricLines.join("\n")}

План на неделю
${planLine}

❗ Нам важно понимать качество лидов для корректировки настроек: сколько было квалифицированных заявок и продаж за прошедшую неделю?

Все отчёты: #план_отчет`;
}

export function ProjectCard({ project, title, variants }: ProjectCardProps) {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [variantIndex, setVariantIndex] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [copied, setCopied] = useState(false);
  const [improvementOpen, setImprovementOpen] = useState(false);
  const [improvementLoading, setImprovementLoading] = useState(false);
  const [improvementError, setImprovementError] = useState("");
  const [improvement, setImprovement] = useState<ImprovementResult | null>(null);
  const currentProject = variants?.[variantIndex]?.project ?? project;
  const metrics = currentProject.metrics;
  const selectedGoals = period === "week" ? metrics?.weeklyGoals : metrics?.goals;
  const selectedLocations = period === "week" ? metrics?.weeklyLocations : metrics?.locations;
  const spend = period === "week" ? metrics?.weeklySpend : metrics?.spend;
  const goals = Object.entries(selectedGoals || {}).filter(([name, value]) =>
    !name.toLocaleLowerCase("ru-RU").includes("другие результаты")
    && (value.results > 0 || (period === "week" && value.spend > 0))
  );
  const locations = currentProject.id === "emalis"
    ? Object.entries(selectedLocations || {}).filter(([, value]) => value.spend > 0)
    : [];
  const kpiHealth = getProjectKpiHealth(currentProject);
  const kpiProgress = getProjectKpiProgress(currentProject);
  const kpiStatus = kpiHealth.failed ? (kpiHealth.warning ? "warning" : "critical") : currentProject.status;
  const reportEnabled = weeklyReportProjects.has(currentProject.id);

  function openWeeklyReport() {
    setReportText(buildWeeklyReport(currentProject));
    setCopied(false);
    setReportOpen(true);
  }

  async function copyWeeklyReport() {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
  }

  async function openImprovement() {
    setImprovementOpen(true);
    if (improvement || improvementLoading) return;
    setImprovementLoading(true);
    setImprovementError("");
    try {
      const response = await fetch(`/api/recommendations/${encodeURIComponent(currentProject.id)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось сформировать рекомендации");
      setImprovement(payload);
    } catch (error) {
      setImprovementError(error instanceof Error ? error.message : "Не удалось сформировать рекомендации");
    } finally {
      setImprovementLoading(false);
    }
  }

  return <article className={`card project-card ${kpiHealth.failed ? (kpiHealth.warning ? "kpi-warning" : "kpi-failed") : ""}`}>
    <div className="project-top">
      <div>
        <div className="project-title">
          <span className="dot" style={{ background: currentProject.color }}/>
          <h2>{title ?? currentProject.name}</h2>
        </div>
        {variants && variants.length > 1 && <div className="source-switch" aria-label="Рекламная система">
          {variants.map((variant, index) => <button
            type="button"
            key={variant.label}
            className={variantIndex === index ? "active" : ""}
            onClick={() => setVariantIndex(index)}
          >{variant.label}</button>)}
        </div>}
      </div>
      <span className={`status ${kpiStatus}`} title={kpiHealth.reasons.join("\n")}>
        ● {kpiHealth.failed ? (kpiHealth.warning ? "Почти выполнено" : `Не выполнено ${kpiHealth.failedCount} из ${kpiHealth.totalCount} KPI`) : statusText[currentProject.status]}
      </span>
    </div>
    {(currentProject.kpi1 || currentProject.kpi2 || currentProject.kpi3) && <div className="project-targets">
      {[
        { label: "Бюджет", value: currentProject.kpi1, progress: kpiProgress.budget },
        { label: "KPI 1", value: currentProject.kpi2, progress: kpiProgress.kpi1 },
        { label: "KPI 2", value: currentProject.kpi3, progress: kpiProgress.kpi2 },
      ].map((item) => item.value && <div className="target-row" key={item.label}>
        <div className="target-chip" title={item.value}><span>{item.label}</span><strong>{item.value}</strong></div>
        <div className={`kpi-battery ${item.progress.state}`} title={item.progress.detail} aria-label={`${item.label}: ${item.progress.detail}`}>
          <span className="battery-body"><i style={{ width: `${Math.max(8, item.progress.percent)}%` }}/></span>
          <span className="battery-tip"/>
          <strong>{item.progress.state === "unknown" ? "—" : `${item.progress.percent}%`}</strong>
        </div>
      </div>)}
    </div>}
    <div className="project-kpis">
      <div className="project-kpi"><span className="small muted">Расход · {period === "week" ? "7 дней" : "месяц"}</span><strong>{metrics ? `${Number(spend || 0).toLocaleString("ru-RU")} ₽` : "—"}</strong></div>
      <div className="project-kpi"><span className="small muted">Активных целей</span><strong>{goals.length || "—"}</strong></div>
      <div className="goal-block">
        <div className="goal-head"><span className="small muted">{locations.length ? "По городам" : "Результаты по целям"}</span><div className="period-switch"><button className={period === "week" ? "active" : ""} onClick={() => setPeriod("week")}>7 дней</button><button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Месяц</button></div></div>
        {locations.length ? <div className="city-list" key={`cities-${period}`}>{locations.map(([city, value]) => <div className="city-section" key={city}>
          <div className="city-head"><strong>{city}</strong><span>{value.spend.toLocaleString("ru-RU")} ₽</span></div>
          {Object.entries(value.goals).filter(([, goal]) => goal.results > 0).map(([name, goal]) =>
            <div className="goal-row" key={name}><span>{name}<small>{(goal.spend / goal.results).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ за результат</small></span><strong>{goal.results.toLocaleString("ru-RU")}</strong></div>
          )}
        </div>)}</div> : <div className="goal-list" key={`goals-${period}-${currentProject.id}`}>
          {goals.length ? goals.map(([name, value]) => <div className="goal-row" key={name}><span>{name}<small>{value.results > 0 ? `${(value.spend / value.results).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ за результат` : "Нет результатов за период"}</small></span><strong>{value.results.toLocaleString("ru-RU")}</strong></div>) : <div className="goal-empty">Нет результатов за выбранный период</div>}
        </div>}
      </div>
    </div>
    <div className="project-foot">
      <span className="small muted" style={{ display: "flex", gap: 5, alignItems: "center" }}><Clock3 size={13}/>{currentProject.lastSyncAt ? new Date(currentProject.lastSyncAt).toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Нет обновлений"}</span>
      <div className="project-foot-actions">
        <ProjectAiChat projectId={currentProject.id} projectName={currentProject.name} compact/>
        <button type="button" className="btn improvement-button" onClick={openImprovement}><Sparkles size={14}/>Как улучшить результаты</button>
        {reportEnabled && <button type="button" className="btn report-button" onClick={openWeeklyReport}><FileText size={14}/>Отчёт</button>}
        <Link href={`/projects/${currentProject.id}`} className="btn">Открыть</Link>
      </div>
    </div>
    {improvementOpen && typeof document !== "undefined" && createPortal(<div className="report-modal-backdrop" role="presentation" onMouseDown={() => setImprovementOpen(false)}>
      <section className="report-modal improvement-modal" role="dialog" aria-modal="true" aria-labelledby={`improvement-title-${currentProject.id}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="report-modal-head">
          <div><span className="eyebrow">Анализ кампаний</span><h2 id={`improvement-title-${currentProject.id}`}>Как улучшить результаты · {currentProject.name}</h2></div>
          <button type="button" className="report-close" aria-label="Закрыть" onClick={() => setImprovementOpen(false)}><X size={18}/></button>
        </div>
        {improvementLoading && <div className="improvement-loading"><Sparkles size={22}/><strong>Анализирую историю кампаний…</strong><span className="small muted">Это может занять несколько секунд</span></div>}
        {improvementError && <div className="notice">{improvementError}</div>}
        {improvement && <>
          <div className="small muted improvement-meta">Период: {improvement.period} · Проанализировано кампаний: {improvement.analyzedCampaigns}</div>
          {improvement.best.length > 0 && <div className="best-campaigns">
            <span className="eyebrow">Самые эффективные связки</span>
            {improvement.best.map((item, index) => <div className="best-campaign" key={item.id}>
              <span>{index + 1}</span><div><strong>{item.name}</strong><small>{item.resultType} · {item.results.toLocaleString("ru-RU")} результатов · {item.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽</small></div>
            </div>)}
          </div>}
          <div className="improvement-tasks">
            <span className="eyebrow">Задачи для улучшения</span>
            {improvement.tasks.map((task, index) => <article className={`improvement-task ${task.priority}`} key={`${task.title}-${index}`}>
              <span className="task-number">{index + 1}</span><div><strong>{task.title}</strong><p>{task.description}</p></div>
            </article>)}
          </div>
          <div className="small muted improvement-disclaimer">Рекомендации сформированы только для планирования. Рекламный кабинет остаётся в режиме чтения.</div>
        </>}
      </section>
    </div>, document.body)}
    {reportOpen && typeof document !== "undefined" && createPortal(<div className="report-modal-backdrop" role="presentation" onMouseDown={() => setReportOpen(false)}>
      <section className="report-modal" role="dialog" aria-modal="true" aria-labelledby={`report-title-${currentProject.id}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="report-modal-head">
          <div><span className="eyebrow">Недельный отчёт</span><h2 id={`report-title-${currentProject.id}`}>{currentProject.name}</h2></div>
          <button type="button" className="report-close" aria-label="Закрыть" onClick={() => setReportOpen(false)}><X size={18}/></button>
        </div>
        <textarea className="report-text" value={reportText} onChange={(event) => { setReportText(event.target.value); setCopied(false); }} aria-label="Текст недельного отчёта"/>
        <div className="report-modal-actions">
          <span className="small muted">Текст можно отредактировать перед копированием</span>
          <button type="button" className="btn primary" onClick={copyWeeklyReport}>{copied ? <Check size={15}/> : <Copy size={15}/>} {copied ? "Скопировано" : "Скопировать"}</button>
        </div>
      </section>
    </div>, document.body)}
  </article>;
}
