"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, HelpCircle, Sparkles, X } from "lucide-react";

type Task = { title: string; description: string; priority: "high" | "medium" | "low" };
type RecommendationPayload = { tasks: Task[] };
type AnalysisPayload = {
  period: { history: string; month: string; week: string };
  metrics: Record<"history" | "month" | "week", { spend: number; results: number; cpl: number; ctr: number }>;
  conclusions: Array<{ status: "good" | "warning" | "critical"; title: string; detail: string }>;
  tasks: Task[];
};

export function ProjectRecommendations({ projectId }: { projectId: string }) {
  const [data, setData] = useState<RecommendationPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/recommendations/${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Не удалось получить рекомендации");
        setData(payload);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось получить рекомендации"));
  }, [projectId]);

  if (error) return <div className="notice"><AlertTriangle size={16}/>{error}</div>;
  if (!data) return <div className="insight-loading"><Sparkles size={20}/><span>Анализирую кампании…</span></div>;
  return <div className="recommendation-list">
    {data.tasks.slice(0, 4).map((task, index) => <div className="recommendation" key={`${task.title}-${index}`}>
      <span className={`rec-icon ${task.priority === "high" ? "critical" : task.priority === "medium" ? "warning" : "info"}`}><Sparkles size={15}/></span>
      <div><strong style={{ fontSize: 13 }}>{task.title}</strong><p className="small muted">{task.description}</p></div>
    </div>)}
  </div>;
}

export function WhyResultsButton({ projectId, projectName, compact = false }: { projectId: string; projectName: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<AnalysisPayload | null>(null);

  async function analyze() {
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/analysis/${encodeURIComponent(projectId)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Не удалось выполнить анализ");
      setData(payload);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось выполнить анализ");
    } finally {
      setLoading(false);
    }
  }

  return <>
    <button type="button" className="btn why-results-button" onClick={analyze}><HelpCircle size={15}/>{compact ? "Почему результаты?" : "Почему такие результаты?"}</button>
    {open && typeof document !== "undefined" && createPortal(<div className="report-modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <section className="report-modal improvement-modal why-modal" role="dialog" aria-modal="true" aria-labelledby={`why-title-${projectId}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="report-modal-head">
          <div><span className="eyebrow">Сравнение периодов</span><h2 id={`why-title-${projectId}`}>Почему такие результаты · {projectName}</h2></div>
          <button type="button" className="report-close" aria-label="Закрыть" onClick={() => setOpen(false)}><X size={18}/></button>
        </div>
        {loading && <div className="improvement-loading"><HelpCircle size={24}/><strong>Сравниваю историю, месяц и неделю…</strong></div>}
        {error && <div className="notice">{error}</div>}
        {data && <>
          <div className="period-comparison">
            {(["history", "month", "week"] as const).map((period) => {
              const labels = { history: "Вся история", month: "Текущий месяц", week: "Последние 7 дней" };
              const metric = data.metrics[period];
              return <div className="period-card" key={period}><span>{labels[period]}</span><strong>{metric.cpl ? `${metric.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽` : "—"}</strong><small>{metric.results.toLocaleString("ru-RU")} результатов · CTR {metric.ctr.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}%</small></div>;
            })}
          </div>
          <div className="analysis-conclusions">
            <span className="eyebrow">Что происходит</span>
            {data.conclusions.map((item, index) => <div className={`analysis-conclusion ${item.status}`} key={`${item.title}-${index}`}>
              {item.status === "good" ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>}<div><strong>{item.title}</strong><p>{item.detail}</p></div>
            </div>)}
          </div>
          <div className="improvement-tasks">
            <span className="eyebrow">Что конкретно сделать</span>
            {data.tasks.map((task, index) => <article className={`improvement-task ${task.priority}`} key={`${task.title}-${index}`}>
              <span className="task-number">{index + 1}</span><div><strong>{task.title}</strong><p>{task.description}</p></div>
            </article>)}
          </div>
          <div className="small muted improvement-disclaimer">Анализ только читает данные VK. Никакие кампании автоматически не изменяются.</div>
        </>}
      </section>
    </div>, document.body)}
  </>;
}
