-- ============================================================================
-- حزمة الترحيلات المعلّقة الآمنة — 19 نوفمبر 2026
-- ============================================================================
-- 8 ترحيلات، كل ملف منسوخ حرفياً من supabase/migrations بالترتيب الزمني.
-- التغيير الوحيد: سطرا begin;/commit; داخل ملف 20261018120000 حُذفا لأن الحزمة كلها
-- معاملة واحدة: إما تنطبق كلها أو لا ينطبق شيء.
--
-- غير مشمول عمداً: 20261119140000_drop_personal_expenses.sql (يمسح بيانات؛ يُطبّق بعد نشر الكود).
--
-- طريقة التطبيق: الصق الملف كاملاً في Supabase SQL Editor واضغط Run.
-- إن ظهر خطأ فيه DRIFT أو ENCODING فلم يتغير شيء — أرسل نص الخطأ.
-- في النهاية جدول تحقق: كل الأسطر يجب أن تكون true.
-- ============================================================================

begin;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261006120000_fabric_store_purge_retention_floor.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- الدفعة E — تصحيحات المراجعة المستقلة (REVIEW-CD.md، 6 أكتوبر 2026): R-CD-06
-- ============================================================================
-- fabric_store_purge_addresses (الدفعة D) كانت تقبل أي مدة احتفاظ غير سالبة (معامل «للاختبار»)،
-- فمستدعٍ بمفتاح الخدمة يستطيع محو عنوان طلب سُلّم للتو. الآن 90 يوماً حدٌ أدنى (قرار المالكة،
-- 5 أكتوبر 2026). التوقيع كما هو، والمهمة المجدولة تمرر الافتراضي — لا تغيير في الكود.
-- لا يمس إلا هذه الدالة. التطبيق في أي وقت من SQL Editor.
-- التحقق: supabase/tests/fabric_store_purge_retention_floor.sql (آمن على الحي).
-- التراجع: docs/store-launch-plans/implementation/payments/fixes/FIX-E-rollback.sql
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if not exists (
    select 1 from pg_proc p
    where p.oid = to_regprocedure('public.fabric_store_purge_addresses(integer, interval)')
      and md5(replace(p.prosrc, E'\r\n', E'\n')) in ('3af7279de38df1f43082b4a2bc44f753', '7e9dc8df2aaaffff0c6d0b8e003c7ebc')
  ) then
    raise exception 'FABRIC_STORE_FIX_E_DRIFT: fabric_store_purge_addresses is not the batch D version — inspect it before replacing';
  end if;
end $$;

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
  -- الدفعة E (المراجعة R-CD-06): قرار المالكة 90 يوماً حدٌ أدنى في الدالة نفسها، لا اصطلاح للمستدعي.
  -- (كانت تقبل أي مدة غير سالبة «للاختبار» فيستطيع مستدعٍ مخوّل محو عنوان طلب سُلّم أمس.)
  if p_retention is null or p_retention < interval '90 days' then
    return jsonb_build_object('status', 'bad_request', 'minimum', '90 days');
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
  'للخادم فقط (المهمة المجدولة): يمحو عنوان الشحن (عدا المدينة) بعد 90 يوماً على الأقل من انتهاء الطلب — قرار المالكة 5 أكتوبر 2026 (AUD-10)؛ الحد الأدنى مفروض منذ الدفعة E (R-CD-06).';

-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
do $$
declare
  v_body text;
begin
  select p.prosrc into v_body from pg_proc p
  where p.oid = 'public.fabric_store_purge_addresses(integer, interval)'::regprocedure;
  if position(chr(1575) || chr(1604) || chr(1605) || chr(1575) || chr(1604) || chr(1603) || chr(1577) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261018120000_fabric_store_push_and_delete.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- طلبات المتجر الإلكتروني: إشعارات المتصفح (Web Push) + حذف الطلب للمدير (18 أكتوبر 2026).
-- المالك يطبّق هذا الملف من SQL Editor؛ لا تنفيذ على الإنتاج من المساعد.
--
-- 1) staff_push_subscriptions: اشتراكات إشعارات المتصفح لكل جهاز (المدير ومدير متجر الأقمشة).
-- 2) fabric_store_order_push_log: «أُرسل إشعار هذا الطلب» — مرة واحدة لكل طلب مهما تكرر السداد
--    (webhook + صفحة الرجوع + المهمة المجدولة).
-- 3) fabric_store_orders.deleted_at/deleted_by + fabric_store_staff_delete_order: «حذف» الطلب
--    إخفاءٌ من قوائم اللوحة، لا محو: محاولات الدفع وأحداث ميسر والاستردادات مربوطة بالطلب
--    بـ ON DELETE RESTRICT عمداً (أثر مالي لا يُمحى). يُحذف فقط طلب لا مال عليه:
--    ملغى قبل الدفع، أو مسترد كاملاً. للمدير الفعّال فقط، ويُسجَّل في سجل الطلب.
--
-- التراجع: drop function public.fabric_store_staff_delete_order(uuid, uuid, text);
--          alter table public.fabric_store_orders drop column deleted_by, drop column deleted_at;
--          drop table public.fabric_store_order_push_log; drop table public.staff_push_subscriptions;

