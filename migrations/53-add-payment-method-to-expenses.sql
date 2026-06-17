-- إضافة طريقة الدفع إلى جدول المصروفات (expenses)
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NULL
  CHECK (payment_method IN ('cash', 'network'));

COMMENT ON COLUMN expenses.payment_method IS 'طريقة الدفع: cash (كاش) أو network (شبكة)';

CREATE INDEX IF NOT EXISTS idx_expenses_payment_method ON expenses(payment_method) WHERE payment_method IS NOT NULL;
