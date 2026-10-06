-- ============================================================================
-- إصلاحات تقرير التدقيق (30 سبتمبر 2026) — الدفعة D: الخصوصية والتشغيل (الجزء الذي في القاعدة)
-- AUD-14 · AUD-10 (محو العنوان) · AUD-09 (نافذة المطابقة)
-- ============================================================================
-- قرارات المالكة (5 أكتوبر 2026): عنوان الشحن يُمحى بعد **90 يوماً** من انتهاء الطلب؛ تنبيهات
-- المتجر في مركز الإشعارات (لا قاعدة هنا).
--
-- ما يتغير:
--   1) AUD-14: الزائر (anon) يقرأ من public.fabrics **أعمدة صريحة** بلا التكلفة والشراء
--      (cost_per_meter، supplier_id، last_purchase_date، last_purchase_price، average_cost). منح الأعمدة إضافي في Postgres: سحب عمود لا يعمل ما دام منح
--      الجدول قائماً، لذلك يُسحب SELECT على الجدول ثم يُمنح على الأعمدة. **عمود جديد لا يراه الزائر**
--      حتى يُمنح صراحةً. authenticated وservice_role كما هما (اللوحة).
--      ⚠ الترتيب: كود الدفعة D (`FABRIC_PUBLIC_COLUMNS` بدل `select('*')`) يُنشر **قبل** هذه الهجرة.
--   2) AUD-10: private.fabric_store_guard_address (حارس المرحلة 2) يسمح أيضاً بمحو عنوان طلب لم يُدفع
--      قط وانتهت مهلة دفعه منذ 90 يوماً (كان يبقى للأبد). وجديد public.fabric_store_purge_addresses:
--      يمحو العناوين المنتهية (90 يوماً من التسليم أو الإلغاء أو الإنشاء لطلب فشل دفعه أو مهلة الدفع
--      لطلب لم يُدفع). المدينة تبقى. تستدعيه المهمة المجدولة.
--   3) AUD-09: fabric_store_due_reconciliation — المدفوع يُطابق يومياً 30 يوماً ثم كل 30 يوماً حتى 120.
-- لا يمس income ولا المخزون ولا مبيعات المحل.
-- التحقق: supabase/tests/fabric_store_privacy_ops.sql (آمن على الحي).
-- التراجع: docs/store-launch-plans/implementation/payments/fixes/FIX-D-rollback.sql
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_refund_record_external(uuid, uuid, uuid, text, bigint, text, text, bigint, uuid)') is null then
    raise exception 'FABRIC_STORE_FIX_C_MISSING: fix batch C must be applied first';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'private.fabric_store_guard_address()'::regprocedure
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) in ('4b60e158afe618323aa9eb12c7a56a9a', '68f6ef6edfbd526af49fa36d92194618'))
     or not exists (select 1 from pg_proc p where p.oid = 'public.fabric_store_due_reconciliation(text, integer)'::regprocedure
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) in ('afed3bc1018e7e1142ea434f42bf00a3', 'beab268fdfdd468c4e702aaf92299b51')) then
    raise exception 'FABRIC_STORE_FIX_D_DRIFT: a deployed function is not the one this migration was written against — inspect it before replacing';
  end if;
  -- كل عمود يُمنح للزائر موجود (إن أُضيف عمود أو حُذف منذ القراءة، يتوقف هنا ولا يتغير شيء)
  if exists (
    select 1 from unnest(array['id', 'name', 'name_en', 'description', 'description_en', 'category', 'type', 'price_per_meter', 'original_price_per_meter', 'is_on_sale', 'discount_percentage', 'image_url', 'thumbnail_image', 'images', 'available_colors', 'width_cm', 'is_available', 'is_active', 'is_featured', 'stock_quantity', 'min_order_meters', 'fabric_weight', 'fabric_texture', 'transparency_level', 'elasticity', 'care_instructions', 'washing_instructions', 'ironing_temperature', 'suitable_for', 'occasions', 'features', 'tags', 'views_count', 'orders_count', 'rating', 'reviews_count', 'country_of_origin', 'created_at', 'updated_at', 'discounted_price_per_meter', 'reorder_level', 'fabric_code', 'inventory_item_id', 'inventory_color_id', 'is_manually_hidden', 'show_stock_quantity', 'deleted_at', 'categories', 'design_images']) as c(name)
    where not exists (select 1 from information_schema.columns ic
                      where ic.table_schema = 'public' and ic.table_name = 'fabrics' and ic.column_name = c.name)
  ) then
    raise exception 'FABRIC_STORE_FIX_D_DRIFT: public.fabrics columns changed — update the anon column list';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) AUD-14: الزائر يقرأ بطاقات القماش بلا أعمدة التكلفة والشراء