-- (begin; محذوف — الحزمة معاملة واحدة)
set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.staff_push_subscriptions') is not null
     or to_regclass('public.fabric_store_order_push_log') is not null
     or to_regprocedure('public.fabric_store_staff_delete_order(uuid,uuid,text)') is not null then
    raise exception 'FABRIC_STORE_PUSH_EXISTS: inspect the existing definitions; do not overwrite';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) اشتراكات الإشعارات — يقرؤها ويكتبها الخادم (service_role) فقط
-- ---------------------------------------------------------------------------
create table public.staff_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  constraint staff_push_subscriptions_endpoint_key unique (endpoint),
  constraint staff_push_subscriptions_endpoint_https check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  constraint staff_push_subscriptions_keys_size check (char_length(p256dh) <= 200 and char_length(auth) <= 100),
  constraint staff_push_subscriptions_user_agent_size check (user_agent is null or char_length(user_agent) <= 300)
);
create index staff_push_subscriptions_user_idx on public.staff_push_subscriptions (user_id);
alter table public.staff_push_subscriptions enable row level security;
revoke all on table public.staff_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.staff_push_subscriptions to service_role;

-- ---------------------------------------------------------------------------
-- 2) سجل «أُرسل إشعار الطلب الجديد»
-- ---------------------------------------------------------------------------
create table public.fabric_store_order_push_log (
  order_id uuid primary key references public.fabric_store_orders(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.fabric_store_order_push_log enable row level security;
revoke all on table public.fabric_store_order_push_log from public, anon, authenticated;
grant select, insert on table public.fabric_store_order_push_log to service_role;

-- ---------------------------------------------------------------------------
-- 3) حذف الطلب (إخفاء) للمدير
-- ---------------------------------------------------------------------------
alter table public.fabric_store_orders
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.users(id) on delete set null;

create index fabric_store_orders_not_deleted_idx
  on public.fabric_store_orders (created_at desc) where deleted_at is null;

-- النتيجة (status): ok · already_deleted · not_found · bad_request · forbidden · not_deletable
create function public.fabric_store_staff_delete_order(p_order_id uuid, p_actor_id uuid, p_note text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_order public.fabric_store_orders%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_order_id is null or p_actor_id is null or char_length(coalesce(v_note, '')) > 300 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if not private.fabric_store_actor_is_admin(p_actor_id) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select o.* into v_order from public.fabric_store_orders o where o.id = p_order_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_order.deleted_at is not null then
    return jsonb_build_object('status', 'already_deleted');
  end if;

  -- لا مال على الطلب: ملغى ولم يُدفع، أو رُدّ كامل مبلغه. ولا علامة مراجعة، ولا استرداد معلّق،
  -- ولا دفعة ناجحة (ولو إضافية أو متأخرة بعد الإلغاء) لم يُرد كامل مبلغها.
  if not (
       (v_order.fulfillment_status = 'cancelled' and v_order.payment_status in ('pending', 'failed'))
       or v_order.payment_status = 'refunded'
     )
     or v_order.needs_review
     or exists (select 1 from public.fabric_store_refunds r where r.order_id = p_order_id and r.status = 'pending')
     or exists (select 1 from public.fabric_store_payment_attempts a
                where a.order_id = p_order_id and a.status = 'paid'
                  and a.amount_halalas > coalesce((select sum(r.amount_halalas) from public.fabric_store_refunds r
                                                   where r.attempt_id = a.id and r.status = 'succeeded'), 0)) then
    return jsonb_build_object('status', 'not_deletable');
  end if;

  update public.fabric_store_orders
  set deleted_at = now(), deleted_by = p_actor_id
  where id = p_order_id;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id,
          'حُذف الطلب من قوائم اللوحة' || coalesce(' — ' || v_note, ''));

  return jsonb_build_object('status', 'ok');
end;
$$;

revoke all on function public.fabric_store_staff_delete_order(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.fabric_store_staff_delete_order(uuid, uuid, text) to service_role;

-- (commit; محذوف — الحزمة معاملة واحدة)

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261024120000_fabric_product_reviews.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- تقييمات الأقمشة من مشتريات حقيقية فقط (24 أكتوبر 2026).
--
-- كل تقييم مربوط بطلب متجر إلكتروني مدفوع ومستلَم يحتوي هذا القماش، وتقييم واحد
-- لكل قماش في الطلب. الكتابة من الخادم وحده (service_role) بعد التحقق من رمز الطلب
-- (كوكي المتصفح أو رابط التتبّع)؛ لا يكتب الزائر في الجدول مباشرة.
-- القراءة العامة للتقييمات المنشورة فقط، وبأعمدة العرض وحدها (لا رقم طلب).
-- إخفاء تقييم: status = 'hidden' (لا حذف، حتى يبقى مانع التكرار).

create table if not exists public.fabric_product_reviews (
  id uuid primary key default gen_random_uuid(),
  fabric_id uuid not null references public.fabrics(id) on delete cascade,
  order_id uuid not null references public.fabric_store_orders(id) on delete restrict,
  rating smallint not null,
  comment text,
  reviewer_name text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fabric_product_reviews_rating check (rating between 1 and 5),
  constraint fabric_product_reviews_comment
    check (comment is null or char_length(btrim(comment)) between 1 and 1000),
  constraint fabric_product_reviews_reviewer_name
    check (char_length(btrim(reviewer_name)) between 2 and 40),
  constraint fabric_product_reviews_status check (status in ('published', 'hidden')),
  constraint fabric_product_reviews_one_per_order unique (order_id, fabric_id)
);

create index if not exists fabric_product_reviews_published_idx
  on public.fabric_product_reviews (fabric_id, created_at desc)
  where status = 'published';

alter table public.fabric_product_reviews enable row level security;

revoke all on table public.fabric_product_reviews from anon, authenticated;
grant select (id, fabric_id, rating, comment, reviewer_name, created_at)
  on table public.fabric_product_reviews to anon, authenticated;
grant select, insert, update on table public.fabric_product_reviews to service_role;

drop policy if exists "fabric_product_reviews_public_read" on public.fabric_product_reviews;
create policy "fabric_product_reviews_public_read"
  on public.fabric_product_reviews
  for select
  to anon, authenticated
  using (status = 'published');

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261027120000_fabric_store_whole_riyal_meter_price.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261119120000_income_seller_name.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- اسم البائع في مبيعات قسم الأقمشة (19 نوفمبر 2026)
-- ============================================================================
-- يُختار البائع (عدنان أو مهيب) إجبارياً عند تسجيل مبيعة جديدة من صفحة
-- «مبيعات الأقمشة». العمود نصّي بلا قيد CHECK، فإضافة بائع جديد لاحقاً تكون من
-- الكود فقط (src/lib/fabric-sellers.ts) بلا migration جديدة.
--
-- الإجبار في النموذج وحده: السجلات القديمة ومبيعات المتجر الإلكتروني تبقى NULL.
--
-- التراجع: ALTER TABLE public.income DROP COLUMN IF EXISTS seller_name;
-- ============================================================================

ALTER TABLE public.income
  ADD COLUMN IF NOT EXISTS seller_name VARCHAR(100) NULL;

COMMENT ON COLUMN public.income.seller_name IS 'اسم البائع في مبيعات قسم الأقمشة (عدنان / مهيب)';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261119130000_fabric_store_worldwide_shipping.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- متجر الأقمشة: الشحن لكل دول العالم (19 نوفمبر 2026، قرار المالكة)
-- ============================================================================
-- قبلها كان عنوان الشحن «عنواناً وطنياً» سعودياً فقط. هذه الترحيلة:
--   ١) تضيف country_code (ISO 3166-1 ثنائي، افتراضيه SA فكل العناوين القديمة سعودية).
--   ٢) الرمز البريدي: 5 أرقام في السعودية، وحروف إنجليزية وأرقام خارجها (مثل SW1A 1AA).
--   ٣) العنوان الإلزامي: في السعودية العنوان المختصر أو الحي والشارع معاً (كما كان)؛
--      خارجها سطر العنوان (street) يكفي.
--   ٤) رقم المبنى والرقم الإضافي والعنوان المختصر للسعودية وحدها.
--   ٥) fabric_store_create_checkout: نفس تعريف 20261003120000 حرفياً، والفرق الوحيد
--      إدخال country_code من p_request.address (غيابه = SA، فالكود القديم يبقى صحيحاً).
--
-- الشحن نفسه صار مجانياً في الكود (shipping = 0)، والقاعدة تقبل الصفر أصلاً — لا تغيير هنا.
-- جوال الزبونة الدولي: قيود القاعدة كانت E.164 عامة من البداية — لا تغيير.
--
-- الترتيب: طبّقيها قبل نشر الكود (صفحة الطلبات تقرأ country_code، والكود الجديد يرسل
-- رموزاً بريدية غير سعودية).
--
-- التراجع (قبل وصول أي طلب دولي):
--   أعيدي تعريف fabric_store_create_checkout من 20261003120000، ثم:
--   alter table public.fabric_store_order_addresses
--     drop constraint fabric_store_order_addresses_national_fields_sa,
--     drop constraint fabric_store_order_addresses_country_code,
--     drop constraint fabric_store_order_addresses_postal_code,
--     add constraint fabric_store_order_addresses_postal_code
--       check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
--     drop constraint fabric_store_order_addresses_required,
--     add constraint fabric_store_order_addresses_required check (
--       anonymized_at is not null
--       or (recipient_name is not null and recipient_phone is not null and city is not null
--           and (short_address is not null or (district is not null and street is not null)))),
--     drop column country_code;
-- ============================================================================

