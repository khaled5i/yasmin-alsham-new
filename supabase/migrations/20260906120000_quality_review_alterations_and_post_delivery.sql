-- مراجعة التعديلات داخل اختبارات الجودة + اختبار رابع لتعديلات ما بعد التسليم.
--
-- 1) كل اختبار يعرض تعديلات المرحلة السابقة ويسأل هل طُبّقت:
--    البروفا الثانية  -> تعديلات البروفا الأولى
--    الفستان النهائي  -> تعديلات البروفا الثانية (أو الأولى للطلبات بلا بروفا ثانية)
--    ما بعد التسليم   -> تعديلات ما بعد التسليم
-- 2) الطلب الذي تطرأ عليه تعديلات بعد التسليم يحصل على اختبار جديد (رقم 4)
--    بنفس شكل الاختبارات السابقة، ويُعاد فتحه كلما أُضيف تعديل جديد بعد آخر مراجعة.

-- ============================================================================
-- 1. أعمدة حالة الاختبار الرابع على الطلب
-- ============================================================================

alter table public.orders
  add column if not exists post_delivery_review_status text not null default 'pending',
  add column if not exists post_delivery_reviewed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_post_delivery_review_status_check'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_post_delivery_review_status_check
      check (post_delivery_review_status in ('pending', 'passed', 'failed'));
  end if;
end;
$$;

-- ============================================================================
-- 2. مرحلة post_delivery + حقول مراجعة التعديلات على جدول المحاولات
-- ============================================================================

alter table public.order_quality_review_attempts
  drop constraint if exists order_quality_review_attempts_stage_check;

alter table public.order_quality_review_attempts
  add constraint order_quality_review_attempts_stage_check
  check (stage in ('first_proof', 'second_proof', 'final_dress', 'post_delivery'));

-- null = لا توجد تعديلات سابقة لمراجعتها في هذا الاختبار.
alter table public.order_quality_review_attempts
  add column if not exists previous_alterations_applied boolean,
  add column if not exists reviewed_alterations jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'order_quality_review_reviewed_alterations_array_check'
      and conrelid = 'public.order_quality_review_attempts'::regclass
  ) then
    alter table public.order_quality_review_attempts
      add constraint order_quality_review_reviewed_alterations_array_check
      check (jsonb_typeof(reviewed_alterations) = 'array');
  end if;
end;
$$;

comment on column public.order_quality_review_attempts.previous_alterations_applied is
  'Did the workshop apply the alterations requested in the previous stage? NULL when the stage has no previous alterations.';
comment on column public.order_quality_review_attempts.reviewed_alterations is
  'Snapshot of the alterations shown during the attempt: [{id, alteration_number, alteration_type, text}].';

-- ============================================================================
-- 3. تحضير المحاولة: مرحلة رابعة + تفشيل الاختبار عند عدم تطبيق التعديلات
-- ============================================================================

create or replace function private.prepare_order_quality_review_attempt()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  order_has_second_proof boolean;
  latest_status text;
  latest_created_at timestamptz;
  has_invalid_check boolean;
  has_newer_alteration boolean;
  needs_failure_details boolean;
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

  -- الاختبار الرابع لا يُفتح إلا بوجود تعديل فعلي بعد التسليم.
  if new.stage = 'post_delivery' and not exists (
    select 1
    from public.alterations alteration
    where alteration.original_order_id = new.order_id
      and alteration.alteration_type = 'after_delivery'
      and alteration.status <> 'cancelled'
  ) then
    raise exception 'post_delivery_alterations_required';
  end if;

  select attempts.status, attempts.created_at
    into latest_status, latest_created_at
  from public.order_quality_review_attempts attempts
  where attempts.order_id = new.order_id
    and attempts.stage = new.stage
  order by attempts.attempt_number desc
  limit 1;

  if latest_status = 'passed' then
    if new.stage <> 'post_delivery' then
      raise exception 'passed_review_cannot_be_retested';
    end if;

    -- ما بعد التسليم يتكرر: كل تعديل جديد بعد آخر مراجعة ناجحة يفتح اختباراً جديداً.
    select exists (
      select 1
      from public.alterations alteration
      where alteration.original_order_id = new.order_id
        and alteration.alteration_type = 'after_delivery'
        and alteration.status <> 'cancelled'
        and alteration.created_at > latest_created_at
    ) into has_newer_alteration;

    if not has_newer_alteration then
      raise exception 'passed_review_cannot_be_retested';
    end if;
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

  if jsonb_typeof(coalesce(new.reviewed_alterations, '[]'::jsonb)) is distinct from 'array' then
    raise exception 'invalid_reviewed_alterations';
  end if;

  -- سؤال «هل طُبّقت التعديلات السابقة؟» إلزامي متى عُرضت تعديلات في الاختبار.
  if jsonb_array_length(coalesce(new.reviewed_alterations, '[]'::jsonb)) > 0
    and new.previous_alterations_applied is null then
    raise exception 'previous_alterations_answer_required';
  end if;

  needs_failure_details := new.design_matches is false
    or new.previous_alterations_applied is false;

  if needs_failure_details
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
  new.status := case
    when new.design_matches and coalesce(new.previous_alterations_applied, true) then 'passed'
    else 'failed'
  end;
  new.reviewed_by := (select auth.uid());
  new.created_at := now();
  new.voice_notes := coalesce(new.voice_notes, '[]'::jsonb);
  new.reviewed_alterations := coalesce(new.reviewed_alterations, '[]'::jsonb);
  new.discrepancy_text := nullif(btrim(new.discrepancy_text), '');

  return new;
end;
$$;

-- ============================================================================
-- 4. مزامنة حالة الطلب مع المرحلة الرابعة
-- ============================================================================

create or replace function private.sync_order_quality_review_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage = 'first_proof' then
    update public.orders
    set first_proof_review_status = new.status,
        first_proof_reviewed_at = new.created_at
    where id = new.order_id;
  elsif new.stage = 'second_proof' then
    update public.orders
    set second_proof_review_status = new.status,
        second_proof_reviewed_at = new.created_at
    where id = new.order_id;
  elsif new.stage = 'post_delivery' then
    update public.orders
    set post_delivery_review_status = new.status,
        post_delivery_reviewed_at = new.created_at
    where id = new.order_id;
  else
    update public.orders
    set final_review_status = new.status,
        final_reviewed_at = new.created_at
    where id = new.order_id;
  end if;

  if not found then
    raise exception 'order_review_status_sync_failed';
  end if;

  return new;
end;
$$;

revoke all on function private.prepare_order_quality_review_attempt() from public, anon, authenticated;
revoke all on function private.sync_order_quality_review_status() from public, anon, authenticated;
