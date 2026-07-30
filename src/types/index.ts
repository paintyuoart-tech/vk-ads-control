export type ProjectStatus = "healthy" | "warning" | "critical" | "stale" | "paused";

export type Project = {
  id: string;
  name: string;
  slug: string;
  status: ProjectStatus;
  color: string;
  description: string;
  vkProfile: string;
  vkAccountId?: string;
  connectionType: "mock" | "api" | "yandex";
  spreadsheetId?: string;
  sheetName?: string;
  asanaProjectId?: string;
  targetCpl: number;
  dailyBudget: number;
  monthlyBudget: number;
  primaryConversion: string;
  kpi1?: string;
  kpi2?: string;
  kpi3?: string;
  lastSyncAt?: string;
  lastSyncStatus: "success" | "error" | "pending";
  metrics?: {
    spend: number; impressions: number; clicks: number; results: number;
    goals?: Record<string, { results: number; spend: number }>;
    locations?: Record<string, { spend: number; goals: Record<string, { results: number; spend: number }> }>;
    weeklySpend?: number;
    weeklyGoals?: Record<string, { results: number; spend: number }>;
    weeklyLocations?: Record<string, { spend: number; goals: Record<string, { results: number; spend: number }> }>;
  };
};

export type CampaignMetric = {
  id: string;
  projectId: string;
  name: string;
  status: "active" | "paused" | "unknown";
  spend: number;
  impressions: number;
  clicks: number;
  results: number;
  cpl: number;
  change: number;
  resultType?: string;
  location?: string;
};

export type DailyMetric = {
  date: string;
  spend: number;
  impressions?: number;
  clicks?: number;
  results: number;
  cpl: number;
  campaignId?: string;
  rawPayload?: unknown;
};

export type Recommendation = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  status: "open" | "resolved" | "ignored";
  metric: string;
};

export type SyncLog = {
  id: string;
  projectId: string;
  projectName: string;
  startedAt: string;
  status: "success" | "error" | "running";
  received: number;
  written: number;
  message?: string;
};
