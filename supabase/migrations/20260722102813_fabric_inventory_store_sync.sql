-- ربط مخزون الأقمشة بمتجر الأقمشة (المخزون هو مصدر الحقيقة)
-- كل لون يحصل على رمز دائم لا يعاد استخدامه، حتى بعد حذف المخزون.

create schema if not exists private;

-- الاسم والوصف في بطاقة المتجر معلومات إثرائية اختيارية.
alter table public.fabrics alter column name drop not null;
alter table public.fabrics alter column description drop not null;
alter table public.fabrics alter column stock_quantity type numeric(12, 2)
  using stock_quantity::numeric(12, 2);

alter table public.fabric_inventory
  add column if not exists images text[] not null default '{}',
  add column if not exists thumbnail_image text,
  add column if not exists type_code varchar(8),
  add column if not exists base_fabric_code varchar(32),
  add column if not exists has_color_variants boolean not null default false;

alter table public.fabric_inventory_colors
  add column if not exists fabric_code varchar(32);

alter table public.fabrics
  add column if not exists fabric_code varchar(32),
  add column if not exists inventory_item_id uuid
    references public.fabric_inventory(id) on delete cascade,
  add column if not exists inventory_color_id uuid
    references public.fabric_inventory_colors(id) on delete cascade,
  add column if not exists is_manually_hidden boolean not null default false,
  add column if not exists show_stock_quantity boolean not null default false,
  add column if not exists deleted_at timestamptz;

create unique index if not exists idx_fabrics_fabric_code_unique
  on public.fabrics (fabric_code) where fabric_code is not null;
create unique index if not exists idx_fabrics_inventory_base_unique
  on public.fabrics (inventory_item_id)
  where inventory_item_id is not null and inventory_color_id is null;
create unique index if not exists idx_fabrics_inventory_color_unique
  on public.fabrics (inventory_color_id) where inventory_color_id is not null;
create unique index if not exists idx_fabric_inventory_base_code_unique
  on public.fabric_inventory (base_fabric_code) where base_fabric_code is not null;
create unique index if not exists idx_fabric_inventory_color_code_unique
  on public.fabric_inventory_colors (fabric_code) where fabric_code is not null;
create index if not exists idx_fabrics_store_visibility
  on public.fabrics (is_active, is_available, deleted_at);

-- العرض العام لا يرى المخفي أو المحذوف من المتجر حتى لو كان متاحاً سابقاً.
drop policy if exists "Anyone can view available fabrics" on public.fabrics;
create policy "Anyone can view available fabrics"
  on public.fabrics for select
  using (is_available = true and is_active = true and deleted_at is null);

-- بادئة ثابتة لكل نوع. last_sequence لا ينقص أبداً، ولذلك لا يعاد استخدام رقم قديم.
create table if not exists public.fabric_type_codes (
  id uuid primary key default gen_random_uuid(),
  fabric_type text not null,
  type_code varchar(8) not null,
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fabric_type_codes_code_format check (type_code ~ '^[A-Z0-9]{1,8}$')
);

create unique index if not exists idx_fabric_type_codes_type_ci
  on public.fabric_type_codes (lower(btrim(fabric_type)));
create unique index if not exists idx_fabric_type_codes_code_unique
  on public.fabric_type_codes (type_code);

alter table public.fabric_type_codes enable row level security;
drop policy if exists "fabric type codes are readable" on public.fabric_type_codes;
create policy "fabric type codes are readable"
  on public.fabric_type_codes for select
  to anon, authenticated
  using (true);
grant select on public.fabric_type_codes to anon, authenticated;

create table if not exists private.fabric_serial_registry (
  fabric_code varchar(32) primary key,
  fabric_type text not null,
  type_code varchar(8) not null,
  sequence_number bigint not null check (sequence_number > 0),
  inventory_item_id uuid references public.fabric_inventory(id)
    on delete set null deferrable initially deferred,
  inventory_color_id uuid references public.fabric_inventory_colors(id)
    on delete set null deferrable initially deferred,
  created_at timestamptz not null default now(),
  unique (type_code, sequence_number)
);

