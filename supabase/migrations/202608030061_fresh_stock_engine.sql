-- MEATOS Fresh Stock Engine MVP.
-- Non-destructive: adds policy, yield-learning and recommendation audit tables.
-- External supplier ordering is intentionally NOT performed (Shadow Mode).

create table if not exists public.fresh_stock_policy (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid references public.store(id) on delete cascade,
  product_key text not null,
  product_name text not null,
  policy_class text not null check (policy_class in ('F1_CORE_FRESH','F2_SHORT_LIFE_PROCESSED','F3_PREMIUM_INTERMITTENT','F4_FROZEN_BUFFER','F5_TRANSFORMABLE_RAW')),
  service_level numeric(5,4) not null default 0.90 check (service_level between 0.50 and 0.99),
  review_period_days numeric(8,2) not null default 1 check (review_period_days >= 0),
  lead_time_days numeric(8,2) not null default 1 check (lead_time_days > 0),
  lead_time_samples integer not null default 0 check (lead_time_samples >= 0),
  shelf_life_days integer not null default 5 check (shelf_life_days >= 1),
  pack_size_kg numeric(18,3) not null default 1 check (pack_size_kg > 0),
  moq_kg numeric(18,3) not null default 0 check (moq_kg >= 0),
  inventory_confidence numeric(5,4) not null default 0.70 check (inventory_confidence between 0 and 1),
  automation_level text not null default 'RECOMMEND' check (automation_level in ('OBSERVE','EXPLAIN','RECOMMEND','APPROVE_TO_EXECUTE','CONDITIONAL_AUTO')),
  auto_order_limit_krw numeric(18,2) not null default 0 check (auto_order_limit_krw >= 0),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (company_id, store_id, product_key)
);

create table if not exists public.fresh_yield_profile (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid references public.store(id) on delete cascade,
  input_product_key text not null,
  input_product_name text not null,
  output_product_name text not null,
  prior_key text not null check (prior_key in ('DIRECT_RETAIL','TRIM_STANDARD','BONE_IN_COMPLEX','MULTI_OUTPUT')),
  prior_yield_rate numeric(7,6) not null check (prior_yield_rate between 0 and 1),
  prior_min_rate numeric(7,6) not null check (prior_min_rate between 0 and 1),
  prior_max_rate numeric(7,6) not null check (prior_max_rate between 0 and 1),
  prior_equivalent_kg numeric(18,3) not null,
  learned_yield_rate numeric(7,6) not null,
  learned_loss_rate numeric(7,6) not null default 0,
  sample_count integer not null default 0,
  observed_input_kg numeric(18,3) not null default 0,
  observed_output_kg numeric(18,3) not null default 0,
  observed_loss_kg numeric(18,3) not null default 0,
  confidence_score numeric(5,4) not null default 0.25,
  model_source text not null default 'MEATOS_PRIOR',
  updated_at timestamptz not null default now(),
  unique nulls not distinct (company_id, store_id, input_product_key, output_product_name, prior_key)
);

