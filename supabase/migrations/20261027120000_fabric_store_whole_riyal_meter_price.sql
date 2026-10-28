-- ============================================================================
-- سعر المتر بريال كامل شاملاً الضريبة (قرار المالكة، 27 أكتوبر 2026)
-- ============================================================================
-- كان سعر المتر المعروض والمدفوع = سعره قبل الضريبة + 15% بالهللة (250 ⇒ 287.50).
-- صار يُقرَّب لأقرب ريال كامل (288)، والزبونة تدفع 288 للمتر بالضبط. لا يمكن ذلك
-- والضريبة تُحسب من الصافي: لا يوجد صافٍ بالهللة يعطي 288.00 بعد إضافة 15%
-- (25043 ⇒ 287.99، 25044 ⇒ 288.01). لذلك ينقلب الحساب للطلبات الجديدة:
--   - سطر الطلب شاملاً الضريبة = سعر المتر الشامل (ريال كامل) × الأمتار، بلا تقريب.
--   - الإجمالي = مجموع الأسطر + الشحن الشامل، والضريبة تُستخرج منه مرة واحدة:
--     round(الإجمالي × 15 / 115) نصف للأعلى، ثم تُوزّع على الأسطر كما كانت.
-- الكود في src/lib/fabric-store/pricing.ts (getFabricGrossPricePerMeterHalalas،
-- computeFabricGrossOrderBreakdown) ونفس الدوال تعرض السعر في المتجر.
--
-- هذه الهجرة توسّع قيدين فقط ليقبلا الطريقتين: طلبات ما قبلها (ضريبة من الصافي) تبقى
-- صحيحة كما هي، والطلبات الجديدة تُقبل بالقاعدة الجديدة. لا دالة ولا بيانات تتغير،
-- والقيود الأخرى كما هي (مجموع الأسطر = مجموع الطلب، حصص الضريبة، الإجمالي = صافي + ضريبة،
-- سعر الوحدة قبل الضريبة = السعر × الخصم).
--
-- الترتيب: طبّقي هذه الهجرة قبل نشر الكود. الكود القديم يبقى يعمل بعدها (فرعه القديم مقبول)،
-- أما الكود الجديد قبلها فيُرفض كل طلب له عند الإنشاء.
-- القفل: ACCESS EXCLUSIVE على جدولي الطلبات وأسطرها لحظة فحص صفوفهما (عشرات الصفوف).
-- التحقق: supabase/tests/fabric_store_whole_riyal_meter_price.sql (آمن على الحي، لا يُدرج شيئاً).
-- التراجع: docs/store-launch-plans/implementation/payments/fixes/FIX-whole-riyal-rollback.sql
-- ============================================================================
set local lock_timeout = '5s';

-- القيدان القديمان كما أنشأتهما المرحلة 2 بالضبط، وإلا فلا نستبدل شيئاً لم نقرأه.
do $$
begin
  if (select regexp_replace(pg_get_constraintdef(c.oid), '\s+', ' ', 'g')
      from pg_constraint c
      where c.conrelid = 'public.fabric_store_orders'::regclass
        and c.conname = 'fabric_store_orders_vat_rule')
     is distinct from
     'CHECK ((vat_halalas = ((((items_net_halalas + shipping_net_halalas) * vat_basis_points) + 5000) / 10000)))'
  then
    raise exception 'FABRIC_STORE_WHOLE_RIYAL_DRIFT: fabric_store_orders_vat_rule is not the stage 2 version — inspect it before replacing';
  end if;

  if (select regexp_replace(pg_get_constraintdef(c.oid), '\s+', ' ', 'g')
      from pg_constraint c
      where c.conrelid = 'public.fabric_store_order_items'::regclass
        and c.conname = 'fabric_store_order_items_net_rule')
     is distinct from
     'CHECK ((net_halalas = CASE purchase_mode WHEN ''piece''::text THEN (unit_price_halalas * quantity_pieces) ELSE (((unit_price_halalas * quantity_cm) + 50) / 100) END))'
  then
    raise exception 'FABRIC_STORE_WHOLE_RIYAL_DRIFT: fabric_store_order_items_net_rule is not the stage 2 version — inspect it before replacing';
  end if;
end $$;

-- 1) ضريبة الطلب: من الصافي (قبل 27 أكتوبر)، أو مستخرجة من الإجمالي الشامل:
--    round(total × bp / (10000 + bp)) نصف للأعلى = (2·total·bp + D) / 2D حيث D = 10000 + bp.
alter table public.fabric_store_orders
  drop constraint fabric_store_orders_vat_rule,
  add constraint fabric_store_orders_vat_rule check (
    vat_halalas = ((items_net_halalas + shipping_net_halalas) * vat_basis_points + 5000) / 10000
    or vat_halalas = (total_halalas * vat_basis_points * 2 + 10000 + vat_basis_points)
                     / ((10000 + vat_basis_points) * 2)
  );

-- 2) سطر الطلب: صافيه = سعر الوحدة × الكمية (قبل 27 أكتوبر)، أو مبلغه الشامل = سعر المتر
--    الشامل بريال كامل × السنتيمترات. سعر المتر الشامل بالريال =
--    round(round(السعر × (1 − الخصم)) × 1.15 / 100): نفس getFabricGrossPricePerMeterHalalas.
--    11500 = 10000 + ضريبة 1500، وهي التي تثبّتها fabric_store_create_checkout لكل طلب.
--    القطعة: stock_consumption_cm = طولها وquantity_pieces = 1 (قيد quantity_shape).
alter table public.fabric_store_order_items
  drop constraint fabric_store_order_items_net_rule,
  add constraint fabric_store_order_items_net_rule check (
    net_halalas = case purchase_mode
      when 'piece' then unit_price_halalas * quantity_pieces
      else (unit_price_halalas * quantity_cm + 50) / 100
    end
    or (
      net_halalas >= 0
      and ((price_per_meter_halalas * (10000 - discount_basis_points) + 5000) / 10000 * 11500 + 500000) / 1000000 > 0
      and gross_halalas = stock_consumption_cm
        * (((price_per_meter_halalas * (10000 - discount_basis_points) + 5000) / 10000 * 11500 + 500000) / 1000000)
    )
  );

comment on constraint fabric_store_orders_vat_rule on public.fabric_store_orders is
  'الضريبة على مجموع الطلب مرة واحدة نصف للأعلى: من الصافي (طلبات ما قبل 27 أكتوبر 2026)، أو مستخرجة من الإجمالي الشامل (سعر المتر بريال كامل) — computeFabricGrossOrderTotals.';
comment on constraint fabric_store_order_items_net_rule on public.fabric_store_order_items is
  'صافي السطر = سعر الوحدة × الكمية (قبل 27 أكتوبر 2026)، أو مبلغه الشامل = سعر المتر الشامل بريال كامل × الأمتار — computeFabricLineGrossHalalas.';

-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
do $$
declare
  v_comment text;
begin
  select d.description into v_comment
  from pg_description d
  join pg_constraint c on c.oid = d.objoid
  where c.conrelid = 'public.fabric_store_orders'::regclass
    and c.conname = 'fabric_store_orders_vat_rule';
  if v_comment is null
     or position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_comment) = 0
     or position(chr(1591) || chr(167) in v_comment) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;