revoke all on table private.fabric_serial_registry from public, anon, authenticated;
create index if not exists idx_fabric_serial_registry_inventory_item
  on private.fabric_serial_registry (inventory_item_id);
create index if not exists idx_fabric_serial_registry_inventory_color
  on private.fabric_serial_registry (inventory_color_id);
create index if not exists idx_fabric_inventory_created_by
  on public.fabric_inventory (created_by);
create index if not exists idx_fabric_inventory_colors_created_by
  on public.fabric_inventory_colors (created_by);
create index if not exists idx_fabric_inventory_movements_created_by
  on public.fabric_inventory_movements (created_by);

-- حماية المخزون من الوصول المباشر عبر Data API. الواجهة وحدها ليست حدّ أمان.
create or replace function private.can_manage_fabric_operations()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.users u
    left join public.workers w on w.user_id = u.id
    where u.id = auth.uid()
      and u.is_active = true
      and (
        u.role = 'admin'
        or (u.role = 'worker' and w.worker_type in (
          'accountant', 'general_manager', 'fabric_store_manager'
        ))
      )
  );
$$;

revoke all on function private.can_manage_fabric_operations() from public, anon;

-- تثبيت search_path للدوال القديمة التي تشارك في سلسلة مزامنة الكميات.
alter function public.update_fabric_inventory_updated_at() set search_path = public, pg_temp;
alter function public.update_inventory_quantity() set search_path = public, pg_temp;
alter function public.update_color_quantity() set search_path = public, pg_temp;
grant usage on schema private to authenticated;
grant execute on function private.can_manage_fabric_operations() to authenticated;

drop policy if exists "fabric_inventory_select" on public.fabric_inventory;
drop policy if exists "fabric_inventory_insert" on public.fabric_inventory;
drop policy if exists "fabric_inventory_update" on public.fabric_inventory;
drop policy if exists "fabric_inventory_delete" on public.fabric_inventory;
create policy "fabric inventory select" on public.fabric_inventory for select
  to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric inventory insert" on public.fabric_inventory for insert
  to authenticated with check ((select private.can_manage_fabric_operations()));
create policy "fabric inventory update" on public.fabric_inventory for update
  to authenticated using ((select private.can_manage_fabric_operations()))
  with check ((select private.can_manage_fabric_operations()));
create policy "fabric inventory delete" on public.fabric_inventory for delete
  to authenticated using ((select private.can_manage_fabric_operations()));

drop policy if exists "fim_select" on public.fabric_inventory_movements;
drop policy if exists "fim_insert" on public.fabric_inventory_movements;
drop policy if exists "fim_update" on public.fabric_inventory_movements;
drop policy if exists "fim_delete" on public.fabric_inventory_movements;
create policy "fabric movements select" on public.fabric_inventory_movements for select
  to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric movements insert" on public.fabric_inventory_movements for insert
  to authenticated with check ((select private.can_manage_fabric_operations()));
create policy "fabric movements update" on public.fabric_inventory_movements for update
  to authenticated using ((select private.can_manage_fabric_operations()))
  with check ((select private.can_manage_fabric_operations()));
create policy "fabric movements delete" on public.fabric_inventory_movements for delete
  to authenticated using ((select private.can_manage_fabric_operations()));

drop policy if exists "fic_select" on public.fabric_inventory_colors;
drop policy if exists "fic_insert" on public.fabric_inventory_colors;
drop policy if exists "fic_update" on public.fabric_inventory_colors;
drop policy if exists "fic_delete" on public.fabric_inventory_colors;
create policy "fabric colors select" on public.fabric_inventory_colors for select
  to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric colors insert" on public.fabric_inventory_colors for insert
  to authenticated with check ((select private.can_manage_fabric_operations()));
