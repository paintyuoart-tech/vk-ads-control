import type { CampaignMetric, DailyMetric } from "@/types";

export type ConnectionResult = { ok: boolean; accountId?: string; message: string };
export type StatisticsParams = { dateFrom: string; dateTo: string; campaignIds?: string[] };
export type StatisticsResult = { rows: DailyMetric[]; rawPayload: unknown };

export interface VkAdsProvider {
  validateConnection(): Promise<ConnectionResult>;
  getCampaigns(): Promise<CampaignMetric[]>;
  getStatistics(params: StatisticsParams): Promise<StatisticsResult>;
}
