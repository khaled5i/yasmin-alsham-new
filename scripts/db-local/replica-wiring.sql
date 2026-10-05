-- Triggers, grants and RLS exactly as on production (22 Sep 2026).

revoke all on function private.validate_fabric_inventory_availability() from public, anon, authenticated;
revoke all on function private.sync_fabric_sale_inventory() from public, anon, authenticated;
revoke all on function private.prepare_fabric_sale_inventory_tracking() from public, anon, authenticated;
revoke all on function private.validate_fabric_movement_color() from public, anon, authenticated;

create trigger validate_fabric_inventory_availability_trigger
  before insert on public.fabric_inventory_movements
  for each row execute function private.validate_fabric_inventory_availability();
create trigger validate_fabric_movement_color_trigger
  before insert on public.fabric_inventory_movements
  for each row execute function private.validate_fabric_movement_color();
create trigger fabric_color_quantity_trigger
  after insert or delete on public.fabric_inventory_movements
  for each row execute function update_color_quantity();
create trigger fabric_inventory_quantity_trigger
  after insert or delete on public.fabric_inventory_movements
  for each row execute function update_inventory_quantity();
create trigger prepare_fabric_sale_inventory_tracking_trigger
  before insert or update of fabric_inventory_tracked on public.income
  for each row execute function private.prepare_fabric_sale_inventory_tracking();
create trigger sync_fabric_sale_inventory_trigger
  after insert or update of branch, category, fabric_items, customer_name, quantity_meters, date on public.income
  for each row execute function private.sync_fabric_sale_inventory();
create trigger trigger_set_income_invoice_number
  before insert on public.income
  for each row execute function set_income_invoice_number();

