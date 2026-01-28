-- ============================================================================
-- إضافة RLS Policy لمدير الورشة لرؤية جميع الطلبات
-- Add RLS Policy for Workshop Manager to View All Orders
-- ============================================================================
-- هذا الملف يضيف:
-- 1. سياسة جديدة تسمح لمدير الورشة برؤية جميع الطلبات
-- 2. تحديث صلاحيات UPDATE للطلبات لتشمل مدير الورشة
-- ============================================================================

-- ============================================================================
-- الخطوة 1: إضافة سياسة SELECT لمدير الورشة
-- ============================================================================

-- مدير الورشة يمكنه رؤية جميع الطلبات (مثل المدير)
DROP POLICY IF EXISTS "Workshop managers can view all orders" ON orders;
CREATE POLICY "Workshop managers can view all orders"
ON orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.worker_type = 'workshop_manager'
  )
);

-- ============================================================================
-- الخطوة 2: إضافة سياسة UPDATE لمدير الورشة
-- ============================================================================

-- مدير الورشة يمكنه تحديث حالة الطلبات (تسليم الطلبات المكتملة)
DROP POLICY IF EXISTS "Workshop managers can update orders" ON orders;
CREATE POLICY "Workshop managers can update orders"
ON orders FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.worker_type = 'workshop_manager'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.worker_type = 'workshop_manager'
  )
);

-- ============================================================================
-- ملاحظات مهمة:
-- ============================================================================
-- 1. مدير الورشة يمكنه:
--    - رؤية جميع الطلبات (SELECT)
--    - تحديث حالة الطلبات (UPDATE) - مثل تسليم الطلبات المكتملة
-- 2. مدير الورشة لا يمكنه:
--    - إنشاء طلبات جديدة (INSERT) - هذا للمدير فقط
--    - حذف الطلبات (DELETE) - هذا للمدير فقط
-- 3. هذه الصلاحيات تتناسب مع دور مدير الورشة في متابعة وتسليم الطلبات
-- ============================================================================

-- التحقق من نجاح العملية
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'orders'
AND policyname LIKE '%workshop%'
ORDER BY policyname;

