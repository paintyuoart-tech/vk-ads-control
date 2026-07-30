import type { CampaignMetric, DailyMetric, Project, Recommendation, SyncLog } from "@/types";

export const projects: Project[] = [
  {
    id: "ks-otdelka-pomeshcheniy",
    name: "КС. Отделка помещений",
    slug: "ks-otdelka-pomeshcheniy",
    status: "stale",
    color: "#2563eb",
    description: "Реклама услуг по отделке помещений",
    vkProfile: "ks",
    vkAccountId: "1090883679",
    connectionType: "api",
    targetCpl: 900,
    dailyBudget: 1667,
    monthlyBudget: 50000,
    primaryConversion: "Сообщения",
    kpi1: "50 000 ₽ в месяц",
    kpi2: "900 ₽ за сообщение / 2 000 ₽ за лид",
    kpi3: "500 ₽ за сообщение / 1 500 ₽ за лид",
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
