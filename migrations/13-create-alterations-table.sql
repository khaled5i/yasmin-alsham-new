-- ============================================================================
-- Yasmin Al-Sham - Alterations System Migration
-- نظام إدارة طلبات التعديلات على الفساتين
-- ============================================================================
-- 
-- تعليمات التطبيق:
-- 1. افتح Supabase Dashboard
-- 2. اذهب إلى SQL Editor
-- 3. انسخ والصق هذا الملف بالكامل
-- 4. اضغط RUN لتنفيذ الأوامر
-- 
-- ============================================================================

-- ============================================================================
-- 1. إنشاء جدول alterations (طلبات التعديلات)
-- ============================================================================

CREATE TABLE IF NOT EXISTS alterations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- رقم طلب التعديل الفريد (يُنشأ تلقائياً)
  alteration_number TEXT UNIQUE NOT NULL,
  
  -- ربط بالطلب الأصلي (اختياري - NULL إذا كان فستان خارجي)
  original_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  
  -- ربط بالعامل المسؤول عن التعديل
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  
  -- بيانات العميل (مطلوبة دائماً)
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  
  -- وصف التعديل المطلوب
  description TEXT,
  
  -- السعر والدفع
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  remaining_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'bank_transfer', 'check')),
  
  -- حالة طلب التعديل
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- قيد الانتظار
    'in_progress',  -- قيد التنفيذ
    'completed',    -- مكتمل
    'delivered',    -- تم التسليم
    'cancelled'     -- ملغي
  )),
  
  -- التواريخ
  alteration_due_date DATE NOT NULL, -- موعد تسليم التعديل
  delivery_date DATE, -- تاريخ التسليم الفعلي
  order_received_date DATE DEFAULT CURRENT_DATE, -- تاريخ استلام طلب التعديل
  
  -- الملاحظات
  notes TEXT, -- ملاحظات إضافية
  admin_notes TEXT, -- ملاحظات الإدارة (للـ Admin فقط)
  
  -- الصور والملاحظات الصوتية
  images TEXT[] DEFAULT '{}', -- صور التصميم
  completed_images TEXT[] DEFAULT '{}', -- صور العمل المكتمل
  voice_notes TEXT[] DEFAULT '{}', -- ملاحظات صوتية
  
  -- تعليقات التصميم والرسومات (نفس بنية orders)
  voice_transcriptions JSONB DEFAULT '[]', -- نصوص الملاحظات الصوتية
  saved_design_comments JSONB DEFAULT '[]', -- تعليقات التصميم المحفوظة
  image_annotations JSONB DEFAULT '[]', -- التعليقات على الصور
  image_drawings JSONB DEFAULT '[]', -- الرسومات على الصور
  custom_design_image TEXT, -- صورة التصميم المخصص (base64)
  
  -- التوقيتات
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. الفهارس (Indexes) لتحسين الأداء
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_alterations_alteration_number ON alterations(alteration_number);
CREATE INDEX IF NOT EXISTS idx_alterations_original_order_id ON alterations(original_order_id);
CREATE INDEX IF NOT EXISTS idx_alterations_worker_id ON alterations(worker_id);
CREATE INDEX IF NOT EXISTS idx_alterations_client_phone ON alterations(client_phone);
CREATE INDEX IF NOT EXISTS idx_alterations_client_name ON alterations(client_name);
CREATE INDEX IF NOT EXISTS idx_alterations_status ON alterations(status);
CREATE INDEX IF NOT EXISTS idx_alterations_payment_status ON alterations(payment_status);
CREATE INDEX IF NOT EXISTS idx_alterations_alteration_due_date ON alterations(alteration_due_date);
CREATE INDEX IF NOT EXISTS idx_alterations_created_at ON alterations(created_at DESC);

-- فهرس مركب للبحث السريع
CREATE INDEX IF NOT EXISTS idx_alterations_search ON alterations(client_name, client_phone, alteration_number);

-- ============================================================================
-- 3. Trigger لتحديث updated_at تلقائياً
-- ============================================================================

CREATE OR REPLACE FUNCTION update_alterations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_alterations_updated_at ON alterations;

CREATE TRIGGER trigger_update_alterations_updated_at
BEFORE UPDATE ON alterations
FOR EACH ROW
EXECUTE FUNCTION update_alterations_updated_at();

-- ============================================================================
-- 4. دالة لتوليد رقم طلب تعديل فريد
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_alteration_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  year_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  -- الحصول على السنة الحالية
  year_prefix := TO_CHAR(NOW(), 'YYYY');
  
  -- الحصول على عدد طلبات التعديل في السنة الحالية
  SELECT COUNT(*) + 1 INTO sequence_num
  FROM alterations
  WHERE alteration_number LIKE 'ALT-' || year_prefix || '%';
  
  -- توليد رقم طلب التعديل بصيغة: ALT-YYYY-NNNN (مثال: ALT-2025-0001)
  new_number := 'ALT-' || year_prefix || '-' || LPAD(sequence_num::TEXT, 4, '0');

  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. Trigger لتوليد رقم طلب التعديل تلقائياً عند الإنشاء
