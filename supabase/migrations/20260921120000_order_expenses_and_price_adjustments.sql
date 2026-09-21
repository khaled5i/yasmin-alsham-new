-- مصروفات الطلب + سجل تعديل سعر الطلب (الدفعة المتبقية)
-- ─────────────────────────────────────────────────────────────
-- • order_expenses: مصروفات إضافية تُضاف إلى سعر الطلب من نافذة «تعديل الطلب».
--   orders.price يبقى «السعر الكلي» (السعر الأساسي + المصروفات) حتى تعمل
--   remaining_amount والمحاسبة والإيصالات دون أي تغيير.
--   الشكل: [{ id, amount, note, created_at }]
-- • price_adjustments: سجل كل تعديل يدوي للدفعة المتبقية من نافذة «تنبيه دفعة متبقية».
--   التعديل يغيّر orders.price بفرق المتبقي، والسجل يبقى رسالة للمستقبل.
--   الشكل: [{ id, previous_price, new_price, previous_remaining, new_remaining, reason, created_at, created_by_name }]

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_expenses JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS price_adjustments JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_expenses_is_array'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_order_expenses_is_array
      CHECK (jsonb_typeof(order_expenses) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_price_adjustments_is_array'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_price_adjustments_is_array
      CHECK (jsonb_typeof(price_adjustments) = 'array');
  END IF;
END $$;

COMMENT ON COLUMN public.orders.order_expenses IS
  'مصروفات الطلب الإضافية [{id, amount, note, created_at}] — مجموعها داخل orders.price.';
COMMENT ON COLUMN public.orders.price_adjustments IS
  'سجل تعديلات الدفعة المتبقية/السعر [{id, previous_price, new_price, previous_remaining, new_remaining, reason, created_at, created_by_name}].';
