create index if not exists daily_statistics_campaign_idx
  on public.daily_statistics(campaign_id);
create index if not exists control_rules_project_idx
  on public.control_rules(project_id);
