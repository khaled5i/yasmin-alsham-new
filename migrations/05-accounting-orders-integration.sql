-- ============================================================================
-- Yasmin Al-Sham - Accounting Orders Integration Migration
-- تكامل النظام المحاسبي مع نظام الطلبات
-- ============================================================================

-- ============================================================================
-- 1. إضافة حقول محاسبية لجدول الطلبات
-- ============================================================================

-- إضافة حقل رقم الفاتورة المحاسبية
ALTER TABLE orders ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

-- إضافة حقل رقم القيد اليومي
ALTER TABLE orders ADD COLUMN IF NOT EXISTS journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE SET NULL;

-- إضافة حقل مركز التكلفة
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cost_center TEXT DEFAULT 'CC-001';

-- إضافة حقل الفرع
ALTER TABLE orders ADD COLUMN IF NOT EXISTS branch TEXT DEFAULT 'tailoring' CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs'));

-- إضافة حقل معرف العميل المحاسبي
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

-- إضافة حقول الضريبة والخصم
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10, 2);

-- فهارس جديدة
CREATE INDEX IF NOT EXISTS idx_orders_invoice_id ON orders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_orders_journal_entry_id ON orders(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch);
CREATE INDEX IF NOT EXISTS idx_orders_cost_center ON orders(cost_center);

-- ============================================================================
-- 2. دالة لحساب المبلغ الإجمالي
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_order_total()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_amount := NEW.price - COALESCE(NEW.discount_amount, 0) + COALESCE(NEW.tax_amount, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger لحساب المبلغ الإجمالي تلقائياً
DROP TRIGGER IF EXISTS trigger_calculate_order_total ON orders;
CREATE TRIGGER trigger_calculate_order_total
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION calculate_order_total();

-- ============================================================================
-- 3. جدول سجل المدفوعات للطلبات
-- ============================================================================

CREATE TABLE IF NOT EXISTS order_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'check')),
  payment_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس لجدول سجل المدفوعات
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_payment_id ON order_payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_payment_date ON order_payments(payment_date);

-- ============================================================================
-- 4. دالة لتحديث حالة الدفع تلقائياً
-- ============================================================================

CREATE OR REPLACE FUNCTION update_order_payment_status()
RETURNS TRIGGER AS $$
DECLARE
  order_record RECORD;
  total_paid DECIMAL(10, 2);
BEGIN
  -- حساب إجمالي المدفوعات للطلب
  SELECT COALESCE(SUM(amount), 0) INTO total_paid
  FROM order_payments
  WHERE order_id = COALESCE(NEW.order_id, OLD.order_id);
  
  -- تحديث الطلب
  UPDATE orders SET
    paid_amount = total_paid,
    payment_status = CASE
      WHEN total_paid = 0 THEN 'unpaid'
      WHEN total_paid >= COALESCE(total_amount, price) THEN 'paid'
      ELSE 'partial'
    END
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger لتحديث حالة الدفع
DROP TRIGGER IF EXISTS trigger_update_order_payment_status ON order_payments;
CREATE TRIGGER trigger_update_order_payment_status
AFTER INSERT OR UPDATE OR DELETE ON order_payments
FOR EACH ROW
EXECUTE FUNCTION update_order_payment_status();

-- ============================================================================
-- 5. RLS لجدول سجل المدفوعات
-- ============================================================================

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;

-- Admin يمكنه كل شيء
DROP POLICY IF EXISTS "Admins can manage order_payments" ON order_payments;
CREATE POLICY "Admins can manage order_payments"
ON order_payments FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
  )
);

-- تعليقات
COMMENT ON TABLE order_payments IS 'سجل مدفوعات الطلبات - يربط بين الطلبات وسندات القبض';
COMMENT ON COLUMN orders.invoice_id IS 'معرف الفاتورة المحاسبية المرتبطة بالطلب';
COMMENT ON COLUMN orders.journal_entry_id IS 'معرف القيد اليومي المرتبط بالطلب';
COMMENT ON COLUMN orders.branch IS 'الفرع: tailoring, fabrics, ready_designs';
COMMENT ON COLUMN orders.cost_center IS 'مركز التكلفة المحاسبي';

-- ============================================================================
-- نهاية Migration
-- ============================================================================

