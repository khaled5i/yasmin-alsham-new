-- أعمال الشك: سؤال جديد على الطلب + نوع عامل جديد (الشكّاك) ينهي عمل الشك
-- دون أن تتغيّر حالة الطلب الرئيسية.
-- Shak (basting) work: a new order flag plus a new worker type whose completion
-- is tracked independently of orders.status.

-- ============================================================================
-- 1) أعمدة الطلب
-- ============================================================================

alter table public.orders
  add column if not exists has_shak_work boolean not null default false,
  add column if not exists shak_completed boolean not null default false,
  add column if not exists shak_completed_at timestamptz,
  add column if not exists shak_worker_id uuid references public.workers(id) on delete set null,
  add column if not exists shak_worker_name text;

comment on column public.orders.has_shak_work is
  'هل يحتوي الطلب على أعمال شك؟ يُحدَّد عند إضافة الطلب ويُوجِّه الطلب تلقائياً إلى الشكّاكين.';
comment on column public.orders.shak_completed is
  'انتهاء عمل الشك فقط — لا علاقة له بحالة الطلب الرئيسية (status).';
comment on column public.orders.shak_completed_at is
  'توقيت الخادم لإنهاء عمل الشك؛ لا يكتبه العميل إطلاقاً.';
comment on column public.orders.shak_worker_name is
  'اسم الشكّاك وقت الإنهاء، محفوظ للعرض التاريخي في متابعة العمال.';

-- طلبات الشك المعلّقة هي الاستعلام الأكثر تكراراً في لوحة الشكّاك.
create index if not exists orders_shak_pending_idx
  on public.orders(shak_completed, due_date)
  where has_shak_work;

create index if not exists orders_shak_worker_completed_at_idx
  on public.orders(shak_worker_id, shak_completed_at desc)
  where shak_worker_id is not null;

-- ============================================================================
-- 2) نوع العامل الجديد: shak_worker (الشكّاك)
-- ============================================================================

-- القيد قد يحمل اسماً مولَّداً مختلفاً حسب كيفية إنشائه، فنحذف أي قيد CHECK على worker_type.
do $$
declare
  con_name text;
begin
  for con_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'workers'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%worker_type%'
  loop
    execute format('alter table public.workers drop constraint %I', con_name);
  end loop;
end $$;

alter table public.workers
  add constraint workers_worker_type_check
  check (worker_type in (
    'tailor',
    'fabric_store_manager',
    'accountant',
    'general_manager',
    'workshop_manager',
    'shak_worker'
  ));

-- ============================================================================
-- 3) ختم إنهاء الشك على الخادم + حصر الشكّاك بأعمدة الشك وحدها
-- ============================================================================

create or replace function public.enforce_order_shak_work()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_is_shak_worker boolean;
  shak_changed boolean;
  found_worker_id uuid;
  found_worker_name text;
begin
  if tg_op = 'INSERT' then
    -- الإنشاء لا يحمل إنجازاً؛ الشك يبدأ دائماً غير منتهٍ.
    new.shak_completed := false;
    new.shak_completed_at := null;
    new.shak_worker_id := null;
    new.shak_worker_name := null;
    return new;
  end if;

  -- أعمدة الختم يكتبها الخادم وحده.
  new.shak_completed_at := old.shak_completed_at;
  new.shak_worker_id := old.shak_worker_id;
  new.shak_worker_name := old.shak_worker_name;

  -- الأدوار الموثوقة تتجاوز الفحص كاملاً حتى لا ندفع ثمن استعلامين في كل تحديث طلب.
  if current_user in ('postgres', 'service_role') then
    actor_is_shak_worker := false;
  else
    actor_is_shak_worker := exists (
      select 1 from public.workers
      where user_id = auth.uid() and worker_type = 'shak_worker'
    ) and not exists (
      select 1 from public.users where id = auth.uid() and role = 'admin'
    );
  end if;

  -- الشكّاك يقلب علم الشك ولا شيء غيره — لا حالة الطلب ولا الأسعار ولا الإسناد.
  if actor_is_shak_worker then
    if (to_jsonb(new) - 'shak_completed' - 'shak_completed_at' - 'shak_worker_id' - 'shak_worker_name' - 'updated_at')
       is distinct from
       (to_jsonb(old) - 'shak_completed' - 'shak_completed_at' - 'shak_worker_id' - 'shak_worker_name' - 'updated_at')
    then
      raise exception 'الشكّاك يمكنه تعديل حالة الشك فقط / Shak workers may only change the shak status'
        using errcode = '42501';
    end if;
  end if;

  shak_changed := new.shak_completed is distinct from old.shak_completed;

  if shak_changed then
    if new.shak_completed then
      if not new.has_shak_work then
        raise exception 'لا يمكن إنهاء الشك لطلب بلا أعمال شك / Cannot complete shak on an order without shak work'
          using errcode = '23514';
      end if;
      select w.id, u.full_name into found_worker_id, found_worker_name
      from public.workers w
      join public.users u on u.id = w.user_id
      where w.user_id = auth.uid();

      new.shak_worker_id := found_worker_id;
      new.shak_worker_name := found_worker_name;
      new.shak_completed_at := statement_timestamp();
    else
      new.shak_worker_id := null;
      new.shak_worker_name := null;
      new.shak_completed_at := null;
    end if;
  end if;

  -- سحب علم الشك عن الطلب يسحب معه أي إنجاز مسجّل عليه.
  if not new.has_shak_work and new.shak_completed then
    new.shak_completed := false;
    new.shak_worker_id := null;
    new.shak_worker_name := null;
    new.shak_completed_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_order_shak_work on public.orders;
create trigger enforce_order_shak_work
before insert or update on public.orders
for each row execute function public.enforce_order_shak_work();

-- ============================================================================
-- 4) صلاحيات الشكّاك: يرى ويعدّل طلبات الشك وحدها
-- ============================================================================

drop policy if exists "Shak workers can view shak orders" on public.orders;
create policy "Shak workers can view shak orders"
on public.orders for select
to authenticated
using (
  has_shak_work
  and exists (
    select 1 from public.workers
    where workers.user_id = auth.uid()
    and workers.worker_type = 'shak_worker'
  )
);

drop policy if exists "Shak workers can update shak orders" on public.orders;
create policy "Shak workers can update shak orders"
on public.orders for update
to authenticated
using (
  has_shak_work
  and exists (
    select 1 from public.workers
    where workers.user_id = auth.uid()
    and workers.worker_type = 'shak_worker'
  )
)
with check (
  has_shak_work
  and exists (
    select 1 from public.workers
    where workers.user_id = auth.uid()
    and workers.worker_type = 'shak_worker'
  )
);