-- live definition (verbatim, read 29 Sep 2026)
create or replace function private.prevent_fabric_manager_sent_sale_changes()
returns trigger language plpgsql security definer set search_path to '' as $function$
BEGIN
  IF OLD.branch = 'fabrics'
     AND OLD.payment_method = 'network'
     AND (
       OLD.alostaz_invoice_id IS NOT NULL
       OR NULLIF(BTRIM(COALESCE(OLD.alostaz_invoice_code, '')), '') IS NOT NULL
       OR OLD.alostaz_sync_status = 'sent'
     )
     AND EXISTS (
       SELECT 1
       FROM public.users AS u
       JOIN public.workers AS w ON w.user_id = u.id
       WHERE u.id = (SELECT auth.uid())
         AND u.is_active = TRUE
         AND u.role = 'worker'
         AND w.worker_type = 'fabric_store_manager'
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Fabric-store managers cannot update or delete a network sale sent to accounting.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;
revoke all on function private.prevent_fabric_manager_sent_sale_changes() from public, anon, authenticated;
create trigger protect_sent_fabric_sales_from_fabric_managers
  before delete or update on public.income
  for each row execute function private.prevent_fabric_manager_sent_sale_changes();

alter table public.fabric_inventory enable row level security;
alter table public.fabric_inventory_colors enable row level security;
alter table public.fabric_inventory_movements enable row level security;
alter table public.income enable row level security;
alter table public.expenses enable row level security;

create policy "fabric inventory select" on public.fabric_inventory for select to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric inventory insert" on public.fabric_inventory for insert to authenticated with check ((select private.can_manage_fabric_operations()));
create policy "fabric inventory update" on public.fabric_inventory for update to authenticated using ((select private.can_manage_fabric_operations())) with check ((select private.can_manage_fabric_operations()));
create policy "fabric inventory delete" on public.fabric_inventory for delete to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric colors select" on public.fabric_inventory_colors for select to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric colors insert" on public.fabric_inventory_colors for insert to authenticated with check ((select private.can_manage_fabric_operations()));
create policy "fabric colors update" on public.fabric_inventory_colors for update to authenticated using ((select private.can_manage_fabric_operations())) with check ((select private.can_manage_fabric_operations()));
create policy "fabric colors delete" on public.fabric_inventory_colors for delete to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric movements select" on public.fabric_inventory_movements for select to authenticated using ((select private.can_manage_fabric_operations()));
create policy "fabric movements insert" on public.fabric_inventory_movements for insert to authenticated with check ((select private.can_manage_fabric_operations()));
create policy "fabric movements update" on public.fabric_inventory_movements for update to authenticated using ((select private.can_manage_fabric_operations())) with check ((select private.can_manage_fabric_operations()));
create policy "fabric movements delete" on public.fabric_inventory_movements for delete to authenticated using ((select private.can_manage_fabric_operations()));
-- income / expenses policies exactly as on production before fix batch A (read 1 Oct 2026):
-- four `to public using (true)` policies each, and every privilege for anon (default ACL above).
-- Migration 20261001120000 replaces them; tests that need the pre-fix state run without it.
create policy income_select_policy on public.income for select to public using (true);
create policy income_insert_policy on public.income for insert to public with check (true);
create policy income_update_policy on public.income for update to public using (true);
create policy income_delete_policy on public.income for delete to public using (true);
create policy expenses_select_policy on public.expenses for select to public using (true);
create policy expenses_insert_policy on public.expenses for insert to public with check (true);
create policy expenses_update_policy on public.expenses for update to public using (true);
create policy expenses_delete_policy on public.expenses for delete to public using (true);

-- مزامنة مبسّطة لبطاقة المتجر (تقريب لدوال الإنتاج: يكفي لفحوص السعر والظهور والمخزون)
create or replace function public.replica_sync_fabric_listing()
returns trigger language plpgsql as $$
declare
  v_price numeric;
begin
  select sale_price_per_unit into v_price from public.fabric_inventory where id = new.inventory_item_id;
  insert into public.fabrics (inventory_item_id, inventory_color_id, fabric_code, price_per_meter, stock_quantity,
                              is_available, is_active)
  values (new.inventory_item_id, new.id, new.fabric_code, v_price, greatest(new.current_quantity, 0),
          new.current_quantity > 0, new.current_quantity > 0)
  on conflict (inventory_color_id) do update
    set price_per_meter = excluded.price_per_meter,
        stock_quantity = excluded.stock_quantity,
        is_available = excluded.is_available,
        is_active = case when public.fabrics.is_manually_hidden or public.fabrics.deleted_at is not null
                         then false else excluded.is_active end;
  return new;
end;
$$;
create unique index fabrics_inventory_color_key on public.fabrics (inventory_color_id);
create trigger replica_sync_fabric_listing_trigger
  after insert or update of current_quantity, fabric_code on public.fabric_inventory_colors
  for each row execute function public.replica_sync_fabric_listing();

insert into public.users (id, email, full_name, role, is_active) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'admin@test.invalid', 'مدير', 'admin', true),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'fabrics@test.invalid', 'مدير الأقمشة', 'worker', true),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'tailor@test.invalid', 'خياط', 'worker', true);
-- fix batch A: the other staff identities the finance policies distinguish (created later so the
-- "first operator by created_at" pick in older tests stays the same)
insert into public.users (id, email, full_name, role, is_active, created_at) values
  ('aaaaaaaa-0000-4000-8000-000000000004', 'accountant@test.invalid', 'محاسب', 'worker', true, now() + interval '1 second'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'gm@test.invalid', 'مدير عام', 'worker', true, now() + interval '1 second'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'workshop@test.invalid', 'مدير ورشة', 'worker', true, now() + interval '1 second'),
  ('aaaaaaaa-0000-4000-8000-000000000007', 'old-admin@test.invalid', 'مدير موقوف', 'admin', false, now() + interval '1 second'),
  ('aaaaaaaa-0000-4000-8000-000000000008', 'old-fabrics@test.invalid', 'مدير أقمشة موقوف', 'worker', false, now() + interval '1 second');
insert into public.workers (user_id, worker_type) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'fabric_store_manager'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'tailor'),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'accountant'),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'general_manager'),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'workshop_manager'),
  ('aaaaaaaa-0000-4000-8000-000000000008', 'fabric_store_manager');

-- one real colour for the stage 2 test to reference
insert into public.fabric_inventory (id, name, fabric_type) values ('11111111-1111-4111-8111-111111111111', 'SEED', 'seed');
insert into public.fabric_inventory_colors (id, inventory_item_id, color_name)
values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'seed');
insert into public.fabric_inventory_movements (inventory_item_id, color_id, movement_type, quantity)
values ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'in', 50);
