-- معالجة ملاحظات مستشاري Supabase الخاصة بتكامل مخزون الأقمشة.
alter function public.update_fabric_inventory_updated_at() set search_path = public, pg_temp;
alter function public.update_inventory_quantity() set search_path = public, pg_temp;
alter function public.update_color_quantity() set search_path = public, pg_temp;

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
