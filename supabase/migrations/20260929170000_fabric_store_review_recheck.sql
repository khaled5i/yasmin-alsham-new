-- ============================================================================
-- متجر الأقمشة الإلكتروني — حسم المراجعة بعد ملاحظات المراجع (المرحلة 7، النسخة 2)
-- ============================================================================
-- طُبّقت 20260929150000 على القاعدة الحية قبل هذه الإصلاحات، ولا يُعاد تشغيلها
-- (add column بلا if not exists). هذه الهجرة تستبدل دالة واحدة:
--
--   public.fabric_store_staff_resolve_review(uuid, uuid, text)          ← تُحذف
--   public.fabric_store_staff_resolve_review(uuid, uuid, text, jsonb)   ← تحل محلها
--
-- 1) لقطة ما رآه الموظف (p_expected_review): السبب وآخر حدث في السجل وتنبيهات
--    الموظفين المفتوحة. تُقارن تحت قفل الطلب نفسه الذي يأخذه كاتب الدفع، فتنبيه وصل
--    بعد فتح الشاشة (دفعة زائدة مثلاً) لا يُغلق بملاحظة تخص مشكلة أقدم ⇒ review_changed.
--    بلا لقطة ⇒ review_changed أيضاً (عميل قديم لا يحسم شيئاً).
-- 2) نقص المخزون أغلق مهمة confirm_order (stock_unavailable). الحسم يعيد جدولتها ذرياً
--    لطلب live مدفوع غير ملغى بلا مبيعة؛ والاعتماد يعيد فحص المخزون تحت القفل، فحسمٌ
--    خاطئ لا يبيع قماشاً غير موجود.
--
-- حذف النسخة ذات المعاملات الثلاثة لازم: لو بقيت (ممنوحة لـservice_role) لحسم استدعاء
-- بثلاثة معاملات المراجعة بلا فحص اللقطة.
--
-- لا يمس أي جدول أو دالة للمحل. التطبيق في أي وقت (من SQL Editor).
-- التحقق: supabase/tests/fabric_store_order_admin.sql (آمن على الحي: لا income).
-- التراجع: تقرير المرحلة 7 §8.
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_staff_set_fulfillment(uuid, text, uuid, text, text, text)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE7_MISSING|طبّق هجرة المرحلة 7 (20260929150000) قبل هذه الهجرة';
  end if;
end $$;

drop function if exists public.fabric_store_staff_resolve_review(uuid, uuid, text);

-- الملاحظة إلزامية (ماذا حُسم وكيف: وُفّر القماش، رُدّ الدفع الزائد لدى ميسر...). تُغلق معها
-- تنبيهات الموظفين التي قرأها الموظف فقط؛ أي تحديث جديد يرفض النسخة القديمة.
-- الحسم لا يسجّل مبيعة ولا يرد مالاً: يعيد جدولة اعتماد طلب live مدفوع وغير ملغى بلا
-- مبيعة، ويبقى ممنوعاً من التجهيز (sale_pending) حتى نجاح فحص المخزون والاعتماد.

create or replace function public.fabric_store_staff_resolve_review(
  p_order_id uuid,
  p_actor_id uuid,
  p_note text,
  p_expected_review jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_needs_review boolean;
  v_closed integer;
  v_snapshot jsonb;
  v_queued boolean := false;
begin
  if p_actor_id is null or v_note is null or char_length(v_note) not between 3 and 500 then
    return jsonb_build_object('status', 'note_required');
  end if;

  select o.needs_review into v_needs_review
  from public.fabric_store_orders o
  where o.id = p_order_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if not v_needs_review then
    return jsonb_build_object('status', 'not_flagged');
  end if;

  -- Payment writers also lock the order. Compare the screen's snapshot under that
  -- same lock: an alert arriving after GET must never be resolved unseen.
  select jsonb_build_object(
    'reason', o.review_reason,
    'eventId', (select max(e.id)::text from public.fabric_store_order_events e where e.order_id = o.id),
    'alertIds', (select coalesce(jsonb_agg(t.id::text order by t.id::text), '[]'::jsonb)
                 from public.fabric_store_outbox t
                 where t.order_id = o.id and t.topic = 'notify_staff' and t.status <> 'done'))
  into v_snapshot from public.fabric_store_orders o where o.id = p_order_id;
  if p_expected_review is distinct from v_snapshot then
    return jsonb_build_object('status', 'review_changed');
  end if;

  perform set_config('fabric_store.actor_type', 'staff', true);
  perform set_config('fabric_store.actor_id', p_actor_id::text, true);
  -- قيد المرحلة 2 يمنع review_reason بلا علامة، فيُمحى السبب هنا. هو محفوظ في سجل التدقيق
  -- منذ رُفعت العلامة (حدث review_flag بسببه)، ويُضاف إليه سبب الحسم أدناه.
  update public.fabric_store_orders
  set needs_review = false, review_reason = null
  where id = p_order_id;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id, left('حُسمت المراجعة: ' || v_note, 500));

  -- كل تنبيه غير منجز ظهر في اللقطة (ومنها dead) رآه الموظف، فيُغلق.
  update public.fabric_store_outbox
  set status = 'done', completed_at = now(), locked_until = null,
      payload = payload || jsonb_build_object('resolved_by', p_actor_id)
  where order_id = p_order_id
    and topic = 'notify_staff'
    and status <> 'done';
  get diagnostics v_closed = row_count;

  -- A shortage closed the original task. Reopen it atomically after staff have
  -- resolved the problem; confirmation still rechecks and locks physical stock.
  if exists (
    select 1 from public.fabric_store_orders o
    join public.fabric_store_payment_attempts a on a.id = o.paid_attempt_id
    where o.id = p_order_id and o.payment_status = 'paid' and a.environment = 'live'
      and o.income_id is null and o.fulfillment_status <> 'cancelled'
  ) then
    insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
    values ('confirm_order', 'confirm_order:' || p_order_id::text, p_order_id,
            jsonb_build_object('requested_by', p_actor_id))
    on conflict (dedupe_key) do update
      set status = 'pending', attempts = 0, run_after = now(), completed_at = null,
          locked_until = null, last_error = null, payload = excluded.payload;
    v_queued := true;
  end if;

  return jsonb_build_object('status', 'ok', 'closed_alerts', v_closed, 'confirmation_queued', v_queued);
end;
$$;

revoke all on function public.fabric_store_staff_resolve_review(uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fabric_store_staff_resolve_review(uuid, uuid, text, jsonb) to service_role;

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "المراجعة"
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'public.fabric_store_staff_resolve_review(uuid, uuid, text, jsonb)'::regprocedure;

  if position(chr(1575) || chr(1604) || chr(1605) || chr(1585) || chr(1575) || chr(1580) || chr(1593) || chr(1577) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
