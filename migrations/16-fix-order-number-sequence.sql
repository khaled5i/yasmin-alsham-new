-- ============================================================================
-- Yasmin Al-Sham - Fix Order Number Generation (Sequence-based)
-- إصلاح توليد رقم الطلب لمنع التكرار حتى مع حذف الطلبات
-- التاريخ: 2026-02-10
-- ============================================================================

-- الهدف:
-- - استبدال التوليد المعتمد على COUNT/‏MAX بتسلسل (SEQUENCE) لضمان التفرد دائمًا
-- - تهيئة التسلسل بناءً على أكبر رقم طلب رقمي موجود

-- ============================================================================
-- 1) إنشاء التسلسل إذا لم يكن موجودًا
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE relkind = 'S'
      AND relname = 'orders_order_number_seq'
  ) THEN
    CREATE SEQUENCE orders_order_number_seq;
  END IF;
END $$;

-- ============================================================================
-- 2) تهيئة التسلسل إلى أكبر رقم طلب رقمي موجود (إن وُجد)
-- ============================================================================
SELECT setval(
  'orders_order_number_seq',
  COALESCE(
    (
      SELECT MAX(normalized_num::BIGINT)
      FROM orders
      CROSS JOIN LATERAL (
        SELECT translate(
          order_number,
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          '01234567890123456789'
        ) AS normalized_num
      ) t
      WHERE normalized_num ~ '^[0-9]+$'
    ),
    0
  )
);

-- ============================================================================
-- 3) تحديث الدالة لتوليد رقم طلب جديد باستخدام التسلسل
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN nextval('orders_order_number_seq')::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_order_number() IS
  'توليد رقم طلب متسلسل باستخدام SEQUENCE لضمان التفرد (1, 2, 3, ...)';
