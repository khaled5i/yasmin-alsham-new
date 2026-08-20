-- Allow one fabric/color serial to appear under more than one classification.
-- The primary classification remains the only source of the serial prefix and sequence.

alter table public.fabric_inventory
  add column if not exists fabric_types text[] not null default '{}',
  add column if not exists purchase_price_mode text,
  add column if not exists purchase_total_price numeric(12, 2),
  add column if not exists purchase_total_quantity numeric(12, 2);

alter table public.fabrics
  add column if not exists categories text[] not null default '{}';

alter table public.fabric_inventory
  drop constraint if exists fabric_inventory_purchase_price_mode_check,
  add constraint fabric_inventory_purchase_price_mode_check
    check (purchase_price_mode is null or purchase_price_mode in ('per_unit', 'total')),
  drop constraint if exists fabric_inventory_purchase_total_price_check,
  add constraint fabric_inventory_purchase_total_price_check
    check (purchase_total_price is null or purchase_total_price >= 0),
  drop constraint if exists fabric_inventory_purchase_total_quantity_check,
  add constraint fabric_inventory_purchase_total_quantity_check
    check (purchase_total_quantity is null or purchase_total_quantity > 0);

comment on column public.fabric_inventory.fabric_types is
  'All classifications for the inventory item. fabric_type is always the primary classification and controls serial allocation.';
comment on column public.fabric_inventory.purchase_price_mode is
  'How the purchase cost was entered: per_unit or total. Null means no purchase price has been entered.';
comment on column public.fabric_inventory.purchase_total_price is
  'Original total purchase amount when purchase_price_mode is total.';
comment on column public.fabric_inventory.purchase_total_quantity is
  'Meter or piece quantity used to derive cost_per_unit from the total purchase amount.';
comment on column public.fabrics.categories is
  'All store classifications for this fabric. category remains the primary classification for backwards compatibility.';

update public.fabric_inventory
set fabric_types = array[btrim(fabric_type)]
where btrim(coalesce(fabric_type, '')) <> ''
  and coalesce(array_length(fabric_types, 1), 0) = 0;

update public.fabric_inventory
set purchase_price_mode = 'per_unit'
where cost_per_unit is not null
  and purchase_price_mode is null;

update public.fabrics
set categories = array[btrim(category)]
where btrim(coalesce(category, '')) <> ''
  and coalesce(array_length(categories, 1), 0) = 0;

create or replace function private.prepare_fabric_inventory_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_primary text := btrim(coalesce(new.fabric_type, ''));
  v_types text[];
  v_type text;
  v_serial_locked boolean := false;
begin
  if v_primary = '' then
    raise exception 'التصنيف الأساسي للقماش مطلوب';
  end if;
  if tg_op = 'INSERT' and coalesce(array_length(new.images, 1), 0) = 0 then
    raise exception 'صورة القماش مطلوبة';
  end if;

  if tg_op = 'UPDATE' then
    v_serial_locked := old.base_fabric_code is not null or exists (
      select 1
      from public.fabric_inventory_colors color
      where color.inventory_item_id = old.id
        and color.fabric_code is not null
    );

    if v_serial_locked
      and lower(btrim(coalesce(old.fabric_type, ''))) <> lower(v_primary) then
      raise exception 'لا يمكن تغيير التصنيف الأساسي بعد حجز رقم القماش؛ يمكن تعديل التصنيف الإضافي فقط';
    end if;

    if v_serial_locked
      and upper(btrim(coalesce(new.type_code, ''))) <> upper(btrim(coalesce(old.type_code, ''))) then
      raise exception 'لا يمكن تغيير رمز التصنيف الأساسي بعد حجز رقم القماش';
    end if;
  end if;

  new.fabric_type := v_primary;
  v_types := array[v_primary];
  foreach v_type in array coalesce(new.fabric_types, '{}'::text[]) loop
    v_type := btrim(v_type);
    if v_type <> '' and not exists (
      select 1 from unnest(v_types) existing_type
      where lower(existing_type) = lower(v_type)
    ) then
      v_types := array_append(v_types, v_type);
    end if;
  end loop;
  new.fabric_types := v_types;

  if not v_serial_locked then
    new.type_code := private.resolve_fabric_type_code(new.fabric_type, new.type_code);
  else
    new.type_code := old.type_code;
  end if;

  if not new.has_color_variants and new.base_fabric_code is null then
    new.base_fabric_code := private.allocate_fabric_code(
      new.fabric_type, new.type_code, new.id, null
    );
  end if;

  if new.purchase_price_mode = 'total' then
    if new.purchase_total_price is null or new.purchase_total_price < 0 then
      raise exception 'السعر الكلي للشراء يجب أن يكون صفراً أو أكثر';
    end if;
    if new.purchase_total_quantity is null or new.purchase_total_quantity <= 0 then
      raise exception 'عدد الأمتار أو القطع المستخدم لحساب سعر الوحدة يجب أن يكون أكبر من صفر';
    end if;
    new.cost_per_unit := round(new.purchase_total_price / new.purchase_total_quantity, 2);
  elsif new.cost_per_unit is not null then
    new.purchase_price_mode := 'per_unit';
    new.purchase_total_price := null;
    new.purchase_total_quantity := null;
  else
    new.purchase_price_mode := null;
    new.purchase_total_price := null;
    new.purchase_total_quantity := null;
  end if;

  -- Keep the legacy name populated; the interface displays the allocated serial.
  new.name := coalesce(nullif(btrim(new.name), ''), new.base_fabric_code, new.type_code);
  return new;
end;
$$;

drop trigger if exists prepare_fabric_inventory_item_trigger on public.fabric_inventory;
create trigger prepare_fabric_inventory_item_trigger
  before insert or update of fabric_type, fabric_types, type_code, images,
    has_color_variants, cost_per_unit, purchase_price_mode,
    purchase_total_price, purchase_total_quantity
  on public.fabric_inventory
  for each row execute function private.prepare_fabric_inventory_item();

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
  v_evening := exists (
    select 1
    from unnest(v_item.fabric_types) item_type
    where lower(item_type) like '%سهرة%'
      or lower(item_type) like '%سهرات%'
      or lower(item_type) like '%evening%'
  );

  if v_existing_id is null then
    insert into public.fabrics (
      name, description, category, categories, type, price_per_meter,
      image_url, thumbnail_image, images, available_colors,
      is_available, is_active, stock_quantity, min_order_meters,
      fabric_code, inventory_item_id, inventory_color_id,
      is_manually_hidden, show_stock_quantity
    ) values (
      null, null, v_item.fabric_type, v_item.fabric_types, v_item.fabric_type,
      v_item.sale_price_per_unit, v_item.images[1],
      coalesce(v_item.thumbnail_image, v_item.images[1]), v_item.images, v_color_names,
      v_quantity > 0, v_quantity > 0, v_quantity, 1,
      v_code, v_item.id, p_inventory_color_id,
      false, v_evening
    );
  else
    update public.fabrics
    set category = v_item.fabric_type,
        categories = v_item.fabric_types,
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

drop trigger if exists sync_inventory_item_to_store_trigger on public.fabric_inventory;
create trigger sync_inventory_item_to_store_trigger
  after insert or update of fabric_type, fabric_types, type_code, current_quantity,
    sale_price_per_unit, images, thumbnail_image, has_color_variants
  on public.fabric_inventory
  for each row execute function private.sync_inventory_item_to_store();

-- Normalize existing arrays and push the classifications to linked store rows.
update public.fabric_inventory
set fabric_types = fabric_types
where btrim(coalesce(fabric_type, '')) <> '';

