-- ============================================================================
-- متجر الأقمشة الإلكتروني — المطابقة الدورية مع ميسر وتنبيهات الموظفين
-- المرحلة 9 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- الخطة: «مهمة مطابقة دورية تقارن المبالغ والمحاولات مع المزود، وتكشف الدفع بلا طلب مؤكد
-- أو طلب paid بلا دليل … مع تنبيهات قابلة للتصرف» · «إغلاق الصفحة بعد الدفع: الطلب يُعتمد
-- عبر webhook/المطابقة، دون احتياج رجوع العميل» · ميسر يُسقط الـwebhook بعد 5 محاولات.
--
-- ما تضيفه (دوال المتجر فقط؛ لا جدول ولا trigger للمحل):
--   • reconciled_at — آخر مطابقة ناجحة؛ وعمودا حجز منفصلان ينتهيان بعد 5 دقائق
--     (منفصل عن last_verified_at الذي تستعمله صفحة الرجوع لتوقيتها).
--   • public.fabric_store_due_reconciliation(env, limit) — المحاولات المستحقة للسؤال:
--       - غير مدفوعة ولها فاتورة، انتهت صفحتها، خلال 3 أيام — كل 15 دقيقة: دفعة نجحت ولم
--         يصل بها webhook والزبونة أغلقت الصفحة.
--       - مدفوعة خلال 30 يوماً — مرة كل 24 ساعة: استرداد أو إلغاء لدى ميسر خارج النظام.
--     الجواب يمر بالمسار نفسه (سجل الأحداث ثم fabric_store_apply_payment)، فلا منطق دفع جديد.
--   • public.fabric_store_staff_alerts() — ما يحتاج تصرفاً، **يُحسب لحظة الطلب** من الحالة
--     نفسها (لا جدول تنبيهات): يزول التنبيه وحده حين يُصلح سببه.
--
-- التطبيق: بعد هجرة تصحيح المرحلة 8 (20260930140000)، أعمدة على جدول المتجر وثلاث دوال.
-- التحقق: supabase/tests/fabric_store_reconciliation.sql (آمن على الحي: لا income).
-- التراجع: docs/store-launch-plans/implementation/payments/stage-09-rollback.sql
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid)') is null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE8_MISSING|طبّق هجرة المرحلة 8 قبل هذه الهجرة';
  end if;
  if not exists (
    select 1 from pg_proc p
    where p.oid = 'public.fabric_store_apply_payment(uuid,text,jsonb,uuid)'::regprocedure
      and position('v_status = ''refunded'' and v_attempt.status <> ''paid''' in p.prosrc) > 0
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_REFUNDED_FIRST_FIX_MISSING|طبّق هجرة 20260930140000 قبل المرحلة 9';
  end if;
end $$;

alter table public.fabric_store_payment_attempts
  add column if not exists reconciled_at timestamptz,
  add column if not exists reconcile_claimed_at timestamptz,
  add column if not exists reconcile_claim_token uuid;

comment on column public.fabric_store_payment_attempts.reconciled_at is
  'آخر مطابقة دورية ناجحة لهذه المحاولة مع ميسر (المرحلة 9). منفصل عن last_verified_at (توقيت صفحة الرجوع).';

-- ---------------------------------------------------------------------------
-- 1) المحاولات المستحقة للمطابقة — الحجز مستقل عن وقت آخر نجاح
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
        -- اعتُمدت: مرة في اليوم لمدة 30 يوماً
        (a.status = 'paid'
         and o.paid_at > now() - interval '30 days'
         and (a.reconciled_at is null or a.reconciled_at < now() - interval '24 hours'))
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

-- لا يتغير reconciled_at إلا بعد جلب الفاتورة وتطبيق جميع دفعاتها بنجاح.
-- الرمز يمنع عاملاً انتهى حجزه من إنهاء حجز عامل أحدث.
create or replace function public.fabric_store_complete_reconciliation(p_attempt_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_attempt_id is null or p_claim_token is null then
    return jsonb_build_object('status', 'bad_request');
  end if;

  update public.fabric_store_payment_attempts a
  set reconciled_at = now(), reconcile_claimed_at = null, reconcile_claim_token = null
  where a.id = p_attempt_id and a.reconcile_claim_token = p_claim_token;

  if not found then
    return jsonb_build_object('status', 'stale_claim');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) تنبيهات الموظفين — تُحسب من الحالة نفسها
