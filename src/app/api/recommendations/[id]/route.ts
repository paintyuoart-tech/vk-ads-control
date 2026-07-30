import { NextResponse } from "next/server";
import { projects } from "@/config/seed";
import { getAdsProvider } from "@/integrations/vk-ads";

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
    const historyRows = (await provider.getStatistics({
      dateFrom,
      dateTo,
      campaignIds: campaigns.map((item) => item.id),
    })).rows;
    const totals = new Map<string, { spend: number; results: number }>();
    for (const row of historyRows) {
      if (!row.campaignId) continue;
      const total = totals.get(row.campaignId) || { spend: 0, results: 0 };
      total.spend += row.spend;
      total.results += row.results;
      totals.set(row.campaignId, total);
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
    const useful = rows.filter((item) =>
      item.results >= 3
      && item.spend > 0
      && !item.resultType.toLocaleLowerCase("ru-RU").includes("другие результаты")
    );
    const best = [...useful].sort((a, b) => a.cpl - b.cpl || b.results - a.results).slice(0, 3);
    const weak = rows
      .filter((item) => item.spend > 0 && (item.results === 0 || item.cpl > project.targetCpl * 1.3))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 3);
    const tasks: Array<{ title: string; description: string; priority: "high" | "medium" | "low" }> = [];

    if (best[0]) {
      const leader = best[0];
      tasks.push({
        title: `Запустить тест на основе «${leader.name}»`,
        description: `Сохранить цель «${leader.resultType}»${leader.location ? ` и географию «${leader.location}»` : ""}. Подготовить 2–3 новых объявления с тем же предложением и запустить отдельным тестом на 10–15% дневного бюджета. Историческая стоимость результата: ${leader.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽.`,
        priority: "high",
      });
      tasks.push({
        title: `Аккуратно масштабировать лучшую связку`,
        description: `Если качество обращений подтверждается, повышать бюджет кампании «${leader.name}» ступенями по 10–15% раз в 2–3 дня. После каждого изменения проверять, что стоимость результата не вышла за KPI.`,
        priority: "medium",
      });
    }
    if (best.length > 1) {
      tasks.push({
        title: "Собрать новый тест из сильных элементов",
        description: `Взять предложение и цель из «${best[0].name}», а дополнительный вариант аудитории или подачи — из «${best[1].name}». Не менять исходные кампании: создать отдельный тест и сравнить его с лидерами.`,
        priority: "medium",
      });
    }
    if (weak.length) {
      tasks.push({
        title: "Разобрать кампании с дорогим результатом",
        description: weak.map((item) =>
          `«${item.name}»: ${item.results ? `${item.cpl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽ за результат` : `нет результатов при расходе ${item.spend.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`}`
        ).join("; ") + ". Проверить аудиторию, объявление и посадочную страницу; не масштабировать до исправления.",
        priority: "high",
      });
    }
    if (!tasks.length) {
      tasks.push({
        title: "Собрать больше статистики",
        description: "Пока недостаточно кампаний минимум с тремя результатами. Продолжить текущие тесты и вернуться к сравнению после накопления данных.",
        priority: "low",
      });
    }

    return NextResponse.json({
      project: project.name,
      period: `вся доступная история VK: с ${dateFrom} по ${dateTo}`,
      analyzedCampaigns: rows.length,
      best,
      tasks,
      readOnly: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сформировать рекомендации";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
