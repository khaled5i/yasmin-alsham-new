-- ============================================================================
-- إضافة أنواع العمال الجديدة (Worker Types)
-- Adding New Worker Types
-- ============================================================================
-- هذا الملف يضيف:
-- 1. عمود worker_type إلى جدول workers
-- 2. القيم المسموحة: tailor, fabric_store_manager, accountant, general_manager
-- ============================================================================

-- إضافة عمود worker_type إلى جدول workers
ALTER TABLE workers 
ADD COLUMN IF NOT EXISTS worker_type TEXT DEFAULT 'tailor' 
CHECK (worker_type IN ('tailor', 'fabric_store_manager', 'accountant', 'general_manager'));

-- إضافة تعليق توضيحي
COMMENT ON COLUMN workers.worker_type IS 'نوع العامل: tailor (خياط), fabric_store_manager (مدير متجر الأقمشة), accountant (محاسب), general_manager (مدير عام)';

-- تحديث العمال الموجودين ليكونوا من نوع tailor (الافتراضي)
UPDATE workers 
SET worker_type = 'tailor' 
WHERE worker_type IS NULL;

-- ============================================================================
-- التحقق من نجاح التحديث
-- ============================================================================

-- عرض بنية الجدول المحدثة
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'workers' AND column_name = 'worker_type';

-- عرض العمال مع أنواعهم
SELECT 
  w.id,
  u.full_name,
  u.email,
  w.specialty,
  w.worker_type,
  w.created_at
FROM workers w
JOIN users u ON w.user_id = u.id
ORDER BY w.created_at DESC;

