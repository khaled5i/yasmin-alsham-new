-- ============================================================================
-- متجر الأقمشة الإلكتروني — الحجز الذري وتوحيد المخزون مع مبيعات المحل
-- المرحلة 3 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- قرار المالك (21 سبتمبر 2026): «حجز موحّد». أثناء نافذة الدفع الإلكتروني
-- لا تبيع شاشة المحل الكمية المحجوزة، وتعرض رسالة واضحة. بعد نجاح الدفع
-- تُخصم (المرحلة 6)، وإن فشل أو انتهت المدة تعود للبيع تلقائياً.
--
-- ما تغيّره هذه الهجرة في النظام القائم — شيء واحد فقط:
--   private.validate_fabric_inventory_availability() — الحارس الذي تمر به كل
--   حركة صرف من المخزون (مبيعات المحل عبر income، والصرف اليدوي من شاشة
--   المخزون). يبقى كما هو حرفياً، ويُضاف إليه فحص واحد بعد القفل:
--     المتاح للصرف = الرصيد − الحجوزات الإلكترونية السارية.
--   ما دام جدول الحجوزات فارغاً (قبل إطلاق المتجر) لا يتغير سلوكه إطلاقاً.
--
--   وتصحيح جانبي: رسائله العربية في القاعدة الحية مخزّنة مشوّهة (UTF-8 قُرئ
--   كـWindows-1256 عند تطبيق هجرة 20260823161026)، فيرى موظف المحل مثلاً
--   «ط§ظ„ظƒظ…ظٹط©» بدل «الكمية». النص هنا هو نص تلك الهجرة الأصلي الصحيح.
--
-- ما تضيفه:
--   • private.fabric_store_stock_hold          — مجموع الحجوزات السارية على صنف/لون.
--   • private.fabric_store_reserve_order       — حجز ذري لكل أسطر طلب (المرحلة 4 تستدعيه).
--   • private.fabric_store_release_order_reservations — تحرير فوري عند إلغاء طلب لم يُدفع.
--   • private.fabric_store_expire_reservations — وسم المنتهية (تنظيف؛ الحجز يتوقف عن
--     الحساب عند انتهاء مدته بلا هذه المهمة).
--
-- شرط مسبق: هجرة المرحلة 2 (20260924102616). الهجرة ترفض العمل بدونها، لأن
-- الحارس المعدَّل يقرأ جدول الحجوزات؛ ولو غاب الجدول لتوقفت كل مبيعات المحل.
--
-- التطبيق: خارج ساعات عمل المحل (استبدال دالة الحارس يقفلها لحظياً).
-- التحقق بعدها: supabase/tests/fabric_store_reservations.sql (داخل معاملة تُلغى).
-- التراجع: تقرير المرحلة 3 §9 — يعيد الحارس أولاً ثم يحذف الدوال الجديدة.
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.fabric_store_stock_reservations') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE2_MISSING|طبّق هجرة المرحلة 2 (20260924102616) قبل هذه الهجرة';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) الحجوزات السارية على وحدة مخزون واحدة (لون، أو صنف بلا ألوان)
-- ---------------------------------------------------------------------------
-- security definer: يقرأ جدول الحجوزات المغلق عن المتصفح. يستدعيه حارس المخزون
-- وهو يعمل بصلاحيات موظف المحل (authenticated)، ويملك USAGE على private.
-- إن غاب جدول الحجوزات (تراجع خاطئ عن المرحلة 2) يُرجع صفراً بدل أن يُسقط
-- كل مبيعات المحل: لا جدول = لا حجوزات.

