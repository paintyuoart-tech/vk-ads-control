import "server-only";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CampaignMetric } from "@/types";
import type { StatisticsParams, StatisticsResult, VkAdsProvider } from "./provider";

function loadProjectEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), "../.env"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const value = line.trim();
      if (!value || value.startsWith("#")) continue;
      const i = value.indexOf("=");
      if (i > 0 && !process.env[value.slice(0, i)]) process.env[value.slice(0, i)] = value.slice(i + 1);
    }
  } catch { /* Hosted environments provide values directly. */ }
}

function profileKey(profile: string) {
  return profile === "default" ? "VK_ADS" : `VK_ADS_${profile.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function campaignResultType(objective: string, description: string) {
  const value = description.toLowerCase();
  if (value.includes("вступить") || value.includes("подпис")) return "Подписки";
  if (value.includes("написать") || value.includes("сообщен")) return "Сообщения";
  if (value.includes("лидформ") || objective === "leadads") return "Лиды";
  if (value.includes("покуп") || objective === "storeproductssales") return "Покупки";
  if (objective === "site_conversions") return "Конверсии";
  if (objective === "appinstalls") return "Установки";
  return "Другие результаты";
}

function detectCampaignLocation(targetings: unknown) {
  const value = targetings as { geo?: { regions?: number[]; local_geo?: { locations?: Array<{ label?: string }> } } } | undefined;
  const regions = value?.geo?.regions || [];
  if (regions.includes(5506)) return "Москва";
  if (regions.includes(5580)) return "Ярославль";
  const labels = (value?.geo?.local_geo?.locations || []).map((item) => item.label?.toLowerCase() || "").join(" ");
  if (labels.includes("москва")) return "Москва";
  if (labels.includes("ярослав")) return "Ярославль";
  return undefined;
}

export class ApiVkAdsProvider implements VkAdsProvider {
  private static readonly readOnlyPaths = [
    "/user.json",
    "/campaigns.json",
    "/packages.json",
    "/statistics/",
  ];
  private token: string;
  private accountId?: string;
  private base: string;
  private profile: string;

  constructor(profile: string) {
    loadProjectEnv();
    this.profile = profile;
    const key = profileKey(profile);
    this.token = process.env[`${key}_TOKEN`] || "";
    this.accountId = process.env[`${key}_ACCOUNT_ID`];
    this.base = (process.env.VK_ADS_API_BASE || "https://ads.vk.com/api/v2").replace(/\/$/, "");
  }

  private async request(path: string, retried = false): Promise<unknown> {
    if (!ApiVkAdsProvider.readOnlyPaths.some((allowedPath) => path.startsWith(allowedPath))) {
      throw new Error("VK Ads работает в режиме только чтения: изменяющие запросы запрещены");
    }
    if (!this.token) throw new Error("Ключ кабинета не найден");
    let response: Response;
    try {
      response = await fetch(`${this.base}${path}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      if (!retried) return this.request(path, true);
      throw error;
    }
    const payload: unknown = await response.json().catch(() => null);
    if (response.status === 429 && !retried) {
      const retryAfter = Math.min(5000, Math.max(1000, Number(response.headers.get("retry-after") || 2) * 1000));
      await new Promise((resolve) => setTimeout(resolve, retryAfter));
      return this.request(path, true);
    }
    if (response.status === 401 && !retried && this.profile === "default") {
      await this.refreshAccessToken();
      return this.request(path, true);
    }
    if (!response.ok) throw new Error(`VK Ads вернул ошибку ${response.status}`);
    return payload;
  }

  private async refreshAccessToken() {
    const clientId = process.env.VK_ADS_CLIENT_ID;
    const clientSecret = process.env.VK_ADS_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error("Токен VK Ads истёк, а OAuth credentials не найдены");
    const response = await fetch(`${this.base}/oauth2/token.json`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok || typeof payload?.access_token !== "string") throw new Error("Не удалось обновить токен VK Ads");
    this.token = payload.access_token;
    process.env.VK_ADS_TOKEN = payload.access_token;
  }

  async validateConnection() {
    const payload = await this.request("/user.json");
    return { ok: true, accountId: this.accountId, message: payload ? "Подключение подтверждено" : "Подключение активно" };
  }

  async getCampaigns(): Promise<CampaignMetric[]> {
    const rows: Array<Record<string, unknown>> = [];
    const limit = 250;
    for (let offset = 0; ; offset += limit) {
      const query = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        fields: "id,name,status,objective,package_id,targetings",
      });
      if (this.accountId) query.set("_user_id", this.accountId);
      let payload: {
        count?: number;
        items?: Array<Record<string, unknown>>;
      } | Array<Record<string, unknown>>;
      try {
        payload = await this.request(`/campaigns.json?${query}`) as typeof payload;
      } catch (error) {
        if (!this.accountId || !(error instanceof Error) || !error.message.includes("400")) throw error;
        query.delete("_user_id");
        payload = await this.request(`/campaigns.json?${query}`) as typeof payload;
      }
      const page = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
      rows.push(...page);
      const count = Array.isArray(payload) ? page.length : Number(payload.count || 0);
      if (page.length < limit || rows.length >= count) break;
    }
    const packageIds = [...new Set(rows.map((item) => Number(item.package_id)).filter(Boolean))];
    const packages = packageIds.length ? await this.request(
      `/packages.json?_id__in=${packageIds.join(",")}&fields=id,description`
    ) as { items?: Array<{ id: number; description?: string }> } : { items: [] };
    const descriptions = new Map((packages.items || []).map((item) => [item.id, item.description || ""]));
    return rows.map((item: Record<string, unknown>) => ({
      id: String(item.id), projectId: "", name: String(item.name || `Кампания ${item.id}`),
      status: item.status === "active" ? "active" : item.status === "paused" ? "paused" : "unknown",
      spend: 0, impressions: 0, clicks: 0, results: 0, cpl: 0, change: 0,
      resultType: campaignResultType(String(item.objective || ""), descriptions.get(Number(item.package_id)) || ""),
      location: detectCampaignLocation(item.targetings),
    }));
  }

  async getStatistics(params: StatisticsParams): Promise<StatisticsResult> {
    const campaignChunks = params.campaignIds?.length
      ? Array.from({ length: Math.ceil(params.campaignIds.length / 50) }, (_, index) =>
          params.campaignIds!.slice(index * 50, index * 50 + 50))
      : [undefined];
    const payloads: Array<{
      items?: Array<{ id: number | string; rows?: Array<{ date: string; base?: Record<string, unknown> }> }>;
    }> = [];
    for (const campaignIds of campaignChunks) {
      const query = new URLSearchParams({ date_from: params.dateFrom, date_to: params.dateTo });
      if (campaignIds?.length) query.set("id", campaignIds.join(","));
      payloads.push(await this.request(`/statistics/campaigns/day.json?${query}`) as {
        items?: Array<{ id: number | string; rows?: Array<{ date: string; base?: Record<string, unknown> }> }>;
      });
    }
    const payload = {
      items: payloads.flatMap((item) => item.items || []),
    } as {
      items?: Array<{ id: number | string; rows?: Array<{ date: string; base?: Record<string, unknown> }> }>;
    };
    const rows = (payload.items || []).flatMap((campaign) =>
      (campaign.rows || []).map((row) => {
        const base = row.base || {};
        const vk = (base.vk && typeof base.vk === "object" ? base.vk : {}) as Record<string, unknown>;
        const spend = Number(base.spent || 0);
        const results = Number(vk.result ?? vk.goals ?? base.goals ?? 0);
        return {
          date: row.date, campaignId: String(campaign.id), spend,
          impressions: Number(base.shows || 0), clicks: Number(base.clicks || 0),
          results, cpl: results ? spend / results : 0, rawPayload: row,
        };
      })
    );
    return { rows, rawPayload: payload };
  }
}

function resultType(objective: string, description: string) {
  const value = description.toLowerCase();
  if (value.includes("вступить") || value.includes("подпис")) return "Подписки";
  if (value.includes("написать") || value.includes("сообщен")) return "Сообщения";
  if (value.includes("лидформ") || objective === "leadads") return "Лиды";
  if (value.includes("покуп") || objective === "storeproductssales") return "Покупки";
  if (objective === "site_conversions") return "Конверсии";
  if (objective === "appinstalls") return "Установки";
  return "Другие результаты";
}

function campaignLocation(targetings: unknown) {
  const value = targetings as { geo?: { regions?: number[]; local_geo?: { locations?: Array<{ label?: string }> } } } | undefined;
  const regions = value?.geo?.regions || [];
  if (regions.includes(5506)) return "Москва";
  if (regions.includes(5580)) return "Ярославль";
  const labels = (value?.geo?.local_geo?.locations || []).map((item) => item.label?.toLowerCase() || "").join(" ");
  if (labels.includes("москва")) return "Москва";
  if (labels.includes("ярослав")) return "Ярославль";
  return undefined;
}
