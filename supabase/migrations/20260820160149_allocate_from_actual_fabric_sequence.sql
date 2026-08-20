-- Allocate the next serial from the highest code that is still attached to an
-- actual inventory item or color. Historical/deleted reservations no longer
-- push the automatic sequence forward.

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

  select greatest(
    coalesce((
      select max(substring(item.base_fabric_code from length(v_type_code) + 2)::bigint)
      from public.fabric_inventory item
      where item.base_fabric_code ~ ('^' || v_type_code || '-[0-9]+$')
    ), 0),
    coalesce((
      select max(substring(color.fabric_code from length(v_type_code) + 2)::bigint)
      from public.fabric_inventory_colors color
      where color.fabric_code ~ ('^' || v_type_code || '-[0-9]+$')
    ), 0)
  ) + 1
  into v_sequence;

  v_fabric_code := v_type_code || '-' || lpad(v_sequence::text, 4, '0');

  -- Remove stale links created by earlier allocations for the same target.
  if p_inventory_color_id is null then
    update private.fabric_serial_registry
    set inventory_item_id = null
    where inventory_item_id = p_inventory_item_id
      and inventory_color_id is null;
  else
    update private.fabric_serial_registry
    set inventory_item_id = null,
        inventory_color_id = null
    where inventory_color_id = p_inventory_color_id;
  end if;

  -- Reclaim the candidate if it only exists as a deleted/historical serial.
  insert into private.fabric_serial_registry (
    fabric_code,
    fabric_type,
    type_code,
    sequence_number,
    inventory_item_id,
    inventory_color_id
  ) values (
    v_fabric_code,
    btrim(p_fabric_type),
    v_type_code,
    v_sequence,
    p_inventory_item_id,
    p_inventory_color_id
  )
  on conflict (fabric_code) do update
  set fabric_type = excluded.fabric_type,
      type_code = excluded.type_code,
      sequence_number = excluded.sequence_number,
      inventory_item_id = excluded.inventory_item_id,
      inventory_color_id = excluded.inventory_color_id;

  update public.fabric_type_codes
  set last_sequence = v_sequence,
      updated_at = now()
  where type_code = v_type_code;

  return v_fabric_code;
end;
$$;

revoke all on function private.allocate_fabric_code(text, text, uuid, uuid)
  from public, anon, authenticated;

create or replace function private.get_fabric_type_codes_with_actual_sequence()
returns table (
  id uuid,
  fabric_type text,
  type_code varchar(8),
  last_sequence bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.can_manage_fabric_operations() then
    raise exception 'FABRIC_SEQUENCE_FORBIDDEN';
  end if;

  return query
  select
    type_row.id,
    type_row.fabric_type,
    type_row.type_code,
    greatest(
      coalesce((
        select max(substring(item.base_fabric_code from length(type_row.type_code) + 2)::bigint)
        from public.fabric_inventory item
        where item.base_fabric_code ~ ('^' || type_row.type_code || '-[0-9]+$')
      ), 0),
      coalesce((
        select max(substring(color.fabric_code from length(type_row.type_code) + 2)::bigint)
        from public.fabric_inventory_colors color
        where color.fabric_code ~ ('^' || type_row.type_code || '-[0-9]+$')
      ), 0)
    )::bigint as last_sequence
  from public.fabric_type_codes type_row
  order by type_row.fabric_type;
end;
$$;

revoke all on function private.get_fabric_type_codes_with_actual_sequence()
  from public, anon, authenticated;
grant execute on function private.get_fabric_type_codes_with_actual_sequence()
  to authenticated;

create or replace function public.get_fabric_type_codes_with_actual_sequence()
returns table (
  id uuid,
  fabric_type text,
  type_code varchar(8),
  last_sequence bigint
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.get_fabric_type_codes_with_actual_sequence();
$$;

revoke all on function public.get_fabric_type_codes_with_actual_sequence()
  from public, anon;
grant execute on function public.get_fabric_type_codes_with_actual_sequence()
  to authenticated;

comment on function public.get_fabric_type_codes_with_actual_sequence() is
  'Returns each fabric prefix with the highest serial that is attached to a current item or color.';
