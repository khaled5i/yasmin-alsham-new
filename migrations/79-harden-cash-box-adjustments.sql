-- ============================================================================
-- تأمين جدول تعديلات الصندوق القديم
-- ============================================================================
-- كان الجدول يسمح سابقاً بالكتابة والتعديل والحذف عبر سياسات USING (true).
-- الرصيد الجديد يقرأ هذا الجدول للتوافق مع التعديلات السابقة، لذلك يجب حصره:
--   • القراءة: العاملون المخولون بالمحاسبة.
--   • الإضافة: مدير النظام فقط (تستخدمها شاشة تعيين رصيد صندوق الأقمشة).
--   • التعديل والحذف: ممنوعان للحفاظ على سجل التدقيق.
-- ============================================================================

ALTER TABLE public.cash_box_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cash_box_adjustments_select_policy"
  ON public.cash_box_adjustments;
DROP POLICY IF EXISTS "cash_box_adjustments_insert_policy"
  ON public.cash_box_adjustments;
DROP POLICY IF EXISTS "cash_box_adjustments_update_policy"
  ON public.cash_box_adjustments;
DROP POLICY IF EXISTS "cash_box_adjustments_delete_policy"
  ON public.cash_box_adjustments;
DROP POLICY IF EXISTS cash_box_adjustments_select_authorized
  ON public.cash_box_adjustments;
DROP POLICY IF EXISTS cash_box_adjustments_insert_admin
  ON public.cash_box_adjustments;

CREATE POLICY cash_box_adjustments_select_authorized
  ON public.cash_box_adjustments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users AS u
      LEFT JOIN public.workers AS w ON w.user_id = u.id
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND (
          u.role = 'admin'
          OR (
            u.role = 'worker'
            AND w.worker_type IN (
              'accountant',
              'general_manager',
              'fabric_store_manager'
            )
          )
        )
    )
  );

CREATE POLICY cash_box_adjustments_insert_admin
  ON public.cash_box_adjustments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.users AS u
      WHERE u.id = (SELECT auth.uid())
        AND u.is_active = TRUE
        AND u.role = 'admin'
    )
  );

REVOKE ALL ON TABLE public.cash_box_adjustments FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.cash_box_adjustments FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.cash_box_adjustments TO authenticated;
GRANT ALL ON TABLE public.cash_box_adjustments TO service_role;

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
