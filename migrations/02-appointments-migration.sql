-- ============================================================================
-- Yasmin Al-Sham - Appointments Migration
-- تحويل نظام المواعيد من localStorage إلى Supabase
-- ============================================================================

-- ============================================================================
-- 1. إنشاء جدول appointments
-- ============================================================================

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- ربط اختياري بمستخدم مسجل (للمستقبل)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- ربط اختياري بعامل
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  
  -- بيانات الزبون (مطلوبة دائماً - للزبائن غير المسجلين)
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  
  -- بيانات الموعد
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  service_type TEXT DEFAULT 'consultation',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  
  -- ملاحظات
  notes TEXT, -- ملاحظات الزبون
  admin_notes TEXT, -- ملاحظات الإدارة (للـ Admin فقط)
  
  -- تتبع
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. إنشاء Indexes للأداء
-- ============================================================================

-- فهرس للبحث برقم الهاتف (للزبائن غير المسجلين)
CREATE INDEX IF NOT EXISTS idx_appointments_customer_phone ON appointments(customer_phone);

-- فهرس للبحث بتاريخ الموعد
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

-- فهرس للبحث بحالة الموعد
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

-- فهرس للبحث بالعامل المسؤول
CREATE INDEX IF NOT EXISTS idx_appointments_worker_id ON appointments(worker_id);

-- فهرس للبحث بالمستخدم (للمستقبل)
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON appointments(user_id);

-- فهرس مركب للبحث بالتاريخ والوقت (للتحقق من التوفر)
CREATE INDEX IF NOT EXISTS idx_appointments_date_time ON appointments(appointment_date, appointment_time);

-- ============================================================================
-- 3. Trigger للتحديث التلقائي لـ updated_at
-- ============================================================================

-- استخدام نفس الدالة الموجودة من workers migration
DROP TRIGGER IF EXISTS update_appointments_updated_at ON appointments;
CREATE TRIGGER update_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. Row Level Security (RLS) Policies
-- ============================================================================

-- تفعيل RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 4.1 سياسات SELECT (القراءة)
-- ============================================================================

-- الجميع (حتى غير المسجلين) يمكنهم قراءة المواعيد
-- هذا مهم للزبائن غير المسجلين للبحث عن مواعيدهم برقم الهاتف
DROP POLICY IF EXISTS "Anyone can view appointments" ON appointments;
CREATE POLICY "Anyone can view appointments"
ON appointments FOR SELECT
TO public
USING (true);

-- ============================================================================
-- 4.2 سياسات INSERT (الإنشاء)
-- ============================================================================

-- الجميع (حتى غير المسجلين) يمكنهم إنشاء مواعيد
-- هذا هو المتطلب الأساسي: حجز مواعيد بدون تسجيل دخول
DROP POLICY IF EXISTS "Anyone can create appointments" ON appointments;
CREATE POLICY "Anyone can create appointments"
ON appointments FOR INSERT
TO public
WITH CHECK (true);

-- ============================================================================
-- 4.3 سياسات UPDATE (التحديث)
-- ============================================================================

-- Admin يمكنه تحديث أي موعد
DROP POLICY IF EXISTS "Admins can update appointments" ON appointments;
CREATE POLICY "Admins can update appointments"
ON appointments FOR UPDATE
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Worker يمكنه تحديث المواعيد المخصصة له فقط
DROP POLICY IF EXISTS "Workers can update assigned appointments" ON appointments;
CREATE POLICY "Workers can update assigned appointments"
ON appointments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = appointments.worker_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = appointments.worker_id
  )
);

-- المستخدم المسجل يمكنه تحديث مواعيده الخاصة (للمستقبل)
DROP POLICY IF EXISTS "Users can update own appointments" ON appointments;
CREATE POLICY "Users can update own appointments"
ON appointments FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- 4.4 سياسات DELETE (الحذف)
-- ============================================================================

