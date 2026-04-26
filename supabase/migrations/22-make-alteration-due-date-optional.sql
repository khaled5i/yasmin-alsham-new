-- جعل موعد تسليم التعديل اختيارياً
-- Make alteration_due_date column nullable in alterations table

ALTER TABLE alterations
ALTER COLUMN alteration_due_date DROP NOT NULL;

COMMENT ON COLUMN alterations.alteration_due_date IS 'موعد تسليم التعديل (اختياري)';