create policy "fabric colors update" on public.fabric_inventory_colors for update
  to authenticated using ((select private.can_manage_fabric_operations()))
  with check ((select private.can_manage_fabric_operations()));
create policy "fabric colors delete" on public.fabric_inventory_colors for delete
  to authenticated using ((select private.can_manage_fabric_operations()));

-- المحاسب ومدير الأقمشة يحتاجان رفع صورة القماش من شاشة المخزون.
drop policy if exists "Managers can upload images" on storage.objects;
drop policy if exists "Managers can update images" on storage.objects;
drop policy if exists "Managers can delete images" on storage.objects;
create policy "Fabric operators can upload images" on storage.objects for insert
  to authenticated with check (
    bucket_id = 'product-images' and (select private.can_manage_fabric_operations())
  );
create policy "Fabric operators can update images" on storage.objects for update
  to authenticated using (
    bucket_id = 'product-images' and (select private.can_manage_fabric_operations())
  ) with check (
    bucket_id = 'product-images' and (select private.can_manage_fabric_operations())
  );
create policy "Fabric operators can delete images" on storage.objects for delete
  to authenticated using (
    bucket_id = 'product-images' and (select private.can_manage_fabric_operations())
  );

-- اقتراح حروف مفهومة من اسم النوع العربي/الإنجليزي. يمكن تعديل الاقتراح قبل الحفظ.
create or replace function public.suggest_fabric_type_code(p_fabric_type text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_clean text := btrim(coalesce(p_fabric_type, ''));
  v_word text;
  v_prefix text := '';
  v_char text;
  v_words text[];
begin
  if v_clean = '' then return 'FB'; end if;

  if v_clean ~ '[A-Za-z]' then
    v_prefix := upper(regexp_replace(v_clean, '[^A-Za-z0-9]+', '', 'g'));
    return left(v_prefix, 4);
  end if;

  v_words := regexp_split_to_array(v_clean, '\s+');
  foreach v_word in array v_words loop
    if v_word in ('قماش', 'اقمشة', 'أقمشة', 'الأقمشة', 'الاقمشة') then continue; end if;
    v_char := substr(v_word, 1, 1);
    v_prefix := v_prefix || case
      when v_char in ('ا','أ','إ','آ','ع') then 'A'
      when v_char = 'ب' then 'B' when v_char = 'ت' then 'T'
      when v_char = 'ث' then 'TH' when v_char = 'ج' then 'J'
      when v_char in ('ح','ه','ة') then 'H' when v_char = 'خ' then 'KH'
      when v_char = 'د' then 'D' when v_char = 'ذ' then 'TH'
      when v_char = 'ر' then 'R' when v_char in ('ز','ظ') then 'Z'
      when v_char in ('س','ص') then 'S' when v_char = 'ش' then 'SH'
      when v_char = 'ض' then 'D' when v_char = 'ط' then 'T'
      when v_char = 'غ' then 'GH' when v_char = 'ف' then 'F'
      when v_char = 'ق' then 'Q' when v_char = 'ك' then 'K'
      when v_char = 'ل' then 'L' when v_char = 'م' then 'M'
      when v_char = 'ن' then 'N' when v_char = 'و' then 'W'
      when v_char in ('ي','ى') then 'Y' else '' end;
    exit when length(v_prefix) >= 4;
  end loop;

  -- إن كان النوع كلمة واحدة، نستخدم أول حرفين منها لاقتراح أوضح.
  if length(v_prefix) < 2 and array_length(v_words, 1) = 1 then
    v_char := substr(v_clean, 2, 1);
    v_prefix := v_prefix || case
      when v_char in ('ا','أ','إ','آ','ع') then 'A'
      when v_char = 'ب' then 'B' when v_char = 'ت' then 'T'
      when v_char = 'ج' then 'J' when v_char in ('ح','ه','ة') then 'H'
      when v_char = 'خ' then 'K' when v_char = 'د' then 'D'
      when v_char = 'ر' then 'R' when v_char in ('ز','ظ') then 'Z'
      when v_char in ('س','ش','ص') then 'S' when v_char = 'ض' then 'D'
      when v_char = 'ط' then 'T' when v_char = 'غ' then 'G'
      when v_char = 'ف' then 'F' when v_char = 'ق' then 'Q'
      when v_char = 'ك' then 'K' when v_char = 'ل' then 'L'
      when v_char = 'م' then 'M' when v_char = 'ن' then 'N'
      when v_char = 'و' then 'W' when v_char in ('ي','ى') then 'Y' else '' end;
  end if;

  return left(case when v_prefix = '' then 'FB' else v_prefix end, 4);
end;
$$;

grant execute on function public.suggest_fabric_type_code(text) to anon, authenticated;

create or replace function private.resolve_fabric_type_code(
  p_fabric_type text,
  p_requested_code text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := btrim(coalesce(p_fabric_type, ''));
  v_code text;
  v_base text;
  v_suffix integer := 1;
begin
  if v_type = '' then raise exception 'نوع القماش مطلوب'; end if;
  perform pg_advisory_xact_lock(hashtext('fabric-type:' || lower(v_type)));

  select type_code into v_code
  from public.fabric_type_codes
  where lower(btrim(fabric_type)) = lower(v_type);
  if v_code is not null then return v_code; end if;

  v_base := upper(regexp_replace(coalesce(p_requested_code, ''), '[^A-Za-z0-9]+', '', 'g'));
  if v_base = '' then v_base := public.suggest_fabric_type_code(v_type); end if;
  v_base := left(v_base, 8);
  v_code := v_base;

  while exists (select 1 from public.fabric_type_codes where type_code = v_code) loop
    v_suffix := v_suffix + 1;
    v_code := left(v_base, greatest(1, 8 - length(v_suffix::text))) || v_suffix::text;
  end loop;

  insert into public.fabric_type_codes (fabric_type, type_code)
  values (v_type, v_code);
  return v_code;
end;
$$;

create or replace function private.allocate_fabric_code(
  p_fabric_type text,
  p_requested_code text,
  p_inventory_item_id uuid,
  p_inventory_color_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type_code text;
  v_sequence bigint;
  v_fabric_code text;
begin
  v_type_code := private.resolve_fabric_type_code(p_fabric_type, p_requested_code);
  perform pg_advisory_xact_lock(hashtext('fabric-sequence:' || v_type_code));

  update public.fabric_type_codes
  set last_sequence = last_sequence + 1, updated_at = now()
  where type_code = v_type_code
  returning last_sequence into v_sequence;

  v_fabric_code := v_type_code || '-' || lpad(v_sequence::text, 4, '0');
  insert into private.fabric_serial_registry (
    fabric_code, fabric_type, type_code, sequence_number,
    inventory_item_id, inventory_color_id
  ) values (
    v_fabric_code, btrim(p_fabric_type), v_type_code, v_sequence,
    p_inventory_item_id, p_inventory_color_id
  );
  return v_fabric_code;
end;
$$;

create or replace function private.prepare_fabric_inventory_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if btrim(coalesce(new.fabric_type, '')) = '' then
    raise exception 'نوع القماش مطلوب';
  end if;
  if tg_op = 'INSERT' and coalesce(array_length(new.images, 1), 0) = 0 then
    raise exception 'صورة القماش مطلوبة';
  end if;

  new.type_code := private.resolve_fabric_type_code(new.fabric_type, new.type_code);
  if not new.has_color_variants and new.base_fabric_code is null then
    new.base_fabric_code := private.allocate_fabric_code(
      new.fabric_type, new.type_code, new.id, null
    );
  end if;
  -- إبقاء عمود name القديم متوافقاً؛ العرض في الواجهة يعتمد رقم القماش.
  new.name := coalesce(nullif(btrim(new.name), ''), new.base_fabric_code, new.type_code);
  return new;
end;
$$;

drop trigger if exists prepare_fabric_inventory_item_trigger on public.fabric_inventory;
create trigger prepare_fabric_inventory_item_trigger
  before insert or update of fabric_type, type_code, images, has_color_variants
  on public.fabric_inventory
  for each row execute function private.prepare_fabric_inventory_item();

create or replace function private.prepare_fabric_inventory_color()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.fabric_inventory%rowtype;
begin
  select * into v_item from public.fabric_inventory where id = new.inventory_item_id;
  if not found then raise exception 'صنف المخزون غير موجود'; end if;

  if new.fabric_code is null then
    new.fabric_code := private.allocate_fabric_code(
      v_item.fabric_type, v_item.type_code, v_item.id, new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_fabric_inventory_color_trigger on public.fabric_inventory_colors;
create trigger prepare_fabric_inventory_color_trigger
  before insert on public.fabric_inventory_colors
  for each row execute function private.prepare_fabric_inventory_color();

create or replace function private.sync_fabric_store_listing(
  p_inventory_item_id uuid,
  p_inventory_color_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.fabric_inventory%rowtype;
  v_color public.fabric_inventory_colors%rowtype;
  v_code text;
  v_quantity numeric(12, 2);
  v_color_names text[];
  v_existing_id uuid;
  v_evening boolean;
begin
  select * into v_item from public.fabric_inventory where id = p_inventory_item_id;
  if not found then return; end if;
  if coalesce(array_length(v_item.images, 1), 0) = 0 then return; end if;

  if p_inventory_color_id is not null then
    select * into v_color from public.fabric_inventory_colors
    where id = p_inventory_color_id and inventory_item_id = p_inventory_item_id;
    if not found then return; end if;
    v_code := v_color.fabric_code;
    v_quantity := greatest(v_color.current_quantity, 0);
    v_color_names := array[v_color.color_name];
    select id into v_existing_id from public.fabrics
      where inventory_color_id = p_inventory_color_id;
  else
    v_code := v_item.base_fabric_code;
    v_quantity := greatest(v_item.current_quantity, 0);
    v_color_names := '{}';
    select id into v_existing_id from public.fabrics
      where inventory_item_id = p_inventory_item_id and inventory_color_id is null;
  end if;

  if v_code is null then return; end if;
  v_evening := lower(v_item.fabric_type) like '%سهرة%'
    or lower(v_item.fabric_type) like '%سهرات%'
    or lower(v_item.fabric_type) like '%evening%';

  if v_existing_id is null then
    insert into public.fabrics (
      name, description, category, type, price_per_meter,
      image_url, thumbnail_image, images, available_colors,
      is_available, is_active, stock_quantity, min_order_meters,
      fabric_code, inventory_item_id, inventory_color_id,
      is_manually_hidden, show_stock_quantity
    ) values (
      null, null, v_item.fabric_type, v_item.fabric_type, v_item.sale_price_per_unit,
      v_item.images[1], coalesce(v_item.thumbnail_image, v_item.images[1]), v_item.images, v_color_names,
      v_quantity > 0, v_quantity > 0, v_quantity, 1,
      v_code, v_item.id, p_inventory_color_id,
      false, v_evening
    );
  else
    update public.fabrics
    set category = v_item.fabric_type,
        type = v_item.fabric_type,
        price_per_meter = v_item.sale_price_per_unit,
        image_url = v_item.images[1],
        thumbnail_image = coalesce(v_item.thumbnail_image, v_item.images[1]),
        images = v_item.images,
        available_colors = v_color_names,
        stock_quantity = v_quantity,
        is_available = v_quantity > 0,
        is_active = case
          when deleted_at is null and not is_manually_hidden and v_quantity > 0 then true
          else false
        end,
        show_stock_quantity = v_evening,
        fabric_code = v_code,
        updated_at = now()
    where id = v_existing_id;
  end if;
end;
$$;

create or replace function private.sync_inventory_item_to_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_color record;
begin
  if new.has_color_variants then
    for v_color in
      select id from public.fabric_inventory_colors where inventory_item_id = new.id
    loop
      perform private.sync_fabric_store_listing(new.id, v_color.id);
    end loop;
  else
    perform private.sync_fabric_store_listing(new.id, null);
  end if;
  return new;
end;
$$;

drop trigger if exists sync_inventory_item_to_store_trigger on public.fabric_inventory;
create trigger sync_inventory_item_to_store_trigger
  after insert or update of fabric_type, type_code, current_quantity,
    sale_price_per_unit, images, thumbnail_image, has_color_variants
  on public.fabric_inventory
  for each row execute function private.sync_inventory_item_to_store();

create or replace function private.sync_inventory_color_to_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer;
  v_item public.fabric_inventory%rowtype;
begin
  if tg_op = 'DELETE' then
    select count(*) into v_remaining
    from public.fabric_inventory_colors
    where inventory_item_id = old.inventory_item_id;

    if v_remaining = 0 then
      select * into v_item from public.fabric_inventory where id = old.inventory_item_id;
      if found then
        if v_item.base_fabric_code is null then
          update public.fabric_inventory
          set has_color_variants = false,
              base_fabric_code = private.allocate_fabric_code(
                v_item.fabric_type, v_item.type_code, v_item.id, null
              )
          where id = v_item.id;
        else
          update public.fabric_inventory set has_color_variants = false where id = v_item.id;
        end if;
      end if;
    end if;
    return old;
  end if;

  -- أول لون يحول الصنف إلى متغيرات ألوان ويلغي البطاقة العامة القديمة.
  update public.fabric_inventory
  set has_color_variants = true
  where id = new.inventory_item_id and has_color_variants = false;
  delete from public.fabrics
  where inventory_item_id = new.inventory_item_id and inventory_color_id is null;
  perform private.sync_fabric_store_listing(new.inventory_item_id, new.id);
  return new;
end;
$$;

drop trigger if exists sync_inventory_color_to_store_trigger on public.fabric_inventory_colors;
create trigger sync_inventory_color_to_store_trigger
  after insert or update of color_name, current_quantity, fabric_code or delete
  on public.fabric_inventory_colors
  for each row execute function private.sync_inventory_color_to_store();

-- أي رقم قديم أُنشئ قبل هذه الهجرة يتم حجزه أيضاً إن كان موجوداً.
insert into private.fabric_serial_registry (
  fabric_code, fabric_type, type_code, sequence_number, inventory_item_id, inventory_color_id
)
select base_fabric_code, coalesce(fabric_type, 'غير مصنف'), coalesce(type_code, 'FB'),
       row_number() over (partition by coalesce(type_code, 'FB') order by created_at), id, null
from public.fabric_inventory
where base_fabric_code is not null
on conflict do nothing;

comment on column public.fabrics.inventory_item_id is
  'رابط اختياري إلى مصدر البطاقة في مخزون الأقمشة؛ حذف المخزون يحذف البطاقة فقط.';
comment on column public.fabrics.is_manually_hidden is
  'إخفاء يدوي من المتجر؛ لا يغيّر المخزون ولا يعاد تفعيله عند التوريد.';
comment on column public.fabrics.deleted_at is
  'حذف منطقي من المتجر للبطاقات المرتبطة بالمخزون، بدون حذف سجل المخزون.';

revoke all on function private.resolve_fabric_type_code(text, text) from public;
revoke all on function private.allocate_fabric_code(text, text, uuid, uuid) from public;
revoke all on function private.prepare_fabric_inventory_item() from public;
revoke all on function private.prepare_fabric_inventory_color() from public;
revoke all on function private.sync_fabric_store_listing(uuid, uuid) from public;
revoke all on function private.sync_inventory_item_to_store() from public;
revoke all on function private.sync_inventory_color_to_store() from public;
revoke all on function private.can_manage_fabric_operations() from public, anon;
