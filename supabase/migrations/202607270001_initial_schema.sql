create extension if not exists pgcrypto;

create type public.project_status as enum ('healthy','warning','critical','stale','paused');
create type public.sync_status as enum ('success','error','running');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, slug text not null, status project_status not null default 'stale',
  color text not null default '#6c5ce7', description text,
  vk_account_id text, vk_profile text not null default 'default',
  connection_type text not null default 'mock' check (connection_type in ('mock','api')),
  credential_reference text, spreadsheet_id text, sheet_name text, asana_project_id text,
  target_cpl numeric not null default 0, daily_budget numeric not null default 0,
  monthly_budget numeric not null default 0, primary_conversion text not null default 'leads',
  last_sync_at timestamptz, last_sync_status sync_status, last_error text,
  created_at timestamptz not null default now(), unique(user_id, slug)
);
create table public.campaigns (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  external_id text not null, name text not null, status text, budget numeric, updated_at timestamptz default now(),
  unique(project_id, external_id)
);
create table public.daily_statistics (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete cascade, date date not null,
  spend numeric not null default 0, impressions bigint not null default 0, clicks bigint not null default 0,
  ctr numeric not null default 0, cpc numeric not null default 0, cpm numeric not null default 0,
  leads integer not null default 0, messages integer not null default 0, subscriptions integer not null default 0,
  conversions integer not null default 0, cost_per_lead numeric, cost_per_message numeric,
  cost_per_subscription numeric, raw_payload jsonb not null default '{}'::jsonb,
  unique(project_id, campaign_id, date)
);
create table public.control_rules (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  metric text not null, operator text not null, threshold numeric not null, comparison_period text,
  severity text not null, create_asana_task boolean not null default false, enabled boolean not null default true
);
create table public.sync_logs (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  started_at timestamptz not null default now(), completed_at timestamptz, status sync_status not null default 'running',
  records_received integer not null default 0, records_written integer not null default 0,
  error_message text, raw_response jsonb
);
create table public.recommendations (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
  title text not null, description text not null, severity text not null, source_metric text,
  status text not null default 'open', asana_task_id text, created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.campaigns enable row level security;
alter table public.daily_statistics enable row level security;
alter table public.control_rules enable row level security;
alter table public.sync_logs enable row level security;
alter table public.recommendations enable row level security;

grant select, insert, update, delete on public.profiles, public.projects, public.campaigns,
  public.daily_statistics, public.control_rules, public.sync_logs, public.recommendations
  to authenticated;

create policy "profiles_own" on public.profiles for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "projects_own" on public.projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "campaigns_via_project" on public.campaigns for all to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy "stats_via_project" on public.daily_statistics for all to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy "rules_via_project" on public.control_rules for all to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy "logs_via_project" on public.sync_logs for all to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())));
create policy "recommendations_via_project" on public.recommendations for all to authenticated using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid()))) with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=(select auth.uid())));

create index campaigns_project_idx on public.campaigns(project_id);
create index projects_user_idx on public.projects(user_id);
create index daily_statistics_project_date_idx on public.daily_statistics(project_id,date desc);
create index daily_statistics_campaign_idx on public.daily_statistics(campaign_id);
create index control_rules_project_idx on public.control_rules(project_id);
create index sync_logs_project_started_idx on public.sync_logs(project_id,started_at desc);
create index recommendations_project_status_idx on public.recommendations(project_id,status);
