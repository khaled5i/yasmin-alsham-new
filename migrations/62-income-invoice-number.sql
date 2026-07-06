-- ============================================================================
-- رقم الفاتورة لمبيعات الأقمشة (قسم المبيعات)
-- ============================================================================
-- الهدف:
--   نظام ترقيم تسلسلي (1, 2, 3, ...) لفواتير قسم مبيعات الأقمشة بدلاً من عرض
--   جزء من معرف UUID كـ"رقم مرجع". يشمل ترقيم كل الفواتير القديمة المخزّنة
--   مسبقاً (بحسب ترتيب الإنشاء)، مع تعيين رقم تلقائي لأي فاتورة جديدة لاحقاً.
--   الترقيم خاص بفرع الأقمشة (branch = 'fabrics') فقط.
-- ============================================================================

-- 1) إضافة عمود رقم الفاتورة
ALTER TABLE income
ADD COLUMN IF NOT EXISTS invoice_number BIGINT;

-- 2) إنشاء تسلسل مخصص لأرقام فواتير مبيعات الأقمشة
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'fabrics_invoice_number_seq'
  ) THEN
    CREATE SEQUENCE fabrics_invoice_number_seq;
  END IF;
END $$;

-- 3) ترقيم الفواتير القديمة (فرع الأقمشة فقط) حسب ترتيب الإنشاء الزمني
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM income
  WHERE branch = 'fabrics' AND invoice_number IS NULL
)
UPDATE income
SET invoice_number = numbered.rn
FROM numbered
WHERE income.id = numbered.id;

-- 4) ضبط التسلسل ليبدأ من بعد أكبر رقم فاتورة موجود حالياً
SELECT setval(
  'fabrics_invoice_number_seq',
  COALESCE((SELECT MAX(invoice_number) FROM income WHERE branch = 'fabrics'), 0)
);

-- 5) دالة + Trigger لتعيين رقم الفاتورة تلقائياً عند إضافة مبيعة قماش جديدة
CREATE OR REPLACE FUNCTION set_income_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.branch = 'fabrics' AND NEW.invoice_number IS NULL THEN
    NEW.invoice_number := nextval('fabrics_invoice_number_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_income_invoice_number ON income;
CREATE TRIGGER trigger_set_income_invoice_number
BEFORE INSERT ON income
FOR EACH ROW
EXECUTE FUNCTION set_income_invoice_number();

-- 6) فهرس فريد لأرقام فواتير الأقمشة (لا يمنع تكرار NULL في الفروع الأخرى)
CREATE UNIQUE INDEX IF NOT EXISTS idx_income_fabrics_invoice_number
ON income(invoice_number) WHERE branch = 'fabrics';

COMMENT ON COLUMN income.invoice_number IS 'رقم الفاتورة التسلسلي لمبيعات الأقمشة (فرع fabrics فقط) — يُعيَّن تلقائياً عبر trigger';

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