alter table public.fabric_store_order_addresses
  add column if not exists country_code text not null default 'SA';

alter table public.fabric_store_order_addresses
  add constraint fabric_store_order_addresses_country_code
    check (country_code ~ '^[A-Z]{2}$'),
  drop constraint fabric_store_order_addresses_postal_code,
  add constraint fabric_store_order_addresses_postal_code
    check (
      postal_code is null
      or (country_code = 'SA' and postal_code ~ '^[0-9]{5}$')
      or (country_code <> 'SA' and postal_code ~ '^[A-Z0-9][A-Z0-9 -]{1,11}$')
    ),
  drop constraint fabric_store_order_addresses_required,
  add constraint fabric_store_order_addresses_required
    check (
      anonymized_at is not null
      or (recipient_name is not null
          and recipient_phone is not null
          and city is not null
          and (short_address is not null
               or (street is not null and (district is not null or country_code <> 'SA'))))
    ),
  add constraint fabric_store_order_addresses_national_fields_sa
    check (country_code = 'SA'
           or (building_number is null and additional_number is null and short_address is null));

comment on column public.fabric_store_order_addresses.country_code is
  'دولة الشحن (ISO 3166-1 ثنائي). SA للعناوين السعودية وكل ما قبل 19 نوفمبر 2026. لا يُمحى مع البيانات الشخصية (للإحصاء).';

