-- ============================================================================
-- تراجع الدفعة E — يُبطل 20261006120000_fabric_store_purge_retention_floor.sql
-- ============================================================================
-- يعيد fabric_store_purge_addresses بنسخة الدفعة D حرفياً (تقبل أي مدة غير سالبة).
-- ⚠ يعيد R-CD-06. لا بيانات تُمس. يرفض إن لم تكن الدالة نسخة E.
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from pg_proc p
                 where p.oid = to_regprocedure('public.fabric_store_purge_addresses(integer, interval)')
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) = '7e9dc8df2aaaffff0c6d0b8e003c7ebc') then
    raise exception 'FIX_E_ROLLBACK_DRIFT: fabric_store_purge_addresses is not the batch E version';
  end if;
end $$;

-- نسخة الدفعة D (20261005150000_fabric_store_privacy_ops.sql) حرفياً
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

do $$
begin
  if not exists (select 1 from pg_proc p
                 where p.oid = 'public.fabric_store_purge_addresses(integer, interval)'::regprocedure
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) = '3af7279de38df1f43082b4a2bc44f753') then
    raise exception 'FIX_E_ROLLBACK_CHECK: the restored function does not match batch D';
  end if;
end $$;
