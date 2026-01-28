-- ============================================================================
-- إضافة نوع عامل جديد: مدير الورشة (Workshop Manager)
-- Adding New Worker Type: Workshop Manager
-- ============================================================================
-- هذا الملف يضيف:
-- 1. تحديث قيد CHECK على عمود worker_type لإضافة 'workshop_manager'
-- ============================================================================

-- الخطوة 1: حذف القيد القديم (إذا كان موجوداً)
DO $$
BEGIN
  -- البحث عن اسم القيد الحالي وحذفه
  IF EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'workers' AND column_name = 'worker_type'
  ) THEN
    -- حذف القيد القديم
    ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_worker_type_check;
    RAISE NOTICE 'تم حذف القيد القديم workers_worker_type_check';
  END IF;
END $$;

-- الخطوة 2: إضافة القيد الجديد مع 'workshop_manager'
ALTER TABLE workers
ADD CONSTRAINT workers_worker_type_check
CHECK (worker_type IN ('tailor', 'fabric_store_manager', 'accountant', 'general_manager', 'workshop_manager'));

-- ============================================================================
-- ملاحظات مهمة:
-- ============================================================================
-- 1. بعد تنفيذ هذا الملف، يمكنك إنشاء عمال جدد من نوع 'workshop_manager'
-- 2. مدير الورشة له الصلاحيات التالية:
--    - الوصول إلى صفحة الطلبات الحديثة (/dashboard/orders)
--    - الوصول إلى صفحة الطلبات المكتملة (/dashboard/completed-orders)
--    - الوصول إلى صفحة الطلبات المسلمة (/dashboard/delivered-orders)
--    - لوحة تحكم خاصة به (/dashboard/workshop-manager)
-- 3. لا يمكنه الوصول إلى:
--    - إدارة الأقمشة
--    - النظام المحاسبي
--    - إدارة العمال
--    - الإعدادات
-- ============================================================================

-- التحقق من نجاح العملية
SELECT
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'workers_worker_type_check';