-- ---------------------------------------------------------------------------
-- kind: sale_missing · task_dead · sale_amount_mismatch · refund_ledger_mismatch ·
--       refund_unconfirmed · refund_review_due · refund_stuck · credit_note_missing · payment_quarantined ·
--       alostaz_review · needs_review

create or replace function public.fabric_store_staff_alerts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with refund_totals as (
    select r.attempt_id, sum(r.amount_halalas) filter (where r.status = 'succeeded') as refunded
    from public.fabric_store_refunds r
    group by r.attempt_id
  ), alerts as (
    -- سداد حقيقي بلا مبيعة لأكثر من 30 دقيقة (مهمة الاعتماد متعثرة)
    select 'sale_missing' as kind, o.id as order_id, o.order_number, o.paid_at as since, a.environment,
           'سداد حقيقي منذ أكثر من 30 دقيقة ولم تُسجَّل مبيعته في الواردات (القماش لم يُخصم)' as detail
    from public.fabric_store_orders o
    join public.fabric_store_payment_attempts a on a.id = o.paid_attempt_id
    where a.environment = 'live' and o.payment_status = 'paid' and o.income_id is null
      and o.fulfillment_status <> 'cancelled' and o.paid_at < now() - interval '30 minutes'

    union all
    -- مهمة توقفت نهائياً (اعتماد، فاتورة الأستاذ…)
    select 'task_dead', t.order_id, o.order_number, coalesce(t.completed_at, t.created_at), null,
           left(t.topic || ': ' || coalesce(t.last_error, 'توقفت بعد أقصى عدد من المحاولات'), 300)
    from public.fabric_store_outbox t
    left join public.fabric_store_orders o on o.id = t.order_id
    where t.status = 'dead'

    union all
    -- مبيعة الواردات لا تساوي إجمالي الطلب
    select 'sale_amount_mismatch', o.id, o.order_number, o.paid_at, 'live',
           format('مبيعة الواردات %s ريال والطلب %s ريال', i.amount, round(o.total_halalas / 100.0, 2))
    from public.fabric_store_orders o
    join public.income i on i.id = o.income_id
    where round(i.amount * 100) <> o.total_halalas

    union all
    -- حالة الدفع لا تطابق سجل الاستردادات
    select 'refund_ledger_mismatch', o.id, o.order_number, coalesce(o.paid_at, o.created_at), a.environment,
           format('حالة الدفع %s والمسترد المسجّل %s من %s هللة', o.payment_status, coalesce(rt.refunded, 0), a.amount_halalas)
    from public.fabric_store_orders o
    join public.fabric_store_payment_attempts a on a.id = o.paid_attempt_id
    left join refund_totals rt on rt.attempt_id = a.id
    where (o.payment_status = 'refunded' and coalesce(rt.refunded, 0) <> a.amount_halalas)
       or (o.payment_status = 'partially_refunded' and (coalesce(rt.refunded, 0) <= 0 or coalesce(rt.refunded, 0) >= a.amount_halalas))
       or (o.payment_status = 'paid' and coalesce(rt.refunded, 0) > 0)

    union all
    -- استرداد نُودي عليه ولم يظهر لدى ميسر بعد 15 دقيقة (لا يُعاد نداؤه آلياً)
    select 'refund_unconfirmed', r.order_id, o.order_number, r.provider_called_at, a.environment,
           format('استرداد %s ريال أُرسل لميسر ولم يظهر — تحقّقي من لوحة ميسر', round(r.amount_halalas / 100.0, 2))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.fabric_store_payment_attempts a on a.id = r.attempt_id
    where r.status = 'pending' and r.provider_called_at < now() - interval '15 minutes'

    union all
    -- (سياسة المالك) 24 ساعة على نداء لم يظهر: موعد قرار المدير بمرجع التسوية — لا فشل تلقائي
    select 'refund_review_due', r.order_id, o.order_number, r.provider_called_at + interval '24 hours', a.environment,
           format('مضت 24 ساعة على استرداد %s ريال لم يظهر لدى ميسر — راجعي التسوية وقرّري من صفحة الطلب',
                  round(r.amount_halalas / 100.0, 2))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.fabric_store_payment_attempts a on a.id = r.attempt_id
    where r.status = 'pending' and r.provider_called_at < now() - interval '24 hours'

    union all
    -- استرداد معلّق لم يُرسَل لأكثر من 30 دقيقة (مفتاح ميسر بيئة أخرى، أو ميسر لا يرد)
    select 'refund_stuck', r.order_id, o.order_number, r.created_at, a.environment,
           format('استرداد %s ريال معلّق منذ أكثر من 30 دقيقة ولم يُرسل لميسر', round(r.amount_halalas / 100.0, 2))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.fabric_store_payment_attempts a on a.id = r.attempt_id
    where r.status = 'pending' and r.provider_called_at is null and r.created_at < now() - interval '30 minutes'

    union all
    -- إشعار دائن مطلوب: مرتجع في الواردات وفاتورة البيع في الأستاذ، ولم يُسجَّل رقمه
    select 'credit_note_missing', r.order_id, o.order_number, r.completed_at, 'live',
           format('مرتجع %s ريال على فاتورة الأستاذ %s — أصدري الإشعار الدائن وسجّلي رقمه',
                  round(r.amount_halalas / 100.0, 2), coalesce(sale.alostaz_invoice_code, '؟'))
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    join public.income sale on sale.id = o.income_id
    where r.status = 'succeeded' and r.income_id is not null and r.credit_note_code is null
      and (sale.alostaz_invoice_id is not null or sale.alostaz_sync_status = 'sent')

    union all
    -- حدث دفع محجور خلال 30 يوماً (فاتورة غير معروفة، مبلغ أو عملة لا تطابق، بيئة أخرى)
    select 'payment_quarantined', e.order_id, o.order_number, e.received_at, e.environment,
           left(coalesce(e.last_error, e.event_type) || coalesce(' — ' || e.provider_payment_id, ''), 300)
    from public.fabric_store_payment_events e
    left join public.fabric_store_orders o on o.id = e.order_id
    where e.processing_status = 'quarantined' and e.received_at > now() - interval '30 days'

    union all
    -- فاتورة الأستاذ لمبيعة إلكترونية فشلت أو توقفت للمراجعة
    select 'alostaz_review', o.id, o.order_number, i.alostaz_synced_at, 'live',
           left('فاتورة الأستاذ: ' || i.alostaz_sync_status || coalesce(' — ' || i.alostaz_sync_error, ''), 300)
    from public.fabric_store_orders o
    join public.income i on i.id = o.income_id
    where i.alostaz_sync_status in ('failed', 'review_required')

    union all
    -- الطلبات تحت المراجعة
    select 'needs_review', o.id, o.order_number, coalesce(o.paid_at, o.created_at), null,
           left(coalesce(o.review_reason, 'تحت المراجعة'), 300)
    from public.fabric_store_orders o
    where o.needs_review
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', a.kind, 'order_id', a.order_id, 'order_number', a.order_number,
           'since', a.since, 'environment', a.environment, 'detail', a.detail)
           order by a.since desc nulls last), '[]'::jsonb)
  from (select * from alerts order by since desc nulls last limit 200) a
$$;

-- ---------------------------------------------------------------------------
-- الصلاحيات: service_role وحده
-- ---------------------------------------------------------------------------

revoke all on function public.fabric_store_due_reconciliation(text, integer) from public, anon, authenticated;
revoke all on function public.fabric_store_complete_reconciliation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_staff_alerts() from public, anon, authenticated;
grant execute on function public.fabric_store_due_reconciliation(text, integer) to service_role;
grant execute on function public.fabric_store_complete_reconciliation(uuid, uuid) to service_role;
grant execute on function public.fabric_store_staff_alerts() to service_role;

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'public.fabric_store_staff_alerts()'::regprocedure;

  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