create table if not exists public.fresh_yield_event (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid references public.store(id) on delete cascade,
  profile_id uuid references public.fresh_yield_profile(id) on delete set null,
  input_product_key text not null,
  input_product_name text not null,
  output_product_name text not null,
  prior_key text not null,
  input_weight_kg numeric(18,3) not null check (input_weight_kg > 0),
  output_weight_kg numeric(18,3) not null check (output_weight_kg >= 0),
  byproduct_weight_kg numeric(18,3) not null default 0 check (byproduct_weight_kg >= 0),
  loss_weight_kg numeric(18,3) not null default 0 check (loss_weight_kg >= 0),
  mass_balance_residual_rate numeric(9,6) not null,
  learning_status text not null check (learning_status in ('ACCEPTED','WARNING','REVIEW','EXCLUDED')),
  supplier_name text,
  work_date date not null default current_date,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.fresh_replenishment_recommendation (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.company(id) on delete cascade,
  store_id uuid references public.store(id) on delete cascade,
  product_key text not null,
  product_name text not null,
  policy_class text not null,
  available_qty_kg numeric(18,3) not null default 0,
  target_stock_kg numeric(18,3) not null default 0,
  recommended_order_kg numeric(18,3) not null default 0,
  approved_order_kg numeric(18,3),
  confidence_score numeric(5,4) not null default 0,
  decision_status text not null default 'RECOMMENDED' check (decision_status in ('RECOMMENDED','APPROVED','MODIFIED','REJECTED','EXPIRED')),
  reason_codes jsonb not null default '[]'::jsonb,
  decision_reason text,
  model_version text not null,
  generated_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);

create index if not exists fresh_stock_policy_company_product_idx on public.fresh_stock_policy(company_id, product_key);
create index if not exists fresh_yield_event_company_product_idx on public.fresh_yield_event(company_id, input_product_key, work_date desc);
create index if not exists fresh_replenishment_company_status_idx on public.fresh_replenishment_recommendation(company_id, decision_status, generated_at desc);

alter table public.fresh_stock_policy enable row level security;
alter table public.fresh_yield_profile enable row level security;
alter table public.fresh_yield_event enable row level security;
alter table public.fresh_replenishment_recommendation enable row level security;

drop policy if exists fresh_stock_policy_member_all on public.fresh_stock_policy;
create policy fresh_stock_policy_member_all on public.fresh_stock_policy for all to authenticated
  using (public.company_membership_allowed(company_id)) with check (public.company_membership_allowed(company_id));
drop policy if exists fresh_yield_profile_member_all on public.fresh_yield_profile;
create policy fresh_yield_profile_member_all on public.fresh_yield_profile for all to authenticated
  using (public.company_membership_allowed(company_id)) with check (public.company_membership_allowed(company_id));
drop policy if exists fresh_yield_event_member_all on public.fresh_yield_event;
create policy fresh_yield_event_member_all on public.fresh_yield_event for all to authenticated
  using (public.company_membership_allowed(company_id)) with check (public.company_membership_allowed(company_id));
drop policy if exists fresh_replenishment_member_all on public.fresh_replenishment_recommendation;
create policy fresh_replenishment_member_all on public.fresh_replenishment_recommendation for all to authenticated
  using (public.company_membership_allowed(company_id)) with check (public.company_membership_allowed(company_id));

create or replace function public.record_fresh_yield_observation(
  p_input_product_key text, p_input_product_name text, p_output_product_name text,
  p_prior_key text, p_input_weight_kg numeric, p_output_weight_kg numeric,
  p_byproduct_weight_kg numeric default 0, p_loss_weight_kg numeric default 0,
  p_supplier_name text default null, p_work_date date default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  a public.account%rowtype; target_store uuid; profile public.fresh_yield_profile%rowtype;
  prior_rate numeric; prior_min numeric; prior_max numeric; prior_kg numeric;
  residual numeric; event_status text; new_rate numeric; new_loss numeric; new_count integer; new_input numeric;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into a from public.account where auth_user_id=auth.uid() and member_status='APPROVED' and lower(status)='active' limit 1;
  if not found or a.company_id is null or not public.company_membership_allowed(a.company_id) then raise exception 'COMPANY_ACCESS_DENIED'; end if;
  target_store:=a.store_id;
  if target_store is null then select id into target_store from public.store where company_id=a.company_id and is_active order by is_default desc,created_at limit 1; end if;
  if coalesce(trim(p_input_product_key),'')='' or coalesce(trim(p_input_product_name),'')='' then raise exception 'PRODUCT_REQUIRED'; end if;
  if p_input_weight_kg<=0 or p_output_weight_kg<0 or coalesce(p_byproduct_weight_kg,0)<0 or coalesce(p_loss_weight_kg,0)<0 then raise exception 'INVALID_WEIGHT'; end if;
  select x.rate,x.min_rate,x.max_rate,x.equivalent_kg into prior_rate,prior_min,prior_max,prior_kg from (values
    ('DIRECT_RETAIL',0.96::numeric,0.90::numeric,0.99::numeric,30::numeric),('TRIM_STANDARD',0.88,0.78,0.96,50),
    ('BONE_IN_COMPLEX',0.75,0.60,0.88,70),('MULTI_OUTPUT',0.85,0.68,0.94,80)
  ) x(key,rate,min_rate,max_rate,equivalent_kg) where x.key=p_prior_key;
  if prior_rate is null then raise exception 'INVALID_PRIOR_KEY'; end if;
  residual:=abs(p_input_weight_kg-p_output_weight_kg-coalesce(p_byproduct_weight_kg,0)-coalesce(p_loss_weight_kg,0))/p_input_weight_kg;
  event_status:=case when residual<=0.02 then 'ACCEPTED' when residual<=0.05 then 'WARNING' when residual<=0.10 then 'REVIEW' else 'EXCLUDED' end;
  insert into public.fresh_yield_profile(company_id,store_id,input_product_key,input_product_name,output_product_name,prior_key,prior_yield_rate,prior_min_rate,prior_max_rate,prior_equivalent_kg,learned_yield_rate)
  values(a.company_id,target_store,trim(p_input_product_key),trim(p_input_product_name),trim(p_output_product_name),p_prior_key,prior_rate,prior_min,prior_max,prior_kg,prior_rate)
  on conflict(company_id,store_id,input_product_key,output_product_name,prior_key) do update set input_product_name=excluded.input_product_name,updated_at=now()
  returning * into profile;
  insert into public.fresh_yield_event(company_id,store_id,profile_id,input_product_key,input_product_name,output_product_name,prior_key,input_weight_kg,output_weight_kg,byproduct_weight_kg,loss_weight_kg,mass_balance_residual_rate,learning_status,supplier_name,work_date,created_by)
  values(a.company_id,target_store,profile.id,trim(p_input_product_key),trim(p_input_product_name),trim(p_output_product_name),p_prior_key,p_input_weight_kg,p_output_weight_kg,coalesce(p_byproduct_weight_kg,0),coalesce(p_loss_weight_kg,0),residual,event_status,nullif(trim(p_supplier_name),''),coalesce(p_work_date,current_date),auth.uid());
  if event_status in ('ACCEPTED','WARNING') then
    new_count:=profile.sample_count+1; new_input:=profile.observed_input_kg+p_input_weight_kg;
    new_rate:=greatest(prior_min,least(prior_max,(prior_rate*prior_kg+profile.observed_output_kg+p_output_weight_kg)/(prior_kg+new_input)));
    new_loss:=(profile.observed_loss_kg+coalesce(p_loss_weight_kg,0))/new_input;
    update public.fresh_yield_profile set sample_count=new_count,observed_input_kg=new_input,observed_output_kg=observed_output_kg+p_output_weight_kg,observed_loss_kg=observed_loss_kg+coalesce(p_loss_weight_kg,0),learned_yield_rate=new_rate,learned_loss_rate=new_loss,confidence_score=least(0.98,0.25+new_count::numeric/40+new_input/500),model_source=case when new_count>=30 then 'STORE_LEARNED' else 'BLENDED' end,updated_at=now() where id=profile.id;
  else new_count:=profile.sample_count; new_rate:=profile.learned_yield_rate; end if;
  return jsonb_build_object('ok',true,'eventStatus',event_status,'sampleCount',new_count,'learnedYieldRate',new_rate,'massBalanceResidualRate',residual);
end $$;

revoke all on function public.record_fresh_yield_observation(text,text,text,text,numeric,numeric,numeric,numeric,text,date) from public,anon;
grant execute on function public.record_fresh_yield_observation(text,text,text,text,numeric,numeric,numeric,numeric,text,date) to authenticated;
notify pgrst,'reload schema';
