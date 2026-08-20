-- قائمة ألوان قابلة لإعادة الاستخدام في مخزون الأقمشة.
create table if not exists public.fabric_color_options (
  id uuid primary key default gen_random_uuid(),
  color_name text not null check (btrim(color_name) <> ''),
  color_hex text null check (color_hex is null or color_hex ~* '^#[0-9a-f]{6}$'),
  normalized_name text generated always as (lower(btrim(color_name))) stored,
  created_at timestamptz not null default now(),
  created_by uuid null default auth.uid() references auth.users(id) on delete set null,
  constraint fabric_color_options_normalized_name_key unique (normalized_name)
);

alter table public.fabric_color_options enable row level security;

revoke all on table public.fabric_color_options from public, anon;
grant select, insert on table public.fabric_color_options to authenticated;

drop policy if exists "fabric color options select" on public.fabric_color_options;
drop policy if exists "fabric color options insert" on public.fabric_color_options;

create policy "fabric color options select"
  on public.fabric_color_options for select
  to authenticated
  using ((select private.can_manage_fabric_operations()));

create policy "fabric color options insert"
  on public.fabric_color_options for insert
  to authenticated
  with check ((select private.can_manage_fabric_operations()));

-- اجعل الألوان المستخدمة سابقاً متاحة للاختيار مستقبلاً.
insert into public.fabric_color_options (color_name, color_hex, created_by)
select distinct on (lower(btrim(color_name)))
  btrim(color_name),
  color_hex,
  null
from public.fabric_inventory_colors
where btrim(color_name) <> ''
order by lower(btrim(color_name)), (color_hex is not null) desc, created_at desc
on conflict (normalized_name) do nothing;

-- الألوان السريعة الافتراضية.
insert into public.fabric_color_options (color_name, color_hex, created_by)
values
  ('أبيض', '#FFFFFF', null),
  ('أسود', '#1A1A1A', null),
  ('أحمر', '#EF4444', null),
  ('وردي', '#EC4899', null),
  ('برتقالي', '#F97316', null),
  ('أصفر', '#EAB308', null),
  ('أخضر', '#22C55E', null),
  ('أزرق فاتح', '#38BDF8', null),
  ('أزرق', '#3B82F6', null),
  ('بنفسجي', '#A855F7', null),
  ('بني', '#92400E', null),
  ('رمادي', '#6B7280', null),
  ('ذهبي', '#D97706', null),
  ('فضي', '#9CA3AF', null),
  ('زيتي', '#4D7C0F', null),
  ('تركوازي', '#0D9488', null)
on conflict (normalized_name) do nothing;
