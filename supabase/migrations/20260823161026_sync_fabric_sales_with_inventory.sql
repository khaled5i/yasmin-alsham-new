-- Keep fabric sales and physical fabric inventory in one database transaction.
-- New and edited sales create linked OUT movements; deleting a sale restores stock
-- through the existing movement DELETE triggers.

alter table public.fabric_inventory_movements
  add column if not exists sale_income_id uuid
    references public.income(id) on delete cascade,
  add column if not exists sale_line_index integer;

create unique index if not exists idx_fabric_inventory_movements_sale_line
  on public.fabric_inventory_movements (sale_income_id, sale_line_index)
  where sale_income_id is not null;

create index if not exists idx_fabric_inventory_movements_sale_income
  on public.fabric_inventory_movements (sale_income_id)
  where sale_income_id is not null;

comment on column public.fabric_inventory_movements.sale_income_id is
  'Fabric income row that created this automatic OUT movement.';

comment on column public.fabric_inventory_movements.sale_line_index is
  'One-based position of the fabric line inside income.fabric_items.';

-- Lock the exact stock row before every OUT movement. This prevents two devices
-- from selling the same remaining quantity at the same time and prevents negative
-- inventory for both base fabrics and color-linked fabrics.
create or replace function private.validate_fabric_inventory_availability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_available numeric;
  v_fabric_code text;
  v_unit text;
begin
  if new.movement_type <> 'out' then
    return new;
  end if;

  if new.color_id is not null then
    select
      color.current_quantity,
      coalesce(color.fabric_code, item.base_fabric_code, item.name),
      item.unit
    into v_available, v_fabric_code, v_unit
    from public.fabric_inventory_colors color
    join public.fabric_inventory item on item.id = color.inventory_item_id
    where color.id = new.color_id
      and color.inventory_item_id = new.inventory_item_id
    for update of color;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_NOT_FOUND|رقم القماش المحدد غير موجود في المخزون';
    end if;
  else
    if exists (
      select 1
      from public.fabric_inventory_colors color
      where color.inventory_item_id = new.inventory_item_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_COLOR_REQUIRED|يجب تحديد رقم القماش المرتبط باللون حتى يتم خصم الكمية الصحيحة';
    end if;

    select
      item.current_quantity,
      coalesce(item.base_fabric_code, item.name),
      item.unit
    into v_available, v_fabric_code, v_unit
    from public.fabric_inventory item
    where item.id = new.inventory_item_id
    for update of item;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_NOT_FOUND|رقم القماش المحدد غير موجود في المخزون';
    end if;
  end if;

  if new.quantity > v_available then
    raise exception using
      errcode = 'P0001',
      message = format(
        'FABRIC_STOCK_INSUFFICIENT|الكمية المطلوبة من القماش %s (%s %s) أكبر من الرصيد المتاح (%s %s)',
        v_fabric_code,
        new.quantity,
        case when v_unit = 'meter' then 'متر' else 'قطعة' end,
        v_available,
        case when v_unit = 'meter' then 'متر' else 'قطعة' end
      );
  end if;

  return new;
end;
$$;

revoke all on function private.validate_fabric_inventory_availability()
  from public, anon, authenticated;

drop trigger if exists validate_fabric_inventory_availability_trigger
  on public.fabric_inventory_movements;
create trigger validate_fabric_inventory_availability_trigger
  before insert on public.fabric_inventory_movements
  for each row execute function private.validate_fabric_inventory_availability();

-- Reconcile the linked movements whenever the sale lines change. Deleting the old
-- movements first restores their quantities; any later validation failure rolls the
-- whole income UPDATE back, including those restores.
create or replace function private.sync_fabric_sale_inventory()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_line record;
  v_inventory_id uuid;
  v_color_id uuid;
  v_color_count integer;
  v_quantity numeric;
  v_fabric_code text;
begin
  if tg_op = 'UPDATE' then
    delete from public.fabric_inventory_movements movement
    where movement.sale_income_id = new.id;
  end if;

  if new.branch <> 'fabrics'
     or new.category is distinct from 'fabric_sale'
     or new.fabric_items is null
     or jsonb_typeof(new.fabric_items) <> 'array'
     or jsonb_array_length(new.fabric_items) = 0 then
    return new;
  end if;

  for v_line in
    select value as item, ordinality::integer as line_index
    from jsonb_array_elements(new.fabric_items) with ordinality
  loop
    begin
      v_inventory_id := nullif(v_line.item ->> 'inventory_id', '')::uuid;
      v_color_id := nullif(v_line.item ->> 'inventory_color_id', '')::uuid;
      v_quantity := nullif(v_line.item ->> 'quantity_meters', '')::numeric;
    exception
      when invalid_text_representation then
        raise exception using
          errcode = 'P0001',
          message = 'FABRIC_STOCK_INVALID|بيانات القماش أو الكمية غير صحيحة';
    end;

    if v_inventory_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_INVALID|يجب اختيار رقم قماش صحيح وإدخال كمية أكبر من صفر';
    end if;

    -- Older clients stored only inventory_id. Keep them safe when the item has one
    -- color, but refuse to guess when several color stocks exist.
    if v_color_id is null then
      select count(*), min(color.id::text)::uuid
      into v_color_count, v_color_id
      from public.fabric_inventory_colors color
      where color.inventory_item_id = v_inventory_id;

      if v_color_count > 1 then
        raise exception using
          errcode = 'P0001',
          message = 'FABRIC_STOCK_COLOR_REQUIRED|هذا الصنف له أكثر من رقم لون؛ ابحث برقم القماش المطلوب وحدده';
      end if;
    end if;

    select coalesce(color.fabric_code, item.base_fabric_code, item.name)
    into v_fabric_code
    from public.fabric_inventory item
    left join public.fabric_inventory_colors color
      on color.id = v_color_id
     and color.inventory_item_id = item.id
    where item.id = v_inventory_id;

    if not found or (v_color_id is not null and v_fabric_code is null) then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_NOT_FOUND|رقم القماش المحدد غير موجود في المخزون';
    end if;

    insert into public.fabric_inventory_movements (
      inventory_item_id,
      movement_type,
      quantity,
      description,
      color_id,
      date,
      created_by,
      sale_income_id,
      sale_line_index
    ) values (
      v_inventory_id,
      'out',
      v_quantity,
      format('بيع قماش رقم %s - فاتورة %s', v_fabric_code, coalesce(new.invoice_number::text, new.id::text)),
      v_color_id,
      new.date,
      coalesce(new.created_by, auth.uid()),
      new.id,
      v_line.line_index
    );
  end loop;

  return new;
end;
$$;

revoke all on function private.sync_fabric_sale_inventory()
  from public, anon, authenticated;

drop trigger if exists sync_fabric_sale_inventory_trigger on public.income;
create trigger sync_fabric_sale_inventory_trigger
  after insert or update of branch, category, fabric_items, customer_name, quantity_meters, date
  on public.income
  for each row execute function private.sync_fabric_sale_inventory();