-- ---------------------------------------------------------------------------
revoke select on table public.fabrics from anon;
grant select (
  id, name, name_en, description, description_en, category, type, price_per_meter,
  original_price_per_meter, is_on_sale, discount_percentage, image_url, thumbnail_image,
  images, available_colors, width_cm, is_available, is_active, is_featured, stock_quantity,
  min_order_meters, fabric_weight, fabric_texture, transparency_level, elasticity,
  care_instructions, washing_instructions, ironing_temperature, suitable_for, occasions,
  features, tags, views_count, orders_count, rating, reviews_count, country_of_origin,
  created_at, updated_at, discounted_price_per_meter, reorder_level, fabric_code,
  inventory_item_id, inventory_color_id, is_manually_hidden, show_stock_quantity, deleted_at,
  categories, design_images
) on table public.fabrics to anon;

-- ---------------------------------------------------------------------------
-- 2) AUD-10: محو عنوان الشحن بعد 90 يوماً من انتهاء الطلب (قرار المالكة)
-- ---------------------------------------------------------------------------
-- نسخة المرحلة 2 + حالة «لم يُدفع وانتهت مهلته منذ 90 يوماً» (معلَّمة).
create or replace function private.fabric_store_guard_address()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_delivery_method text;
  v_payment_status text;
  v_fulfillment_status text;
  v_payment_due_at timestamptz;
begin
  select o.delivery_method, o.payment_status, o.fulfillment_status, o.payment_due_at
  into v_delivery_method, v_payment_status, v_fulfillment_status, v_payment_due_at
  from public.fabric_store_orders o
  where o.id = new.order_id;

  if tg_op = 'INSERT' then
    if v_delivery_method is distinct from 'shipping' then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_ORDER_ADDRESS_UNEXPECTED|طلب الاستلام من المحل لا يخزَّن له عنوان';
    end if;
    if new.anonymized_at is not null then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_INVALID|العنوان الجديد لا يكون ممحوّاً';
    end if;
    return new;
  end if;

  if new.order_id is distinct from old.order_id or new.created_at is distinct from old.created_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_IMMUTABLE|العنوان مرتبط بطلبه ولا ينتقل';
  end if;
  if old.anonymized_at is not null then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_ANONYMIZED|العنوان مُحي ولا يُعدَّل';
  end if;

  if new.anonymized_at is not null then
    -- المحو بعد انتهاء الطلب فقط: سُلِّم أو أُلغي، أو لم يُسدَّد أصلاً.
    -- الدفعة D (AUD-10): أو طلب لم يُدفع قط وانتهت مهلة دفعه منذ 90 يوماً (لا شحن ولا قماش له).
    if not (v_fulfillment_status in ('delivered', 'cancelled') or v_payment_status = 'failed'
            or (v_payment_status = 'pending' and v_payment_due_at < now() - interval '90 days')) then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STORE_ADDRESS_IN_USE|لا يُمحى عنوان طلب لم ينتهِ بعد';
    end if;
    return new;
  end if;

  -- تصحيح العنوان مسموح قبل الشحن فقط؛ بعده هو ما استُخدم فعلاً.
  if (new.recipient_name, new.recipient_phone, new.city, new.district, new.street,
      new.building_number, new.postal_code, new.additional_number, new.short_address, new.notes)
     is distinct from
     (old.recipient_name, old.recipient_phone, old.city, old.district, old.street,
      old.building_number, old.postal_code, old.additional_number, old.short_address, old.notes)
     and v_fulfillment_status not in ('unfulfilled', 'preparing') then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ADDRESS_LOCKED|لا يُعدَّل العنوان بعد شحن الطلب أو إنهائه';
  end if;

  return new;
end;
$$;

revoke all on function private.fabric_store_guard_address() from public, anon, authenticated;

