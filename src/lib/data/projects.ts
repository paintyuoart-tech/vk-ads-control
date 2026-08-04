import "server-only";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { projects as fallbackProjects } from "@/config/seed";
import { getAdsProvider } from "@/integrations/vk-ads";
import { getRussianHeightMeasurements } from "@/integrations/vk-community/russian-height";
import { createClient } from "@/lib/supabase/server";
import type { Project } from "@/types";

type Goal = { results: number; spend: number };
const CURRENT_PROJECTS_CACHE_MS = 60_000;

type CurrentProjectsCacheEntry = {
  expiresAt: number;
  value?: Project[];
  pending?: Promise<Project[]>;
};

const currentProjectsCache = new Map<string, CurrentProjectsCacheEntry>();

function projectCacheFile(id: string) {
  return resolve(process.cwd(), ".runtime-cache", `project-${id}.json`);
}

function saveProjectCache(project: Project) {
  try {
    const file = projectCacheFile(project.id);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(project), "utf8");
  } catch {
    // The dashboard still works in hosted runtimes with a read-only filesystem.
  }
}

function loadProjectCache(id: string) {
  try {
    return JSON.parse(readFileSync(projectCacheFile(id), "utf8")) as Project;
  } catch {
    return undefined;
  }
}

async function getLiveFallbackProjects(): Promise<Project[]> {
  return Promise.all(fallbackProjects.map(async (project) => {
    if (project.connectionType === "mock") return project;
    try {
      const provider = getAdsProvider(project.id);
      await provider.validateConnection();
      const campaigns = await provider.getCampaigns();
      const now = new Date();
      const monthStart = now.toISOString().slice(0, 8) + "01";
      const weekStart = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
      const dateTo = now.toISOString().slice(0, 10);
      const [monthly, weekly] = await Promise.all([
        provider.getStatistics({ dateFrom: monthStart, dateTo, campaignIds: campaigns.map((item) => item.id) }),
        provider.getStatistics({ dateFrom: weekStart, dateTo, campaignIds: campaigns.map((item) => item.id) }),
      ]);
      const campaignById = new Map(campaigns.map((item) => [item.id, item]));

      const aggregate = (rows: typeof monthly.rows) => {
        const goals: Record<string, Goal> = {};
        const locations: Record<string, { spend: number; goals: Record<string, Goal> }> = {};
        let spend = 0;
        let impressions = 0;
        let clicks = 0;
        for (const row of rows) {
          spend += row.spend;
          impressions += row.impressions || 0;
          clicks += row.clicks || 0;
          const campaign = campaignById.get(row.campaignId || "");
          const goalName = campaign?.resultType || project.primaryConversion;
          goals[goalName] ||= { results: 0, spend: 0 };
          goals[goalName].results += row.results;
          goals[goalName].spend += row.spend;
          if (campaign?.location) {
            locations[campaign.location] ||= { spend: 0, goals: {} };
            locations[campaign.location].spend += row.spend;
            locations[campaign.location].goals[goalName] ||= { results: 0, spend: 0 };
            locations[campaign.location].goals[goalName].results += row.results;
            locations[campaign.location].goals[goalName].spend += row.spend;
          }
        }
        return { spend, impressions, clicks, goals, locations };
      };

      const month = aggregate(monthly.rows);
      const week = aggregate(weekly.rows);
      if (project.id === "russian-height") {
        try {
          const measurements = await getRussianHeightMeasurements();
          month.goals["Замеры"] = { results: measurements.month, spend: month.spend };
          week.goals["Замеры"] = { results: measurements.week, spend: week.spend };
          if (measurements.needsReviewMonth > 0) {
            month.goals["Диалоги на проверку"] = { results: measurements.needsReviewMonth, spend: 0 };
          }
          if (measurements.needsReviewWeek > 0) {
            week.goals["Диалоги на проверку"] = { results: measurements.needsReviewWeek, spend: 0 };
          }
        } catch {
          // Advertising statistics stay available if the community API is temporarily unavailable.
        }
      }
      const currentProject = {
        ...project,
        status: "healthy" as const,
        lastSyncAt: new Date().toISOString(),
        lastSyncStatus: "success" as const,
        metrics: {
          spend: month.spend,
          impressions: month.impressions,
          clicks: month.clicks,
          results: Object.values(month.goals).reduce((sum, goal) => sum + goal.results, 0),
          goals: month.goals,
          locations: project.id === "emalis" ? month.locations : undefined,
          weeklySpend: week.spend,
          weeklyGoals: week.goals,
          weeklyLocations: project.id === "emalis" ? week.locations : undefined,
        },
      } satisfies Project;
      saveProjectCache(currentProject);
      return currentProject;
    } catch {
      const saved = loadProjectCache(project.id);
      if (saved) return { ...saved, status: "warning" as const, lastSyncStatus: "error" as const };
      return { ...project, status: "critical" as const, lastSyncStatus: "error" as const };
    }
  }));
}

export function invalidateCurrentProjectsCache() {
  currentProjectsCache.clear();
}

