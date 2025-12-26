-- ============================================================================
-- السماح بحذف الفئات الافتراضية
-- تحديث سياسة RLS للسماح بحذف جميع الفئات بما فيها الافتراضية
-- ============================================================================

-- حذف السياسة القديمة
DROP POLICY IF EXISTS "Admins and managers can delete non-default categories" ON accounting_categories;

-- إنشاء سياسة جديدة: السماح بحذف جميع الفئات (بما فيها الافتراضية)
CREATE POLICY "Admins and managers can delete all categories"
  ON accounting_categories
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
        OR (u.role = 'worker' AND w.worker_type = 'accountant')
      )
    )
  );

-- تحديث التعليق
COMMENT ON COLUMN accounting_categories.is_default IS 'الفئات الافتراضية (يمكن حذفها الآن)';