-- p_retention للاختبار الآمن فقط (المهمة تمرر الافتراضي)؛ لا يقل عن صفر.
create or replace function public.fabric_store_purge_addresses(p_limit integer, p_retention interval default interval '90 days')
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_count integer;
begin
  if p_retention is null or p_retention < interval '0' then
    return jsonb_build_object('status', 'bad_request');
  end if;
  with due as (
    select a.order_id
    from public.fabric_store_order_addresses a
    join public.fabric_store_orders o on o.id = a.order_id
    where a.anonymized_at is null
      and (
        (o.fulfillment_status = 'delivered' and o.delivered_at < clock_timestamp() - p_retention)
        or (o.fulfillment_status = 'cancelled' and o.cancelled_at < clock_timestamp() - p_retention)
        or (o.payment_status = 'failed' and o.created_at < clock_timestamp() - p_retention)
        -- لم يُدفع قط: الحارس يسمح بعد 90 يوماً من مهلة الدفع (ثابتة، لا تتبع p_retention)
        or (o.payment_status = 'pending' and o.payment_due_at < clock_timestamp() - interval '90 days')
      )
    order by a.created_at
    limit greatest(1, least(coalesce(p_limit, 50), 500))
    for update of a skip locked
  )
  update public.fabric_store_order_addresses a
  set recipient_name = null, recipient_phone = null, district = null, street = null, building_number = null,
      postal_code = null, additional_number = null, short_address = null, notes = null,
      anonymized_at = now(), retain_until = coalesce(a.retain_until, now())
  from due
  where a.order_id = due.order_id;
  get diagnostics v_count = row_count;
  return jsonb_build_object('status', 'ok', 'anonymized', v_count);
end;
$$;

revoke all on function public.fabric_store_purge_addresses(integer, interval) from public, anon, authenticated;
grant execute on function public.fabric_store_purge_addresses(integer, interval) to service_role;
comment on function public.fabric_store_purge_addresses(integer, interval) is
  'للخادم فقط (المهمة المجدولة): يمحو عنوان الشحن (عدا المدينة) بعد 90 يوماً من انتهاء الطلب — قرار المالكة 5 أكتوبر 2026، الدفعة D (AUD-10).';

-- ---------------------------------------------------------------------------
-- 3) AUD-09: نافذة مطابقة المدفوع (نسخة المرحلة 9 + الفرع المعلَّم)
-- ---------------------------------------------------------------------------
create or replace function public.fabric_store_due_reconciliation(p_environment text, p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  if p_environment is null or p_environment not in ('test', 'live') then
    return '[]'::jsonb;
  end if;

  with due as (
    select a.id
    from public.fabric_store_payment_attempts a
    join public.fabric_store_orders o on o.id = a.order_id
    where a.environment = p_environment
      and a.provider_invoice_id is not null
      and (a.reconcile_claimed_at is null or a.reconcile_claimed_at < now() - interval '5 minutes')
      and (
        -- لم تُعتمد: صفحة الدفع انتهت (ما دامت مفتوحة فالرجوع والـwebhook أسرع)، خلال 3 أيام
        (a.status <> 'paid'
         and a.expires_at < now()
         and a.created_at > now() - interval '3 days'
         and (a.reconciled_at is null or a.reconciled_at < now() - interval '15 minutes'))
        or
        -- اعتُمدت: مرة في اليوم لمدة 30 يوماً، ثم (الدفعة D، AUD-09) مرة كل 30 يوماً حتى 120 يوماً:
        -- استرداد من لوحة ميسر أو اعتراض بنكي متأخر يُرى (نافذة الاعتراض — للتحقق من ميسر).
        (a.status = 'paid'
         and o.paid_at > now() - interval '120 days'
         and (a.reconciled_at is null
              or a.reconciled_at < now() - case when o.paid_at > now() - interval '30 days'
                                                then interval '24 hours' else interval '30 days' end))
      )
    order by a.reconciled_at nulls first, a.created_at
    limit greatest(1, least(coalesce(p_limit, 20), 50))
    for update of a skip locked
  ), claimed as (
    update public.fabric_store_payment_attempts a
    set reconcile_claimed_at = now(),
        reconcile_claim_token = gen_random_uuid()
    from due
    where a.id = due.id
    returning a.id, a.provider_invoice_id, a.status, a.reconcile_claim_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'attempt_id', c.id, 'invoice_id', c.provider_invoice_id,
           'status', c.status, 'claim_token', c.reconcile_claim_token)), '[]'::jsonb)
  into v_rows
  from claimed c;
  return v_rows;
end;
$$;

revoke all on function public.fabric_store_due_reconciliation(text, integer) from public, anon, authenticated;
grant execute on function public.fabric_store_due_reconciliation(text, integer) to service_role;

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- ============================================================================
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'private.fabric_store_guard_address()'::regprocedure;
  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
