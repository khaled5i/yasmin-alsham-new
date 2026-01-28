-- ============================================================================
-- Yasmin Al-Sham - Add Order Fields Migration
-- إضافة حقول جديدة لجدول الطلبات
-- ============================================================================

-- ============================================================================
-- 1. إضافة حقل طريقة الدفع (payment_method)
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash' 
  CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'check'));

-- ============================================================================
-- 2. إضافة حقل تاريخ استلام الطلب (order_received_date)
-- ============================================================================

-- نستخدم created_at كتاريخ استلام الطلب، لكن يمكن إضافة حقل منفصل إذا لزم الأمر
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_received_date DATE DEFAULT CURRENT_DATE;

-- ============================================================================
-- 3. إضافة فهارس للحقول الجديدة
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_order_received_date ON orders(order_received_date);

-- ============================================================================
-- 4. تحديث البيانات الموجودة
-- ============================================================================

-- تحديث order_received_date للطلبات الموجودة لتكون نفس تاريخ الإنشاء
UPDATE orders 
SET order_received_date = created_at::DATE 
WHERE order_received_date IS NULL;

-- ============================================================================
-- 5. التعليقات التوضيحية
-- ============================================================================

COMMENT ON COLUMN orders.payment_method IS 'طريقة الدفع: cash (كاش), card (شبكة), bank_transfer (تحويل بنكي), check (شيك)';
COMMENT ON COLUMN orders.order_received_date IS 'تاريخ استلام الطلب من العميل';

