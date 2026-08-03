import { NextResponse } from "next/server";
import { projects } from "@/config/seed";
import { getAdsProvider } from "@/integrations/vk-ads";
import { openAiJson, PROJECT_ANALYST_RULES } from "@/lib/ai/openai";

type CampaignTotal = {
  id: string;
  name: string;
  status: string;
  resultType: string;
  location?: string;
  spend: number;
  results: number;
  cpl: number;
};

function directionName(item: CampaignTotal) {
  return `${item.resultType}${item.location ? ` · ${item.location}` : ""}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  if (!project) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });

  try {
    const provider = getAdsProvider(id);
    const campaigns = await provider.getCampaigns();
    const now = new Date();
    const dateTo = now.toISOString().slice(0, 10);
    const dateFrom = new Date(now.getTime() - 399 * 86400000).toISOString().slice(0, 10);
    const monthFrom = now.toISOString().slice(0, 8) + "01";
    const weekFrom = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    const historyRows = (await provider.getStatistics({
      dateFrom,
      dateTo,
      campaignIds: campaigns.map((item) => item.id),
    })).rows;
    const totals = new Map<string, { spend: number; results: number }>();
    const periodTotals = new Map<string, {
      history: { spend: number; results: number };
      month: { spend: number; results: number };
      week: { spend: number; results: number };
    }>();
    for (const row of historyRows) {
      if (!row.campaignId) continue;
      const total = totals.get(row.campaignId) || { spend: 0, results: 0 };
      total.spend += row.spend;
      total.results += row.results;
      totals.set(row.campaignId, total);
      const periods = periodTotals.get(row.campaignId) || {
        history: { spend: 0, results: 0 }, month: { spend: 0, results: 0 }, week: { spend: 0, results: 0 },
      };
      periods.history.spend += row.spend; periods.history.results += row.results;
      if (row.date >= monthFrom) { periods.month.spend += row.spend; periods.month.results += row.results; }
      if (row.date >= weekFrom) { periods.week.spend += row.spend; periods.week.results += row.results; }
      periodTotals.set(row.campaignId, periods);
    }
    const rows: CampaignTotal[] = campaigns.map((campaign) => {
      const total = totals.get(campaign.id) || { spend: 0, results: 0 };
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        resultType: campaign.resultType || project.primaryConversion,
        location: campaign.location,
        spend: total.spend,
        results: total.results,
        cpl: total.results ? total.spend / total.results : 0,
      };
    });
    const campaignPeriods = campaigns.map((campaign) => {
      const periods = periodTotals.get(campaign.id) || {
        history: { spend: 0, results: 0 }, month: { spend: 0, results: 0 }, week: { spend: 0, results: 0 },
      };
      const decorate = (value: { spend: number; results: number }) => ({
        ...value, cpl: value.results ? value.spend / value.results : null,
      });
      return {
        id: campaign.id, name: campaign.name, status: campaign.status,
        resultType: campaign.resultType || project.primaryConversion, location: campaign.location,
        history: decorate(periods.history), month: decorate(periods.month), week: decorate(periods.week),
      };
    });
    const useful = rows.filter((item) =>
      item.results >= 3
      && item.spend > 0
      && !item.resultType.toLocaleLowerCase("ru-RU").includes("другие результаты")
    );
    const groups = new Map<string, CampaignTotal[]>();
    for (const item of useful) {
      const key = `${item.resultType}::${item.location || "Все"}`;
      const group = groups.get(key) || [];
      group.push(item);
      groups.set(key, group);
    }
    const directions = [...groups.entries()].map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.cpl - b.cpl || b.results - a.results);
      const totals = items.reduce((sum, item) => ({
        spend: sum.spend + item.spend,
        results: sum.results + item.results,
      }), { spend: 0, results: 0 });
      return {
        key,
        name: directionName(sorted[0]),
        spend: totals.spend,
        results: totals.results,
        cpl: totals.results ? totals.spend / totals.results : 0,
        leader: sorted[0],
        runnerUp: sorted[1],
      };
    }).sort((a, b) => b.spend - a.spend);
    const best = directions.map((item) => item.leader);
    const tasks: Array<{ title: string; description: string; priority: "high" | "medium" | "low" }> = [];

    for (const direction of directions) {
      const leader = direction.leader;
      tasks.push({
        title: `${direction.name}: развить связку «${leader.name}»`,
        description: `В направлении «${direction.name}» лучший результат у кампании «${leader.name}»: ${leader.results.toLocaleString("ru-RU")} результатов по ${leader.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽. Создать отдельный тест с 2–3 новыми объявлениями, сохранив цель${leader.location ? ` и географию «${leader.location}»` : ""}; выделить 10–15% дневного бюджета и оценить после 3–5 результатов.`,
        priority: "medium",
      });
      if (direction.runnerUp) {
        tasks.push({
          title: `${direction.name}: сравнить две сильные кампании`,
          description: `Сравнить «${leader.name}» (${leader.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽) и «${direction.runnerUp.name}» (${direction.runnerUp.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽). Зафиксировать различия в предложении, аудитории и подаче; перенести один сильный элемент в новый контрольный тест.`,
          priority: "low",
        });
      }
    }
    const weak = rows
      .filter((item) => item.spend > 0 && (item.results === 0 || item.cpl > project.targetCpl * 1.3))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 5);
    if (weak.length) {
      tasks.push({
        title: "Разобрать кампании с дорогим результатом или расходом без результата",
        description: weak.map((item) =>
          `«${item.name}» [${directionName(item)}]: ${item.results ? `${item.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ за результат` : `нет результатов при расходе ${item.spend.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`}`
        ).join("; ") + ". Проверить цель, аудиторию, креатив и посадочную страницу отдельно по каждому направлению.",
        priority: "high",
      });
    }
    if (!tasks.length) {
      tasks.push({
        title: "Собрать больше статистики по каждому направлению",
        description: "Пока недостаточно кампаний минимум с тремя результатами. Не объединять разные цели и города: оценивать каждое направление отдельно после накопления данных.",
        priority: "low",
      });
    }
    const ai = await openAiJson<{
      summary: string;
      tasks: Array<{ title: string; description: string; priority: "high" | "medium" | "low" }>;
    }>(
      PROJECT_ANALYST_RULES,
      `Задача: сформируй наиболее сильный и конкретный план улучшения результатов проекта.
Верни JSON вида {"summary":"краткий главный вывод","tasks":[{"title":"...","description":"действие, доказательство, срок и критерий успеха","priority":"high|medium|low"}]}.
Дай 5–8 задач. Обязательно покрой каждое направление результата и каждый город, присутствующие в данных. Не повторяй одну задачу разными словами.

ДАННЫЕ ПРОЕКТА:
${JSON.stringify({
  project: { name: project.name, description: project.description, budget: project.monthlyBudget, targetCpl: project.targetCpl, primaryConversion: project.primaryConversion, kpi: [project.kpi1, project.kpi2, project.kpi3].filter(Boolean) },
  period: { history: { from: dateFrom, to: dateTo }, month: { from: monthFrom, to: dateTo }, week: { from: weekFrom, to: dateTo } },
  campaigns: rows,
  campaignPeriods,
  directions,
  calculatedCandidates: tasks,
})}`,
      { cacheKey: `recommendations:v2:${id}:${dateTo}`, reasoning: "medium", verbosity: "high", maxOutputTokens: 6000 },
    );
    return NextResponse.json({
      project: project.name,
      period: `вся доступная история VK: с ${dateFrom} по ${dateTo}`,
      analyzedCampaigns: rows.length,
      best,
      directions,
      summary: ai.summary,
      tasks: Array.isArray(ai.tasks) && ai.tasks.length ? ai.tasks : tasks,
      aiPowered: true,
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      readOnly: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сформировать рекомендации";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
