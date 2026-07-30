import type { Project } from "@/types";

type Goal = { name: string; results: number; spend: number };
type Target = { amount: number; terms: string[] };

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
    const terms = alias?.terms ?? (normalized.includes("кабинет") ? ["сообщ"] : []);
    return { amount, terms };
  }).filter((target) => target.amount > 0 && target.terms.length > 0);
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
      let matches = goals.filter((goal) => target.terms.some((term) => goal.name.includes(term)));
      if (!matches.length && target.terms.some((term) => ["заяв", "квалиф", "лид"].includes(term))) {
        matches = goals.filter((goal) => goal.name.includes("конверси"));
      }
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