-- Admin فقط يمكنه حذف المواعيد
DROP POLICY IF EXISTS "Admins can delete appointments" ON appointments;
CREATE POLICY "Admins can delete appointments"
ON appointments FOR DELETE
TO authenticated
USING (is_admin());

-- ============================================================================
-- 5. دوال مساعدة (Helper Functions)
-- ============================================================================

-- دالة للتحقق من توفر موعد في تاريخ ووقت محدد
CREATE OR REPLACE FUNCTION is_appointment_slot_available(
  check_date DATE,
  check_time TIME,
  exclude_appointment_id UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM appointments
    WHERE appointment_date = check_date
    AND appointment_time = check_time
    AND status NOT IN ('cancelled')
    AND (exclude_appointment_id IS NULL OR id != exclude_appointment_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة لحساب عدد المواعيد في يوم محدد
CREATE OR REPLACE FUNCTION count_appointments_on_date(
  check_date DATE,
  exclude_status TEXT[] DEFAULT ARRAY['cancelled']
)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM appointments
    WHERE appointment_date = check_date
    AND NOT (status = ANY(exclude_status))
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة للحصول على مواعيد زبون برقم الهاتف
CREATE OR REPLACE FUNCTION get_appointments_by_phone(
  phone_number TEXT
)
RETURNS SETOF appointments AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM appointments
  WHERE customer_phone = phone_number
  ORDER BY appointment_date DESC, appointment_time DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 6. تعليقات على الجدول والأعمدة (Documentation)
-- ============================================================================

COMMENT ON TABLE appointments IS 'جدول المواعيد - يدعم حجز المواعيد للزبائن المسجلين وغير المسجلين';

COMMENT ON COLUMN appointments.id IS 'معرف فريد للموعد';
COMMENT ON COLUMN appointments.user_id IS 'معرف المستخدم المسجل (اختياري - للمستقبل)';
COMMENT ON COLUMN appointments.worker_id IS 'معرف العامل المسؤول (اختياري)';
COMMENT ON COLUMN appointments.customer_name IS 'اسم الزبون (مطلوب دائماً)';
COMMENT ON COLUMN appointments.customer_phone IS 'رقم هاتف الزبون (مطلوب دائماً - للبحث)';
COMMENT ON COLUMN appointments.customer_email IS 'البريد الإلكتروني للزبون (اختياري)';
COMMENT ON COLUMN appointments.appointment_date IS 'تاريخ الموعد';
COMMENT ON COLUMN appointments.appointment_time IS 'وقت الموعد';
COMMENT ON COLUMN appointments.service_type IS 'نوع الخدمة (consultation, fitting, delivery, etc.)';
COMMENT ON COLUMN appointments.status IS 'حالة الموعد: pending, confirmed, completed, cancelled';
COMMENT ON COLUMN appointments.notes IS 'ملاحظات الزبون';
COMMENT ON COLUMN appointments.admin_notes IS 'ملاحظات الإدارة (للـ Admin فقط)';

-- ============================================================================
-- 7. بيانات تجريبية (اختيارية - للتطوير فقط)
-- ============================================================================

-- يمكنك إضافة بيانات تجريبية هنا للاختبار
-- مثال:
-- INSERT INTO appointments (customer_name, customer_phone, customer_email, appointment_date, appointment_time, service_type, status, notes)
-- VALUES 
--   ('فاطمة أحمد', '0501234567', 'fatima@example.com', CURRENT_DATE + INTERVAL '2 days', '16:00', 'consultation', 'pending', 'استشارة لفستان زفاف'),
--   ('مريم خالد', '0509876543', 'mariam@example.com', CURRENT_DATE + INTERVAL '3 days', '18:00', 'fitting', 'confirmed', 'قياس فستان سهرة');

-- ============================================================================
-- نهاية Migration
-- ============================================================================

-- للتحقق من نجاح التنفيذ:
-- SELECT COUNT(*) FROM appointments;
-- SELECT * FROM appointments LIMIT 5;