create or replace function private.fabric_store_stock_hold(
  p_inventory_item_id uuid,
  p_color_id uuid
)
returns table (reserved_cm bigint, hold_until timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller text := coalesce(nullif(current_setting('role', true), ''), 'none');
begin
  -- القرار على **دور الجلسة** لا على وجود هوية: JWT بلا sub كان يمر من شرط
  -- «auth.uid() ليست فارغة». أدوار المتصفح (anon وauthenticated) يجب أن تكون
  -- مخوّلة بالمخزون، وغيرها (service_role عبر دالة في public، ودوال المالك،
  -- والهجرات) يمر: هي التي تحجز وتعتمد. GUC الدور لا يتغير بـsecurity definer،
  -- فيبقى دور المستدعي مرئياً هنا حتى داخل سلسلة دوال يملكها postgres.
  if v_caller = 'anon'
     or (v_caller = 'authenticated' and not private.can_manage_fabric_operations()) then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_HOLD_FORBIDDEN|قراءة حجوزات المتجر مقصورة على المخوّلين بالمخزون';
  end if;

  if to_regclass('public.fabric_store_stock_reservations') is null then
    return query select 0::bigint, null::timestamptz;
    return;
  end if;

  if p_color_id is not null then
    return query
      select coalesce(sum(r.quantity_cm), 0)::bigint, max(r.expires_at)
      from public.fabric_store_stock_reservations r
      where r.inventory_color_id = p_color_id
        and r.status = 'active'
        and r.expires_at > now();
  else
    return query
      select coalesce(sum(r.quantity_cm), 0)::bigint, max(r.expires_at)
      from public.fabric_store_stock_reservations r
      where r.inventory_item_id = p_inventory_item_id
        and r.inventory_color_id is null
        and r.status = 'active'
        and r.expires_at > now();
  end if;
end;
$$;

revoke all on function private.fabric_store_stock_hold(uuid, uuid) from public, anon, authenticated;
grant execute on function private.fabric_store_stock_hold(uuid, uuid) to authenticated, service_role;

comment on function private.fabric_store_stock_hold(uuid, uuid) is
  'مجموع الحجوزات الإلكترونية السارية (active ولم تنتهِ مدتها) بالسنتيمتر، وآخر موعد انتهاء بينها.';

-- ---------------------------------------------------------------------------
-- 2) حارس المخزون — النسخة الحالية حرفياً + فحص الحجوزات
-- ---------------------------------------------------------------------------
-- يبقى security invoker كما هو: يعمل بصلاحيات من يصرف (موظف المحل).

create or replace function private.validate_fabric_inventory_availability()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_available numeric;
  v_fabric_code text;
  v_unit text;
  v_reserved_cm bigint;
  v_hold_until timestamptz;
  v_free numeric;
begin
  if new.movement_type <> 'out' then
    return new;
  end if;

  if new.color_id is not null then
    select
      color.current_quantity,
      coalesce(color.fabric_code, item.base_fabric_code, item.name),
      item.unit
    into v_available, v_fabric_code, v_unit
    from public.fabric_inventory_colors color
    join public.fabric_inventory item on item.id = color.inventory_item_id
    where color.id = new.color_id
      and color.inventory_item_id = new.inventory_item_id
    for update of color;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_NOT_FOUND|رقم القماش المحدد غير موجود في المخزون';
    end if;
  else
    if exists (
      select 1
      from public.fabric_inventory_colors color
      where color.inventory_item_id = new.inventory_item_id
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_COLOR_REQUIRED|يجب تحديد رقم القماش المرتبط باللون حتى يتم خصم الكمية الصحيحة';
    end if;

    select
      item.current_quantity,
      coalesce(item.base_fabric_code, item.name),
      item.unit
    into v_available, v_fabric_code, v_unit
    from public.fabric_inventory item
    where item.id = new.inventory_item_id
    for update of item;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'FABRIC_STOCK_NOT_FOUND|رقم القماش المحدد غير موجود في المخزون';
    end if;
  end if;

  if new.quantity > v_available then
    raise exception using
      errcode = 'P0001',
      message = format(
        'FABRIC_STOCK_INSUFFICIENT|الكمية المطلوبة من القماش %s (%s %s) أكبر من الرصيد المتاح (%s %s)',
        v_fabric_code,
        new.quantity,
        case when v_unit = 'meter' then 'متر' else 'قطعة' end,
        v_available,
        case when v_unit = 'meter' then 'متر' else 'قطعة' end
      );
  end if;

  -- جديد (المرحلة 3): ما حجزته زبونة تدفع الآن في المتجر الإلكتروني لا يُصرف هنا.
  -- الحجز يقفل صف المخزون نفسه المقفول أعلاه، فبعد الحصول على القفل يرى هذا
  -- الاستعلام كل حجز أُودع قبلنا، ولا يُحجز شيء جديد حتى تنتهي هذه المعاملة.
  select hold.reserved_cm, hold.hold_until
  into v_reserved_cm, v_hold_until
  from private.fabric_store_stock_hold(new.inventory_item_id, new.color_id) hold;

  if v_reserved_cm > 0 then
    v_free := greatest(v_available - v_reserved_cm / 100.0, 0);
    if new.quantity > v_free then
      raise exception using
        errcode = 'P0001',
        message = format(
          'FABRIC_STOCK_RESERVED|لا يمكن صرف %s متر من القماش %s الآن: %s متر منه محجوزة لطلب إلكتروني قيد الدفع، والمتاح للبيع في المحل %s متر. يعود المحجوز تلقائياً إن لم يكتمل الدفع قبل الساعة %s',
          trim_scale(new.quantity),
          v_fabric_code,
          trim_scale(v_reserved_cm / 100.0),
          trim_scale(v_free),
          to_char(v_hold_until at time zone 'Asia/Riyadh', 'HH24:MI')
        );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_fabric_inventory_availability() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) الحجز الذري لطلب كامل — كله أو لا شيء
