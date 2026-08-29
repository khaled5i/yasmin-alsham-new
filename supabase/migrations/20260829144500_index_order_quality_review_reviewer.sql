-- يغطي المفتاح الخارجي reviewed_by ويسرّع مراجعة محاولات مستخدم محدد.
create index if not exists order_quality_review_reviewer_idx
  on public.order_quality_review_attempts (reviewed_by, created_at desc);
