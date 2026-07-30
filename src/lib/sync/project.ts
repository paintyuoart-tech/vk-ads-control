import "server-only";
import { projects as projectConfig } from "@/config/seed";
import { getAdsProvider } from "@/integrations/vk-ads";
import { createClient } from "@/lib/supabase/server";

export async function syncProject(projectSlug: string) {
  const config = projectConfig.find((item) => item.slug === projectSlug);
  if (!config) throw new Error("Проект не найден в конфигурации");

  const supabase = await createClient();
  if (!supabase) throw new Error("Supabase не настроен");
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Требуется вход");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .eq("slug", projectSlug)
    .single();
  if (projectError || !project) throw new Error("Проект не найден в Supabase");

  const startedAt = new Date().toISOString();
  const { data: log } = await supabase
    .from("sync_logs")
    .insert({ project_id: project.id, started_at: startedAt, status: "running" })
    .select("id")
    .single();

  try {
    const provider = getAdsProvider(config.id);
    const connection = await provider.validateConnection();
    const campaigns = await provider.getCampaigns();

    const rows = campaigns.map((item) => ({
      project_id: project.id,
      external_id: item.id,
      name: item.name,
      status: item.status,
      budget: item.spend || null,
      result_type: item.resultType || "Конверсии",
      location: item.location || null,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length) {
      const { error } = await supabase.from("campaigns").upsert(rows, { onConflict: "project_id,external_id" });
      if (error) throw error;
    }
    const dateTo = new Date().toISOString().slice(0, 10);
    const statistics = await provider.getStatistics({
      dateFrom: `${dateTo.slice(0, 8)}01`,
      dateTo,
      campaignIds: campaigns.map((item) => item.id),
    });
    const { data: savedCampaigns, error: savedCampaignsError } = await supabase
      .from("campaigns").select("id,external_id,result_type").eq("project_id", project.id);
    if (savedCampaignsError) throw savedCampaignsError;
    const campaignDetails = new Map((savedCampaigns || []).map((item) => [
      item.external_id,
      { id: item.id, resultType: item.result_type || "Конверсии" },
    ]));
    const statsRows = statistics.rows.flatMap((item) => {
      const campaign = item.campaignId ? campaignDetails.get(item.campaignId) : undefined;
      if (!campaign) return [];
      const resultType = campaign.resultType;
      return [{
        project_id: project.id, campaign_id: campaign.id, date: item.date,
        spend: item.spend, impressions: item.impressions || 0, clicks: item.clicks || 0,
        ctr: item.impressions ? ((item.clicks || 0) / item.impressions) * 100 : 0,
        cpc: item.clicks ? item.spend / item.clicks : 0,
        cpm: item.impressions ? (item.spend / item.impressions) * 1000 : 0,
        leads: resultType === "Лиды" ? item.results : 0,
        messages: resultType === "Сообщения" ? item.results : 0,
        subscriptions: resultType === "Подписки" ? item.results : 0,
        conversions: item.results,
        cost_per_lead: item.cpl || null, raw_payload: item.rawPayload || {},
      }];
    });
    if (statsRows.length) {
      for (let index = 0; index < statsRows.length; index += 500) {
        const { error } = await supabase.from("daily_statistics")
          .upsert(statsRows.slice(index, index + 500), { onConflict: "project_id,campaign_id,date" });
        if (error) throw error;
      }
    }

    const completedAt = new Date().toISOString();
    await supabase.from("projects").update({
      status: "healthy", last_sync_at: completedAt, last_sync_status: "success", last_error: null,
    }).eq("id", project.id);
    if (log) await supabase.from("sync_logs").update({
      completed_at: completedAt, status: "success", records_received: rows.length,
      records_written: rows.length + statsRows.length,
      raw_response: { connection, source: config.connectionType, statistics: statsRows.length },
    }).eq("id", log.id);

    return { ok: true, projectId: projectSlug, mode: config.connectionType, recordsReceived: rows.length + statistics.rows.length, recordsWritten: rows.length + statsRows.length };
  } catch (error) {
    const message = formatError(error);
    const completedAt = new Date().toISOString();
    await supabase.from("projects").update({
      status: "critical", last_sync_at: completedAt, last_sync_status: "error", last_error: message,
    }).eq("id", project.id);
    if (log) await supabase.from("sync_logs").update({
      completed_at: completedAt, status: "error", error_message: message,
    }).eq("id", log.id);
    throw error;
  }
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return "Ошибка синхронизации";
}
