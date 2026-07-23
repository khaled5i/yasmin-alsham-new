-- يجب تأجيل التحقق لأن الرقم يُحجز في BEFORE INSERT قبل اكتمال إدراج
-- صنف المخزون أو اللون داخل المعاملة نفسها.
alter table private.fabric_serial_registry
  drop constraint if exists fabric_serial_registry_inventory_item_id_fkey,
  add constraint fabric_serial_registry_inventory_item_id_fkey
    foreign key (inventory_item_id)
    references public.fabric_inventory(id)
    on delete set null
    deferrable initially deferred;

alter table private.fabric_serial_registry
  drop constraint if exists fabric_serial_registry_inventory_color_id_fkey,
  add constraint fabric_serial_registry_inventory_color_id_fkey
    foreign key (inventory_color_id)
    references public.fabric_inventory_colors(id)
    on delete set null
    deferrable initially deferred;
