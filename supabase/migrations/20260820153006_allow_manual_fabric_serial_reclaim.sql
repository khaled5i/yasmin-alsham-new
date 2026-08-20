-- Allow authorized inventory managers to change a fabric/color sequence number.
-- A previously deleted serial may be reclaimed, but a serial used by a live
-- inventory item, color, or store listing remains protected from duplication.

create or replace function public.set_fabric_serial_number(
  p_inventory_item_id uuid,
  p_sequence_number bigint,
  p_inventory_color_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.fabric_inventory%rowtype;
  v_color public.fabric_inventory_colors%rowtype;
  v_type_code text;
  v_fabric_code text;
  v_current_code text;
begin
  if not private.can_manage_fabric_operations() then
    raise exception 'FABRIC_SERIAL_FORBIDDEN';
  end if;

  if p_sequence_number is null or p_sequence_number <= 0 then
    raise exception 'FABRIC_SERIAL_INVALID';
  end if;

  select * into v_item
  from public.fabric_inventory
  where id = p_inventory_item_id
  for update;

  if not found then
    raise exception 'FABRIC_SERIAL_ITEM_NOT_FOUND';
  end if;

  v_type_code := upper(btrim(coalesce(v_item.type_code, '')));
  if v_type_code = '' or v_type_code !~ '^[A-Z0-9]{1,8}$' then
    raise exception 'FABRIC_SERIAL_INVALID_PREFIX';
  end if;

  if p_inventory_color_id is not null then
    select * into v_color
    from public.fabric_inventory_colors
    where id = p_inventory_color_id
      and inventory_item_id = p_inventory_item_id
    for update;

    if not found then
      raise exception 'FABRIC_SERIAL_COLOR_NOT_FOUND';
    end if;
    v_current_code := v_color.fabric_code;
  else
    if exists (
      select 1
      from public.fabric_inventory_colors
      where inventory_item_id = p_inventory_item_id
    ) then
      raise exception 'FABRIC_SERIAL_REQUIRES_COLOR';
    end if;
    v_current_code := v_item.base_fabric_code;
  end if;

  v_fabric_code := v_type_code || '-' || lpad(p_sequence_number::text, 4, '0');
  if v_fabric_code = v_current_code then
    return v_fabric_code;
  end if;

  perform pg_advisory_xact_lock(hashtext('fabric-sequence:' || v_type_code));

  if exists (
    select 1
    from public.fabric_inventory inventory
    where inventory.base_fabric_code = v_fabric_code
      and (p_inventory_color_id is not null or inventory.id <> p_inventory_item_id)
  ) or exists (
    select 1
    from public.fabric_inventory_colors color
    where color.fabric_code = v_fabric_code
      and (p_inventory_color_id is null or color.id <> p_inventory_color_id)
  ) or exists (
    select 1
    from public.fabrics fabric
    where fabric.fabric_code = v_fabric_code
      and not (
        fabric.inventory_item_id = p_inventory_item_id
        and (
          (p_inventory_color_id is null and fabric.inventory_color_id is null)
          or fabric.inventory_color_id = p_inventory_color_id
        )
      )
  ) then
    raise exception 'FABRIC_SERIAL_IN_USE';
  end if;

  -- Clear stale links left by earlier automatic allocations for this target.
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

  insert into private.fabric_serial_registry (
    fabric_code,
    fabric_type,
    type_code,
    sequence_number,
    inventory_item_id,
    inventory_color_id
  ) values (
    v_fabric_code,
    v_item.fabric_type,
    v_type_code,
    p_sequence_number,
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
  set last_sequence = greatest(last_sequence, p_sequence_number),
      updated_at = now()
  where type_code = v_type_code;

  if p_inventory_color_id is null then
    update public.fabric_inventory
    set base_fabric_code = v_fabric_code
    where id = p_inventory_item_id;
    perform private.sync_fabric_store_listing(p_inventory_item_id, null);
  else
    update public.fabric_inventory_colors
    set fabric_code = v_fabric_code
    where id = p_inventory_color_id;
  end if;

  return v_fabric_code;
end;
$$;

revoke all on function public.set_fabric_serial_number(uuid, bigint, uuid)
  from public, anon;
grant execute on function public.set_fabric_serial_number(uuid, bigint, uuid)
  to authenticated;

comment on function public.set_fabric_serial_number(uuid, bigint, uuid) is
  'Changes or reclaims a fabric serial after checking live inventory, color, and store usage.';