create or replace function public.fabric_store_create_checkout(p_request jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '800ms'
as $$
declare
  -- ثوابت العمل (المالك، 24 سبتمبر 2026؛ والدفعة B، 1 أكتوبر 2026). تغييرها = هجرة جديدة.
  -- c_hold صار مهلة الضغط على «ادفعي» (payment_due_at)، لا مدة حجز: لا حجز قبل الدفع.
  c_hold interval := interval '30 minutes';
  c_max_lines integer := 5;
  c_access interval := interval '90 days';
  c_per_client_10m integer := 6;
  c_per_client_day integer := 30;
  c_live_orders_per_phone integer := 3;
  c_live_orders_total integer := 50;

  v_key uuid;
  v_fingerprint bytea;
  v_access_hash bytea;
  v_client_hash bytea;
  v_supersede_hash bytea;
  v_phone text;
  v_items jsonb;
  v_item jsonb;
  v_line integer;
  v_listing record;
  v_existing record;
  v_old record;
  v_order_id uuid;
  v_order_number text;
  v_hold_until timestamptz;
  v_mode text;
  v_state text;
  v_message text;
  v_code text;
begin
  -- مدخلات لا تُقرأ (معرّف أو بصمة تالفة) تُرفض قبل أي أثر.
  begin
    v_key := (p_request ->> 'checkout_key')::uuid;
    v_fingerprint := decode(p_request ->> 'request_fingerprint', 'hex');
    v_access_hash := decode(p_request ->> 'access_token_hash', 'hex');
    v_client_hash := decode(p_request ->> 'client_hash', 'hex');
    v_supersede_hash := decode(nullif(p_request ->> 'supersede_access_hash', ''), 'hex');
    v_phone := p_request -> 'customer' ->> 'phone';
    v_items := p_request -> 'items';
  exception when data_exception then
    return jsonb_build_object('status', 'bad_request');
  end;

  if v_key is null
     or octet_length(v_fingerprint) is distinct from 32
     or octet_length(v_access_hash) is distinct from 32
     or octet_length(v_client_hash) is distinct from 32
     or (v_supersede_hash is not null and octet_length(v_supersede_hash) <> 32)
     or v_phone is null
     or jsonb_typeof(v_items) is distinct from 'array' then
    return jsonb_build_object('status', 'bad_request');
  end if;
  -- منفصل عمّا قبله: ترتيب تقييم OR في SQL غير مضمون، وjsonb_array_length ترمي لغير المصفوفة.
  if jsonb_array_length(v_items) not between 1 and 40 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  -- الدفعة B (AUD-02): الطلب غير المدفوع لا يتجاوز c_max_lines سطراً (قرار المالكة).
  if jsonb_array_length(v_items) > c_max_lines then
    return jsonb_build_object('status', 'rejected', 'code', 'FABRIC_STORE_TOO_MANY_LINES',
      'message', format('الطلب الإلكتروني يصل إلى %s أقمشة؛ للكميات الأكبر تواصلي مع المحل', c_max_lines));
  end if;

  -- طلبان متزامنان بالمفتاح نفسه يُسلسلان هنا: الثاني يرى الأول بعد التزامه.
  perform pg_advisory_xact_lock(hashtextextended('fabric_store_checkout:' || v_key::text, 0));

  select o.id, o.order_number, o.request_fingerprint, o.access_token_hash, o.total_halalas,
         o.payment_due_at, o.payment_status, o.fulfillment_status
  into v_existing
  from public.fabric_store_orders o
  where o.checkout_key = v_key;

  if found then
    if v_existing.request_fingerprint = v_fingerprint and v_existing.access_token_hash = v_access_hash then
      return jsonb_build_object(
        'status', 'existing',
        'order_id', v_existing.id,
        'order_number', v_existing.order_number,
        'total_halalas', v_existing.total_halalas,
        'hold_expires_at', v_existing.payment_due_at,
        'payment_status', v_existing.payment_status,
        'fulfillment_status', v_existing.fulfillment_status);
    end if;
    return jsonb_build_object('status', 'key_reused');
  end if;

  -- حدود المعدّل: تُحتسب قبل الكتلة المحمية، فلا يمحوها رفض الطلب.
  if not private.fabric_store_take_rate_limit('checkout_10m', v_client_hash, c_per_client_10m, interval '10 minutes')
     or not private.fabric_store_take_rate_limit('checkout_day', v_client_hash, c_per_client_day, interval '1 day') then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  begin
    -- ١) طلب سابق من نفس المتصفح لم يُدفع ولم تبدأ له محاولة دفع: يُلغى ويُحرَّر
    --    حجزه أولاً، فلا تحجز الزبونة القماش نفسه مرتين ولا تنافس نفسها على آخر قطعة.
    if v_supersede_hash is not null then
      for v_old in
        select o.id
        from public.fabric_store_orders o
        where o.access_token_hash = v_supersede_hash
          and o.payment_status = 'pending'
          and o.fulfillment_status = 'unfulfilled'
        for update
      loop
        if not exists (
          select 1 from public.fabric_store_payment_attempts attempt
          where attempt.order_id = v_old.id
            and attempt.status in ('created', 'initiated', 'authorized', 'paid')
        ) then
          perform private.fabric_store_release_order_reservations(v_old.id, 'استُبدل بطلب أحدث من نفس المتصفح');
          perform set_config('fabric_store.actor_type', 'system', true);
          update public.fabric_store_orders
          set fulfillment_status = 'cancelled',
              cancel_reason = 'استُبدل بطلب أحدث من نفس المتصفح قبل الدفع'
          where id = v_old.id;
        end if;
      end loop;
    end if;

    -- ٢) سقوف الطلبات الحيّة (محجوزة ولم تُدفع): لكل هاتف، وللمتجر كله. تحمي قماش
    --    المحل من أن يُحجز كله بطلبات لا تنوي الدفع. تُرمى (لا return) حتى يُلغى
    --    الاستبدال أعلاه معها: طلب قديم لا يُلغى لأجل طلب جديد لم يُنشأ.
    if (select count(*) from public.fabric_store_orders o
        where o.customer_phone = v_phone
          and o.payment_status = 'pending'
          and o.fulfillment_status = 'unfulfilled'
          and exists (select 1 from public.fabric_store_stock_reservations r
                      where r.order_id = o.id and r.status = 'active' and r.expires_at > now()))
       >= c_live_orders_per_phone then
      raise exception using errcode = 'P0001', message = 'FABRIC_STORE_PHONE_LIMIT|limit';
    end if;
    if (select count(distinct r.order_id) from public.fabric_store_stock_reservations r
        where r.status = 'active' and r.expires_at > now()) >= c_live_orders_total then
      raise exception using errcode = 'P0001', message = 'FABRIC_STORE_STORE_BUSY|limit';
    end if;

    -- ٣) الطلب نفسه. فحوص الاتساق مؤجَّلة حتى تُدرج الأسطر (قد يكون المستدعي جعلها فورية).
    set constraints public.fabric_store_orders_consistency,
                    public.fabric_store_order_items_consistency,
                    public.fabric_store_order_addresses_consistency deferred;
    v_hold_until := clock_timestamp() + c_hold;
    perform set_config('fabric_store.actor_type', 'customer', true);

    insert into public.fabric_store_orders (
      access_token_hash, access_expires_at, checkout_key, request_fingerprint,
      customer_name, customer_phone, customer_email,
      delivery_method, delivery_option_code, delivery_option_label,
      vat_basis_points, items_net_halalas, shipping_net_halalas, shipping_vat_halalas,
      vat_halalas, total_halalas, payment_due_at,
      terms_version, returns_policy_version, privacy_policy_version, policies_accepted_at,
      marketing_opt_in
    ) values (
      v_access_hash, now() + c_access, v_key, v_fingerprint,
      p_request -> 'customer' ->> 'name', v_phone, nullif(p_request -> 'customer' ->> 'email', ''),
      p_request -> 'delivery' ->> 'method',
      nullif(p_request -> 'delivery' ->> 'option_code', ''),
      nullif(p_request -> 'delivery' ->> 'option_label', ''),
      1500,
      (p_request -> 'totals' ->> 'items_net_halalas')::bigint,
      coalesce((p_request -> 'delivery' ->> 'shipping_net_halalas')::bigint, 0),
      coalesce((p_request -> 'delivery' ->> 'shipping_vat_halalas')::bigint, 0),
      (p_request -> 'totals' ->> 'vat_halalas')::bigint,
      (p_request -> 'totals' ->> 'total_halalas')::bigint,
      v_hold_until,
      p_request -> 'policies' ->> 'terms',
      p_request -> 'policies' ->> 'returns',
      p_request -> 'policies' ->> 'privacy',
      now(),
      coalesce((p_request ->> 'marketing_opt_in')::boolean, false)
    )
    returning id, order_number into v_order_id, v_order_number;

    -- ٤) الأسطر: الأرقام من الخادم (تتحقق منها القيود والحجز)، والنص ومراجع
    --    المخزون من بطاقة المتجر نفسها.
    v_line := 0;
    for v_item in select value from jsonb_array_elements(v_items)
    loop
      v_line := v_line + 1;
      select listing.id, listing.name, listing.fabric_code, (listing.available_colors)[1] as color,
             coalesce((listing.images)[1], listing.thumbnail_image, listing.image_url) as image,
             listing.inventory_item_id, listing.inventory_color_id
      into v_listing
      from public.fabrics listing
      where listing.id = (v_item ->> 'fabric_id')::uuid;

      if not found or v_listing.inventory_item_id is null then
        raise exception using
          errcode = 'P0001',
          message = 'FABRIC_STORE_LISTING_UNAVAILABLE|أحد الأقمشة في السلة لم يعد متاحاً للشراء الإلكتروني';
      end if;

      v_mode := v_item ->> 'purchase_mode';
      insert into public.fabric_store_order_items (
        order_id, line_number, fabric_id, inventory_item_id, inventory_color_id,
        fabric_code, fabric_name, color_name, image_url,
        purchase_mode, piece_length_cm, quantity_pieces, quantity_cm, stock_consumption_cm,
        price_per_meter_halalas, discount_basis_points, unit_price_halalas,
        net_halalas, vat_halalas, gross_halalas
      ) values (
        v_order_id, v_line, v_listing.id, v_listing.inventory_item_id, v_listing.inventory_color_id,
        left(nullif(btrim(v_listing.fabric_code), ''), 60),
        left(coalesce(nullif(btrim(v_listing.name), ''), nullif(btrim(v_listing.fabric_code), ''), 'قماش'), 200),
        left(nullif(btrim(v_listing.color), ''), 60),
        case when v_listing.image ~ '^https://' and char_length(v_listing.image) <= 1000 then v_listing.image end,
        v_mode,
        case when v_mode = 'piece' then (v_item ->> 'piece_length_cm')::integer end,
        case when v_mode = 'piece' then 1 end,
        case when v_mode = 'meter' then (v_item ->> 'quantity_cm')::integer end,
        case when v_mode = 'piece' then (v_item ->> 'piece_length_cm')::integer
             else (v_item ->> 'quantity_cm')::integer end,
        (v_item ->> 'price_per_meter_halalas')::bigint,
        (v_item ->> 'discount_basis_points')::integer,
        (v_item ->> 'unit_price_halalas')::bigint,
        (v_item ->> 'net_halalas')::bigint,
        (v_item ->> 'vat_halalas')::bigint,
        (v_item ->> 'net_halalas')::bigint + (v_item ->> 'vat_halalas')::bigint
      );
    end loop;

    -- ٥) عنوان الشحن (يرفضه حارس المرحلة 2 لطلب الاستلام).
    if jsonb_typeof(p_request -> 'address') = 'object' then
      insert into public.fabric_store_order_addresses (
        order_id, country_code, recipient_name, recipient_phone, city, district, street,
        building_number, postal_code, additional_number, short_address, notes
      ) values (
        v_order_id,
        coalesce(nullif(p_request -> 'address' ->> 'country_code', ''), 'SA'),
        p_request -> 'address' ->> 'recipient_name',
        p_request -> 'address' ->> 'recipient_phone',
        p_request -> 'address' ->> 'city',
        nullif(p_request -> 'address' ->> 'district', ''),
        nullif(p_request -> 'address' ->> 'street', ''),
        nullif(p_request -> 'address' ->> 'building_number', ''),
        nullif(p_request -> 'address' ->> 'postal_code', ''),
        nullif(p_request -> 'address' ->> 'additional_number', ''),
        nullif(p_request -> 'address' ->> 'short_address', ''),
        nullif(p_request -> 'address' ->> 'notes', '')
      );
    end if;

    -- ٦) الدفعة B (AUD-02): لا حجز قبل «ادفعي». يُجرَّب الحجز الذري (المرحلة 3) كاملاً
    --    — البطاقة والسعر والظهور والمتاح تحت أقفال المخزون نفسها — ثم يُلغى داخل كتلة
    --    فرعية: لا يبقى صف حجز، وتُفك الأقفال فوراً. الزبونة تعرف الآن إن تغيّر شيء، والمحل
    --    لا يُحجز عنه شيء. الحجز الحقيقي في fabric_store_begin_payment.
    begin
      perform private.fabric_store_reserve_order(v_order_id, v_hold_until);
      raise exception using errcode = 'P0001', message = 'FABRIC_STORE_DRY_RUN|ok';
    exception when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state is distinct from 'P0001' or v_message is distinct from 'FABRIC_STORE_DRY_RUN|ok' then
        raise;
      end if;
    end;

    -- ٧) اتساق الطلب (مجموع الأسطر، حصص الضريبة، العنوان) يُفحص الآن لا عند الالتزام،
    --    ليقع أي خلل داخل هذه الكتلة فيُلغى الطلب كله ويعود رفضاً مفهوماً. بالأسماء لا
    --    بـall، ثم تُعاد مؤجَّلة: الإعداد يبقى لبقية المعاملة، وطلب ثانٍ في المعاملة
    --    نفسها كان سيُفحص قبل أن تُدرج أسطره.
    set constraints public.fabric_store_orders_consistency,
                    public.fabric_store_order_items_consistency,
                    public.fabric_store_order_addresses_consistency immediate;
    set constraints public.fabric_store_orders_consistency,
                    public.fabric_store_order_items_consistency,
                    public.fabric_store_order_addresses_consistency deferred;
  exception
    when others then
      get stacked diagnostics v_state = returned_sqlstate, v_message = message_text;
      if v_state = '55P03' then
        raise;  -- انتظار قفل: الخادم يعيد المحاولة
      end if;
      if v_state = 'P0001' and position('|' in v_message) > 0 then
        v_code := split_part(v_message, '|', 1);
        v_message := substr(v_message, position('|' in v_message) + 1);
      elsif v_state like '23%' or v_state like '22%' then
        v_code := 'FABRIC_STORE_ORDER_INVALID';
        v_message := 'بيانات الطلب غير متسقة؛ أعيدي مراجعة السلة';
      else
        raise;
      end if;
      if v_code = 'FABRIC_STORE_PHONE_LIMIT' then
        return jsonb_build_object('status', 'phone_limit');
      elsif v_code = 'FABRIC_STORE_STORE_BUSY' then
        return jsonb_build_object('status', 'store_busy');
      end if;
      return jsonb_build_object('status', 'rejected', 'code', v_code, 'message', left(v_message, 500),
                                'sqlstate', v_state);
  end;

  return jsonb_build_object(
    'status', 'created',
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_halalas', (p_request -> 'totals' ->> 'total_halalas')::bigint,
    'hold_expires_at', v_hold_until,
    'payment_status', 'pending',
    'fulfillment_status', 'unfulfilled');
