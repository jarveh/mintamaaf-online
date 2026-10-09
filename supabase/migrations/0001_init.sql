-- Mintamaaf initial schema: blueprint.md §6 adapted for the Supabase stack.
-- Run via `supabase db push` or paste into the Supabase SQL editor (runs as postgres).
-- Tables below hold page/job/version/report records; HTML and screenshot artifacts
-- live in the private `pages` storage bucket created at the end of this file.
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- app_config: values the database-side dispatch needs. The two CHANGE_ME rows
-- must be edited (or updated later) before production dispatch works; the
-- dispatch functions no-op while they are unset.
--   worker_url  -> https://<your-deployment>/api/internal/jobs
--   jobs_secret -> exact same value as the JOBS_SECRET env var
-- ---------------------------------------------------------------------------
create table if not exists public.app_config (
  key text primary key,
  value text not null
);
insert into public.app_config (key, value) values
  ('worker_url', 'CHANGE_ME'),
  ('jobs_secret', 'CHANGE_ME'),
  ('max_concurrent_jobs', '1')
on conflict (key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- Core records (blueprint §6)
-- ---------------------------------------------------------------------------
create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  owner_hash text not null,
  prompt text not null,
  recipient_name text,
  sender_name text,
  tone text not null,
  language text not null default 'en',
  status text not null default 'draft' check (status in ('draft', 'published', 'unpublished', 'blocked')),
  latest_version integer not null default 0,
  active_version integer,
  revision_count integer not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  cleanup_at timestamptz not null
);
create index if not exists pages_cleanup_idx on public.pages (cleanup_at);

create table if not exists public.page_versions (
  page_id uuid not null references public.pages(id) on delete cascade,
  version integer not null,
  html_path text not null,
  screenshot_path text,
  provider text not null,
  project_id text,
  screen_id text,
  created_at timestamptz not null default now(),
  primary key (page_id, version)
);

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  kind text not null check (kind in ('create', 'revise')),
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  progress_label text not null default 'Waiting to begin',
  instruction text,
  error_code text,
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists generation_jobs_dispatch_idx on public.generation_jobs (status, next_attempt_at);

create table if not exists public.page_reports (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  scope text not null,
  period text not null,
  amount bigint not null default 0,
  primary key (scope, period)
);

create table if not exists public.idempotency_keys (
  owner_hash text not null,
  key text not null,
  job_id uuid not null,
  page_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (owner_hash, key)
);

-- ---------------------------------------------------------------------------
-- RLS: every table is server-side only (service_role bypasses RLS); deny
-- anon/authenticated entirely — there is no browser Supabase client.
-- ---------------------------------------------------------------------------
alter table public.app_config enable row level security;
alter table public.pages enable row level security;
alter table public.page_versions enable row level security;
alter table public.generation_jobs enable row level security;
alter table public.page_reports enable row level security;
alter table public.usage_counters enable row level security;
alter table public.idempotency_keys enable row level security;

revoke all on public.app_config from anon, authenticated;
revoke all on public.pages from anon, authenticated;
revoke all on public.page_versions from anon, authenticated;
revoke all on public.generation_jobs from anon, authenticated;
revoke all on public.page_reports from anon, authenticated;
revoke all on public.usage_counters from anon, authenticated;
revoke all on public.idempotency_keys from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs used by the app (service_role only)
-- ---------------------------------------------------------------------------
create or replace function public.bump_counter(p_scope text, p_period text, p_amount bigint default 1)
returns bigint
language sql
security definer
set search_path = ''
as $$
  insert into public.usage_counters (scope, period, amount)
  values (p_scope, p_period, p_amount)
  on conflict (scope, period) do update set amount = public.usage_counters.amount + excluded.amount
  returning amount;
$$;

-- Atomically move a queued, due job to running. Returns null when the job is
-- unknown, already finished, not yet due, or the concurrency cap is reached.
create or replace function public.claim_job(p_job_id uuid)
returns public.generation_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_jobs integer;
  v_running integer;
  v_job public.generation_jobs;
begin
  perform pg_advisory_xact_lock(hashtext('mintamaaf-job-claim'));

  select coalesce(nullif(value, '')::int, 1) into v_max_jobs from public.app_config where key = 'max_concurrent_jobs';
  select count(*) into v_running from public.generation_jobs where status = 'running';
  if v_running >= coalesce(v_max_jobs, 1) then
    return null;
  end if;

  update public.generation_jobs
    set status = 'running', locked_at = now(), attempts = attempts + 1
    where id = p_job_id
      and status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
    returning * into v_job;
  return v_job;
end;
$$;

-- Fire-and-forget dispatch of one job to the worker endpoint. No-ops while
-- app_config still holds CHANGE_ME placeholders, so local/inline setups work
-- without configuring it.
create or replace function public.app_dispatch_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_config where key = 'worker_url';
  select value into v_secret from public.app_config where key = 'jobs_secret';
  if v_url is null or v_secret is null or v_url like 'CHANGE_ME%' or v_secret like 'CHANGE_ME%' then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('jobId', p_job_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', v_secret),
    timeout_msec := 10000
  );
end;
$$;

-- Cron sweep: re-queue jobs whose worker died mid-run (attempts < 3), fail
-- those that exhausted retries, then dispatch due queued jobs up to the cap.
create or replace function public.app_dispatch_due_jobs()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_jobs integer;
  v_running integer;
  v_due record;
begin
  perform pg_advisory_xact_lock(hashtext('mintamaaf-job-claim'));

  update public.generation_jobs
    set status = 'failed', error_code = 'GENERATION_TIMEOUT', finished_at = now()
    where status = 'running' and locked_at < now() - interval '15 minutes' and attempts >= 3;

  update public.generation_jobs
    set status = 'queued', locked_at = null, next_attempt_at = now()
    where status = 'running' and locked_at < now() - interval '15 minutes' and attempts < 3;

  select coalesce(nullif(value, '')::int, 1) into v_max_jobs from public.app_config where key = 'max_concurrent_jobs';
  select count(*) into v_running from public.generation_jobs where status = 'running';

  for v_due in
    select id from public.generation_jobs
    where status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
    order by created_at
    limit greatest(coalesce(v_max_jobs, 1) - v_running, 0)
  loop
    perform public.app_dispatch_job(v_due.id);
  end loop;
end;
$$;

revoke all on function public.bump_counter(text, text, bigint) from public, anon, authenticated;
revoke all on function public.claim_job(uuid) from public, anon, authenticated;
revoke all on function public.app_dispatch_job(uuid) from public, anon, authenticated;
revoke all on function public.app_dispatch_due_jobs() from public, anon, authenticated;
grant execute on function public.bump_counter(text, text, bigint) to service_role;
grant execute on function public.claim_job(uuid) to service_role;
grant execute on function public.app_dispatch_job(uuid) to service_role;
grant execute on function public.app_dispatch_due_jobs() to service_role;

-- Minute sweep for retries and missed dispatches (immediate dispatch happens
-- from the app via app_dispatch_job on enqueue).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'mintamaaf-dispatch-jobs') then
    perform cron.schedule('mintamaaf-dispatch-jobs', '* * * * *', 'select public.app_dispatch_due_jobs()');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for generated HTML + screenshots. No storage
-- policies on purpose — only the service role may read/write.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pages', 'pages', false)
on conflict (id) do nothing;

commit;
