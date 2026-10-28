-- ============================================================================
-- التراجع عن هجرة 20261027120000 (سعر المتر بريال كامل) — يعيد القيدين الصارمين للمرحلة 2.
-- ============================================================================
-- التراجع العادي هو إعادة الكود السابق فقط: القيدان الموسّعان يقبلان الطريقة القديمة، فلا حاجة
-- لهذا الملف. شغّليه فقط إن طُلب إرجاع القاعدة نفسها، وبعد إرجاع الكود أولاً.
-- يرفض (ولا يغيّر شيئاً) متى وُجد طلب أو سطر أُنشئ بالقاعدة الجديدة: الطلبات لا تُحذف،
-- وإعادة القيد القديم عليها مستحيلة.
-- ============================================================================
set local lock_timeout = '5s';

-- نفس ترتيب أقفال المسار الحي: الطلب ثم أسطره.
lock table public.fabric_store_orders, public.fabric_store_order_items in access exclusive mode;

do $$
begin
  if exists (
    select 1 from public.fabric_store_orders o
    where o.vat_halalas <> ((o.items_net_halalas + o.shipping_net_halalas) * o.vat_basis_points + 5000) / 10000
  ) or exists (
    select 1 from public.fabric_store_order_items i
    where i.net_halalas <> case i.purchase_mode
      when 'piece' then i.unit_price_halalas * i.quantity_pieces
      else (i.unit_price_halalas * i.quantity_cm + 50) / 100
    end
  ) then
    raise exception 'FABRIC_STORE_WHOLE_RIYAL_ROLLBACK_REFUSED: orders already use the whole-riyal rule; keep the widened constraints';
  end if;
end $$;

alter table public.fabric_store_orders
  drop constraint fabric_store_orders_vat_rule,
  add constraint fabric_store_orders_vat_rule
    check (vat_halalas = ((items_net_halalas + shipping_net_halalas) * vat_basis_points + 5000) / 10000);

alter table public.fabric_store_order_items
  drop constraint fabric_store_order_items_net_rule,
  add constraint fabric_store_order_items_net_rule
    check (
      net_halalas = case purchase_mode
        when 'piece' then unit_price_halalas * quantity_pieces
        else (unit_price_halalas * quantity_cm + 50) / 100
      end
    );

comment on constraint fabric_store_orders_vat_rule on public.fabric_store_orders is null;
comment on constraint fabric_store_order_items_net_rule on public.fabric_store_order_items is null;