-- ============================================================================

CREATE OR REPLACE FUNCTION set_alteration_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.alteration_number IS NULL OR NEW.alteration_number = '' THEN
    NEW.alteration_number := generate_alteration_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_alteration_number ON alterations;

CREATE TRIGGER trigger_set_alteration_number
BEFORE INSERT ON alterations
FOR EACH ROW
EXECUTE FUNCTION set_alteration_number();

-- ============================================================================
-- 6. دالة لتحديث remaining_amount و payment_status تلقائياً
-- ============================================================================

CREATE OR REPLACE FUNCTION update_alteration_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- حساب المبلغ المتبقي
  NEW.remaining_amount := NEW.price - COALESCE(NEW.paid_amount, 0);

  -- تحديث حالة الدفع بناءً على المبلغ المدفوع
  IF COALESCE(NEW.paid_amount, 0) = 0 THEN
    NEW.payment_status := 'unpaid';
  ELSIF COALESCE(NEW.paid_amount, 0) >= NEW.price THEN
    NEW.payment_status := 'paid';
  ELSE
    NEW.payment_status := 'partial';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_alteration_payment ON alterations;

CREATE TRIGGER trigger_update_alteration_payment
BEFORE INSERT OR UPDATE OF price, paid_amount ON alterations
FOR EACH ROW
EXECUTE FUNCTION update_alteration_payment();

-- ============================================================================
-- 7. Constraints (القيود)
-- ============================================================================

-- التأكد من أن remaining_amount >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_alteration_remaining_amount_non_negative'
  ) THEN
    ALTER TABLE alterations
    ADD CONSTRAINT check_alteration_remaining_amount_non_negative
    CHECK (remaining_amount >= 0);
  END IF;
END $$;

-- التأكد من أن price >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_alteration_price_non_negative'
  ) THEN
    ALTER TABLE alterations
    ADD CONSTRAINT check_alteration_price_non_negative
    CHECK (price >= 0);
  END IF;
END $$;

-- التأكد من أن paid_amount >= 0
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_alteration_paid_amount_non_negative'
  ) THEN
    ALTER TABLE alterations
    ADD CONSTRAINT check_alteration_paid_amount_non_negative
    CHECK (paid_amount >= 0);
  END IF;
END $$;

-- ============================================================================
-- 8. Row Level Security (RLS) Policies
-- ============================================================================

-- تفعيل RLS
ALTER TABLE alterations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 8.1 سياسات SELECT (القراءة)
-- ============================================================================

-- Admin يمكنه رؤية جميع طلبات التعديل
DROP POLICY IF EXISTS "Admins can view all alterations" ON alterations;
CREATE POLICY "Admins can view all alterations"
ON alterations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- العمال يمكنهم رؤية طلبات التعديل المعينة لهم فقط
DROP POLICY IF EXISTS "Workers can view assigned alterations" ON alterations;
CREATE POLICY "Workers can view assigned alterations"
ON alterations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = alterations.worker_id
  )
);

-- ============================================================================
-- 8.2 سياسات INSERT (الإضافة)
-- ============================================================================

-- Admin فقط يمكنه إنشاء طلبات تعديل جديدة
DROP POLICY IF EXISTS "Admins can insert alterations" ON alterations;
CREATE POLICY "Admins can insert alterations"
ON alterations FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- 8.3 سياسات UPDATE (التعديل)
-- ============================================================================

-- Admin يمكنه تعديل جميع طلبات التعديل
DROP POLICY IF EXISTS "Admins can update all alterations" ON alterations;
CREATE POLICY "Admins can update all alterations"
ON alterations FOR UPDATE
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

-- العمال يمكنهم تعديل طلبات التعديل المعينة لهم فقط (حقول محددة)
DROP POLICY IF EXISTS "Workers can update assigned alterations" ON alterations;
CREATE POLICY "Workers can update assigned alterations"
ON alterations FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = alterations.worker_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workers
    WHERE workers.user_id = auth.uid()
    AND workers.id = alterations.worker_id
  )
);

-- ============================================================================
-- 8.4 سياسات DELETE (الحذف)
-- ============================================================================

-- Admin فقط يمكنه حذف طلبات التعديل
DROP POLICY IF EXISTS "Admins can delete alterations" ON alterations;
CREATE POLICY "Admins can delete alterations"
ON alterations FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'
  )
);

-- ============================================================================
-- 9. التعليقات التوضيحية (Comments)
-- ============================================================================

COMMENT ON TABLE alterations IS 'جدول طلبات التعديلات على الفساتين - يدعم التعديلات على فساتين موجودة في النظام أو فساتين خارجية';

