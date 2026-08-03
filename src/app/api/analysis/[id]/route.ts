import { NextResponse } from "next/server";
import { projects } from "@/config/seed";
import { getAdsProvider } from "@/integrations/vk-ads";
import { openAiJson, PROJECT_ANALYST_RULES } from "@/lib/ai/openai";

type Totals = { spend: number; results: number; impressions: number; clicks: number };

function emptyTotals(): Totals {
  return { spend: 0, results: 0, impressions: 0, clicks: 0 };
}

function add(total: Totals, row: { spend: number; results: number; impressions?: number; clicks?: number }) {
  total.spend += row.spend;
  total.results += row.results;
  total.impressions += row.impressions || 0;
  total.clicks += row.clicks || 0;
}

function metric(total: Totals) {
  return {
    ...total,
    cpl: total.results ? total.spend / total.results : 0,
    ctr: total.impressions ? total.clicks / total.impressions * 100 : 0,
  };
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
    const rows = (await provider.getStatistics({
      dateFrom,
      dateTo,
      campaignIds: campaigns.map((item) => item.id),
    })).rows;
    const campaignById = new Map(campaigns.map((item) => [item.id, item]));
    const periods = {
      history: emptyTotals(),
      month: emptyTotals(),
      week: emptyTotals(),
    };
    const byCampaign = new Map<string, { history: Totals; month: Totals; week: Totals }>();

    for (const row of rows) {
      if (!row.campaignId) continue;
      const item = byCampaign.get(row.campaignId) || {
        history: emptyTotals(), month: emptyTotals(), week: emptyTotals(),
      };
      add(periods.history, row); add(item.history, row);
      if (row.date >= monthFrom) { add(periods.month, row); add(item.month, row); }
      if (row.date >= weekFrom) { add(periods.week, row); add(item.week, row); }
      byCampaign.set(row.campaignId, item);
    }

    const campaignMetrics = campaigns.map((campaign) => {
      const values = byCampaign.get(campaign.id) || {
        history: emptyTotals(), month: emptyTotals(), week: emptyTotals(),
      };
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        resultType: campaign.resultType || project.primaryConversion,
        location: campaign.location,
        history: metric(values.history),
        month: metric(values.month),
        week: metric(values.week),
      };
    });
    const relevant = campaignMetrics.filter((item) =>
      !item.resultType.toLocaleLowerCase("ru-RU").includes("другие результаты")
    );
    const bestHistory = relevant.filter((item) => item.history.results >= 3).sort((a, b) => a.history.cpl - b.history.cpl)[0];
    const bestMonth = relevant.filter((item) => item.month.results >= 3).sort((a, b) => a.month.cpl - b.month.cpl)[0];
    const bestWeek = relevant.filter((item) => item.week.results >= 2).sort((a, b) => a.week.cpl - b.week.cpl)[0];
    const dormantWinners = relevant
      .filter((item) => item.history.results >= 5 && item.week.spend === 0)
      .sort((a, b) => a.history.cpl - b.history.cpl)
      .slice(0, 3);
    const deteriorated = relevant
      .filter((item) => item.history.results >= 5 && item.month.results >= 2 && item.month.cpl > item.history.cpl * 1.2)
      .sort((a, b) => (b.month.cpl / b.history.cpl) - (a.month.cpl / a.history.cpl))
      .slice(0, 3);
    const zeroResultSpend = relevant
      .filter((item) => item.month.spend > 0 && item.month.results === 0)
      .sort((a, b) => b.month.spend - a.month.spend)
      .slice(0, 3);
    const history = metric(periods.history);
    const month = metric(periods.month);
    const week = metric(periods.week);
    const conclusions: Array<{ status: "good" | "warning" | "critical"; title: string; detail: string }> = [];
    const tasks: Array<{ title: string; description: string; priority: "high" | "medium" | "low" }> = [];
    const directionGroups = new Map<string, typeof relevant>();
    for (const item of relevant) {
      const key = `${item.resultType}::${item.location || "Все"}`;
      const group = directionGroups.get(key) || [];
      group.push(item);
      directionGroups.set(key, group);
    }
    const directions = [...directionGroups.values()].map((items) => {
      const name = `${items[0].resultType}${items[0].location ? ` · ${items[0].location}` : ""}`;
      const totals = { history: emptyTotals(), month: emptyTotals(), week: emptyTotals() };
      for (const item of items) {
        add(totals.history, item.history);
        add(totals.month, item.month);
        add(totals.week, item.week);
      }
      const leader = [...items]
        .filter((item) => item.week.results >= 2 || item.month.results >= 3 || item.history.results >= 3)
        .sort((a, b) => {
          const aMetric = a.week.results >= 2 ? a.week : a.month.results >= 3 ? a.month : a.history;
          const bMetric = b.week.results >= 2 ? b.week : b.month.results >= 3 ? b.month : b.history;
          return aMetric.cpl - bMetric.cpl;
        })[0];
      return { name, history: metric(totals.history), month: metric(totals.month), week: metric(totals.week), leader };
    }).filter((item) => item.history.spend > 0 || item.month.spend > 0 || item.week.spend > 0);

    for (const direction of directions) {
      const current = direction.week.results ? direction.week : direction.month.results ? direction.month : direction.history;
      const baseline = direction.month.results ? direction.month : direction.history;
      const change = current.cpl && baseline.cpl ? (current.cpl / baseline.cpl - 1) * 100 : 0;
      conclusions.push({
        status: !current.results ? "critical" : change > 10 ? "critical" : change > 0 ? "warning" : "good",
        title: `Направление «${direction.name}»`,
        detail: `${current.results.toLocaleString("ru-RU")} результатов по ${current.cpl ? `${current.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽` : "—"} за ${direction.week.results ? "7 дней" : direction.month.results ? "месяц" : "доступную историю"}${direction.leader ? `; лучшая кампания — «${direction.leader.name}»` : ""}.`,
      });
      if (direction.leader) {
        const leaderMetric = direction.leader.week.results >= 2 ? direction.leader.week : direction.leader.month.results >= 3 ? direction.leader.month : direction.leader.history;
        tasks.push({
          title: `${direction.name}: отдельный план улучшения`,
          description: `Опорная кампания «${direction.leader.name}» — ${leaderMetric.results.toLocaleString("ru-RU")} результатов по ${leaderMetric.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽. Подготовить 2–3 новые подачи именно для направления «${direction.name}», запустить отдельным тестом и оценить после 3–5 результатов, не смешивая статистику с другими целями или городами.`,
          priority: current.results ? "medium" : "high",
        });
      }
    }

    if (month.cpl && history.cpl) {
      const change = (month.cpl / history.cpl - 1) * 100;
      conclusions.push({
        status: change <= 0 ? "good" : change <= 10 ? "warning" : "critical",
        title: Math.abs(change) < 1 ? "Месяц на уровне исторического результата" : change < 0 ? "Месяц эффективнее истории" : "Стоимость результата выросла",
        detail: `История: ${history.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽; месяц: ${month.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ (${change >= 0 ? "+" : ""}${change.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%).`,
      });
    }
    if (week.cpl && month.cpl) {
      const change = (week.cpl / month.cpl - 1) * 100;
      conclusions.push({
        status: change <= 0 ? "good" : change <= 10 ? "warning" : "critical",
        title: change <= 0 ? "Последняя неделя улучшилась" : "Последняя неделя просела",
        detail: `Месяц: ${month.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽; 7 дней: ${week.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ (${change >= 0 ? "+" : ""}${change.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%).`,
      });
    }
    if (bestWeek || bestMonth || bestHistory) {
      const leader = bestWeek || bestMonth || bestHistory!;
      const values = bestWeek ? leader.week : bestMonth ? leader.month : leader.history;
      conclusions.push({
        status: "good",
        title: `Сейчас лучше всего работает «${leader.name}»`,
        detail: `${leader.resultType}: ${values.results.toLocaleString("ru-RU")} результатов по ${values.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽${leader.location ? `, география — ${leader.location}` : ""}.`,
      });
    }
    if (dormantWinners.length) {
      conclusions.push({
        status: "warning",
        title: "Есть сильные кампании без свежего расхода",
        detail: dormantWinners.map((item) => `«${item.name}» — исторически ${item.history.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`).join("; "),
      });
      tasks.push({
        title: "Перезапустить исторически сильные кампании отдельным тестом",
        description: dormantWinners.map((item) => `«${item.name}» (${item.history.results} результатов по ${item.history.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽)`).join("; ") + ". Сделать копии, обновить 2–3 креатива и запустить на 10% дневного бюджета, не меняя исходные кампании.",
        priority: "high",
      });
    }
    if (deteriorated.length) {
      tasks.push({
        title: "Обновить креативы в просевших кампаниях",
        description: deteriorated.map((item) => `«${item.name}»: было ${item.history.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽, в этом месяце ${item.month.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`).join("; ") + ". Подготовить минимум 3 новые подачи, проверить частоту и разделить широкую и узкую аудитории.",
        priority: "high",
      });
    }
    if (zeroResultSpend.length) {
      tasks.push({
        title: "Остановить расход без результатов и разобрать причину",
        description: zeroResultSpend.map((item) => `«${item.name}» — ${item.month.spend.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ без результата`).join("; ") + ". Проверить цель оптимизации, ссылку, форму, аудиторию и соответствие объявления посадочной странице.",
        priority: "high",
      });
    }
    if (bestWeek || bestMonth) {
      const leader = bestWeek || bestMonth!;
      tasks.push({
        title: `Масштабировать текущего лидера «${leader.name}»`,
        description: "Если качество обращений подтверждено, увеличивать бюджет ступенями по 10–15% раз в 2–3 дня. После каждой ступени сравнивать CPL и CTR с текущим месяцем.",
        priority: "medium",
      });
    }
    if (!tasks.length) {
      tasks.push({
        title: "Продолжить текущий тест и накопить данные",
        description: "Явных просадок или остановленных сильных связок не найдено. Сохранить текущую структуру и повторить анализ после накопления минимум 5 результатов на кампанию.",
        priority: "low",
      });
    }

    const ai = await openAiJson<{
      conclusions: Array<{ status: "good" | "warning" | "critical"; title: string; detail: string }>;
      tasks: Array<{ title: string; description: string; priority: "high" | "medium" | "low" }>;
    }>(
      PROJECT_ANALYST_RULES,
      `Задача: объясни, почему получены именно такие результаты, а затем дай конкретный план действий.
Верни JSON вида {"conclusions":[{"status":"good|warning|critical","title":"...","detail":"факт, сравнение и объяснение"}],"tasks":[{"title":"...","description":"действие, доказательство, срок и критерий успеха","priority":"high|medium|low"}]}.
В conclusions должно быть 5–10 выводов: история против месяца, месяц против недели, каждое направление результата, каждый город, лидеры, просадки и ограничения данных. В tasks — 4–8 неповторяющихся действий.

ДАННЫЕ ПРОЕКТА:
${JSON.stringify({
  project: { name: project.name, description: project.description, budget: project.monthlyBudget, targetCpl: project.targetCpl, primaryConversion: project.primaryConversion, kpi: [project.kpi1, project.kpi2, project.kpi3].filter(Boolean) },
  period: { history: { from: dateFrom, to: dateTo }, month: { from: monthFrom, to: dateTo }, week: { from: weekFrom, to: dateTo } },
  totals: { history, month, week },
  directions,
  campaigns: campaignMetrics,
  calculatedCandidates: { conclusions, tasks },
})}`,
      { cacheKey: `analysis:${id}:${dateTo}`, reasoning: "medium", verbosity: "high", maxOutputTokens: 7000 },
    );

    return NextResponse.json({
      period: { history: `с ${dateFrom}`, month: `с ${monthFrom}`, week: `с ${weekFrom}` },
      metrics: { history, month, week },
      conclusions: Array.isArray(ai.conclusions) && ai.conclusions.length ? ai.conclusions : conclusions,
      tasks: Array.isArray(ai.tasks) && ai.tasks.length ? ai.tasks : tasks,
      aiPowered: true,
      model: process.env.OPENAI_MODEL || "gpt-5.6-terra",
      readOnly: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить анализ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
