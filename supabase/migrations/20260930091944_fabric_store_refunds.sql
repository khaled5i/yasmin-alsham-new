-- ============================================================================
-- متجر الأقمشة الإلكتروني — الاسترداد والإلغاء قبل القص وإعادة المخزون
-- المرحلة 8 من خطة الدفع (docs/store-launch-plans/02-electronic-payments.md)
-- ============================================================================
-- قرارات المالك (29 سبتمبر، بأسئلة ذات خيارات):
--   • القص يبدأ عند «بدء التجهيز» (preparing). قبله: الإلغاء = استرداد كامل وإعادة القماش
--     للمخزون آلياً. بعده: استرداد بسبب مكتوب فقط (السياسة المنشورة §1 و§3).
--   • الاسترداد **للمدير فقط** (يُفرض في مسار الخادم): كامل، أو جزئي بمبلغ وسبب إلزامي.
--   • في واردات الأقمشة: المبيعة الأصلية تبقى كما هي، ويُضاف **صف مرتجع سالب** مرتبط بها
--     (category = 'fabric_store_refund'). trigger خصم المخزون يتجاهل هذه الفئة، والصندوق
--     لا يقرأ إلا الكاش والمختلط، فلا يمسّهما الصف.
--   • إعادة المخزون بعد القص أو التسليم: زر مستقل في اللوحة (إدخال موثّق بالطول الصالح).
--   • الإشعار الدائن في الأستاذ: **يدوياً الآن** — اللوحة تذكّر به، ويُسجَّل رقمه هنا.
--
-- ما تضيفه:
--   • أعمدة على fabric_store_refunds + حارس لها، وجدول fabric_store_restocks (سجل الإعادة).
--   • public.fabric_store_refund_begin / fabric_store_refund_mark_called / fabric_store_refund_finish /
--     fabric_store_due_refunds
--     — الاسترداد على مرحلتين حول نداء ميسر (ميسر **بلا مفتاح عدم تكرار للاسترداد**:
--     الحماية من الاسترداد المزدوج = استرداد معلّق واحد لكل طلب + مقارنة المسترد لدى ميسر
--     بما سجّلناه قبل أي نداء).
--   • public.fabric_store_restock_return — إعادة قماش مرتجع للمخزون.
--   • public.fabric_store_record_credit_note — رقم الإشعار الدائن من الأستاذ.
--
-- ما يغيّره في القائم (دوال المتجر فقط؛ لا جدول ولا trigger للمحل):
--   • fabric_store_apply_payment: دفعة حالتها refunded لدى ميسر لم تعد تُحجر للمراجعة إن
--     كان المسترد مسجّلاً عندنا (كانت تُحجر دائماً).
--   • fabric_store_staff_set_fulfillment: لا «بدء تجهيز» أثناء استرداد إلغاء معلّق.
--   • private.fabric_store_protect_online_sale: صف المرتجع مقفل مثل المبيعة الإلكترونية.
--
-- التطبيق: من SQL Editor، في أي وقت (لا قفل على income ولا على جداول المخزون: الدوال
-- وحدها تتغير، والجداول الجديدة للمتجر).
-- التحقق: supabase/tests/fabric_store_refunds.sql (آمن على الحي: لا income).
--         المسار الكامل (صف مرتجع + إعادة مخزون) محلياً فقط: scripts/db-local/stage8-local-refund.sql.
-- التراجع: docs/store-launch-plans/implementation/payments/stage-08-rollback.sql
-- ============================================================================

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.fabric_store_staff_resolve_review(uuid, uuid, text, jsonb)') is null
     or to_regprocedure('public.fabric_store_staff_resolve_review(uuid, uuid, text)') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'FABRIC_STORE_STAGE7_MISSING|طبّق هجرتي المرحلة 7 (20260929150000 و20260929170000) قبل هذه الهجرة';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) الاسترداد: أعمدة المرحلة 8
-- ---------------------------------------------------------------------------

-- «if not exists» والقيود تُحذف ثم تُضاف: التراجع يُبقي الأعمدة (تاريخ)، فتصلح إعادة التطبيق بعده.
alter table public.fabric_store_refunds
  drop constraint if exists fabric_store_refunds_refunded_before,
  drop constraint if exists fabric_store_refunds_credit_note,
  drop constraint if exists fabric_store_refunds_income_only_succeeded,
  add column if not exists cancels_order boolean not null default false,
  -- ما سجّلناه مسترداً من هذه الدفعة **قبل** هذا الاسترداد: ميسر يجب أن يُظهره نفسه قبل
  -- النداء، وأن يُظهره + المبلغ بعده. غير ذلك = استرداد لم نسجّله ⇒ لا نداء، ومراجعة.
  add column if not exists provider_refunded_before bigint,
  -- حجز النداء: من يحمله وحده ينادي ميسر (المسار أو مهمة المطابقة)، حتى انتهائه.
  add column if not exists locked_until timestamptz,
  -- (مراجعة 2) رمز ملكية الحجز: يتجدد مع كل استلام (البدء، أو المهمة). تسجيل النداء وإنهاء
  -- الاسترداد يشترطانه، فعامل انتهى حجزه لا ينادي ولا يكتب نتيجة بحجز غيره.
  add column if not exists claim_token uuid,
  -- يُسجَّل **قبل** نداء الاسترداد. بدونه لا يثبت «المسترد لدى ميسر ≥ المطلوب» أن النداء
  -- نداؤنا (قد يكون استرداداً يدوياً من لوحة ميسر) ⇒ يُعامل كعدم تطابق.
  add column if not exists provider_called_at timestamptz,
  -- صف المرتجع في income (مبيعة live مسجّلة فقط).
  add column if not exists income_id uuid,
  add column if not exists credit_note_code text,
  add column if not exists credit_note_by uuid,
  add column if not exists credit_note_at timestamptz,
  add constraint fabric_store_refunds_refunded_before
    check (provider_refunded_before is null or provider_refunded_before >= 0),
  add constraint fabric_store_refunds_credit_note
    check ((credit_note_code is null) = (credit_note_at is null)
           and (credit_note_code is null) = (credit_note_by is null)
           and (credit_note_code is null or (status = 'succeeded' and income_id is not null
                                             and char_length(btrim(credit_note_code)) between 1 and 60))),
  add constraint fabric_store_refunds_income_only_succeeded
    check (income_id is null or status = 'succeeded');

-- استرداد معلّق واحد لكل طلب **مما ينادي عليه الخادم ميسر** (صفوف المرحلة 8، وهي وحدها
-- تحمل provider_refunded_before): نداءان متزامنان لا يُبنيان على «المسترد قبل» نفسه.
-- صفوف أُدرجت مباشرة بلا هذا العمود (سلوك المرحلة 2، واختبارها المعتمد يُدرج اثنين)
-- لا ينادي عليها أحد: fabric_store_due_refunds يتخطاها، وrefund_begin يرفض ما دامت معلّقة.
create unique index fabric_store_refunds_one_pending
  on public.fabric_store_refunds (order_id)
  where status = 'pending' and provider_refunded_before is not null;
create unique index fabric_store_refunds_income_key
  on public.fabric_store_refunds (income_id)
  where income_id is not null;