-- ---------------------------------------------------------------------------

-- lock_timeout أقصر من deadlock_timeout (ثانية في Supabase): عند تعارض أقفال مع
-- مبيعة محل (ترتيب معاكس للألوان) يتراجع الحجز الإلكتروني أولاً ويُعاد، ولا
-- يُلغي Postgres مبيعة الموظف أمام الزبونة الحاضرة.
create or replace function private.fabric_store_reserve_order(
  p_order_id uuid,
  p_expires_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
set lock_timeout = '800ms'
as $$
declare
  v_order_payment text;
  v_order_fulfillment text;
  v_unit record;
  v_line record;
  v_physical numeric;
  v_item_unit text;
  v_fabric_code text;
  v_physical_cm bigint;
  v_reserved_cm bigint;
  v_listing_price numeric;
  v_listing_on_sale boolean;
  v_listing_discount numeric;
  v_listing_visible boolean;
  v_listing_matches boolean;
  v_count integer;
begin
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '2 hours' then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_HOLD_WINDOW|مدة الحجز يجب أن تنتهي خلال ساعتين من الآن';
  end if;

  select o.payment_status, o.fulfillment_status
  into v_order_payment, v_order_fulfillment
  from public.fabric_store_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FABRIC_STORE_ORDER_NOT_FOUND|الطلب غير موجود';
  end if;
  if v_order_payment <> 'pending' or v_order_fulfillment <> 'unfulfilled' then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ORDER_NOT_RESERVABLE|الطلب لم يعد قابلاً للحجز';
  end if;
  if exists (select 1 from public.fabric_store_stock_reservations r where r.order_id = p_order_id) then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_ALREADY_RESERVED|هذا الطلب محجوز مسبقاً';
  end if;

  -- وحدة مخزون واحدة في كل مرة وبترتيب ثابت، فيقل التعارض بين طلبين متزامنين.
  for v_unit in
    select item.inventory_item_id,
           item.inventory_color_id,
           sum(item.stock_consumption_cm)::bigint as required_cm
    from public.fabric_store_order_items item
    where item.order_id = p_order_id
    group by item.inventory_item_id, item.inventory_color_id
    order by item.inventory_color_id nulls last, item.inventory_item_id
  loop
    -- نفس قفل الصف الذي يأخذه حارس مبيعات المحل: من يصل أولاً يكمل، والآخر ينتظر ثم يرى أثره.
    if v_unit.inventory_color_id is not null then
      select color.current_quantity, inv.unit, coalesce(color.fabric_code, inv.base_fabric_code, inv.name)
      into v_physical, v_item_unit, v_fabric_code
      from public.fabric_inventory_colors color
      join public.fabric_inventory inv on inv.id = color.inventory_item_id
      where color.id = v_unit.inventory_color_id
        and color.inventory_item_id = v_unit.inventory_item_id
      for update of color;
    else
      if exists (
        select 1 from public.fabric_inventory_colors color
        where color.inventory_item_id = v_unit.inventory_item_id
      ) then
        raise exception using
          errcode = 'P0001',
          message = 'FABRIC_STORE_STOCK_COLOR_REQUIRED|هذا الصنف له ألوان؛ السطر يجب أن يحدد اللون';
      end if;
      select inv.current_quantity, inv.unit, coalesce(inv.base_fabric_code, inv.name)
      into v_physical, v_item_unit, v_fabric_code
      from public.fabric_inventory inv
      where inv.id = v_unit.inventory_item_id
      for update of inv;
    end if;

    if not found then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_STOCK_NOT_FOUND|قماش في الطلب لم يعد موجوداً في المخزون';
    end if;
    if v_item_unit is distinct from 'meter' then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_UNIT_UNSUPPORTED|القماش %s لا يُباع بالمتر ولا يُحجز إلكترونياً', v_fabric_code);
    end if;

    v_physical_cm := greatest(floor(v_physical * 100), 0)::bigint;

    -- طريقة البيع تُشتق من المخزون الفعلي كما يشتقها المتجر: 3 أو 3.5م قطعة كاملة.
    -- إن تغيّر المخزون منذ عرض السعر تغيّر معنى الطلب، فيُرفض ليُعاد عرض السعر.
    -- ومعه يُقارَن السعر والخصم وظهور القماش الحيّة بلقطة السطر، تحت القفل نفسه:
    -- سعر تغيّر بين عرض السعر والحجز لا يمر بالسعر القديم.
    for v_line in
      select item.purchase_mode, item.piece_length_cm, item.fabric_id,
             item.price_per_meter_halalas, item.discount_basis_points
      from public.fabric_store_order_items item
      where item.order_id = p_order_id
        and item.inventory_item_id = v_unit.inventory_item_id
        and item.inventory_color_id is not distinct from v_unit.inventory_color_id
    loop
      if (v_line.purchase_mode = 'piece' and v_line.piece_length_cm is distinct from v_physical_cm)
         or (v_line.purchase_mode = 'meter' and v_physical_cm in (300, 350)) then
        raise exception using
          errcode = 'P0001',
          message = format('FABRIC_STORE_STOCK_CHANGED|تغيّر المتوفر من القماش %s منذ عرض السعر؛ أعيدي مراجعة السلة', v_fabric_code);
      end if;

      -- نفس قاعدة الظهور في isFabricPubliclyVisible حرفياً (الفارغ ليس إخفاءً).
      -- ومعها: البطاقة يجب أن تكون بطاقة **هذه** وحدة المخزون نفسها. بدون هذا
      -- الشرط يكفي أن يشير السطر إلى بطاقة قماش أرخص ليمر سعرها على مخزون أغلى.
      select listing.price_per_meter, listing.is_on_sale, listing.discount_percentage,
             (listing.deleted_at is null
              and listing.is_active is distinct from false
              and listing.is_available is distinct from false
              and listing.is_manually_hidden is distinct from true),
             (listing.inventory_item_id is not distinct from v_unit.inventory_item_id
              and listing.inventory_color_id is not distinct from v_unit.inventory_color_id)
      into v_listing_price, v_listing_on_sale, v_listing_discount, v_listing_visible, v_listing_matches
      from public.fabrics listing
      where listing.id = v_line.fabric_id;

      if not found then
        raise exception using
          errcode = 'P0001',
          message = format('FABRIC_STORE_LISTING_UNAVAILABLE|القماش %s لم يعد معروضاً في المتجر', v_fabric_code);
      end if;
      if not v_listing_matches then
        raise exception using
          errcode = 'P0001',
          message = format('FABRIC_STORE_LISTING_MISMATCH|بطاقة المتجر في السطر لا تخص القماش %s المطلوب صرفه', v_fabric_code);
      end if;
      if not v_listing_visible then
        raise exception using
          errcode = 'P0001',
          message = format('FABRIC_STORE_LISTING_UNAVAILABLE|القماش %s لم يعد معروضاً في المتجر', v_fabric_code);
      end if;

      -- نفس قاعدتَي التسعير: السعر بالهللة، والخصم بأجزاء العشرة آلاف حين يكون مفعّلاً.
      if coalesce(round(v_listing_price * 100), -1)::bigint is distinct from v_line.price_per_meter_halalas
         or (case when coalesce(v_listing_on_sale, false) and coalesce(v_listing_discount, 0) > 0
                  then round(v_listing_discount * 100)::integer else 0 end)
            is distinct from v_line.discount_basis_points then
        raise exception using
          errcode = 'P0001',
          message = format('FABRIC_STORE_PRICE_CHANGED|تغيّر سعر القماش %s منذ عرض السعر؛ أعيدي مراجعة السلة', v_fabric_code);
      end if;
    end loop;

    select hold.reserved_cm
    into v_reserved_cm
    from private.fabric_store_stock_hold(v_unit.inventory_item_id, v_unit.inventory_color_id) hold;

    if v_unit.required_cm > v_physical_cm - v_reserved_cm then
      raise exception using
        errcode = 'P0001',
        message = format('FABRIC_STORE_STOCK_UNAVAILABLE|المتاح الآن من القماش %s هو %s متر فقط',
                         v_fabric_code, trim_scale(greatest(v_physical_cm - v_reserved_cm, 0) / 100.0));
    end if;
  end loop;

  insert into public.fabric_store_stock_reservations
    (order_id, order_item_id, inventory_item_id, inventory_color_id, quantity_cm, expires_at)
  select item.order_id, item.id, item.inventory_item_id, item.inventory_color_id, item.stock_consumption_cm, p_expires_at
  from public.fabric_store_order_items item
  where item.order_id = p_order_id;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception using errcode = 'P0001', message = 'FABRIC_STORE_ORDER_EMPTY|الطلب بلا أسطر';
  end if;
  return v_count;
end;
$$;

revoke all on function private.fabric_store_reserve_order(uuid, timestamptz) from public, anon, authenticated;

comment on function private.fabric_store_reserve_order(uuid, timestamptz) is
  'يحجز كل أسطر الطلب ذرياً أو يرفض كله: يقفل صفوف المخزون بترتيب ثابت، ويتحقق أن بطاقة المتجر تخص وحدة المخزون نفسها وأن سعرها وظهورها وطريقة البيع لم تتغير، وأن المتاح (الرصيد − الحجوزات السارية) يكفي.';

-- ---------------------------------------------------------------------------
-- 4) تحرير حجوزات طلب لم يُدفع (إلغاء، فشل نهائي) — فوري، لا ينتظر انتهاء المدة
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_release_order_reservations(
  p_order_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_payment_status text;
begin
  -- قفل الطلب ثم فحص حالته: التحرير لما قبل الدفع فقط. حجز طلب مدفوع يُستهلك
  -- بالبيع (المرحلة 6) أو يُراجع؛ تحريره يعيد قماشاً مدفوعاً إلى رفّ المحل.
  select o.payment_status
  into v_payment_status
  from public.fabric_store_orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'FABRIC_STORE_ORDER_NOT_FOUND|الطلب غير موجود';
  end if;
  if v_payment_status in ('paid', 'partially_refunded', 'refunded') then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_RELEASE_PAID|لا يُحرَّر حجز طلب مدفوع؛ يُستهلك بالبيع أو يُراجع';
  end if;

  update public.fabric_store_stock_reservations
  set status = 'released',
      end_reason = left(coalesce(nullif(btrim(p_reason), ''), 'أُلغي الطلب قبل الدفع'), 200)
  where order_id = p_order_id
    and status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.fabric_store_release_order_reservations(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) وسم الحجوزات المنتهية — تنظيف قابل للتكرار
-- ---------------------------------------------------------------------------
-- الحجز يتوقف عن الحساب لحظة انتهاء مدته حتى دون هذه المهمة؛ هي تحدّث الحالة
-- للعرض والتقارير فقط. دفعة تنجح بعد الانتهاء تُعالج في المرحلة 6: تخصيص ذري
-- إن بقي المخزون، وإلا مراجعة واسترداد.

create or replace function private.fabric_store_expire_reservations(p_limit integer default 500)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select r.id
    from public.fabric_store_stock_reservations r
    where r.status = 'active'
      and r.expires_at <= now()
    order by r.expires_at
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  )
  update public.fabric_store_stock_reservations r
  set status = 'expired',
      end_reason = 'انتهت مدة الدفع دون سداد'
  from due
  where r.id = due.id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.fabric_store_expire_reservations(integer) from public, anon, authenticated;

