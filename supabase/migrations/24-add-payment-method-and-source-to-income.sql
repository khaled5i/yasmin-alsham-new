-- ============================================================================
-- إضافة طريقة الدفع ومصدر الزبونة إلى جدول الواردات (income)
-- ============================================================================

-- طريقة الدفع: نقدي (كاش) أو شبكة (بطاقة)
ALTER TABLE income
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NULL
  CHECK (payment_method IN ('cash', 'network'));

COMMENT ON COLUMN income.payment_method IS 'طريقة الدفع: cash (كاش) أو network (شبكة)';

-- مصدر الزبونة: ياسمين الشام أو مصدر آخر
ALTER TABLE income
ADD COLUMN IF NOT EXISTS customer_source VARCHAR(255) NULL;

COMMENT ON COLUMN income.customer_source IS 'مصدر الزبونة: yasmin_alsham (ياسمين الشام) أو other (مصدر آخر) أو اسم المصدر الآخر';

-- فهرس للأداء على طريقة الدفع
CREATE INDEX IF NOT EXISTS idx_income_payment_method ON income(payment_method) WHERE payment_method IS NOT NULL;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
