-- Non-destructive upgrade of daily sanitation logs to the 10-item / 100-point scorecard.
-- Existing checkbox-era records remain readable; new scoring columns are nullable for compatibility.

alter table public.daily_sanitation_logs
  add column if not exists evaluation_items jsonb,
  add column if not exists total_score integer,
  add column if not exists ai_advice text,
  add column if not exists score_version text,
  add column if not exists finding_note text,
  add column if not exists corrective_action text;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'daily_sanitation_logs_total_score_check'
       and conrelid = 'public.daily_sanitation_logs'::regclass
  ) then
    alter table public.daily_sanitation_logs
      add constraint daily_sanitation_logs_total_score_check
      check (total_score is null or total_score between 10 and 100);
  end if;
end
$$;

create index if not exists daily_sanitation_logs_tenant_work_score_idx
  on public.daily_sanitation_logs (tenant_id, work_date desc, total_score);

comment on column public.daily_sanitation_logs.evaluation_items is
  'SANITATION-100-V1: ten scored items; rating 1=10, 2=5, 3=1.';
comment on column public.daily_sanitation_logs.total_score is
  'Daily sanitation score, maximum 100 points.';
comment on column public.daily_sanitation_logs.ai_advice is
  'Deterministic inspector-style advice generated from low-scoring items.';
