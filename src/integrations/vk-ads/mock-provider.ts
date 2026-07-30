import { campaigns, daily } from "@/config/seed";
import type { VkAdsProvider, StatisticsParams } from "./provider";

export class MockVkAdsProvider implements VkAdsProvider {
  constructor(private readonly projectId: string) {}
  async validateConnection() { return { ok: true, accountId: `mock-${this.projectId}`, message: "Тестовое подключение активно" }; }
  async getCampaigns() { return campaigns.map((item) => ({ ...item, projectId: this.projectId })); }
  async getStatistics(params: StatisticsParams) { return { rows: daily, rawPayload: { source: "mock", projectId: this.projectId, period: params } }; }
}
