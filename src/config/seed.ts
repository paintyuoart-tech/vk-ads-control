import type { CampaignMetric, DailyMetric, Project, Recommendation, SyncLog } from "@/types";

export const projects: Project[] = [
  {
    id: "demo-project",
    name: "Демонстрационный проект",
    slug: "demo-project",
    status: "stale",
    color: "#6254e8",
    description: "Замените этот проект на реальные проекты нового владельца",
    vkProfile: "demo",
    connectionType: "mock",
    targetCpl: 0,
    dailyBudget: 0,
    monthlyBudget: 0,
    primaryConversion: "Лиды",
    lastSyncStatus: "pending",
  },
];

export const projectSummaries: Record<string, {
  yesterday: number;
  month: number;
  results: number;
  cpl: number;
  change: number;
}> = {};

export const daily: DailyMetric[] = [];
export const campaigns: CampaignMetric[] = [];
export const recommendations: Recommendation[] = [];
export const syncLogs: SyncLog[] = [];
