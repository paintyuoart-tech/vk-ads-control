"use client";

import Link from "next/link";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Clock3, Copy, FileText, X } from "lucide-react";
import type { Project } from "@/types";
import { getProjectKpiHealth } from "@/lib/kpi";

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
  const currentProject = variants?.[variantIndex]?.project ?? project;
  const metrics = currentProject.metrics;
  const selectedGoals = period === "week" ? metrics?.weeklyGoals : metrics?.goals;
  const selectedLocations = period === "week" ? metrics?.weeklyLocations : metrics?.locations;
  const spend = period === "week" ? metrics?.weeklySpend : metrics?.spend;
  const goals = Object.entries(selectedGoals || {}).filter(([, value]) =>
    value.results > 0 || (period === "week" && value.spend > 0)
  );
  const locations = currentProject.id === "emalis"
    ? Object.entries(selectedLocations || {}).filter(([, value]) => value.spend > 0)
    : [];
  const kpiHealth = getProjectKpiHealth(currentProject);
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

  return <article className={`card project-card ${kpiHealth.failed ? "kpi-failed" : ""}`}>
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
      <span className={`status ${kpiHealth.failed ? "critical" : currentProject.status}`} title={kpiHealth.reasons.join("\n")}>
        ● {kpiHealth.failed ? `Не выполнено ${kpiHealth.failedCount} из ${kpiHealth.totalCount} KPI` : statusText[currentProject.status]}
      </span>
    </div>
    {(currentProject.kpi1 || currentProject.kpi2 || currentProject.kpi3) && <div className="project-targets">
      {[
        { label: "Бюджет", value: currentProject.kpi1 },
        { label: "KPI 1", value: currentProject.kpi2 },
        { label: "KPI 2", value: currentProject.kpi3 },
      ].map((item) => item.value && <div className="target-chip" key={item.label} title={item.value}><span>{item.label}</span><strong>{item.value}</strong></div>)}
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
        {reportEnabled && <button type="button" className="btn report-button" onClick={openWeeklyReport}><FileText size={14}/>Отчёт</button>}
        <Link href={`/projects/${currentProject.id}`} className="btn">Открыть</Link>
      </div>
    </div>
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
