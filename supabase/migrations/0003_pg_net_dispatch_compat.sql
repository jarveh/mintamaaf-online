-- 0003: pg_net dispatch compatibility. Migration 0001's app_dispatch_job calls
-- net.http_post(url, body, headers, timeout_msec) by name, but the pg_net
-- version installed on the live project does not expose that signature, so the
-- dispatch raises "function net.http_post(...) does not exist". The error also
-- aborts the whole app_dispatch_due_jobs transaction, which silently defeats
-- the stale-job recovery UPDATEs that run before dispatch. Symptoms: jobs sit
-- in "queued" forever ("Waiting to begin" in the UI) and stale "running" jobs
-- are never re-queued.
--
-- Run in the Supabase SQL editor. Safe to re-run.
begin;

-- Install pg_net if the project somehow lacks it (no-op otherwise).
create extension if not exists pg_net;

-- Diagnostic (optional):
--   select oid::regprocedure from pg_proc
--   where pronamespace = 'net'::regnamespace and proname = 'http_post';

-- Dispatch one job to the worker endpoint, tolerating every pg_net signature
-- shipped on Supabase so far. Never raises: a failed dispatch must not abort
-- the sweep transaction or roll back the recovery UPDATEs that precede it.
create or replace function public.app_dispatch_job(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
  v_headers jsonb;
  v_body jsonb;
begin
  select value into v_url from public.app_config where key = 'worker_url';
  select value into v_secret from public.app_config where key = 'jobs_secret';
  if v_url is null or v_secret is null or v_url like 'CHANGE_ME%' or v_secret like 'CHANGE_ME%' then
    return;
  end if;

  v_body := jsonb_build_object('jobId', p_job_id);
  v_headers := jsonb_build_object('Content-Type', 'application/json', 'x-jobs-secret', v_secret);

  -- pg_net >= 0.10: (url, body, params, headers, timeout_msec)
  begin
    perform net.http_post(v_url, v_body, '{}'::jsonb, v_headers, 10000);
    return;
  exception when others then
    null;
  end;

  -- older pg_net: (url, body, timeout_milliseconds, headers)
  begin
    perform net.http_post(v_url, v_body, 10000, v_headers);
    return;
  exception when others then
    null;
  end;

  -- pg_net >= 0.10 named-order 4-arg: (url, body, headers, timeout_msec)
  begin
    perform net.http_post(v_url, v_body, v_headers, 10000);
    return;
  exception when others then
    null;
  end;

  -- minimal builds: (url, body, timeout) then (url, body)
  begin
    perform net.http_post(v_url, v_body, 10000);
    return;
  exception when others then
    begin
      perform net.http_post(v_url, v_body);
    exception when others then
      -- pg_net unusable; the cron sweep retries next minute.
      null;
    end;
  end;
end;
$$;

revoke all on function public.app_dispatch_job(uuid) from public, anon, authenticated;
grant execute on function public.app_dispatch_job(uuid) to service_role;

commit;
