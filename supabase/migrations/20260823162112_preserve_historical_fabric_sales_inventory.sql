-- Do not attach stock movements retroactively when an old, untracked fabric sale
-- is edited. Only sales created after inventory tracking is enabled participate in
-- automatic reconciliation.

alter table public.income
  add column if not exists fabric_inventory_tracked boolean not null default false;

update public.income sale
set fabric_inventory_tracked = true
where exists (
  select 1
  from public.fabric_inventory_movements movement
  where movement.sale_income_id = sale.id
);

comment on column public.income.fabric_inventory_tracked is
  'True only for fabric sales whose stock is managed by linked inventory movements.';

create or replace function private.prepare_fabric_sale_inventory_tracking()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.fabric_inventory_tracked :=
      new.branch = 'fabrics'
      and new.category is not distinct from 'fabric_sale'
      and new.fabric_items is not null
      and jsonb_typeof(new.fabric_items) = 'array'
      and jsonb_array_length(new.fabric_items) > 0;
  else
    -- The tracking boundary is database-owned and cannot be toggled by clients.
    new.fabric_inventory_tracked := old.fabric_inventory_tracked;
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_fabric_sale_inventory_tracking()
  from public, anon, authenticated;

drop trigger if exists prepare_fabric_sale_inventory_tracking_trigger
  on public.income;
create trigger prepare_fabric_sale_inventory_tracking_trigger
  before insert or update of fabric_inventory_tracked on public.income
  for each row execute function private.prepare_fabric_sale_inventory_tracking();

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
    if not old.fabric_inventory_tracked then
      return new;
    end if;

    delete from public.fabric_inventory_movements movement
    where movement.sale_income_id = new.id;
  end if;

  if not new.fabric_inventory_tracked
     or new.branch <> 'fabrics'
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

