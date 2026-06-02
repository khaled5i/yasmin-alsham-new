-- Migration 51: تاريخ البروفا الثانية القابل للتعديل (second_proof_date)
--
-- المشكلة: موعد "البروفا الثانية" كان يُحسب ديناميكياً في كل الواجهات كـ (due_date - 1)
-- أي قبل تاريخ التسليم الحقيقي للزبون بثلاثة أيام (customer_due_date - 3).
-- لم يكن هناك طريقة لتعديل هذا الموعد يدوياً عند إضافة الطلب.
--
-- الحل: عمود اختياري second_proof_date يحفظ القيمة المُعدّلة يدوياً.
--   • عند وجود قيمة: تُعرض كموعد البروفا الثانية في كل الواجهات.
--   • عند NULL (الطلبات القديمة أو عند عدم التعديل): يُعاد إلى الحساب القديم (due_date - 1).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS second_proof_date DATE;

COMMENT ON COLUMN orders.second_proof_date IS
  'موعد البروفا الثانية (قابل للتعديل). NULL → يُحسب تلقائياً كـ (due_date - 1) أي قبل تاريخ الزبون بثلاثة أيام.';

-- فهرس لتسريع أي استعلام مستقبلي على هذا التاريخ
CREATE INDEX IF NOT EXISTS idx_orders_second_proof_date
  ON orders(second_proof_date)
  WHERE second_proof_date IS NOT NULL;