create index if not exists fabric_store_stock_reservations_active_expiry_idx
  on public.fabric_store_stock_reservations (expires_at)
  where status = 'active';

-- ---------------------------------------------------------------------------
-- 6) لا يُحذف مخزون عليه حجز فعّال
-- ---------------------------------------------------------------------------
-- مرجع الحجز إلى المخزون حذفه متتالٍ، فحذف لون أثناء دفع زبونة كان يمحو حجزها
-- بصمت ويترك طلبها بلا مخزون مخصَّص. الحارس يمنع الحذف ما دام الحجز فعّالاً،
-- ويشرح السبب للموظف. بعد انتهاء الحجز أو تحريره يعمل الحذف كالمعتاد.
-- security definer: جدول الحجوزات مغلق عن موظف المحل.

create or replace function private.fabric_store_block_reserved_stock_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserved_cm bigint;
  v_hold_until timestamptz;
  v_label text;
begin
  if to_regclass('public.fabric_store_stock_reservations') is null then
    return old;
  end if;

  if tg_table_name = 'fabric_inventory_colors' then
    select coalesce(sum(r.quantity_cm), 0)::bigint, max(r.expires_at)
    into v_reserved_cm, v_hold_until
    from public.fabric_store_stock_reservations r
    where r.inventory_color_id = old.id and r.status = 'active' and r.expires_at > now();
    v_label := coalesce(old.fabric_code, old.color_name);
  else
    select coalesce(sum(r.quantity_cm), 0)::bigint, max(r.expires_at)
    into v_reserved_cm, v_hold_until
    from public.fabric_store_stock_reservations r
    where r.inventory_item_id = old.id and r.status = 'active' and r.expires_at > now();
    v_label := coalesce(old.base_fabric_code, old.name);
  end if;

  if v_reserved_cm > 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'FABRIC_STOCK_RESERVED_DELETE|لا يمكن حذف %s الآن: %s متر منه محجوزة لطلب إلكتروني قيد الدفع. أعيدي المحاولة بعد الساعة %s، أو أنهي الطلب أولاً',
        v_label, trim_scale(v_reserved_cm / 100.0),
        to_char(v_hold_until at time zone 'Asia/Riyadh', 'HH24:MI')
      );
  end if;

  return old;
