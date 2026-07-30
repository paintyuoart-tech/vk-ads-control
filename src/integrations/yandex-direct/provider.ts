import "server-only";
import { loadEnvConfig } from "@next/env";
import type { CampaignMetric } from "@/types";
import type { VkAdsProvider, StatisticsParams, StatisticsResult } from "@/integrations/vk-ads/provider";
loadEnvConfig(process.cwd());
loadEnvConfig(`${process.cwd()}/..`);

type DirectConfig = { token: string; clientLogin: string; apiBase: string };

function getYandexDirectConfig(): DirectConfig {
  if (!process.env.YANDEX_DIRECT_TOKEN) throw new Error("Не задан токен Яндекс Директа");
  return {
    token: process.env.YANDEX_DIRECT_TOKEN,
    clientLogin: process.env.YANDEX_DIRECT_CLIENT_LOGIN || "",
    apiBase: process.env.YANDEX_DIRECT_API_BASE || "https://api.direct.yandex.com/json/v5",
  };
}

function headers(config: DirectConfig, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${config.token}`,
    "Client-Login": config.clientLogin,
    "Accept-Language": "ru",
    "Content-Type": "application/json; charset=utf-8",
    ...extra,
  };
}

async function directGet(service: string, params: unknown, config: DirectConfig) {
  const response = await fetch(`${config.apiBase}/${service}`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify({ method: "get", params }),
  });
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error?.error_detail || "Ошибка API Яндекс Директа");
  return payload.result;
}

const reportFields = ["Date", "CampaignId", "CampaignName", "Impressions", "Clicks", "Cost", "Conversions"];

async function report(params: StatisticsParams, config: DirectConfig): Promise<Record<string, unknown>[]> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${config.apiBase}/reports`, {
      method: "POST",
      headers: headers(config, { returnMoneyInMicros: "false", skipReportHeader: "true", skipReportSummary: "true", processingMode: "auto" }),
      body: JSON.stringify({ params: {
        SelectionCriteria: {
          DateFrom: params.dateFrom,
          DateTo: params.dateTo,
          ...(params.campaignIds?.length ? { Filter: [{ Field: "CampaignId", Operator: "IN", Values: params.campaignIds }] } : {}),
        },
        FieldNames: reportFields,
        ReportName: `dashboard_${config.clientLogin}_${Date.now()}`,
        ReportType: "CAMPAIGN_PERFORMANCE_REPORT",
        DateRangeType: "CUSTOM_DATE",
        Format: "TSV",
        IncludeVAT: "YES",
        IncludeDiscount: "NO",
      }}),
    });
    if (response.status === 201 || response.status === 202) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    const text = await response.text();
    if (!response.ok) throw new Error("Ошибка отчёта Яндекс Директа");
    return text.trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const cells = line.split("\t");
      return Object.fromEntries(reportFields.map((field, index) => [field, cells[index] === "--" ? null : cells[index]]));
    });
  }
  throw new Error("Отчёт Яндекс Директа ещё не готов");
}

function value(input: unknown): number {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
}

export class YandexDirectProvider implements VkAdsProvider {
  constructor(private readonly clientLogin: string, private readonly counterId?: string) {}

  private config() {
    return { ...getYandexDirectConfig(), clientLogin: this.clientLogin };
  }

  async validateConnection() {
    const result = await directGet("clients", { FieldNames: ["Login", "ClientId", "ClientInfo", "Archived"] }, this.config());
    const client = result?.Clients?.[0];
    return {
      ok: Boolean(client),
      accountId: client?.ClientId ? String(client.ClientId) : undefined,
      message: client ? `Подключён Яндекс Директ: ${client.ClientInfo || client.Login}` : "Кабинет не найден",
    };
  }

  async getCampaigns(): Promise<CampaignMetric[]> {
    const result = await directGet("campaigns", {
      SelectionCriteria: {},
      FieldNames: ["Id", "Name", "Status", "State", "Type", "StartDate", "EndDate", "Statistics"],
      Page: { Limit: 10000 },
    }, this.config());
    return (result?.Campaigns || []).map((campaign: Record<string, unknown>) => ({
      id: String(campaign.Id),
      projectId: this.clientLogin,
      name: String(campaign.Name || "Кампания"),
      status: campaign.State === "ON" ? "active" : campaign.State === "OFF" || campaign.Status === "SUSPENDED" ? "paused" : "unknown",
      spend: 0,
      impressions: 0,
      clicks: 0,
      results: 0,
      cpl: 0,
      change: 0,
      resultType: "Конверсии",
    }));
  }

  async getStatistics(params: StatisticsParams): Promise<StatisticsResult> {
    const raw = await report(params, this.config());
    return {
      rows: raw.map((row: Record<string, unknown>) => {
        const spend = value(row.Cost);
        const results = value(row.Conversions);
        return {
          date: String(row.Date),
          campaignId: String(row.CampaignId),
          spend,
          impressions: value(row.Impressions),
          clicks: value(row.Clicks),
          results,
          cpl: results > 0 ? spend / results : 0,
          rawPayload: row,
        };
      }),
      rawPayload: raw,
    };
  }

  async getMetrikaGoals(dateFrom: string, dateTo: string) {
    if (!this.counterId || !process.env.YANDEX_METRICA_TOKEN) return [];
    const authorization = { Authorization: `OAuth ${process.env.YANDEX_METRICA_TOKEN}`, "Accept-Language": "ru" };
    const goalsResponse = await fetch(`https://api-metrika.yandex.net/management/v1/counter/${this.counterId}/goals`, { headers: authorization });
    if (!goalsResponse.ok) throw new Error("Не удалось получить цели Яндекс Метрики");
    const goalsPayload = await goalsResponse.json();
    const goals = (goalsPayload.goals || []).filter((goal: Record<string, unknown>) => goal.id && goal.name);
    const result: Array<{ name: string; results: number }> = [];

    for (let offset = 0; offset < goals.length; offset += 10) {
      const chunk = goals.slice(offset, offset + 10);
      const url = new URL("https://api-metrika.yandex.net/stat/v1/data");
      url.searchParams.set("ids", this.counterId);
      url.searchParams.set("date1", dateFrom);
      url.searchParams.set("date2", dateTo);
      url.searchParams.set("dimensions", "ym:s:lastsignDirectClickOrder");
      url.searchParams.set("metrics", chunk.map((goal: Record<string, unknown>) => `ym:s:goal${goal.id}reaches`).join(","));
      url.searchParams.set("accuracy", "full");
      url.searchParams.set("limit", "10000");
      const response = await fetch(url, { headers: authorization });
      if (!response.ok) throw new Error("Не удалось получить статистику Яндекс Метрики");
      const payload = await response.json();
      const directRows = (payload.data || []).filter((row: Record<string, unknown>) => {
        const dimension = (row.dimensions as Array<Record<string, unknown>> | undefined)?.[0];
        return /^\d+$/.test(String(dimension?.id || dimension?.name || ""));
      });
      chunk.forEach((goal: Record<string, unknown>, index: number) => {
        const results = directRows.reduce((sum: number, row: Record<string, unknown>) => {
          const metrics = row.metrics as unknown[] | undefined;
          return sum + value(metrics?.[index]);
        }, 0);
        if (results > 0) result.push({ name: String(goal.name), results });
      });
    }
    return result;
  }
}
