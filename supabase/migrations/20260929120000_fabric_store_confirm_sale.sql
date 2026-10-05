-- ============================================================================
-- متجر الأقمشة الإلكتروني — اعتماد البيع بعد السداد
-- المرحلة 6 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- ما تضيفه:
--   • public.fabric_store_confirm_order(order_id) — قلب المرحلة. لطلب مدفوع، في معاملة
--     واحدة تحت قفل الطلب وصفوف المخزون:
--       - يستهلك حجوزات الطلب، ثم يُنشئ **مبيعة أقمشة واحدة في income** (المسار الوحيد
--         لخصم المخزون: trigger sync_fabric_sale_inventory ← الحركات ← حارس المحل).
--         لا خصم يدوي فوقه.
--       - يربط المبيعة بالطلب، ويضع مهمة فاتورة الأستاذ في الـoutbox.
--       - دفعة **test** (قرار المالك 28 سبتمبر): لا مبيعة ولا خصم ولا رقم فاتورة؛
--         يُستهلك الحجز فيعود القماش للبيع فوراً.
--       - دفعة وصلت بعد انتهاء الحجز: يُخصم إن بقي القماش (تحقق ذري)، وإلا يُرفع
--         الطلب للمراجعة والاسترداد ويُبلَّغ الموظف. **الدفعة لا تُرفض أبداً.**
--   • public.fabric_store_due_outbox / fabric_store_finish_outbox — طابور المهام
--     لمسار الخادم المجدول (إعادة المحاولة مع تباعد، ثم dead بعد max_attempts).
--   • حارس على income: مبيعة المتجر الإلكتروني (المرتبطة بطلب) لا تُحذف ولا تتغير
--     أعمدتها التجارية؛ حقول مزامنة الأستاذ والملاحظات والصور فقط تبقى قابلة للتحديث.
--
-- ما يغيّره في النظام القائم: **trigger واحد جديد على income** (BEFORE UPDATE OR DELETE)
-- لا يفعل شيئاً لأي صف غير مرتبط بطلب إلكتروني. لا تعديل لأي دالة أو trigger قائم.
--
-- ملاحظة إلزامية: set_income_invoice_number (الحي) يستدعي nextval('fabrics_invoice_number_seq')
-- بلا اسم مخطط وبلا search_path خاص به؛ داخل دالة search_path='' يفشل. لذلك يُمرَّر رقم
-- الفاتورة صراحةً من التسلسل نفسه (public.fabrics_invoice_number_seq) فيتخطاه الـtrigger.
--
-- التطبيق: من SQL Editor، خارج ساعات المحل (إنشاء trigger على income يقفله لحظياً في آخر الهجرة).
-- التحقق: supabase/tests/fabric_store_confirm_sale.sql (آمن على الحي: لا يُدرج في income).
--         المسار الكامل (مبيعة + خصم حقيقي) يُختبر محلياً فقط: scripts/db-local/stage6-local-sale.sql.
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_apply_payment(uuid, text, jsonb, uuid)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE5_MISSING|طبّق هجرات المراحل 2 و3 و4 و5 قبل هذه الهجرة';
  end if;
  if to_regclass('public.fabrics_invoice_number_seq') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_INVOICE_SEQUENCE_MISSING|تسلسل أرقام فواتير الأقمشة غير موجود';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 0) إغلاق مهمة الاعتماد مع نتيجتها (داخل معاملة الاعتماد نفسها)
-- ---------------------------------------------------------------------------

