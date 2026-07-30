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
  {
    id: "quarta",
    name: "Quarta",
    slug: "quarta",
    status: "stale",
    color: "#f59e0b",
    description: "Рекламный проект Quarta",
    vkProfile: "quarta",
    vkAccountId: "30737452",
    connectionType: "api",
    targetCpl: 30,
    dailyBudget: 3000,
    monthlyBudget: 90000,
    primaryConversion: "Подписки",
    kpi1: "90 000 ₽ в месяц",
    kpi2: "Подписчик до 30 ₽",
    kpi3: "Сообщение в сообщество до 200 ₽",
    lastSyncStatus: "pending",
  },
  {
    id: "hut",
    name: "HUT",
    slug: "hut",
    status: "stale",
    color: "#10b981",
    description: "Рекламный проект HUT",
    vkProfile: "hut",
    vkAccountId: "30615001",
    connectionType: "api",
    targetCpl: 30,
    dailyBudget: 3000,
    monthlyBudget: 90000,
    primaryConversion: "Подписки",
    kpi1: "90 000 ₽ в месяц",
    kpi2: "Подписчик до 30 ₽",
    kpi3: "Сообщение в сообщество до 200 ₽",
    lastSyncStatus: "pending",
  },
  {
    id: "emalis",
    name: "Эмалис",
    slug: "emalis",
    status: "stale",
    color: "#ec4899",
    description: "Рекламный проект Эмалис",
    vkProfile: "emalis",
    vkAccountId: "29867480",
    connectionType: "api",
    targetCpl: 400,
    dailyBudget: 2667,
    monthlyBudget: 80000,
    primaryConversion: "Сообщения",
    kpi1: "80 000 ₽ в месяц, с НДС",
    kpi2: "400 ₽ за сообщение",
    kpi3: "600 ₽ за сообщение",
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
