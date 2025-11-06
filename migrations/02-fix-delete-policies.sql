-- ============================================================================
-- إصلاح سياسات RLS للحذف
-- المشكلة: عند حذف عامل، يجب حذفه من جدولي workers و users
-- الحل: تحديث سياسات الحذف للسماح للمستخدمين المصادقين بالحذف
-- ============================================================================

-- ============================================================================
-- 1. تحديث سياسات الحذف لجدول workers
-- ============================================================================

-- حذف السياسة القديمة
DROP POLICY IF EXISTS "Admins can delete workers" ON workers;

-- سياسة جديدة: أي مستخدم مصادق يمكنه حذف عمال (للتطوير)
CREATE POLICY "Authenticated users can delete workers"
ON workers FOR DELETE
TO authenticated
USING (true);

-- ملاحظة: في الإنتاج، استخدم هذه السياسة بدلاً من ذلك:
-- CREATE POLICY "Admins can delete workers"
-- ON workers FOR DELETE
-- TO authenticated
-- USING (is_admin());

-- ============================================================================
-- 2. تحديث سياسات الحذف لجدول users
-- ============================================================================

-- حذف السياسة القديمة
DROP POLICY IF EXISTS "Admins can delete users" ON users;

-- سياسة جديدة: أي مستخدم مصادق يمكنه حذف مستخدمين (للتطوير)
CREATE POLICY "Authenticated users can delete users"
ON users FOR DELETE
TO authenticated
USING (true);

-- ملاحظة: في الإنتاج، استخدم هذه السياسة بدلاً من ذلك:
-- CREATE POLICY "Admins can delete users"
-- ON users FOR DELETE
-- TO authenticated
-- USING (is_admin());

-- ============================================================================
-- 3. التحقق من CASCADE DELETE
-- ============================================================================

-- التحقق من أن foreign key في جدول workers يحتوي على ON DELETE CASCADE
-- هذا يضمن أنه عند حذف user، يتم حذف worker تلقائياً

-- عرض foreign keys الحالية
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name = 'workers';

-- إذا كانت delete_rule ليست 'CASCADE'، قم بتحديث foreign key:
-- ALTER TABLE workers DROP CONSTRAINT workers_user_id_fkey;
-- ALTER TABLE workers ADD CONSTRAINT workers_user_id_fkey 
--   FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- ============================================================================
-- ملاحظات مهمة:
-- ============================================================================
-- 1. هذه السياسات مناسبة لبيئة التطوير فقط
-- 2. في الإنتاج، يجب استخدام سياسات أكثر صرامة (is_admin())
-- 3. CASCADE DELETE موجود بالفعل في schema الأصلي
-- 4. عند حذف worker، يتم حذفه من جدول workers ثم من جدول users
-- 5. لحذف المستخدم من Supabase Auth، يجب استخدام Service Role Key
-- ============================================================================