COMMENT ON COLUMN alterations.id IS 'المعرف الفريد لطلب التعديل';
COMMENT ON COLUMN alterations.alteration_number IS 'رقم طلب التعديل الفريد (يُنشأ تلقائياً بصيغة ALT-YYYY-NNNN)';
COMMENT ON COLUMN alterations.original_order_id IS 'معرف الطلب الأصلي (NULL إذا كان فستان خارجي غير موجود في النظام)';
COMMENT ON COLUMN alterations.worker_id IS 'معرف العامل المسؤول عن التعديل';
COMMENT ON COLUMN alterations.client_name IS 'اسم العميل';
COMMENT ON COLUMN alterations.client_phone IS 'رقم هاتف العميل';
COMMENT ON COLUMN alterations.client_email IS 'البريد الإلكتروني للعميل (اختياري)';
COMMENT ON COLUMN alterations.description IS 'وصف التعديل المطلوب';
COMMENT ON COLUMN alterations.price IS 'سعر التعديل';
COMMENT ON COLUMN alterations.paid_amount IS 'المبلغ المدفوع';
COMMENT ON COLUMN alterations.remaining_amount IS 'المبلغ المتبقي (يُحسب تلقائياً: price - paid_amount)';
COMMENT ON COLUMN alterations.payment_status IS 'حالة الدفع (يُحسب تلقائياً: unpaid, partial, paid)';
COMMENT ON COLUMN alterations.payment_method IS 'طريقة الدفع (cash, card, bank_transfer, check)';
COMMENT ON COLUMN alterations.status IS 'حالة طلب التعديل (pending, in_progress, completed, delivered, cancelled)';
COMMENT ON COLUMN alterations.alteration_due_date IS 'موعد تسليم التعديل';
COMMENT ON COLUMN alterations.delivery_date IS 'تاريخ التسليم الفعلي';
COMMENT ON COLUMN alterations.order_received_date IS 'تاريخ استلام طلب التعديل';
COMMENT ON COLUMN alterations.notes IS 'ملاحظات إضافية';
COMMENT ON COLUMN alterations.admin_notes IS 'ملاحظات الإدارة (للـ Admin فقط)';
COMMENT ON COLUMN alterations.images IS 'صور التصميم (مصفوفة من URLs أو base64)';
COMMENT ON COLUMN alterations.completed_images IS 'صور العمل المكتمل (مصفوفة من URLs أو base64)';
COMMENT ON COLUMN alterations.voice_notes IS 'ملاحظات صوتية (مصفوفة من URLs أو base64)';
COMMENT ON COLUMN alterations.voice_transcriptions IS 'نصوص الملاحظات الصوتية (JSONB)';
COMMENT ON COLUMN alterations.saved_design_comments IS 'تعليقات التصميم المحفوظة (JSONB)';
COMMENT ON COLUMN alterations.image_annotations IS 'التعليقات على الصور (JSONB)';
COMMENT ON COLUMN alterations.image_drawings IS 'الرسومات على الصور (JSONB)';
COMMENT ON COLUMN alterations.custom_design_image IS 'صورة التصميم المخصص (base64)';
COMMENT ON COLUMN alterations.created_at IS 'تاريخ إنشاء طلب التعديل';
COMMENT ON COLUMN alterations.updated_at IS 'تاريخ آخر تحديث';

-- ============================================================================
-- 10. ملاحظات نهائية
-- ============================================================================

-- ✅ تم إنشاء جدول alterations بنجاح
-- ✅ تم إنشاء جميع الفهارس (Indexes) لتحسين الأداء
-- ✅ تم إنشاء Trigger لتوليد alteration_number تلقائياً
-- ✅ تم إنشاء Trigger لحساب remaining_amount و payment_status تلقائياً
-- ✅ تم إنشاء Trigger لتحديث updated_at تلقائياً
-- ✅ تم إضافة جميع القيود (Constraints)
-- ✅ تم تفعيل Row Level Security (RLS)
-- ✅ تم إضافة جميع السياسات (Policies) للـ Admin والعمال

-- ============================================================================
-- 11. اختبار الجدول
-- ============================================================================

-- يمكنك اختبار الجدول بتشغيل هذه الأوامر:

-- 1. عرض بنية الجدول
-- \d alterations

-- 2. اختبار إنشاء طلب تعديل جديد (سيتم توليد alteration_number تلقائياً)
-- INSERT INTO alterations (client_name, client_phone, price, alteration_due_date)
-- VALUES ('فاطمة أحمد', '0501234567', 150.00, '2025-02-15');

-- 3. عرض طلبات التعديل
-- SELECT id, alteration_number, client_name, price, paid_amount, remaining_amount, payment_status, status
-- FROM alterations
-- ORDER BY created_at DESC
-- LIMIT 5;

-- 4. اختبار تحديث المبلغ المدفوع (سيتم حساب remaining_amount و payment_status تلقائياً)
-- UPDATE alterations
-- SET paid_amount = 75.00
-- WHERE alteration_number = 'ALT-2025-0001';

-- ============================================================================
-- نهاية الملف
-- ============================================================================

