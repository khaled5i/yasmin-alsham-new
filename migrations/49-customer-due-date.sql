-- Migration 49: التاريخ الحقيقي للزبون (customer_due_date)
--
-- المشكلة: عند إضافة طلب جديد يختار الموظف تاريخ التسليم المُعطى للزبون (مثلاً 29)،
-- لكن النظام يحفظ `due_date` مُزاحاً بيومين للوراء (27) لضمان إنجاز القطعة قبل موعد الزبون.
-- هذا التاريخ المُزاح يظهر في كل النظام مما يسبب ارتباكاً في الواجهات التي يراها الزبون
-- (صفحة تتبع الطلب، التقويم، رسالة الواتساب).
--
-- الحل: حفظ التاريخين معاً.
--   • `due_date`           = التاريخ الداخلي (المُزاح -2) — يبقى كما هو في كل الصفحات التشغيلية.
--   • `customer_due_date`  = التاريخ الحقيقي المُعطى للزبون — يُعرض فقط في الواجهات الموجهة للزبون.
--
-- الطلبات القديمة: العمود يقبل NULL. الكود يستخدم `due_date` كـ fallback لأي صف بلا قيمة.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_due_date DATE;

COMMENT ON COLUMN orders.customer_due_date IS
  'التاريخ الحقيقي المُعطى للزبون (قبل إزاحة الـ -2 الداخلية). NULL للطلبات القديمة قبل تطبيق هذا الفصل.';

-- فهرس على customer_due_date لتسريع استعلامات التقويم/تتبع الطلب
CREATE INDEX IF NOT EXISTS idx_orders_customer_due_date
  ON orders(customer_due_date)
  WHERE customer_due_date IS NOT NULL;
