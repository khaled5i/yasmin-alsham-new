-- ============================================================================
-- Yasmin Al-Sham - إضافة حقل الدفعة المتبقية
-- Add remaining_amount field to orders table
-- ============================================================================

-- إضافة حقل remaining_amount إلى جدول orders
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS remaining_amount DECIMAL(10, 2);

-- تحديث القيم الحالية: remaining_amount = price - paid_amount
UPDATE orders 
SET remaining_amount = price - COALESCE(paid_amount, 0)
WHERE remaining_amount IS NULL;

-- جعل الحقل NOT NULL بعد تحديث القيم
ALTER TABLE orders 
ALTER COLUMN remaining_amount SET NOT NULL;

-- إضافة قيد للتأكد من أن remaining_amount >= 0
ALTER TABLE orders 
ADD CONSTRAINT check_remaining_amount_non_negative 
CHECK (remaining_amount >= 0);

-- ============================================================================
-- دالة لتحديث remaining_amount تلقائياً عند تغيير price أو paid_amount
-- ============================================================================

CREATE OR REPLACE FUNCTION update_remaining_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- حساب المبلغ المتبقي
  NEW.remaining_amount := NEW.price - COALESCE(NEW.paid_amount, 0);

  -- تحديث حالة الدفع بناءً على المبلغ المدفوع
  IF COALESCE(NEW.paid_amount, 0) = 0 THEN
    NEW.payment_status := 'unpaid';
  ELSIF COALESCE(NEW.paid_amount, 0) >= NEW.price THEN
    NEW.payment_status := 'paid';
  ELSE
    NEW.payment_status := 'partial';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger لتحديث remaining_amount تلقائياً
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_update_remaining_amount ON orders;

CREATE TRIGGER trigger_update_remaining_amount
BEFORE INSERT OR UPDATE OF price, paid_amount ON orders
FOR EACH ROW
EXECUTE FUNCTION update_remaining_amount();

-- ============================================================================
-- تعليقات توضيحية
-- ============================================================================

COMMENT ON COLUMN orders.remaining_amount IS 'المبلغ المتبقي (يُحسب تلقائياً: price - paid_amount)';