end;
$$;

revoke all on function public.fabric_store_create_checkout(jsonb) from public, anon, authenticated;
grant execute on function public.fabric_store_create_checkout(jsonb) to service_role;

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261119130000_orders_taken_by.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- من أخذ الطلب (19 نوفمبر 2026)
-- ============================================================================
-- عند حفظ طلب تفصيل جديد من صفحة «إضافة طلب» تظهر نافذة «مين أخذ الطلب؟»
-- (وليد / عبد الرحمن — المدير / شخص آخر يُكتب اسمه). العمود نصّي بلا قيد
-- CHECK، فإضافة اسم جديد لاحقاً تكون من الكود فقط (src/lib/order-takers.ts).
--
-- يجب تطبيقها قبل نشر الكود: صفحة إضافة الطلب ترسل taken_by دائماً.
-- الطلبات القديمة والطلبات المنشأة من أماكن أخرى تبقى NULL.
--
-- التراجع: ALTER TABLE public.orders DROP COLUMN IF EXISTS taken_by;
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS taken_by VARCHAR(100) NULL;

COMMENT ON COLUMN public.orders.taken_by IS 'من أخذ الطلب من الزبونة (وليد / عبد الرحمن / اسم يُكتب يدوياً)';

-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> 20261119150000_alteration_and_measurement_taken_by.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ============================================================================
-- من أخذ التعديل + من أخذ المقاس (19 نوفمبر 2026)
-- ============================================================================
-- 1) alterations.taken_by: سؤال إجباري ثالث عند حفظ طلب تعديل
--    «مين أخذ التعديل؟» (هبة / منال / ندى).
-- 2) orders.measurement_taken_by: اختيار إجباري في نافذة المقاسات
--    «مين أخذ المقاس؟» من نفس الأسماء.
--
-- العمودان نصّيان بلا قيد CHECK، فإضافة اسم جديد تكون من الكود فقط
-- (src/lib/reception-staff.ts). السجلات القديمة تبقى NULL.
--
-- يجب تطبيقها قبل نشر الكود.
--
-- التراجع:
--   ALTER TABLE public.alterations DROP COLUMN IF EXISTS taken_by;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS measurement_taken_by;
-- ============================================================================