comment on column public.fabric_store_refunds.provider_refunded_before is
  'المسترد المسجّل لدينا من الدفعة قبل هذا الاسترداد (هللة). يُقارن بحقل refunded لدى ميسر قبل النداء وبعده.';
comment on column public.fabric_store_refunds.credit_note_code is
  'رقم الإشعار الدائن كما أصدره المحاسب في الأستاذ (يدوياً، قرار المالك 29 سبتمبر).';

create or replace function private.fabric_store_guard_refund_stage8()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.cancels_order is distinct from old.cancels_order
     or new.provider_refunded_before is distinct from old.provider_refunded_before
     or (old.income_id is not null and new.income_id is distinct from old.income_id)
     or (old.provider_called_at is not null and new.provider_called_at is null)
     or (new.provider_called_at is distinct from old.provider_called_at and old.status <> 'pending')
     or (old.credit_note_code is not null and (new.credit_note_code is distinct from old.credit_note_code
                                               or new.credit_note_by is distinct from old.credit_note_by
                                               or new.credit_note_at is distinct from old.credit_note_at)) then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_REFUND_IMMUTABLE|بيانات الاسترداد لا تتغير بعد تسجيله';
  end if;
  if new.status <> 'pending' and new.locked_until is not null then
    new.locked_until := null;
  end if;
  if new.status <> 'pending' and new.claim_token is not null then
    new.claim_token := null;
  end if;
  return new;
end;
$$;

revoke all on function private.fabric_store_guard_refund_stage8() from public, anon, authenticated;

drop trigger if exists fabric_store_refunds_guard_stage8 on public.fabric_store_refunds;
create trigger fabric_store_refunds_guard_stage8
  before update on public.fabric_store_refunds
  for each row execute function private.fabric_store_guard_refund_stage8();

-- ---------------------------------------------------------------------------
-- 2) سجل إعادة المخزون
-- ---------------------------------------------------------------------------
-- كل إعادة = حركة IN في fabric_inventory_movements (مسار المخزون القائم) + صف هنا يربطها
-- بالطلب وسطره. **بلا sale_income_id** على الحركة عمداً: trigger المحل يحذف حركات
-- المبيعة عند تعديلها، والإعادة ليست جزءاً من المبيعة.

create table if not exists public.fabric_store_restocks (
  id bigint generated always as identity primary key,
  order_id uuid not null,
  line_number smallint not null,
  inventory_item_id uuid not null,
  inventory_color_id uuid,
  quantity_cm integer not null,
  movement_id uuid not null,
  reason text not null,
  refund_id uuid references public.fabric_store_refunds(id) on delete restrict,
  request_key uuid,
  note text,
  actor_type text not null,
  actor_id uuid,
  created_at timestamptz not null default now(),

  constraint fabric_store_restocks_line_fkey foreign key (order_id, line_number)
    references public.fabric_store_order_items (order_id, line_number) on delete restrict,
  constraint fabric_store_restocks_quantity check (quantity_cm > 0 and quantity_cm <= 100000),
  constraint fabric_store_restocks_reason check (reason in ('cancelled_before_cut', 'returned')),
  constraint fabric_store_restocks_actor check (actor_type in ('staff', 'system')),
  constraint fabric_store_restocks_note check (note is null or char_length(note) <= 500),
  constraint fabric_store_restocks_request_line_key unique (request_key, line_number),
  constraint fabric_store_restocks_movement_key unique (movement_id)
);

create index if not exists fabric_store_restocks_order_idx on public.fabric_store_restocks (order_id);

comment on table public.fabric_store_restocks is
  'إعادة قماش طلب إلكتروني للمخزون (المرحلة 8): آلياً عند الإلغاء قبل القص، أو بزر بعد استلام المرتجع وفحصه. المجموع لكل سطر لا يتجاوز ما خُصم له.';

alter table public.fabric_store_restocks enable row level security;
revoke all on table public.fabric_store_restocks from public, anon, authenticated, service_role;
grant select on table public.fabric_store_restocks to service_role;

do $$
declare
  v_seq text := pg_get_serial_sequence('public.fabric_store_restocks', 'id');
begin
  execute format('revoke all on sequence %s from public, anon, authenticated, service_role', v_seq);
end $$;

-- إدخال سطر واحد: حركة IN ثم صف السجل. داخل معاملة المستدعي وتحت قفل طلبه.
create or replace function private.fabric_store_restock_line(
  p_order_id uuid,
  p_order_number text,
  p_line_number smallint,
  p_quantity_cm integer,
  p_reason text,
  p_refund_id uuid,
  p_request_key uuid,
  p_note text,
  p_actor_type text,
  p_actor_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_item public.fabric_store_order_items%rowtype;
  v_done bigint;
  v_movement uuid;
begin
  select item.* into v_item
  from public.fabric_store_order_items item
  where item.order_id = p_order_id and item.line_number = p_line_number;
  if not found then
    raise exception using errcode = 'P0001', message = 'FABRIC_STORE_RESTOCK_LINE|سطر غير موجود في الطلب';
  end if;

  select coalesce(sum(r.quantity_cm), 0) into v_done
  from public.fabric_store_restocks r
  where r.order_id = p_order_id and r.line_number = p_line_number;
  if v_done + p_quantity_cm > v_item.stock_consumption_cm then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_RESTOCK_EXCEEDS|السطر %s: المُعاد (%s م) يتجاوز المخصوم (%s م) بعد الإعادات السابقة (%s م)',
                       p_line_number, trim_scale(p_quantity_cm / 100.0), trim_scale(v_item.stock_consumption_cm / 100.0),
                       trim_scale(v_done / 100.0));
  end if;

  insert into public.fabric_inventory_movements
    (inventory_item_id, color_id, movement_type, quantity, description, date, created_by)
  values (
    v_item.inventory_item_id,
    v_item.inventory_color_id,
    'in',
    round(p_quantity_cm / 100.0, 2),
    left(format('إرجاع طلب المتجر الإلكتروني %s — %s', p_order_number,
                case p_reason when 'cancelled_before_cut' then 'أُلغي قبل القص' else 'مرتجع بعد الفحص' end), 500),
    (now() at time zone 'Asia/Riyadh')::date,
    case when p_actor_type = 'staff' then p_actor_id end
  )
  returning id into v_movement;

  insert into public.fabric_store_restocks
    (order_id, line_number, inventory_item_id, inventory_color_id, quantity_cm, movement_id,
     reason, refund_id, request_key, note, actor_type, actor_id)
  values (p_order_id, p_line_number, v_item.inventory_item_id, v_item.inventory_color_id, p_quantity_cm, v_movement,
          p_reason, p_refund_id, p_request_key, p_note, p_actor_type, p_actor_id);

  return v_movement;
end;
$$;

revoke all on function private.fabric_store_restock_line(uuid, text, smallint, integer, text, uuid, uuid, text, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2ب) (مراجعة 2) واقعة بدء القص — دائمة
-- ---------------------------------------------------------------------------
-- «لم يُجهَّز» حالة يمكن الرجوع إليها من «قيد التجهيز»، فلا تدل على أن القماش لم يُقص.
-- cut_started_at يُسجَّل عند أول تقدّم (preparing فما بعد) ولا يُمحى. الإلغاء مع الاسترداد
-- وإعادة القماش آلياً مشروطان بغيابه.

