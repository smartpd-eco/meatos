-- Impact: expiry-date alert system. Adds expiry_policy (권장 유통기한 기준표) and
-- slaughter_date/expiry_date columns on inventory_movement. RLS off to match schema.

create table if not exists public.expiry_policy (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant_master(id) on delete cascade,
  species text not null,                 -- 소 / 돼지 / 닭
  part_name text not null default '전부위',
  storage_type text not null check (storage_type in ('냉장', '냉동')),
  default_days integer not null check (default_days >= 0),
  warning_days integer not null default 3 check (warning_days >= 0),
  critical_days integer not null default 1 check (critical_days >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, species, part_name, storage_type)
);
alter table public.expiry_policy disable row level security;

alter table public.inventory_movement add column if not exists slaughter_date date;
alter table public.inventory_movement add column if not exists expiry_date date;

-- 기본 권장 유통기한 시드 (SMARTPD_DEV). 관리자가 이후 수정 가능.
insert into public.expiry_policy (tenant_id, species, part_name, storage_type, default_days) values
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '소',   '등심',   '냉장', 14),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '소',   '안심',   '냉장', 12),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '소',   '채끝',   '냉장', 14),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '소',   '갈비',   '냉장', 14),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '소',   '양지',   '냉장', 12),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '소',   '전부위', '냉장', 12),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '삼겹',   '냉장', 14),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '목살',   '냉장', 14),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '앞다리', '냉장', 12),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '뒷다리', '냉장', 12),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '갈비',   '냉장', 12),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '미후지', '냉장', 10),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '전부위', '냉장', 10),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '닭',   '전부위', '냉장', 7),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '소',   '전부위', '냉동', 365),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '돼지', '전부위', '냉동', 180),
  ('881f6cc1-b552-468c-b9b4-152edb464e61', '닭',   '전부위', '냉동', 180)
on conflict (tenant_id, species, part_name, storage_type) do nothing;
