import { NextResponse } from "next/server";
import { projects } from "@/config/seed";
import { getAdsProvider } from "@/integrations/vk-ads";
import { openAiText, PROJECT_ANALYST_RULES } from "@/lib/ai/openai";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Total = { spend: number; results: number; impressions: number; clicks: number };

function emptyTotal(): Total {
  return { spend: 0, results: 0, impressions: 0, clicks: 0 };
}

function add(total: Total, row: { spend: number; results: number; impressions?: number; clicks?: number }) {
  total.spend += row.spend;
  total.results += row.results;
  total.impressions += row.impressions || 0;
  total.clicks += row.clicks || 0;
}

function present(total: Total) {
  return {
    ...total,
    costPerResult: total.results ? total.spend / total.results : null,
    ctr: total.impressions ? total.clicks / total.impressions * 100 : null,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = projects.find((item) => item.id === id);
  if (!project) return NextResponse.json({ error: "Проект не найден" }, { status: 404 });
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Ключ OpenAI API не настроен" }, { status: 503 });
  }

  try {
    const body = await request.json() as { messages?: ChatMessage[] };
    const messages = (body.messages || [])
      .filter((item) => (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
      .slice(-10)
      .map((item) => ({ ...item, content: item.content.slice(0, 4000) }));
    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ error: "Нужен вопрос пользователя" }, { status: 400 });
    }

    const provider = getAdsProvider(id);
    const campaigns = await provider.getCampaigns();
    const now = new Date();
    const dateTo = now.toISOString().slice(0, 10);
    const dateFrom = new Date(now.getTime() - 399 * 86400000).toISOString().slice(0, 10);
    const monthFrom = now.toISOString().slice(0, 8) + "01";
    const weekFrom = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
    const statistics = await provider.getStatistics({
      dateFrom,
      dateTo,
      campaignIds: campaigns.map((item) => item.id),
    });
    const periods = { history: emptyTotal(), month: emptyTotal(), week: emptyTotal() };
    const campaignTotals = new Map<string, { history: Total; month: Total; week: Total }>();

    for (const row of statistics.rows) {
      if (!row.campaignId) continue;
      const totals = campaignTotals.get(row.campaignId) || {
        history: emptyTotal(), month: emptyTotal(), week: emptyTotal(),
      };
      add(periods.history, row); add(totals.history, row);
      if (row.date >= monthFrom) { add(periods.month, row); add(totals.month, row); }
      if (row.date >= weekFrom) { add(periods.week, row); add(totals.week, row); }
      campaignTotals.set(row.campaignId, totals);
    }

    const campaignContext = campaigns.map((campaign) => {
      const totals = campaignTotals.get(campaign.id) || {
        history: emptyTotal(), month: emptyTotal(), week: emptyTotal(),
      };
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        resultType: campaign.resultType,
        location: campaign.location,
        history: present(totals.history),
        month: present(totals.month),
        week: present(totals.week),
      };
    }).sort((a, b) => b.month.spend - a.month.spend);
    const context = {
      project: {
        name: project.name,
        description: project.description,
        primaryConversion: project.primaryConversion,
        monthlyBudget: project.monthlyBudget,
        targetCpl: project.targetCpl,
        kpi: [project.kpi1, project.kpi2, project.kpi3].filter(Boolean),
      },
      periods: {
        availableHistory: { from: dateFrom, to: dateTo, ...present(periods.history) },
        currentMonth: { from: monthFrom, to: dateTo, ...present(periods.month) },
        last7Days: { from: weekFrom, to: dateTo, ...present(periods.week) },
      },
      campaigns: campaignContext,
    };
    const transcript = messages.map((item) =>
      `${item.role === "user" ? "Пользователь" : "ИИ"}: ${item.content}`
    ).join("\n\n");
    const answer = await openAiText(
      `${PROJECT_ANALYST_RULES}\nВ диалоге отвечай на текущий вопрос пользователя. Начни с прямого вывода, затем приведи доказательства и конкретные следующие действия. Если вопрос широкий, всё равно проверь все цели и города из контекста.`,
      `КОНТЕКСТ ПРОЕКТА:\n${JSON.stringify(context)}\n\nДИАЛОГ:\n${transcript}`,
      { reasoning: "medium", verbosity: "high", maxOutputTokens: 6000 },
    );
    return NextResponse.json({ answer, model: process.env.OPENAI_MODEL || "gpt-5.6-terra", aiPowered: true, readOnly: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось получить ответ ИИ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
