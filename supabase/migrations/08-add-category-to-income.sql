-- ============================================================================
-- إضافة حقل الفئة إلى جدول الواردات (income)
-- ============================================================================

-- إضافة عمود category
ALTER TABLE income
ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL;

-- إضافة تعليق على العمود
COMMENT ON COLUMN income.category IS 'فئة المبيعة (مرتبطة بجدول accounting_categories)';

-- إضافة فهرس للأداء
CREATE INDEX IF NOT EXISTS idx_income_category ON income(category) WHERE category IS NOT NULL;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================