create or replace function private.fabric_store_close_confirm_task(p_order_id uuid, p_result text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.fabric_store_outbox
  set status = 'done',
      completed_at = now(),
      locked_until = null,
      payload = payload || jsonb_build_object('result', p_result)
  where dedupe_key = 'confirm_order:' || p_order_id::text
    and status not in ('done', 'dead');
$$;

revoke all on function private.fabric_store_close_confirm_task(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) اعتماد البيع
-- ---------------------------------------------------------------------------
-- النتيجة (status): confirmed · already_confirmed · test_no_sale · stock_unavailable ·
-- cancelled_order · not_paid · not_found. كلها نهائية وتُغلق مهمة confirm_order.
-- أي خطأ (قفل مشغول 55P03 خلف مبيعة محل، أو غيره) يُلغي المعاملة كلها: لا حجز
-- مُستهلك بلا مبيعة، ولا مبيعة بلا ربط. تُعاد المحاولة لاحقاً من الطابور.
--
-- lock_timeout أقصر من deadlock_timeout (نفس قرار المرحلة 3): عند تعارض مع مبيعة محل
-- يتراجع الاعتماد ويُعاد، ولا تُلغى مبيعة الموظف أمام زبونة حاضرة.

create or replace function public.fabric_store_confirm_order(p_order_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '800ms'
as $$
declare
  -- النص الذي يكتبه حارس المرحلة 2 حين يصل السداد بعد انتهاء الحجز (حرفياً).
  c_lapsed_reason constant text :=
    'وصل السداد دون حجز سارٍ لكل أسطر الطلب أو بعد انتهاء حجز: تأكدي من توفر القماش قبل التجهيز، وإلا استرجعي المبلغ';
  c_source constant text := 'المتجر الإلكتروني';

  v_order public.fabric_store_orders%rowtype;
  v_environment text;
  v_unit record;
  v_physical numeric;
  v_item_unit text;
  v_fabric_code text;
  v_physical_cm bigint;
  v_other_cm bigint;
  v_short text;
  v_items jsonb;
  v_names text;
  v_first_name text;
  v_total_cm bigint;
  v_invoice bigint;
  v_income uuid;
  v_phone text;
  v_shipping_gross bigint;
  v_consumed integer;
  v_reason text;
begin
  select o.* into v_order
  from public.fabric_store_orders o
  where o.id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_order.income_id is not null then
    perform private.fabric_store_close_confirm_task(p_order_id, 'already_confirmed');
    return jsonb_build_object('status', 'already_confirmed', 'income_id', v_order.income_id);
  end if;

  -- المسترد (المرحلة 8) أو غير المدفوع لا يُنشأ له بيع. المهمة تُغلق بسببها.
  if v_order.payment_status <> 'paid' then
    perform private.fabric_store_close_confirm_task(p_order_id, 'not_paid:' || v_order.payment_status);
    return jsonb_build_object('status', 'not_paid', 'payment_status', v_order.payment_status);
  end if;

  select a.environment into v_environment
  from public.fabric_store_payment_attempts a
  where a.id = v_order.paid_attempt_id;

  -- دفعة اختبار: لا مبيعة، لا خصم، لا رقم فاتورة. الحجز يُستهلك فيعود القماش للمحل.
  if v_environment is distinct from 'live' then
    update public.fabric_store_stock_reservations
    set status = 'consumed',
        end_reason = 'دفعة اختبار — لا مبيعة ولا خصم من المخزون'
    where order_id = p_order_id
      and status <> 'consumed';
    get diagnostics v_consumed = row_count;
    if v_consumed > 0 or not exists (
      select 1 from public.fabric_store_order_events e
      where e.order_id = p_order_id and e.event_type = 'note' and e.note like 'دفعة اختبار%'
    ) then
      insert into public.fabric_store_order_events (order_id, event_type, actor_type, note)
      values (p_order_id, 'note', 'system', 'دفعة اختبار (test): لم تُسجَّل مبيعة ولم يُخصم المخزون');
    end if;
    perform private.fabric_store_close_confirm_task(p_order_id, 'test_no_sale');
    return jsonb_build_object('status', 'test_no_sale');
  end if;

  -- طلب أُلغي قبل وصول السداد: المال يُسجَّل ولا يُباع شيء؛ يُسترد أو يُعاد تفعيل الطلب.
  if v_order.fulfillment_status = 'cancelled' then
    if not v_order.needs_review then
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders
      set needs_review = true, review_reason = 'وصل سداد لطلب ملغى — يُسترد أو يُعاد تفعيل الطلب'
      where id = p_order_id;
    end if;
    perform private.fabric_store_close_confirm_task(p_order_id, 'cancelled_order');
    return jsonb_build_object('status', 'cancelled_order');
  end if;

  -- التخصيص الذري: نفس صفوف المخزون التي يقفلها حارس المحل، وبالترتيب الثابت للحجز.
  -- المتاح لهذا الطلب = الرصيد − حجوزات الطلبات **الأخرى** السارية. حجوزات الطلب نفسه
  -- (إن بقيت سارية) محسوبة ضمن الرصيد له. نفس now() التي يستعملها حارس المحل.
  for v_unit in
    select item.inventory_item_id,
           item.inventory_color_id,
           sum(item.stock_consumption_cm)::bigint as required_cm
    from public.fabric_store_order_items item
    where item.order_id = p_order_id
    group by item.inventory_item_id, item.inventory_color_id
    order by item.inventory_color_id nulls last, item.inventory_item_id
  loop
    if v_unit.inventory_color_id is not null then
      select color.current_quantity, inv.unit, coalesce(color.fabric_code, inv.base_fabric_code, inv.name)
      into v_physical, v_item_unit, v_fabric_code
      from public.fabric_inventory_colors color
      join public.fabric_inventory inv on inv.id = color.inventory_item_id
      where color.id = v_unit.inventory_color_id
        and color.inventory_item_id = v_unit.inventory_item_id
      for update of color;
    else
      select inv.current_quantity, inv.unit, coalesce(inv.base_fabric_code, inv.name)
      into v_physical, v_item_unit, v_fabric_code
      from public.fabric_inventory inv
      where inv.id = v_unit.inventory_item_id
      for update of inv;
    end if;

    if not found then
      v_short := concat_ws('، ', v_short, 'قماش لم يعد في المخزون');
      continue;
    end if;
    if v_item_unit is distinct from 'meter' then
      v_short := concat_ws('، ', v_short, format('%s لا يُباع بالمتر', v_fabric_code));
      continue;
    end if;

    v_physical_cm := greatest(floor(v_physical * 100), 0)::bigint;

    select coalesce(sum(r.quantity_cm), 0)::bigint
    into v_other_cm
    from public.fabric_store_stock_reservations r
    where r.order_id <> p_order_id
      and r.status = 'active'
      and r.expires_at > now()
      and r.inventory_item_id = v_unit.inventory_item_id
      and r.inventory_color_id is not distinct from v_unit.inventory_color_id;

    if v_unit.required_cm > v_physical_cm - v_other_cm then
      v_short := concat_ws('، ', v_short, format('%s (المطلوب %s م، المتاح %s م)',
        v_fabric_code, trim_scale(v_unit.required_cm / 100.0),
        trim_scale(greatest(v_physical_cm - v_other_cm, 0) / 100.0)));
    end if;
  end loop;

  if v_short is not null then
    v_reason := left('تعذّر خصم القماش بعد السداد: ' || v_short || ' — وفّري القماش أو استرجعي المبلغ', 500);
    perform set_config('fabric_store.actor_type', 'system', true);
    update public.fabric_store_orders
    set needs_review = true, review_reason = v_reason
    where id = p_order_id;
    insert into public.fabric_store_order_events (order_id, event_type, actor_type, note)
    values (p_order_id, 'note', 'system', v_reason);
    insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
    values ('notify_staff', 'stock_unavailable:' || p_order_id::text, p_order_id,
            jsonb_build_object('reason', 'stock_unavailable'))
    on conflict (dedupe_key) do nothing;
    perform private.fabric_store_close_confirm_task(p_order_id, 'stock_unavailable');
    return jsonb_build_object('status', 'stock_unavailable', 'reason', v_reason);
  end if;

  -- الحجز يُستهلك **قبل** إدراج المبيعة: حارس المحل يطرح الحجوزات السارية من المتاح،
  -- فلو بقي حجز الطلب نفسه سارياً لحجب صرفه هو (HANDOFF §4 القرار 11).
  update public.fabric_store_stock_reservations
  set status = 'consumed',
      end_reason = left('بيع إلكتروني ' || v_order.order_number, 200)
  where order_id = p_order_id
    and status <> 'consumed';

  -- بنود المبيعة بشكل fabric_items الذي تكتبه شاشة المحل نفسه. الاسم = اسم صنف المخزون
  -- (به يُطابَق منتج الأستاذ)، والكمية بالمتر.
  select jsonb_agg(jsonb_build_object(
           'inventory_id', item.inventory_item_id,
           'inventory_color_id', item.inventory_color_id,
           'fabric_code', coalesce(color.fabric_code, inv.base_fabric_code, item.fabric_code),
           'name', coalesce(nullif(btrim(inv.name), ''), item.fabric_name),
           'quantity_meters', trim_scale(round(item.stock_consumption_cm / 100.0, 2)))
           order by item.line_number),
         string_agg(coalesce(nullif(btrim(inv.name), ''), item.fabric_name), '، ' order by item.line_number),
         (array_agg(coalesce(nullif(btrim(inv.name), ''), item.fabric_name) order by item.line_number))[1],
         sum(item.stock_consumption_cm)::bigint
  into v_items, v_names, v_first_name, v_total_cm
  from public.fabric_store_order_items item
  left join public.fabric_inventory inv on inv.id = item.inventory_item_id
  left join public.fabric_inventory_colors color on color.id = item.inventory_color_id
  where item.order_id = p_order_id;

  v_invoice := nextval('public.fabrics_invoice_number_seq');
  v_phone := case when v_order.customer_phone ~ '^\+9665[0-9]{8}$'
                  then '0' || substr(v_order.customer_phone, 5)
                  else v_order.customer_phone end;
  v_shipping_gross := v_order.shipping_net_halalas + v_order.shipping_vat_halalas;

  insert into public.income (
    branch, category, customer_name, description, amount, date, is_automatic, notes,
    quantity_meters, fabric_items, payment_method, customer_source, buyer_name, buyer_phone,
    invoice_number, created_by
  ) values (
    'fabrics',
    'fabric_sale',
    v_first_name,
    format('طلب المتجر الإلكتروني %s — %s', v_order.order_number, v_names),
    round(v_order.total_halalas / 100.0, 2),
    (v_order.paid_at at time zone 'Asia/Riyadh')::date,
    true,
    case when v_shipping_gross > 0
         then format('يشمل رسوم الشحن %s ريال مع الضريبة', trim_scale(round(v_shipping_gross / 100.0, 2))) end,
    round(v_total_cm / 100.0, 2),
    v_items,
    'network',
    c_source,
    v_order.customer_name,
    v_phone,
    v_invoice,
    null
  )
  returning id into v_income;

  update public.fabric_store_orders
  set income_id = v_income
  where id = p_order_id;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, note)
  values (p_order_id, 'note', 'system', format('سُجّلت مبيعة الأقمشة رقم %s وخُصم المخزون', v_invoice));

  -- علامة «السداد بعد انتهاء الحجز» حُسمت الآن: القماش خُصّص فعلاً. تُرفع فقط إن كان هذا
  -- سببها الوحيد (لا دفع زائد ولا عدم تطابق بلّغا الموظف).
  if v_order.needs_review
     and v_order.review_reason = c_lapsed_reason
     and not exists (
       select 1 from public.fabric_store_outbox t
       where t.order_id = p_order_id and t.topic = 'notify_staff'
     ) then
    perform set_config('fabric_store.actor_type', 'system', true);
    update public.fabric_store_orders
    set needs_review = false, review_reason = null
    where id = p_order_id;
  end if;

  insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
  values ('alostaz_invoice', 'alostaz_invoice:' || p_order_id::text, p_order_id,
          jsonb_build_object('income_id', v_income))
  on conflict (dedupe_key) do nothing;

  perform private.fabric_store_close_confirm_task(p_order_id, 'confirmed');
  return jsonb_build_object('status', 'confirmed', 'income_id', v_income, 'invoice_number', v_invoice);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) الطابور: المهام المستحقة، وإنهاء مهمة (نجاح / إعادة لاحقاً / توقف نهائي)
