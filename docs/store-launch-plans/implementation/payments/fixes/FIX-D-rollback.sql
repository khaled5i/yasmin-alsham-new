-- ============================================================================
-- تراجع الدفعة D (AUD-14، AUD-10، AUD-09) — يُبطل 20261005150000_fabric_store_privacy_ops.sql
-- ============================================================================
-- يعيد حارس العنوان (المرحلة 2) ونافذة المطابقة (المرحلة 9) حرفياً من ملفي هجرتيهما (يُفحصان في
-- آخره)، ويحذف دالة محو العناوين، ويعيد قراءة جدول fabrics كاملاً للزائر.
-- (هذا الملف مولَّد من ملفات الهجرات نفسها.)
--
-- ⚠ يعيد AUD-14 (أعمدة التكلفة مقروءة للعموم) ويوقف محو العناوين. لذلك يرفض العمل ما لم تُعلني:
--       set local fabric_store.rollback_d_ack = 'cost-columns-exposed';
-- ما يبقى عمداً: العناوين التي مُحيت (لا تُسترجع، ولا سبب لاسترجاعها).
-- الكود بعده يعمل كما هو (الأعمدة الصريحة تعمل مع منح الجدول كاملاً؛ المهمة تتخطى المحو إن غابت دالته).
-- ============================================================================
set local lock_timeout = '5s';

do $$
begin
  if coalesce(current_setting('fabric_store.rollback_d_ack', true), '') <> 'cost-columns-exposed' then
    raise exception 'FIX_D_ROLLBACK_REFUSED: this re-opens AUD-14 (fabric cost columns readable by anyone). Run: set local fabric_store.rollback_d_ack = ''cost-columns-exposed''; in the same transaction';
  end if;
  if to_regprocedure('public.fabric_store_purge_addresses(integer, interval)') is null then
    raise exception 'FIX_D_ROLLBACK_NOT_NEEDED: migration 20261005150000 is not applied';
  end if;
  if not exists (select 1 from pg_proc p where p.oid = 'private.fabric_store_guard_address()'::regprocedure
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) = '68f6ef6edfbd526af49fa36d92194618')
     or not exists (select 1 from pg_proc p where p.oid = 'public.fabric_store_due_reconciliation(text, integer)'::regprocedure
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) = 'beab268fdfdd468c4e702aaf92299b51') then
    raise exception 'FIX_D_ROLLBACK_DRIFT: the deployed functions are not the batch D versions — inspect before rolling back';
  end if;
end $$;

drop function public.fabric_store_purge_addresses(integer, interval);

-- نسخة المرحلة 2 (20260924102616) حرفياً
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
begin
  select o.delivery_method, o.payment_status, o.fulfillment_status
  into v_delivery_method, v_payment_status, v_fulfillment_status
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
    if not (v_fulfillment_status in ('delivered', 'cancelled') or v_payment_status = 'failed') then
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

-- نسخة المرحلة 9 (20260930135919) حرفياً
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

revoke all on function private.fabric_store_guard_address() from public, anon, authenticated;
revoke all on function public.fabric_store_due_reconciliation(text, integer) from public, anon, authenticated;
grant execute on function public.fabric_store_due_reconciliation(text, integer) to service_role;

grant select on table public.fabrics to anon;

do $$
begin
  if not exists (select 1 from pg_proc p where p.oid = 'private.fabric_store_guard_address()'::regprocedure
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) = '4b60e158afe618323aa9eb12c7a56a9a')
     or not exists (select 1 from pg_proc p where p.oid = 'public.fabric_store_due_reconciliation(text, integer)'::regprocedure
                   and md5(replace(p.prosrc, E'\r\n', E'\n')) = 'afed3bc1018e7e1142ea434f42bf00a3') then
    raise exception 'FIX_D_ROLLBACK_CHECK: a restored function does not match its migration file';
  end if;
end $$;
