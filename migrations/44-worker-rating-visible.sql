-- Migration 44: إضافة عمود التحكم في رؤية التقييم للعامل
-- يتيح للمدير إرسال التقييم والسعر والملاحظات لحساب العامل

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS worker_rating_visible BOOLEAN NOT NULL DEFAULT FALSE;