alter table public.fabric_store_orders
  add column if not exists cut_started_at timestamptz;

comment on column public.fabric_store_orders.cut_started_at is
  'أول انتقال إلى «قيد التجهيز» فما بعد (بدء القص، قرار المالك 29 سبتمبر). لا يُمحى بالرجوع إلى «لم يُجهَّز». المرحلة 8.';

-- الطلبات القائمة: من سجل التدقيق (trigger المرحلة 2 يسجّل كل انتقال)، وإلا من حالتها الحالية.
update public.fabric_store_orders o
set cut_started_at = coalesce(
      (select min(e.created_at) from public.fabric_store_order_events e
       where e.order_id = o.id and e.event_type = 'fulfillment_status'
         and e.to_value in ('preparing', 'ready_for_pickup', 'shipped', 'delivered')),
      case when o.fulfillment_status in ('preparing', 'ready_for_pickup', 'shipped', 'delivered') then o.updated_at end)
where o.cut_started_at is null
  and (o.fulfillment_status in ('preparing', 'ready_for_pickup', 'shipped', 'delivered')
       or exists (select 1 from public.fabric_store_order_events e
                  where e.order_id = o.id and e.event_type = 'fulfillment_status'
                    and e.to_value in ('preparing', 'ready_for_pickup', 'shipped', 'delivered')));

create or replace function private.fabric_store_mark_cut()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.cut_started_at is not null and new.cut_started_at is distinct from old.cut_started_at then
    raise exception using
      errcode = 'P0001', message = 'FABRIC_STORE_CUT_IMMUTABLE|واقعة بدء القص لا تُمحى ولا تتغير';
  end if;
  if new.fulfillment_status is distinct from old.fulfillment_status
     and new.fulfillment_status in ('preparing', 'ready_for_pickup', 'shipped', 'delivered') then
    -- لا قص أثناء إلغاء مع استرداد بدأه المدير (يُفرض على الصف، لا في دالة الموظف وحدها).
    -- الطلب مقفل بهذا التحديث، وبدء الإلغاء يقفله أيضاً: أحدهما ينتظر الآخر.
    if exists (select 1 from public.fabric_store_refunds r
               where r.order_id = new.id and r.status = 'pending' and r.cancels_order) then
      raise exception using
        errcode = 'P0001', message = 'FABRIC_STORE_REFUND_PENDING_CUT|إلغاء الطلب واسترداده قيد التنفيذ — لا يبدأ التجهيز';
    end if;
    if new.cut_started_at is null then
      new.cut_started_at := now();
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.fabric_store_mark_cut() from public, anon, authenticated;

drop trigger if exists fabric_store_orders_mark_cut on public.fabric_store_orders;
create trigger fabric_store_orders_mark_cut
  before update on public.fabric_store_orders
  for each row execute function private.fabric_store_mark_cut();

-- ---------------------------------------------------------------------------
-- 3) بدء الاسترداد (قبل نداء ميسر)
-- ---------------------------------------------------------------------------
-- النتيجة (status): started · existing (المفتاح نفسه: حالة الاسترداد السابق) · key_conflict ·
-- not_found · not_refundable · refund_in_progress · exceeds · already_cut · use_cancel ·
-- sale_pending · bad_request.
-- **من هو المدير** يتحقق منه مسار الخادم؛ هنا معرّفه واسمه للسجل.

create or replace function public.fabric_store_refund_begin(
  p_order_id uuid,
  p_actor_id uuid,
  p_actor_label text,
  p_amount_halalas bigint,
  p_reason text,
  p_cancel boolean,
  p_key uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_existing public.fabric_store_refunds%rowtype;
  v_order public.fabric_store_orders%rowtype;
  v_attempt public.fabric_store_payment_attempts%rowtype;
  v_refunded bigint;
  v_remaining bigint;
  v_refund uuid;
  v_claim uuid;
begin
  if p_actor_id is null or p_key is null or p_cancel is null
     or v_reason is null or char_length(v_reason) not between 3 and 500
     or p_amount_halalas is null or p_amount_halalas <= 0 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select r.* into v_existing from public.fabric_store_refunds r where r.idempotency_key = p_key;
  if found then
    if v_existing.order_id <> p_order_id or v_existing.amount_halalas <> p_amount_halalas
       or v_existing.cancels_order <> p_cancel then
      return jsonb_build_object('status', 'key_conflict');
    end if;
    return jsonb_build_object('status', 'existing', 'refund_id', v_existing.id, 'refund_status', v_existing.status);
  end if;

  select o.* into v_order from public.fabric_store_orders o where o.id = p_order_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_order.payment_status not in ('paid', 'partially_refunded') then
    return jsonb_build_object('status', 'not_refundable', 'payment_status', v_order.payment_status);
  end if;

  select a.* into v_attempt from public.fabric_store_payment_attempts a where a.id = v_order.paid_attempt_id;
  if not found or v_attempt.provider_payment_id is null then
    return jsonb_build_object('status', 'not_refundable', 'payment_status', v_order.payment_status);
  end if;

  if exists (select 1 from public.fabric_store_refunds r where r.order_id = p_order_id and r.status = 'pending') then
    return jsonb_build_object('status', 'refund_in_progress');
  end if;

  select coalesce(sum(r.amount_halalas), 0) into v_refunded
  from public.fabric_store_refunds r
  where r.attempt_id = v_attempt.id and r.status = 'succeeded';
  v_remaining := v_attempt.amount_halalas - v_refunded;

  if p_amount_halalas > v_remaining then
    return jsonb_build_object('status', 'exceeds', 'remaining_halalas', v_remaining);
  end if;

  if v_order.fulfillment_status = 'cancelled' then
    -- (مراجعة 2) طلب ملغى وصله سداد متأخر: لا قماش ولا مبيعة (الاعتماد يرفض الملغى)،
    -- فالاسترداد مباشر ويبقى الطلب ملغى. «إلغاء» ثانٍ لا معنى له.
    if p_cancel then
      return jsonb_build_object('status', 'already_cancelled');
    end if;
  elsif p_cancel then
    -- القص يبدأ عند «بدء التجهيز» (قرار المالك)، وواقعته دائمة: الرجوع إلى «لم يُجهَّز»
    -- لا يعيد أهلية الإلغاء. بعده لا إلغاء، بل استرداد بسبب.
    if v_order.fulfillment_status <> 'unfulfilled' or v_order.cut_started_at is not null then
      return jsonb_build_object('status', 'already_cut', 'fulfillment_status', v_order.fulfillment_status);
    end if;
    if p_amount_halalas <> v_remaining then
      return jsonb_build_object('status', 'bad_request', 'remaining_halalas', v_remaining);
    end if;
  else
    -- استرداد كل الباقي قبل القص = إلغاء (يعيد القماش). بدونه يبقى القماش مخصوماً
    -- لطلب لا يُجهَّز (الحارس يمنع تجهيز المسترد كاملاً).
    if v_order.fulfillment_status = 'unfulfilled' and v_order.cut_started_at is null
       and p_amount_halalas = v_remaining then
      return jsonb_build_object('status', 'use_cancel');
    end if;
    -- سداد حقيقي لم تُسجَّل مبيعته بعد: الجزئي ينتظرها (الاعتماد لا يبيع ما استُرد جزئياً).
    if v_attempt.environment = 'live' and v_order.income_id is null then
      return jsonb_build_object('status', 'sale_pending');
    end if;
  end if;

  insert into public.fabric_store_refunds
    (order_id, attempt_id, idempotency_key, amount_halalas, reason, requested_by, requested_by_label,
     cancels_order, provider_refunded_before, locked_until, claim_token)
  values (p_order_id, v_attempt.id, p_key, p_amount_halalas, v_reason, p_actor_id,
          left(nullif(btrim(coalesce(p_actor_label, '')), ''), 200),
          p_cancel, v_refunded, now() + interval '2 minutes', gen_random_uuid())
  returning id, claim_token into v_refund, v_claim;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id,
          left(format('%s %s ريال: %s', case when p_cancel then 'بدأ إلغاء الطلب واسترداد' else 'بدأ استرداد' end,
                      trim_scale(round(p_amount_halalas / 100.0, 2)), v_reason), 500));

  return jsonb_build_object(
    'status', 'started',
    'refund_id', v_refund,
    'payment_id', v_attempt.provider_payment_id,
    'environment', v_attempt.environment,
    'amount_halalas', p_amount_halalas,
    'refunded_before', v_refunded,
    'claim_token', v_claim);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) إنهاء الاسترداد (بعد رد ميسر أو مطابقته)