ALTER TABLE public.alterations
  ADD COLUMN IF NOT EXISTS taken_by VARCHAR(100) NULL;

COMMENT ON COLUMN public.alterations.taken_by IS 'من أخذ طلب التعديل من الزبونة (هبة / منال / ندى)';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS measurement_taken_by VARCHAR(100) NULL;

COMMENT ON COLUMN public.orders.measurement_taken_by IS 'من أخذ مقاس الزبونة (هبة / منال / ندى)';

commit;

-- ============================================================================
-- تحقق بعد التطبيق (قراءة فقط) — كل الأسطر يجب أن تكون true
-- ============================================================================
select check_name, ok from (values
  ('20261006 purge retention floor', exists (select 1 from pg_proc where oid = to_regprocedure('public.fabric_store_purge_addresses(integer, interval)') and prosrc like '%< interval ''90 days''%')),
  ('20261018 staff_push_subscriptions', to_regclass('public.staff_push_subscriptions') is not null),
  ('20261018 fabric_store_order_push_log', to_regclass('public.fabric_store_order_push_log') is not null),
  ('20261018 fabric_store_orders.deleted_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fabric_store_orders' and column_name = 'deleted_at')),
  ('20261024 fabric_product_reviews', to_regclass('public.fabric_product_reviews') is not null),
  ('20261027 whole-riyal vat rule', exists (select 1 from pg_constraint where conname = 'fabric_store_orders_vat_rule' and pg_get_constraintdef(oid) like '%total_halalas%')),
  ('20261119 income.seller_name', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'income' and column_name = 'seller_name')),
  ('20261119 addresses.country_code', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'fabric_store_order_addresses' and column_name = 'country_code')),
  ('20261119 orders.taken_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'taken_by')),
  ('20261119 alterations.taken_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'alterations' and column_name = 'taken_by')),
  ('20261119 orders.measurement_taken_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'orders' and column_name = 'measurement_taken_by'))
) as t(check_name, ok);
