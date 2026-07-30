import type { Project } from "@/types";

type Goal = { name: string; results: number; spend: number };
type Target = { amount: number; terms: string[] };
export type KpiProgress = {
  percent: number;
  state: "good" | "warning" | "bad" | "unknown";
  detail: string;
};

const ACTION_ALIASES: Array<{ words: string[]; terms: string[] }> = [
  { words: ["подпис"], terms: ["подпис"] },
  { words: ["квалиф", "квал"], terms: ["квалиф", "квал"] },
  { words: ["сообщ", "диалог"], terms: ["сообщ", "диалог"] },
  { words: ["лид"], terms: ["лид"] },
  { words: ["заяв"], terms: ["заяв", "лид"] },
];

function targetsFrom(text: string): Target[] {
  return text.split("/").map((part) => {
    const normalized = part.toLowerCase();
    const amount = Number((part.match(/\d[\d\s]*/) ?? ["0"])[0].replace(/\s/g, ""));
    const alias = ACTION_ALIASES.find(({ words }) => words.some((word) => normalized.includes(word)));
    const terms = normalized.includes("кабинет") ? ["сообщ"] : (alias?.terms ?? []);
    return { amount, terms };
  }).filter((target) => target.amount > 0 && target.terms.length > 0);
}

function matchingGoals(goals: Goal[], target: Target) {
  let matches = goals.filter((goal) => target.terms.some((term) => goal.name.includes(term)));
  if (!matches.length && target.terms.some((term) => ["заяв", "квалиф", "лид"].includes(term))) {
    matches = goals.filter((goal) => goal.name.includes("конверси"));
  }
  return matches;
}

export function getProjectKpiProgress(project: Project): Record<"budget" | "kpi1" | "kpi2", KpiProgress> {
  const goals: Goal[] = Object.entries(project.metrics?.goals || {})
    .filter(([name]) => !name.toLowerCase().includes("другие результаты"))
    .map(([name, value]) => ({ name: name.toLowerCase(), ...value }));
  const budgetPercent = project.monthlyBudget > 0
    ? Math.min(100, Math.round((Number(project.metrics?.spend || 0) / project.monthlyBudget) * 100))
    : 0;
  const result: Record<"budget" | "kpi1" | "kpi2", KpiProgress> = {
    budget: {
      percent: budgetPercent,
      state: budgetPercent >= 90 ? "good" : budgetPercent >= 70 ? "warning" : "bad",
      detail: `Освоено ${budgetPercent}% бюджета`,
    },
    kpi1: { percent: 0, state: "unknown", detail: "Нет данных для расчёта" },
    kpi2: { percent: 0, state: "unknown", detail: "Нет данных для расчёта" },
  };

  for (const [key, text] of [["kpi1", project.kpi2], ["kpi2", project.kpi3]] as const) {
    if (!text) continue;
    const scores: number[] = [];
    for (const target of targetsFrom(text)) {
      const matches = matchingGoals(goals, target);
      const results = matches.reduce((sum, goal) => sum + goal.results, 0);
      const spend = matches.reduce((sum, goal) => sum + goal.spend, 0);
      if (results <= 0) continue;
      scores.push(Math.min(100, Math.round((target.amount / (spend / results)) * 100)));
    }
    if (!scores.length) continue;
    const percent = Math.min(...scores);
    result[key] = {
      percent,
      state: percent >= 100 ? "good" : percent >= 90 ? "warning" : "bad",
      detail: percent >= 100 ? "KPI выполнен" : `Выполнение KPI: ${percent}%`,
    };
  }
  return result;
}

export function getProjectKpiHealth(project: Project) {
  const goals: Goal[] = Object.entries(project.metrics?.goals || {})
    .filter(([name]) => !name.toLowerCase().includes("другие результаты"))
    .map(([name, value]) => ({ name: name.toLowerCase(), ...value }));
  const reasons: string[] = [];
  const failedLabels = new Set<string>();
  const criticalLabels = new Set<string>();
  const checkedLabels = new Set<string>();
  let maxOverrun = 0;

  for (const [label, text] of [["KPI 1", project.kpi2], ["KPI 2", project.kpi3]] as const) {
    if (!text) continue;
    for (const target of targetsFrom(text)) {
      checkedLabels.add(label);
      const matches = matchingGoals(goals, target);
      const results = matches.reduce((sum, goal) => sum + goal.results, 0);
      const spend = matches.reduce((sum, goal) => sum + goal.spend, 0);

      if (results <= 0) {
        // Some KPI values come from CRM or manual qualification and cannot be
        // evaluated from VK Ads statistics alone.
        continue;
      }

      const actualCost = spend / results;
      if (actualCost > target.amount) {
        failedLabels.add(label);
        maxOverrun = Math.max(maxOverrun, actualCost / target.amount);
        if (actualCost > target.amount * 1.1) criticalLabels.add(label);
        reasons.push(`${label}: ${Math.round(actualCost).toLocaleString("ru-RU")} ₽ > ${target.amount.toLocaleString("ru-RU")} ₽`);
      }
    }
  }

  const totalCount = [project.kpi2, project.kpi3].filter(Boolean).length;
  return {
    failed: failedLabels.size > 0,
    warning: failedLabels.size > 0 && criticalLabels.size === 0,
    failedCount: failedLabels.size,
    totalCount,
    reasons,
    evaluated: checkedLabels.size > 0,
    maxOverrun,
  };
}

export function sortProjectsByKpi(projects: Project[]) {
  const statusPriority = { critical: 4, warning: 3, stale: 2, paused: 1, healthy: 0 };
  return [...projects].sort((a, b) => {
    const aHealth = getProjectKpiHealth(a);
    const bHealth = getProjectKpiHealth(b);
    return bHealth.failedCount - aHealth.failedCount
      || bHealth.maxOverrun - aHealth.maxOverrun
      || statusPriority[b.status] - statusPriority[a.status];
  });
}
