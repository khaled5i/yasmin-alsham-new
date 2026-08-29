-- المقاسات غير المطابقة تبقى ملاحظات تشغيلية، ولا تُفشل المراجعة.
-- فشل المراجعة محصور في عدم مطابقة التصميم (الخطوة الثانية داخل الاختبار).
create or replace function private.prepare_order_quality_review_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  order_has_second_proof boolean;
  latest_status text;
  has_invalid_check boolean;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required';
  end if;

  select orders.has_second_proof
    into order_has_second_proof
  from public.orders orders
  where orders.id = new.order_id;

  if not found then
    raise exception 'order_not_found_or_not_accessible';
  end if;

  if new.stage = 'second_proof' and not coalesce(order_has_second_proof, false) then
    raise exception 'second_proof_not_enabled_for_order';
  end if;

  select attempts.status
    into latest_status
  from public.order_quality_review_attempts attempts
  where attempts.order_id = new.order_id
    and attempts.stage = new.stage
  order by attempts.attempt_number desc
  limit 1;

  if latest_status = 'passed' then
    raise exception 'passed_review_cannot_be_retested';
  end if;

  if jsonb_typeof(new.measurement_checks) is distinct from 'array'
    or jsonb_array_length(new.measurement_checks) = 0 then
    raise exception 'measurement_checks_required';
  end if;

  select exists (
    select 1
    from jsonb_array_elements(new.measurement_checks) check_item
    where jsonb_typeof(check_item -> 'matched') is distinct from 'boolean'
      or coalesce(check_item ->> 'key', '') = ''
      or coalesce(check_item ->> 'expected_value', '') = ''
  ) into has_invalid_check;

  if has_invalid_check then
    raise exception 'invalid_measurement_check';
  end if;

  if new.design_matches is false
    and coalesce(btrim(new.discrepancy_text), '') = ''
    and jsonb_array_length(coalesce(new.voice_notes, '[]'::jsonb)) = 0 then
    raise exception 'design_discrepancy_details_required';
  end if;

  new.attempt_number := coalesce((
    select max(attempts.attempt_number)
    from public.order_quality_review_attempts attempts
    where attempts.order_id = new.order_id
      and attempts.stage = new.stage
  ), 0) + 1;
  new.status := case when new.design_matches then 'passed' else 'failed' end;
  new.reviewed_by := (select auth.uid());
  new.created_at := now();
  new.voice_notes := coalesce(new.voice_notes, '[]'::jsonb);
  new.discrepancy_text := nullif(btrim(new.discrepancy_text), '');

  return new;
end;
$$;

revoke all on function private.prepare_order_quality_review_attempt()
  from public, anon, authenticated;
