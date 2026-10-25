-- تقييمات الأقمشة من مشتريات حقيقية فقط (24 أكتوبر 2026).
--
-- كل تقييم مربوط بطلب متجر إلكتروني مدفوع ومستلَم يحتوي هذا القماش، وتقييم واحد
-- لكل قماش في الطلب. الكتابة من الخادم وحده (service_role) بعد التحقق من رمز الطلب
-- (كوكي المتصفح أو رابط التتبّع)؛ لا يكتب الزائر في الجدول مباشرة.
-- القراءة العامة للتقييمات المنشورة فقط، وبأعمدة العرض وحدها (لا رقم طلب).
-- إخفاء تقييم: status = 'hidden' (لا حذف، حتى يبقى مانع التكرار).

create table if not exists public.fabric_product_reviews (
  id uuid primary key default gen_random_uuid(),
  fabric_id uuid not null references public.fabrics(id) on delete cascade,
  order_id uuid not null references public.fabric_store_orders(id) on delete restrict,
  rating smallint not null,
  comment text,
  reviewer_name text not null,
  status text not null default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint fabric_product_reviews_rating check (rating between 1 and 5),
  constraint fabric_product_reviews_comment
    check (comment is null or char_length(btrim(comment)) between 1 and 1000),
  constraint fabric_product_reviews_reviewer_name
    check (char_length(btrim(reviewer_name)) between 2 and 40),
  constraint fabric_product_reviews_status check (status in ('published', 'hidden')),
  constraint fabric_product_reviews_one_per_order unique (order_id, fabric_id)
);

create index if not exists fabric_product_reviews_published_idx
  on public.fabric_product_reviews (fabric_id, created_at desc)
  where status = 'published';

alter table public.fabric_product_reviews enable row level security;

revoke all on table public.fabric_product_reviews from anon, authenticated;
grant select (id, fabric_id, rating, comment, reviewer_name, created_at)
  on table public.fabric_product_reviews to anon, authenticated;
grant select, insert, update on table public.fabric_product_reviews to service_role;

drop policy if exists "fabric_product_reviews_public_read" on public.fabric_product_reviews;
create policy "fabric_product_reviews_public_read"
  on public.fabric_product_reviews
  for select
  to anon, authenticated
  using (status = 'published');
