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
