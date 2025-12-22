-- جعل السعر اختياري في جدول الأقمشة
-- Make price_per_meter column nullable in fabrics table

ALTER TABLE fabrics 
ALTER COLUMN price_per_meter DROP NOT NULL;

-- إضافة تعليق توضيحي
COMMENT ON COLUMN fabrics.price_per_meter IS 'السعر بالمتر (اختياري) - Price per meter (optional)';