async function loadSupabaseCurrentProjects(
  client: NonNullable<Awaited<ReturnType<typeof createClient>>>,
  ownerId: string,
): Promise<Project[]> {
  const { data, error } = await client.from("projects").select("*").order("created_at");
  if (error || !data?.length) return getLiveFallbackProjects();

  const now = new Date();
  const weekStart = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const { data: summaries, error: summaryError } = await client.rpc("get_dashboard_project_totals", {
    month_start: now.toISOString().slice(0, 8) + "01",
    week_start: weekStart,
    owner_id: ownerId,
  });
  const summaryBySlug = new Map(
    (summaryError ? [] : summaries || []).map((row: Record<string, unknown>) => [String(row.slug), row]),
  );
  const { data: goalRows } = await client.rpc("get_dashboard_goal_totals", {
    month_start: now.toISOString().slice(0, 8) + "01",
    week_start: weekStart,
    owner_id: ownerId,
  });
  const goalsBySlug = new Map<string, Record<string, Goal>>();
  const weeklyGoalsBySlug = new Map<string, Record<string, Goal>>();
  for (const row of (goalRows || []) as Record<string, unknown>[]) {
    const slug = String(row.slug);
    const name = String(row.goal_name);
    const monthly = goalsBySlug.get(slug) || {};
    const weekly = weeklyGoalsBySlug.get(slug) || {};
    const results = Number(row.results || 0);
    const weeklyResults = Number(row.weekly_results || 0);
    if (results > 0) monthly[name] = { results, spend: Number(row.spend || 0) };
    if (weeklyResults > 0 || Number(row.weekly_spend || 0) > 0) {
      weekly[name] = { results: weeklyResults, spend: Number(row.weekly_spend || 0) };
    }
    goalsBySlug.set(slug, monthly);
    weeklyGoalsBySlug.set(slug, weekly);
  }
  const { data: locationRows } = await client.rpc("get_dashboard_location_totals", {
    month_start: now.toISOString().slice(0, 8) + "01",
    week_start: weekStart,
    owner_id: ownerId,
  });
  const locations: Record<string, { spend: number; goals: Record<string, Goal> }> = {};
  const weeklyLocations: Record<string, { spend: number; goals: Record<string, Goal> }> = {};
  for (const row of (locationRows || []) as Record<string, unknown>[]) {
    const city = String(row.location);
    const goalName = String(row.goal_name);
    const spend = Number(row.spend || 0);
    const results = Number(row.results || 0);
    const weeklySpend = Number(row.weekly_spend || 0);
    const weeklyResults = Number(row.weekly_results || 0);
    locations[city] ||= { spend: 0, goals: {} };
    weeklyLocations[city] ||= { spend: 0, goals: {} };
    locations[city].spend += spend;
    weeklyLocations[city].spend += weeklySpend;
    if (results > 0) locations[city].goals[goalName] = { spend, results };
    if (weeklyResults > 0) weeklyLocations[city].goals[goalName] = { spend: weeklySpend, results: weeklyResults };
  }

  return data.map((item) => {
    const summary = summaryBySlug.get(item.slug);
    const goals = goalsBySlug.get(item.slug) || {};
    const weeklyGoals = weeklyGoalsBySlug.get(item.slug) || {};
    const results = Object.values(goals).reduce((sum, goal) => sum + goal.results, 0);

    return {
      id: item.slug,
      name: item.name,
      slug: item.slug,
      status: item.status,
      color: item.color,
      description: item.description || "",
      vkProfile: item.vk_profile,
      vkAccountId: item.vk_account_id || undefined,
      connectionType: item.connection_type,
      spreadsheetId: item.spreadsheet_id || undefined,
      sheetName: item.sheet_name || undefined,
      asanaProjectId: item.asana_project_id || undefined,
      targetCpl: Number(item.target_cpl),
      dailyBudget: Number(item.daily_budget),
      monthlyBudget: Number(item.monthly_budget),
      primaryConversion: item.primary_conversion,
      kpi1: item.kpi_1 || undefined,
      kpi2: item.kpi_2 || undefined,
      kpi3: item.kpi_3 || undefined,
      lastSyncAt: item.last_sync_at || undefined,
      lastSyncStatus: item.last_sync_status || "pending",
      metrics: summary ? {
        spend: Number(summary.spend || 0),
        impressions: Number(summary.impressions || 0),
        clicks: Number(summary.clicks || 0),
        results,
        goals,
        locations: item.slug === "emalis" ? locations : undefined,
        weeklySpend: Number(summary.weekly_spend || 0),
        weeklyGoals,
        weeklyLocations: item.slug === "emalis" ? weeklyLocations : undefined,
      } : undefined,
    } satisfies Project;
  });
}

async function getCachedCurrentProjects(cacheKey: string, loader: () => Promise<Project[]>): Promise<Project[]> {
  const now = Date.now();
  const cached = currentProjectsCache.get(cacheKey);
  if (cached?.value && cached.expiresAt > now) {
    return cached.value;
  }
  if (cached?.pending) return cached.pending;

  const pending = loader()
    .then((value) => {
      currentProjectsCache.set(cacheKey, { value, expiresAt: Date.now() + CURRENT_PROJECTS_CACHE_MS });
      return value;
    })
    .catch((error) => {
      currentProjectsCache.delete(cacheKey);
      throw error;
    });

  currentProjectsCache.set(cacheKey, { pending, expiresAt: now + CURRENT_PROJECTS_CACHE_MS });
  return pending;
}

export async function getCurrentProjects(): Promise<Project[]> {
  const client = await createClient();
  if (!client) return getCachedCurrentProjects("fallback", getLiveFallbackProjects);

  const { data: { user } } = await client.auth.getUser();
  if (!user) return getCachedCurrentProjects("fallback", getLiveFallbackProjects);

  return getCachedCurrentProjects(`user:${user.id}`, () => loadSupabaseCurrentProjects(client, user.id));
}
