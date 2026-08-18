-- Keep color-based fabric listings in sync with inventory movements.
-- A store listing represents one inventory color, so movements for an item
-- with colors must always identify the affected color.

-- Repair legacy unassigned movements when the item has exactly one possible
-- color. The returned delta updates the color quantity and fires the existing
-- color-to-store synchronization trigger.
with sole_colors as (
  select inventory_item_id, min(id::text)::uuid as color_id
  from public.fabric_inventory_colors
  group by inventory_item_id
  having count(*) = 1
), corrected_movements as (
  update public.fabric_inventory_movements movement
  set color_id = sole.color_id
  from sole_colors sole
  where movement.inventory_item_id = sole.inventory_item_id
    and movement.color_id is null
  returning
    sole.color_id,
    movement.movement_type,
    movement.quantity
), correction_deltas as (
  select
    color_id,
    sum(
      case when movement_type = 'in' then quantity else -quantity end
    ) as quantity_delta
  from corrected_movements
  group by color_id
)
update public.fabric_inventory_colors color
set current_quantity = color.current_quantity + delta.quantity_delta
from correction_deltas delta
where color.id = delta.color_id
  and delta.quantity_delta <> 0;

create or replace function private.validate_fabric_movement_color()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.color_id is null and exists (
    select 1
    from public.fabric_inventory_colors color
    where color.inventory_item_id = new.inventory_item_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'يجب تحديد لون القماش حتى تتم مزامنة الكمية مع متجر الأقمشة';
  end if;

  if new.color_id is not null and not exists (
    select 1
    from public.fabric_inventory_colors color
    where color.id = new.color_id
      and color.inventory_item_id = new.inventory_item_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'اللون المحدد لا يتبع صنف المخزون';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_fabric_movement_color_trigger
  on public.fabric_inventory_movements;
create trigger validate_fabric_movement_color_trigger
  before insert on public.fabric_inventory_movements
  for each row execute function private.validate_fabric_movement_color();

revoke all on function private.validate_fabric_movement_color()
  from public, anon, authenticated;
