-- ============================================================================
-- Yasmin Al-Sham - Orders Migration
-- ترحيل نظام الطلبات من localStorage إلى Supabase
-- ============================================================================

-- ============================================================================
-- 1. إنشاء جدول orders (الطلبات)
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- رقم الطلب الفريد (يُنشأ تلقائياً)
  order_number TEXT UNIQUE NOT NULL,
  
  -- ربط بالمستخدم (اختياري - للعملاء المسجلين)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- ربط بالعامل المسؤول عن الطلب
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  
  -- بيانات العميل (مطلوبة دائماً)
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  
  -- وصف الطلب والتفاصيل
  description TEXT NOT NULL,
  fabric TEXT, -- نوع القماش
  
  -- المقاسات (JSONB للمرونة)
  measurements JSONB DEFAULT '{}',
  
  -- السعر والدفع
  price DECIMAL(10, 2) NOT NULL,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  
  -- حالة الطلب
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- قيد الانتظار
    'in_progress',  -- قيد التنفيذ
    'completed',    -- مكتمل
    'delivered',    -- تم التسليم
    'cancelled'     -- ملغي
  )),
  
  -- التواريخ
  due_date DATE NOT NULL, -- تاريخ التسليم المتوقع
  delivery_date DATE, -- تاريخ التسليم الفعلي
  
  -- الملاحظات
  notes TEXT, -- ملاحظات عامة
  admin_notes TEXT, -- ملاحظات الإدارة (للـ Admin فقط)
  
  -- الصور والملاحظات الصوتية (مصفوفات من URLs أو base64)
  images TEXT[] DEFAULT '{}',
  voice_notes TEXT[] DEFAULT '{}',
  completed_images TEXT[] DEFAULT '{}', -- صور العمل المكتمل
  
  -- التوقيتات
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. الفهارس (Indexes) لتحسين الأداء
-- ============================================================================

CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_worker_id ON orders(worker_id);
CREATE INDEX idx_orders_client_phone ON orders(client_phone);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_due_date ON orders(due_date);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- فهرس مركب للبحث السريع
CREATE INDEX idx_orders_search ON orders(client_name, client_phone, order_number);

-- ============================================================================
-- 3. Trigger لتحديث updated_at تلقائياً
-- ============================================================================

CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_orders_updated_at();

-- ============================================================================
-- 4. دالة لتوليد رقم طلب فريد
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  year_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  -- الحصول على السنة الحالية
  year_prefix := TO_CHAR(NOW(), 'YYYY');
  
  -- الحصول على عدد الطلبات في السنة الحالية
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM orders
  WHERE order_number LIKE year_prefix || '%';
  
  -- توليد رقم الطلب بصيغة: YYYY-NNNN (مثال: 2025-0001)
  new_number := year_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Trigger لتوليد رقم الطلب تلقائياً عند الإنشاء
-- ============================================================================

CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := generate_order_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_order_number
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION set_order_number();

-- ============================================================================
-- 6. Row Level Security (RLS) Policies
-- ============================================================================

-- تفعيل RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6.1 سياسات SELECT (القراءة)
-- ============================================================================

-- Admin يمكنه رؤية جميع الطلبات
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
CREATE POLICY "Admins can view all orders"
ON orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- العمال يمكنهم رؤية الطلبات المعينة لهم فقط
DROP POLICY IF EXISTS "Workers can view assigned orders" ON orders;
CREATE POLICY "Workers can view assigned orders"
ON orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = orders.worker_id
  )
);

-- العملاء المسجلون يمكنهم رؤية طلباتهم فقط
DROP POLICY IF EXISTS "Clients can view their orders" ON orders;
CREATE POLICY "Clients can view their orders"
ON orders FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
);

-- ============================================================================
-- 6.2 سياسات INSERT (الإضافة)
-- ============================================================================

-- Admin فقط يمكنه إنشاء طلبات جديدة
-- هذا مهم جداً: الطلبات تُنشأ من قبل الإدارة فقط (على عكس المواعيد)
DROP POLICY IF EXISTS "Admins can insert orders" ON orders;
CREATE POLICY "Admins can insert orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- 6.3 سياسات UPDATE (التحديث)
-- ============================================================================

-- Admin يمكنه تحديث جميع الطلبات
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
CREATE POLICY "Admins can update all orders"
ON orders FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- العمال يمكنهم تحديث الطلبات المعينة لهم (حالة الطلب، الصور المكتملة، إلخ)
DROP POLICY IF EXISTS "Workers can update assigned orders" ON orders;
CREATE POLICY "Workers can update assigned orders"
ON orders FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = orders.worker_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = orders.worker_id
  )
);

-- ============================================================================
-- 6.4 سياسات DELETE (الحذف)
-- ============================================================================

-- Admin فقط يمكنه حذف الطلبات
DROP POLICY IF EXISTS "Admins can delete orders" ON orders;
CREATE POLICY "Admins can delete orders"
ON orders FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- 7. دوال مساعدة للبحث والاستعلام
-- ============================================================================

-- دالة للبحث عن طلبات العميل برقم الهاتف
CREATE OR REPLACE FUNCTION get_orders_by_phone(phone_number TEXT)
RETURNS SETOF orders AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM orders
  WHERE client_phone = phone_number
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة للبحث عن طلب برقم الطلب
CREATE OR REPLACE FUNCTION get_order_by_number(order_num TEXT)
RETURNS SETOF orders AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM orders
  WHERE order_number = order_num
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 8. تعليقات على الجدول والأعمدة (Documentation)
-- ============================================================================

COMMENT ON TABLE orders IS 'جدول الطلبات - يحتوي على جميع طلبات الخياطة (Admin فقط يمكنه الإنشاء)';
COMMENT ON COLUMN orders.order_number IS 'رقم الطلب الفريد (يُنشأ تلقائياً بصيغة YYYY-NNNN)';
COMMENT ON COLUMN orders.user_id IS 'معرف العميل المسجل (اختياري)';
COMMENT ON COLUMN orders.worker_id IS 'معرف العامل المسؤول عن الطلب';
COMMENT ON COLUMN orders.measurements IS 'المقاسات بصيغة JSON (مرنة لدعم أنواع مختلفة من المقاسات)';
COMMENT ON COLUMN orders.status IS 'حالة الطلب: pending, in_progress, completed, delivered, cancelled';
COMMENT ON COLUMN orders.payment_status IS 'حالة الدفع: unpaid, partial, paid';

-- ============================================================================
-- نهاية Migration
-- ============================================================================