-- ---------------------------------------------------------------------------
-- p_outcome: succeeded (p_provider_refunded = حقل refunded لدى ميسر بعد النداء) · failed ·
-- mismatch (ميسر يُظهر مسترداً لا يطابق سجلنا: لا نداء، يُغلق الاسترداد ويُراجع) ·
-- unconfirmed (مراجعة 2: نُودي ميسر ولم يظهر الاسترداد بعد: يبقى معلّقاً — لا نداء ثانٍ أبداً —
-- وبعد 15 دقيقة من النداء يُرفع الطلب للمراجعة ليتحقق شخص من لوحة ميسر).
-- p_claim_token: رمز الحجز الحالي. غيره ⇒ stale_claim بلا أثر (عامل انتهى حجزه).
-- النتيجة: succeeded · failed · mismatch · unconfirmed · too_early · not_confirmed · stale_claim ·
-- already_<status> · not_found · bad_request.

drop function if exists public.fabric_store_refund_finish(uuid, text, bigint, text);

create or replace function public.fabric_store_refund_finish(
  p_refund_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_provider_refunded bigint,
  p_message text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  c_source constant text := 'المتجر الإلكتروني';
  v_order_id uuid;
  v_order public.fabric_store_orders%rowtype;
  v_refund public.fabric_store_refunds%rowtype;
  v_attempt public.fabric_store_payment_attempts%rowtype;
  v_message text := left(nullif(btrim(coalesce(p_message, '')), ''), 500);
  v_total bigint;
  v_sale record;
  v_invoice bigint;
  v_income uuid;
  v_line record;
  v_restocked integer := 0;
  v_reason text;
begin
  if p_outcome is null or p_outcome not in ('succeeded', 'failed', 'mismatch', 'unconfirmed') then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select r.order_id into v_order_id from public.fabric_store_refunds r where r.id = p_refund_id;
  if v_order_id is null then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- الطلب ثم الاسترداد: نفس ترتيب البدء.
  select o.* into v_order from public.fabric_store_orders o where o.id = v_order_id for update;
  select r.* into v_refund from public.fabric_store_refunds r where r.id = p_refund_id for update;
  if v_refund.status <> 'pending' then
    return jsonb_build_object('status', 'already_' || v_refund.status);
  end if;
  if v_refund.claim_token is distinct from p_claim_token then
    return jsonb_build_object('status', 'stale_claim');
  end if;
  select a.* into v_attempt from public.fabric_store_payment_attempts a where a.id = v_refund.attempt_id;

  if p_outcome = 'unconfirmed' then
    if v_refund.provider_called_at is null or v_refund.provider_called_at > now() - interval '15 minutes' then
      return jsonb_build_object('status', 'too_early');
    end if;
    v_reason := left(format('استرداد %s ريال أُرسل لميسر (%s) ولم يظهر بعد — لا يُعاد إرساله آلياً. تحقّقي من لوحة ميسر',
                            trim_scale(round(v_refund.amount_halalas / 100.0, 2)),
                            to_char(v_refund.provider_called_at at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24:MI')), 500);
    perform set_config('fabric_store.actor_type', 'system', true);
    update public.fabric_store_orders set needs_review = true, review_reason = v_reason
    where id = v_order_id and not needs_review;
    insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
    values ('notify_staff', 'refund_unconfirmed:' || p_refund_id::text, v_order_id,
            jsonb_build_object('reason', 'refund_unconfirmed', 'refund_id', p_refund_id))
    on conflict (dedupe_key) do nothing;
    return jsonb_build_object('status', 'unconfirmed');
  end if;

  if p_outcome in ('failed', 'mismatch') then
    update public.fabric_store_refunds
    set status = 'failed',
        failure_message = coalesce(v_message, case when p_outcome = 'mismatch' then 'mismatch' else 'failed' end)
    where id = p_refund_id;
    insert into public.fabric_store_order_events (order_id, event_type, actor_type, note)
    values (v_order_id, 'note', 'system',
            left('لم يتم الاسترداد: ' || coalesce(v_message, 'رفضه ميسر'), 500));
    if p_outcome = 'mismatch' then
      v_reason := left('المسترد لدى ميسر لا يطابق سجلنا — لم يُرسل استرداد جديد. راجعي لوحة ميسر: '
                       || coalesce(v_message, ''), 500);
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders set needs_review = true, review_reason = v_reason
      where id = v_order_id and not needs_review;
      insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
      values ('notify_staff', 'refund_mismatch:' || p_refund_id::text, v_order_id,
              jsonb_build_object('reason', 'refund_mismatch', 'refund_id', p_refund_id))
      on conflict (dedupe_key) do nothing;
    end if;
    return jsonb_build_object('status', p_outcome);
  end if;

  -- succeeded: ميسر يجب أن يُظهر ما سجّلناه + هذا المبلغ على الأقل.
  if p_provider_refunded is null
     or p_provider_refunded < v_refund.provider_refunded_before + v_refund.amount_halalas then
    return jsonb_build_object('status', 'not_confirmed');
  end if;

  update public.fabric_store_refunds set status = 'succeeded' where id = p_refund_id;

  if p_provider_refunded > v_refund.provider_refunded_before + v_refund.amount_halalas then
    v_reason := left(format('ميسر يُظهر مسترداً (%s) أكثر مما سجّلنا (%s) — راجعي لوحة ميسر',
                            p_provider_refunded, v_refund.provider_refunded_before + v_refund.amount_halalas), 500);
    perform set_config('fabric_store.actor_type', 'system', true);
    update public.fabric_store_orders set needs_review = true, review_reason = v_reason
    where id = v_order_id and not needs_review;
    insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
    values ('notify_staff', 'refund_mismatch:' || p_refund_id::text, v_order_id,
            jsonb_build_object('reason', 'refund_mismatch', 'refund_id', p_refund_id))
    on conflict (dedupe_key) do nothing;
  end if;

  select coalesce(sum(r.amount_halalas), 0) into v_total
  from public.fabric_store_refunds r
  where r.attempt_id = v_refund.attempt_id and r.status = 'succeeded';

  perform set_config('fabric_store.actor_type', 'system', true);
  update public.fabric_store_orders
  set payment_status = case when v_total >= v_attempt.amount_halalas then 'refunded' else 'partially_refunded' end
  where id = v_order_id
    and payment_status is distinct from
        (case when v_total >= v_attempt.amount_halalas then 'refunded' else 'partially_refunded' end);

  -- مبيعة live مسجّلة ⇒ صف مرتجع سالب مرتبط بها. رقم فاتورة من تسلسل الأقمشة صراحةً
  -- (trigger الترقيم يفشل داخل search_path='' — HANDOFF §8 الدرس 20).
  select i.id, i.invoice_number, i.customer_name, i.buyer_name, i.buyer_phone
  into v_sale
  from public.income i
  where i.id = v_order.income_id;
  if found then
    v_invoice := nextval('public.fabrics_invoice_number_seq');
    insert into public.income (
      branch, category, customer_name, description, amount, date, is_automatic, notes,
      payment_method, customer_source, buyer_name, buyer_phone, invoice_number, created_by
    ) values (
      'fabrics',
      'fabric_store_refund',
      v_sale.customer_name,
      left(format('استرداد طلب المتجر الإلكتروني %s — مرتجع عن الفاتورة %s', v_order.order_number, v_sale.invoice_number), 500),
      -round(v_refund.amount_halalas / 100.0, 2),
      (now() at time zone 'Asia/Riyadh')::date,
      true,
      left(v_refund.reason, 500),
      'network',
      c_source,
      v_sale.buyer_name,
      v_sale.buyer_phone,
      v_invoice,
      null
    )
    returning id into v_income;
    update public.fabric_store_refunds set income_id = v_income where id = p_refund_id;
  end if;

  if v_refund.cancels_order then
    -- القص الدائم: لا إلغاء ولا إعادة قماش إن بدأ القص يوماً (حتى لو عادت الحالة).
    if v_order.fulfillment_status = 'unfulfilled' and v_order.cut_started_at is null then
      perform set_config('fabric_store.actor_type', 'staff', true);
      perform set_config('fabric_store.actor_id', v_refund.requested_by::text, true);
      update public.fabric_store_orders
      set fulfillment_status = 'cancelled', cancel_reason = left(v_refund.reason, 300)
      where id = v_order_id;
      -- خُصم القماش (مبيعة live) ⇒ يعود كله للمخزون: لم يُقص.
      if v_order.income_id is not null then
        for v_line in
          select item.line_number, item.stock_consumption_cm
          from public.fabric_store_order_items item
          where item.order_id = v_order_id
          order by item.inventory_color_id nulls last, item.inventory_item_id, item.line_number
        loop
          perform private.fabric_store_restock_line(v_order_id, v_order.order_number, v_line.line_number,
            v_line.stock_consumption_cm, 'cancelled_before_cut', p_refund_id, null, null, 'staff', v_refund.requested_by);
          v_restocked := v_restocked + 1;
        end loop;
      end if;
      -- سداد لم تُسجَّل مبيعته: لا مبيعة لاحقاً (الاعتماد يرى الطلب مسترداً أيضاً).
      perform private.fabric_store_close_confirm_task(v_order_id, 'refunded');
    else
      -- بدأ التجهيز بين البدء والإنهاء (لا يُفترض: دالة التجهيز ترفض أثناء إلغاء معلّق).
      v_reason := 'استُرد المبلغ كاملاً لإلغاء الطلب بعد أن بدأ تجهيزه — لا يُسلَّم، وقرّري مصير القماش';
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders set needs_review = true, review_reason = v_reason
      where id = v_order_id and not needs_review;
    end if;
  end if;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (v_order_id, 'note', 'staff', v_refund.requested_by,
          left(format('%s %s ريال%s', case when v_refund.cancels_order then 'أُلغي الطلب واستُرد' else 'استُرد' end,
                      trim_scale(round(v_refund.amount_halalas / 100.0, 2)),
                      case when v_invoice is not null then format(' — مرتجع رقم %s في الواردات', v_invoice) else '' end), 500));

  return jsonb_build_object('status', 'succeeded', 'refund_income_id', v_income, 'refund_invoice_number', v_invoice,
                            'restocked_lines', v_restocked,
                            'payment_status', case when v_total >= v_attempt.amount_halalas then 'refunded' else 'partially_refunded' end);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) الاستردادات المعلّقة للمطابقة (المهمة المجدولة): تحجزها دقيقتين وتعيدها
-- ---------------------------------------------------------------------------

create or replace function public.fabric_store_due_refunds(p_limit integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows jsonb;
begin
  with due as (
    select r.id
    from public.fabric_store_refunds r
    where r.status = 'pending'
      and r.provider_refunded_before is not null
      and (r.locked_until is null or r.locked_until < now())
    order by r.created_at
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  ), claimed as (
    update public.fabric_store_refunds r
    set locked_until = now() + interval '2 minutes',
        claim_token = gen_random_uuid()
    from due
    where r.id = due.id
    returning r.id, r.order_id, r.attempt_id, r.amount_halalas, r.provider_refunded_before, r.created_at,
              r.provider_called_at, r.claim_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'refund_id', c.id, 'order_id', c.order_id, 'amount_halalas', c.amount_halalas,
           'refunded_before', c.provider_refunded_before, 'created_at', c.created_at,
           'called', c.provider_called_at is not null, 'claim_token', c.claim_token,
           'payment_id', a.provider_payment_id, 'environment', a.environment)), '[]'::jsonb)
  into v_rows
  from claimed c
  join public.fabric_store_payment_attempts a on a.id = c.attempt_id;
  return v_rows;
end;
$$;

-- قبل نداء ميسر مباشرة: يُسجَّل أن النداء قد يحدث، ويُمدَّد الحجز. لحامل الحجز فقط —
-- **برمزه** (مراجعة 2)، لا بوقته: عامل انتهى حجزه ثم استُلم الاسترداد بعده يحمل رمزاً قديماً
-- ⇒ held_elsewhere. **ونداء واحد لكل استرداد أبداً** (already_called): ميسر بلا مفتاح عدم
-- تكرار، و«لم يظهر الاسترداد بعد» لا يثبت أن نداءً سابقاً لن يُنفَّذ لاحقاً.
drop function if exists public.fabric_store_refund_mark_called(uuid);

create or replace function public.fabric_store_refund_mark_called(p_refund_id uuid, p_claim_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_refund public.fabric_store_refunds%rowtype;
begin
  select r.* into v_refund from public.fabric_store_refunds r where r.id = p_refund_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_refund.status <> 'pending' then
    return jsonb_build_object('status', 'already_' || v_refund.status);
  end if;
  if p_claim_token is null or v_refund.claim_token is distinct from p_claim_token
     or v_refund.locked_until is null or v_refund.locked_until < now() + interval '20 seconds' then
    return jsonb_build_object('status', 'held_elsewhere');
  end if;
  if v_refund.provider_called_at is not null then
    return jsonb_build_object('status', 'already_called');
  end if;
  update public.fabric_store_refunds
  set provider_called_at = now(), locked_until = now() + interval '2 minutes'
  where id = p_refund_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) إعادة قماش مرتجع للمخزون (بعد القص أو التسليم)
-- ---------------------------------------------------------------------------
-- p_lines: [{"line_number": 1, "quantity_cm": 300}, …] — الطول الصالح بعد الفحص.
-- النتيجة: ok · already_done (المفتاح نفسه) · note_required · bad_request · not_found ·
-- nothing_to_restock (لا خصم: دفعة test أو مبيعة لم تُسجَّل) · not_cut (قبل القص: الإلغاء
-- يعيده آلياً) · exceeds.

create or replace function public.fabric_store_restock_return(
  p_order_id uuid,
  p_actor_id uuid,
  p_lines jsonb,
  p_note text,
  p_key uuid
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
  v_order public.fabric_store_orders%rowtype;
  v_line jsonb;
  v_number integer;
  v_cm integer;
  v_count integer := 0;
  v_message text;
begin
  if p_actor_id is null or p_key is null then
    return jsonb_build_object('status', 'bad_request');
  end if;
  if v_note is null or char_length(v_note) not between 3 and 500 then
    return jsonb_build_object('status', 'note_required');
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) not between 1 and 40 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select o.* into v_order from public.fabric_store_orders o where o.id = p_order_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if exists (select 1 from public.fabric_store_restocks r where r.request_key = p_key) then
    return jsonb_build_object('status', 'already_done');
  end if;
  if v_order.income_id is null then
    return jsonb_build_object('status', 'nothing_to_restock');
  end if;
  -- (مراجعة 2) واقعة القص الدائمة، لا الحالة الحالية.
  if v_order.cut_started_at is null then
    return jsonb_build_object('status', 'not_cut', 'fulfillment_status', v_order.fulfillment_status);
  end if;

  begin
    for v_line in select value from jsonb_array_elements(p_lines) loop
      begin
        v_number := (v_line ->> 'line_number')::integer;
        v_cm := (v_line ->> 'quantity_cm')::integer;
      exception when others then
        return jsonb_build_object('status', 'bad_request');
      end;
      if v_number is null or v_number not between 1 and 40 or v_cm is null or v_cm <= 0 then
        return jsonb_build_object('status', 'bad_request');
      end if;
      perform private.fabric_store_restock_line(p_order_id, v_order.order_number, v_number::smallint, v_cm,
        'returned', null, p_key, v_note, 'staff', p_actor_id);
      v_count := v_count + 1;
    end loop;
  exception when sqlstate 'P0001' or unique_violation then
    get stacked diagnostics v_message = message_text;
    return jsonb_build_object('status', case when v_message like 'FABRIC_STORE_RESTOCK_EXCEEDS%' then 'exceeds'
                                             when v_message like 'FABRIC_STORE_RESTOCK_LINE%' then 'bad_request'
                                             else 'refused' end,
                              'message', coalesce(nullif(split_part(v_message, '|', 2), ''), v_message));
  end;

  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (p_order_id, 'note', 'staff', p_actor_id, left('أُعيد قماش مرتجع للمخزون: ' || v_note, 500));

  return jsonb_build_object('status', 'ok', 'lines', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) رقم الإشعار الدائن من الأستاذ
-- ---------------------------------------------------------------------------

create or replace function public.fabric_store_record_credit_note(
  p_refund_id uuid,
  p_actor_id uuid,
  p_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := nullif(btrim(coalesce(p_code, '')), '');
  v_refund public.fabric_store_refunds%rowtype;
begin
  if p_actor_id is null or v_code is null or char_length(v_code) > 60 then
    return jsonb_build_object('status', 'bad_request');
  end if;
  select r.* into v_refund from public.fabric_store_refunds r where r.id = p_refund_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_refund.status <> 'succeeded' or v_refund.income_id is null then
    return jsonb_build_object('status', 'not_required');
  end if;
  if v_refund.credit_note_code is not null then
    return jsonb_build_object('status', case when v_refund.credit_note_code = v_code then 'ok' else 'already_recorded' end);
  end if;
  update public.fabric_store_refunds
  set credit_note_code = v_code, credit_note_by = p_actor_id, credit_note_at = now()
  where id = p_refund_id;
  insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
  values (v_refund.order_id, 'note', 'staff', p_actor_id, left('سُجّل الإشعار الدائن في الأستاذ: ' || v_code, 500));
  return jsonb_build_object('status', 'ok');
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) قفل صف المرتجع في الواردات (مثل المبيعة الإلكترونية)
-- ---------------------------------------------------------------------------

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
  v_kind text;
begin
  if old.branch is distinct from 'fabrics'
     or old.category is null or old.category not in ('fabric_sale', 'fabric_store_refund') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- تراجع خاطئ حذف جداول المتجر: لا طلبات = لا مبيعات مقفلة، ولا تتعطل مبيعات المحل.
  if to_regclass('public.fabric_store_orders') is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if old.category = 'fabric_sale' then
    select o.order_number into v_order_number
    from public.fabric_store_orders o
    where o.income_id = old.id;
    v_kind := 'مبيعة';
  else
    select o.order_number into v_order_number
    from public.fabric_store_refunds r
    join public.fabric_store_orders o on o.id = r.order_id
    where r.income_id = old.id;
    v_kind := 'مرتجع';
  end if;

  if not found then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ONLINE_SALE_LOCKED|%s الطلب الإلكتروني %s مرتبطة بدفعة حقيقية ولا تُحذف؛ الإلغاء والاسترداد من طلبات المتجر', v_kind, v_order_number);
  end if;

  if (to_jsonb(new) - c_mutable) is distinct from (to_jsonb(old) - c_mutable) then
    raise exception using
      errcode = 'P0001',
      message = format('FABRIC_STORE_ONLINE_SALE_LOCKED|%s الطلب الإلكتروني %s مرتبطة بدفعة حقيقية ولا يُعدَّل مبلغها أو قماشها أو تاريخها', v_kind, v_order_number);
  end if;

  return new;
end;
$$;
revoke all on function private.fabric_store_protect_online_sale() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) تطبيق الدفعة: الاسترداد المسجّل عندنا لا يُحجر (نسخة المرحلة 5 + فرع refunded)
-- ---------------------------------------------------------------------------

create or replace function public.fabric_store_apply_payment(
  p_event_id uuid,
  p_environment text,
  p_payment jsonb,
  p_attempt_hint uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_payment_id text := nullif(p_payment ->> 'id', '');
  v_invoice_id text := nullif(p_payment ->> 'invoice_id', '');
  v_status text := lower(coalesce(p_payment ->> 'status', ''));
  v_amount bigint;
  v_refunded bigint;
  v_currency text := upper(coalesce(p_payment ->> 'currency', ''));
  v_message text := left(nullif(btrim(coalesce(p_payment ->> 'message', '')), ''), 500);
  v_attempt_id uuid;
  v_attempt record;
  v_order record;
  v_order_id uuid;
  v_result text;
  v_reason text;
begin
  begin
    v_amount := (p_payment ->> 'amount')::bigint;
  exception when data_exception then
    v_amount := null;
  end;
  begin
    v_refunded := (p_payment ->> 'refunded')::bigint;
  exception when data_exception then
    v_refunded := null;
  end;
  if v_payment_id is null or char_length(v_payment_id) > 100 or v_status = '' then
    return jsonb_build_object('status', 'bad_request');
  end if;

  -- المحاولة: بفاتورتها لدى ميسر، أو بالتلميح إن لم تُربط فاتورتها بعد.
  select a.id into v_attempt_id
  from public.fabric_store_payment_attempts a
  where a.provider = 'moyasar' and a.environment = p_environment and a.provider_invoice_id = v_invoice_id;
  if v_attempt_id is null and p_attempt_hint is not null then
    select a.id into v_attempt_id
    from public.fabric_store_payment_attempts a
    where a.id = p_attempt_hint and a.provider_invoice_id is null;
  end if;

  if v_attempt_id is null then
    v_result := 'unknown';
    v_reason := 'دفعة لفاتورة لا تخص محاولة معروفة';
  else
    -- قفل الطلب ثم المحاولة: نفس ترتيب بدء الدفع وحارس المرحلة 2.
    select o.id, o.payment_status, o.fulfillment_status, o.paid_attempt_id, o.needs_review, o.total_halalas
    into v_order
    from public.fabric_store_orders o
    where o.id = (select a.order_id from public.fabric_store_payment_attempts a where a.id = v_attempt_id)
    for update;
    v_order_id := v_order.id;
    select a.* into v_attempt
    from public.fabric_store_payment_attempts a
    where a.id = v_attempt_id
    for update;

    if v_attempt.environment <> p_environment
       or v_amount is distinct from v_attempt.amount_halalas
       or v_currency <> v_attempt.currency
       or (v_attempt.provider_invoice_id is not null and v_attempt.provider_invoice_id is distinct from v_invoice_id) then
      v_result := 'quarantined';
      v_reason := format('دفعة لا تطابق محاولتها (المبلغ %s مقابل %s، العملة %s، البيئة %s) — لا تُعتمد وتُراجع يدوياً',
                         coalesce(v_amount::text, '؟'), v_attempt.amount_halalas, v_currency, p_environment);
      if v_status in ('paid', 'captured') then
        perform set_config('fabric_store.actor_type', 'system', true);
        update public.fabric_store_orders
        set needs_review = true, review_reason = left(v_reason, 500)
        where id = v_order.id and not needs_review;
        insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
        values ('notify_staff', 'payment_mismatch:' || v_payment_id, v_order.id,
                jsonb_build_object('attempt_id', v_attempt_id, 'payment_id', v_payment_id, 'reason', 'mismatch'))
        on conflict (dedupe_key) do nothing;
      end if;

    elsif v_status in ('paid', 'captured') then
      if v_attempt.provider_payment_id is not null and v_attempt.provider_payment_id <> v_payment_id then
        -- دفعتان ناجحتان على الفاتورة نفسها: الأولى هي المعتمدة، والثانية مراجعة واسترداد.
        v_result := 'overpaid';
        v_reason := format('دفعة ناجحة ثانية (%s) على المحاولة نفسها — تُسترد', v_payment_id);
      else
        update public.fabric_store_payment_attempts
        set status = 'paid',
            provider_invoice_id = coalesce(provider_invoice_id, v_invoice_id),
            provider_payment_id = coalesce(provider_payment_id, v_payment_id),
            last_provider_status = v_status,
            last_verified_at = now()
        where id = v_attempt_id;

        if v_order.paid_attempt_id is null then
          perform set_config('fabric_store.actor_type', 'provider', true);
          update public.fabric_store_orders
          set payment_status = 'paid', paid_attempt_id = v_attempt_id
          where id = v_order.id;
          -- حارس المرحلة 2 يرفع علامة المراجعة وحده إن وصل السداد بلا حجز سارٍ.
          if v_order.fulfillment_status = 'cancelled' then
            perform set_config('fabric_store.actor_type', 'system', true);
            update public.fabric_store_orders
            set needs_review = true,
                review_reason = coalesce(review_reason, 'وصل سداد لطلب ملغى — يُسترد أو يُعاد تفعيله')
            where id = v_order.id;
          end if;
          -- المرحلة 6 تبدأ من هنا: مبيعة income واستهلاك الحجز وفاتورة الأستاذ.
          insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
          values ('confirm_order', 'confirm_order:' || v_order.id, v_order.id,
                  jsonb_build_object('attempt_id', v_attempt_id, 'payment_id', v_payment_id))
          on conflict (dedupe_key) do nothing;
          v_result := 'paid';
        elsif v_order.paid_attempt_id = v_attempt_id then
          v_result := 'already_paid';
        else
          v_result := 'overpaid';
          v_reason := format('الطلب مسدَّد بمحاولة أخرى، ووصلت دفعة ناجحة ثانية (%s) — تُسترد', v_payment_id);
        end if;
      end if;

      if v_result = 'overpaid' then
        perform set_config('fabric_store.actor_type', 'system', true);
        update public.fabric_store_orders
        set needs_review = true, review_reason = left(v_reason, 500)
        where id = v_order.id and not needs_review;
        insert into public.fabric_store_outbox (topic, dedupe_key, order_id, payload)
        values ('notify_staff', 'overpaid:' || v_payment_id, v_order.id,
                jsonb_build_object('attempt_id', v_attempt_id, 'payment_id', v_payment_id, 'reason', 'overpaid'))
        on conflict (dedupe_key) do nothing;
      end if;

    elsif v_status = 'failed' then
      if v_attempt.status in ('created', 'initiated', 'authorized') then
        update public.fabric_store_payment_attempts
        set status = 'failed',
            provider_invoice_id = coalesce(provider_invoice_id, v_invoice_id),
            last_provider_status = v_status,
            last_verified_at = now(),
            failure_code = coalesce(failure_code, 'payment_failed'),
            failure_message = coalesce(v_message, failure_message)
        where id = v_attempt_id;
        v_result := 'failed';
      else
        -- محاولة سابقة فاشلة لا تمحو دفعة ناجحة، ولا يعود paid إلى failed.
        v_result := 'ignored';
      end if;

    elsif v_status = 'refunded' and v_attempt.status = 'paid'
          and v_refunded is not null
          and v_refunded <= (select coalesce(sum(r.amount_halalas), 0)
                             from public.fabric_store_refunds r
                             where r.attempt_id = v_attempt_id and r.status in ('pending', 'succeeded')) then
      -- المرحلة 8: استرداد بدأناه أو سجّلناه نحن — لا مراجعة.
      update public.fabric_store_payment_attempts
      set last_provider_status = v_status, last_verified_at = now()
      where id = v_attempt_id;
      v_result := 'ignored';

    elsif v_status in ('refunded', 'voided') and v_attempt.status = 'paid' then
      v_result := 'quarantined';
      v_reason := format('ميسر يُظهر الدفعة %s بحالة %s دون استرداد مسجّل لدينا', v_payment_id, v_status);
      perform set_config('fabric_store.actor_type', 'system', true);
      update public.fabric_store_orders
      set needs_review = true, review_reason = left(v_reason, 500)
      where id = v_order.id and not needs_review;

    else
      -- initiated/authorized/verified: ليست تحصيلاً (التفويض ليس سداداً). تُسجَّل للاطلاع.
      update public.fabric_store_payment_attempts
      set last_provider_status = left(v_status, 40), last_verified_at = now()
      where id = v_attempt_id;
      v_result := 'ignored';
    end if;
  end if;

  if p_event_id is not null then
    update public.fabric_store_payment_events
    set processing_status = case v_result
                              when 'quarantined' then 'quarantined'
                              when 'unknown' then 'quarantined'
                              when 'ignored' then 'ignored'
                              else 'processed' end,
        processing_attempts = processing_attempts + 1,
        attempt_id = coalesce(attempt_id, v_attempt_id),
        order_id = coalesce(order_id, v_order_id),
        last_error = case when v_result in ('quarantined', 'unknown', 'overpaid') then left(v_reason, 1000) end
    where id = p_event_id
      and processing_status not in ('processed', 'ignored');
  end if;

  return jsonb_build_object('status', v_result, 'attempt_id', v_attempt_id, 'order_id', v_order_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) تغيير حالة التنفيذ: لا تجهيز أثناء استرداد إلغاء معلّق (نسخة المرحلة 7 + فحص)
-- ---------------------------------------------------------------------------

create or replace function public.fabric_store_staff_set_fulfillment(
  p_order_id uuid,
  p_to text,
  p_actor_id uuid,
  p_carrier text,
  p_tracking text,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_order public.fabric_store_orders%rowtype;
  v_environment text;
  v_carrier text := nullif(btrim(coalesce(p_carrier, '')), '');
  v_tracking text := nullif(upper(regexp_replace(coalesce(p_tracking, ''), '\s', '', 'g')), '');
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_released integer;
  v_message text;
begin
  if p_actor_id is null
     or p_to is null
     or p_to not in ('unfulfilled', 'preparing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled')
     or char_length(coalesce(v_note, '')) > 500 then
    return jsonb_build_object('status', 'bad_request');
  end if;

  select o.* into v_order
  from public.fabric_store_orders o
  where o.id = p_order_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_order.fulfillment_status = p_to then
    return jsonb_build_object('status', 'ok', 'fulfillment_status', p_to, 'unchanged', true);
  end if;

  select a.environment into v_environment
  from public.fabric_store_payment_attempts a
  where a.id = v_order.paid_attempt_id;

  -- التقدّم في تجهيز سداد حقيقي يحتاج مبيعته مسجّلة (وإلا فالقماش لم يُخصم بعد).
  if p_to in ('preparing', 'ready_for_pickup', 'shipped', 'delivered')
     and v_environment = 'live' and v_order.income_id is null then
    return jsonb_build_object('status', 'sale_pending');
  end if;

  -- المرحلة 8: إلغاء مع استرداد بدأه المدير ولم يؤكده ميسر بعد — القماش لم يُقص، ولا يُقص.
  if p_to in ('preparing', 'ready_for_pickup', 'shipped', 'delivered')
     and exists (select 1 from public.fabric_store_refunds r
                 where r.order_id = p_order_id and r.status = 'pending' and r.cancels_order) then
    return jsonb_build_object('status', 'refund_pending');
  end if;

  if p_to = 'cancelled' and v_order.payment_status not in ('pending', 'failed') then
    return jsonb_build_object('status', 'refund_required');
  end if;

  if p_to = 'shipped' then
    if v_carrier is null or char_length(v_carrier) not between 2 and 80
       or v_tracking is null or v_tracking !~ '^[A-Z0-9-]{3,60}$' then
      return jsonb_build_object('status', 'tracking_required');
    end if;
  end if;

  perform set_config('fabric_store.actor_type', 'staff', true);
  perform set_config('fabric_store.actor_id', p_actor_id::text, true);

  begin
    update public.fabric_store_orders
    set fulfillment_status = p_to,
        cancel_reason = case when p_to = 'cancelled' then coalesce(left(v_note, 300), 'أُلغي من لوحة المتجر') else cancel_reason end,
        shipping_carrier = case when p_to = 'shipped' then v_carrier else shipping_carrier end,
        tracking_number = case when p_to = 'shipped' then v_tracking else tracking_number end,
        shipped_at = case when p_to = 'shipped' then now() else shipped_at end
    where id = p_order_id;
  exception when sqlstate 'P0001' or check_violation then
    get stacked diagnostics v_message = message_text;
    return jsonb_build_object('status', 'refused',
      'code', split_part(v_message, '|', 1),
      'message', coalesce(nullif(split_part(v_message, '|', 2), ''), v_message));
  end;

  -- طلب غير مدفوع أُلغي: يعود قماشه للمحل فوراً.
  if p_to = 'cancelled' then
    v_released := private.fabric_store_release_order_reservations(p_order_id, 'أُلغي الطلب من لوحة المتجر');
  end if;

  if v_note is not null then
    insert into public.fabric_store_order_events (order_id, event_type, actor_type, actor_id, note)
    values (p_order_id, 'note', 'staff', p_actor_id, v_note);
  end if;

  return jsonb_build_object('status', 'ok', 'fulfillment_status', p_to, 'released_holds', coalesce(v_released, 0));
end;
$$;

-- ---------------------------------------------------------------------------
-- الصلاحيات: service_role وحده
-- ---------------------------------------------------------------------------

revoke all on function public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_refund_finish(uuid, uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.fabric_store_due_refunds(integer) from public, anon, authenticated;
revoke all on function public.fabric_store_refund_mark_called(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_restock_return(uuid, uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.fabric_store_record_credit_note(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.fabric_store_refund_begin(uuid, uuid, text, bigint, text, boolean, uuid) to service_role;
grant execute on function public.fabric_store_refund_finish(uuid, uuid, text, bigint, text) to service_role;
grant execute on function public.fabric_store_due_refunds(integer) to service_role;
grant execute on function public.fabric_store_refund_mark_called(uuid, uuid) to service_role;
grant execute on function public.fabric_store_restock_return(uuid, uuid, jsonb, text, uuid) to service_role;
grant execute on function public.fabric_store_record_credit_note(uuid, uuid, text) to service_role;

-- ============================================================================
-- فحص ذاتي للترميز: إن قُرئ الملف بترميز خاطئ تفشل الهجرة كلها. "الطلب"
-- ============================================================================

do $$
declare
  v_body text;
begin
  select p.prosrc into v_body
  from pg_proc p
  where p.oid = 'public.fabric_store_refund_finish(uuid, uuid, text, bigint, text)'::regprocedure;

  if position(chr(1575) || chr(1604) || chr(1591) || chr(1604) || chr(1576) in v_body) = 0
     or position(chr(1591) || chr(167) in v_body) > 0 then
    raise exception 'FABRIC_STORE_ENCODING: this migration was read with the wrong text encoding (Arabic would be garbled). Nothing was applied. Run it from the Supabase SQL editor, or with client_encoding UTF8.';
  end if;
end $$;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