-- ---------------------------------------------------------------------------
-- لا «حجز» للمهمة هنا: كل مهمة آمنة للتكرار بنفسها — الاعتماد بقفل الطلب ومعرّف
-- المبيعة، وفاتورة الأستاذ بحجز صف المبيعة (alostaz_sync_token) كما في شاشة المحل.

create or replace function public.fabric_store_due_outbox(
  p_topics text[],
  p_limit integer,
  p_order_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'topic', t.topic, 'order_id', t.order_id, 'payload', t.payload,
           'attempts', t.attempts) order by t.run_after), '[]'::jsonb)
  from (
    select * from public.fabric_store_outbox t
    where t.topic = any (p_topics)
      and t.status in ('pending', 'failed')
      and t.run_after <= now()
      and t.attempts < t.max_attempts
      and (p_order_id is null or t.order_id = p_order_id)
    order by t.run_after
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) t;
$$;

create or replace function public.fabric_store_finish_outbox(
  p_task_id uuid,
  p_outcome text,
  p_error text,
  p_retry_seconds integer
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if p_outcome is null or p_outcome not in ('done', 'retry', 'dead') then
    return jsonb_build_object('status', 'bad_request');
  end if;

  update public.fabric_store_outbox t
  set status = case
                 when p_outcome = 'done' then 'done'
                 when p_outcome = 'dead' or t.attempts + 1 >= t.max_attempts then 'dead'
                 else 'failed'
               end,
      attempts = case when p_outcome = 'done' then t.attempts else least(t.attempts + 1, t.max_attempts) end,
      run_after = case when p_outcome = 'retry'
                       then now() + make_interval(secs => greatest(30, least(coalesce(p_retry_seconds, 300), 86400)))
                       else t.run_after end,
      completed_at = case when p_outcome = 'done' or p_outcome = 'dead' or t.attempts + 1 >= t.max_attempts
                          then now() end,
      locked_until = null,
      last_error = case when p_outcome = 'done' then t.last_error else left(coalesce(p_error, 'unknown error'), 2000) end
  where t.id = p_task_id
    and t.status not in ('done', 'dead')
  returning t.status into v_status;

  return jsonb_build_object('status', coalesce(v_status, 'unchanged'));
end;
$$;

-- ---------------------------------------------------------------------------
-- الصلاحيات: service_role وحده
-- ---------------------------------------------------------------------------

revoke all on function public.fabric_store_confirm_order(uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_due_outbox(text[], integer, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_finish_outbox(uuid, text, text, integer) from public, anon, authenticated;

grant execute on function public.fabric_store_confirm_order(uuid) to service_role;
grant execute on function public.fabric_store_due_outbox(text[], integer, uuid) to service_role;
grant execute on function public.fabric_store_finish_outbox(uuid, text, text, integer) to service_role;

comment on function public.fabric_store_confirm_order(uuid) is
  'للخادم فقط: يعتمد بيع طلب مدفوع — يستهلك الحجز وينشئ مبيعة أقمشة واحدة في income (مسار خصم المخزون الوحيد) ويضع مهمة فاتورة الأستاذ. دفعة test بلا مبيعة. آمن للتكرار.';

-- ---------------------------------------------------------------------------
-- 3) مبيعة المتجر الإلكتروني مقفلة (قرار المالك 28 سبتمبر)
-- ---------------------------------------------------------------------------
-- مرتبطة بدفعة حقيقية: لا تُحذف، ولا يتغير مبلغها أو قماشها أو تاريخها أو طريقة دفعها.
-- يبقى قابلاً للتحديث: حقول مزامنة الأستاذ (يكتبها إرسال الفاتورة)، والملاحظات، والصور.
-- أي عمود يُضاف لاحقاً إلى income مقفل افتراضياً لهذه الصفوف (المقارنة بالصف كله).
-- security definer: جدول الطلبات مغلق عن موظف المحل. صفوف غير مرتبطة لا تتأثر.

create or replace function private.fabric_store_protect_online_sale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_mutable constant text[] := array[
    'alostaz_customer_id', 'alostaz_invoice_id', 'alostaz_invoice_code', 'alostaz_sync_status',
    'alostaz_synced_at', 'alostaz_sync_token', 'alostaz_sync_error',
    'notes', 'fabric_images', 'fabric_inventory_tracked'];
  v_order_number text;
begin
  if old.branch is distinct from 'fabrics' or old.category is distinct from 'fabric_sale' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- تراجع خاطئ حذف جداول المتجر: لا طلبات = لا مبيعات مقفلة، ولا تتعطل مبيعات المحل.
  if to_regclass('public.fabric_store_orders') is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select o.order_number into v_order_number
  from public.fabric_store_orders o
  where o.income_id = old.id;

  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ONLINE_SALE_LOCKED|مبيعة الطلب الإلكتروني %s مرتبطة بدفعة حقيقية ولا تُحذف؛ الإلغاء والاسترداد من طلبات المتجر', v_order_number);
  end if;

  if (to_jsonb(new) - c_mutable) is distinct from (to_jsonb(old) - c_mutable) then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ONLINE_SALE_LOCKED|مبيعة الطلب الإلكتروني %s مرتبطة بدفعة حقيقية ولا يُعدَّل مبلغها أو قماشها أو تاريخها', v_order_number);
  end if;

  return new;
end;
$$;

revoke all on function private.fabric_store_protect_online_sale() from public, anon, authenticated;

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- (قبل إنشاء الـtrigger على income، فلا يُقفل الجدول في هجرة ستفشل أصلاً)
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'fabric_store_confirm_order';

  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- آخر شيء: الـtrigger على income. إنشاؤه يأخذ قفل SHARE ROW EXCLUSIVE على income
-- حتى نهاية المعاملة؛ هنا يقتصر على ذيل الهجرة (lock_timeout أعلاه يحد الانتظار).
-- ============================================================================

drop trigger if exists fabric_store_protect_online_sale on public.income;
create trigger fabric_store_protect_online_sale
  before update or delete on public.income
  for each row execute function private.fabric_store_protect_online_sale();

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