end;
$$;

revoke all on function private.fabric_store_block_reserved_stock_delete() from public, anon, authenticated;

drop trigger if exists fabric_store_block_reserved_color_delete on public.fabric_inventory_colors;
create trigger fabric_store_block_reserved_color_delete
  before delete on public.fabric_inventory_colors
  for each row execute function private.fabric_store_block_reserved_stock_delete();

drop trigger if exists fabric_store_block_reserved_item_delete on public.fabric_inventory;
create trigger fabric_store_block_reserved_item_delete
  before delete on public.fabric_inventory
  for each row execute function private.fabric_store_block_reserved_stock_delete();

-- ---------------------------------------------------------------------------
-- 6) فحص ذاتي للترميز: هجرة 20260823161026 طُبّقت عبر أداة قرأت UTF-8 كـWIN1256
--    فشُوِّهت رسائل المحل. إن تكرر ذلك هنا تفشل الهجرة كلها ولا يُطبَّق شيء.
--    الفحص بأكواد الحروف (ASCII)، ورسالته إنجليزية، فلا يتشوه هو نفسه.
-- ---------------------------------------------------------------------------

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'validate_fabric_inventory_availability';

  -- "محجوزة" و"الكمية"
  if position(chr(1605) || chr(1581) || chr(1580) || chr(1608) || chr(1586) || chr(1577) in v_body) = 0
     or position(chr(1575) || chr(1604) || chr(1603) || chr(1605) || chr(1610) || chr(1577) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
