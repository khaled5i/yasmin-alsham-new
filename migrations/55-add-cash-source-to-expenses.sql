-- إضافة مصدر التمويل (من الصندوق / من خارج الصندوق) إلى جدول المصروفات (expenses)
-- يُستخدم في قسم مشتريات الأقمشة لتتبّع رصيد الصندوق:
--   * المبيعات الكاش ترفع رصيد الصندوق
--   * المشتريات التي تكون "من الصندوق" تخفض رصيده
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS cash_source VARCHAR(20) NULL
  CHECK (cash_source IN ('box', 'external'));

COMMENT ON COLUMN expenses.cash_source IS 'مصدر التمويل: box (من الصندوق) أو external (من خارج الصندوق)';

CREATE INDEX IF NOT EXISTS idx_expenses_cash_source ON expenses(cash_source) WHERE cash_source IS NOT NULL;
