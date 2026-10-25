-- عدّاد الوصول إلى واتساب لكل محل ومصدر (25 أكتوبر 2026).
--
-- كل صف ضغطة واحدة: من رابط وسيط /wa/<shop>/<source>/ (بايو إنستغرام، تيك توك، الخرائط...)
-- أو من زر واتساب داخل الموقع (source = 'website' مع موضع الزر ومصدر الزيارة).
-- الكتابة والقراءة من الخادم وحده (service_role): الجدول مغلق تماماً عن anon وauthenticated،
-- وصفحة الإحصائيات تقرأ عبر مسار API يتحقق أن المستخدم مدير.
-- visitor_hash: بصمة HMAC لعنوان IP مع المتصفح بمفتاح شهري — لا يُخزَّن العنوان نفسه.

create table if not exists public.whatsapp_clicks (
  id bigint generated always as identity primary key,
  shop text not null,
  source text not null,
  placement text,
  visit_source text,
  visitor_hash text,
  created_at timestamptz not null default now(),

  constraint whatsapp_clicks_shop check (shop in ('fabrics', 'tailoring')),
  constraint whatsapp_clicks_source check (source ~ '^[a-z0-9_-]{1,40}$'),
  constraint whatsapp_clicks_placement check (placement is null or placement ~ '^[a-z0-9_-]{1,60}$'),
  constraint whatsapp_clicks_visit_source check (visit_source is null or visit_source ~ '^[a-z0-9_-]{1,40}$'),
  constraint whatsapp_clicks_visitor_hash check (visitor_hash is null or visitor_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists whatsapp_clicks_created_idx
  on public.whatsapp_clicks (created_at);

alter table public.whatsapp_clicks enable row level security;

revoke all on table public.whatsapp_clicks from anon, authenticated;
grant select, insert on table public.whatsapp_clicks to service_role;

-- الإحصائيات لفترة [p_from, p_until): مستويات مجمّعة في استعلام واحد، و«الأشخاص» عدّ مميّز
-- للبصمة داخل كل مستوى (لا يُجمع بين الصفوف).
--   level = 'shop'         : المحل كله
--   level = 'source'       : المحل + المصدر
--   level = 'placement'    : المحل + المصدر + موضع الزر
--   level = 'visit_source' : المحل + المصدر + مصدر الزيارة
create or replace function public.whatsapp_click_stats(p_from timestamptz, p_until timestamptz)
returns table (
  level text,
  shop text,
  source text,
  placement text,
  visit_source text,
  clicks bigint,
  people bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case grouping(c.source, c.placement, c.visit_source)
      when 7 then 'shop'
      when 3 then 'source'
      when 1 then 'placement'
      else 'visit_source'
    end as level,
    c.shop,
    c.source,
    c.placement,
    c.visit_source,
    count(*)::bigint as clicks,
    count(distinct c.visitor_hash)::bigint as people
  from public.whatsapp_clicks c
  where c.created_at >= p_from and c.created_at < p_until
  group by grouping sets (
    (c.shop),
    (c.shop, c.source),
    (c.shop, c.source, c.placement),
    (c.shop, c.source, c.visit_source)
  );
$$;

revoke all on function public.whatsapp_click_stats(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.whatsapp_click_stats(timestamptz, timestamptz) to service_role;
