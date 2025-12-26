-- ============================================================================
-- جدول فئات المحاسبة الديناميكية
-- Accounting Categories Table
-- ============================================================================

-- إنشاء جدول الفئات
CREATE TABLE IF NOT EXISTS accounting_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- نوع الفئة
  category_type VARCHAR(50) NOT NULL CHECK (category_type IN ('income', 'purchase', 'fixed_expense', 'salary')),
  
  -- الفرع
  branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  
  -- معرف الفئة (يستخدم في الكود)
  category_id VARCHAR(100) NOT NULL,
  
  -- اسم الفئة بالعربية
  label_ar VARCHAR(200) NOT NULL,
  
  -- اسم الفئة بالإنجليزية (اختياري)
  label_en VARCHAR(200),
  
  -- وصف الفئة
  description TEXT,
  
  -- ترتيب العرض
  display_order INTEGER DEFAULT 0,
  
  -- هل الفئة نشطة
  is_active BOOLEAN DEFAULT true,
  
  -- هل الفئة افتراضية (لا يمكن حذفها)
  is_default BOOLEAN DEFAULT false,
  
  -- التواريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  
  -- فهرس فريد لمنع التكرار
  UNIQUE(branch, category_type, category_id)
);

-- إنشاء فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_accounting_categories_branch ON accounting_categories(branch);
CREATE INDEX IF NOT EXISTS idx_accounting_categories_type ON accounting_categories(category_type);
CREATE INDEX IF NOT EXISTS idx_accounting_categories_active ON accounting_categories(is_active);

-- تفعيل RLS
ALTER TABLE accounting_categories ENABLE ROW LEVEL SECURITY;

-- سياسة القراءة: الجميع يمكنهم قراءة الفئات النشطة
CREATE POLICY "Anyone can view active categories"
  ON accounting_categories
  FOR SELECT
  USING (is_active = true);

-- سياسة الإضافة: المدراء فقط
CREATE POLICY "Admins and managers can insert categories"
  ON accounting_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
      )
    )
  );

-- سياسة التحديث: المدراء فقط
CREATE POLICY "Admins and managers can update categories"
  ON accounting_categories
  FOR UPDATE
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
      )
    )
  );

-- سياسة الحذف: المدراء فقط ولا يمكن حذف الفئات الافتراضية
CREATE POLICY "Admins and managers can delete non-default categories"
  ON accounting_categories
  FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
      )
    )
  );

-- دالة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_accounting_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_categories_updated_at
  BEFORE UPDATE ON accounting_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_accounting_categories_updated_at();

-- ============================================================================
-- إدراج الفئات الافتراضية لقسم الأقمشة
-- ============================================================================

-- فئات المبيعات للأقمشة
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('fabrics', 'income', 'fabric_sale', 'بيع أقمشة', 'Fabric Sale', true, 1),
('fabrics', 'income', 'wholesale', 'بيع جملة', 'Wholesale', true, 2),
('fabrics', 'income', 'retail', 'بيع تجزئة', 'Retail', true, 3),
('fabrics', 'income', 'accessories_sale', 'بيع إكسسوارات', 'Accessories Sale', true, 4),
('fabrics', 'income', 'custom_order', 'طلب خاص', 'Custom Order', true, 5),
('fabrics', 'income', 'other', 'أخرى', 'Other', true, 6);

-- فئات المشتريات للأقمشة
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('fabrics', 'purchase', 'cotton', 'أقمشة قطنية', 'Cotton Fabrics', true, 1),
('fabrics', 'purchase', 'silk', 'أقمشة حرير', 'Silk Fabrics', true, 2),
('fabrics', 'purchase', 'wool', 'أقمشة صوف', 'Wool Fabrics', true, 3),
('fabrics', 'purchase', 'linen', 'أقمشة كتان', 'Linen Fabrics', true, 4),
('fabrics', 'purchase', 'synthetic', 'أقمشة صناعية', 'Synthetic Fabrics', true, 5),
('fabrics', 'purchase', 'accessories', 'إكسسوارات', 'Accessories', true, 6),
('fabrics', 'purchase', 'tools', 'أدوات وعدد', 'Tools', true, 7),
('fabrics', 'purchase', 'other', 'أخرى', 'Other', true, 8);

-- فئات المصاريف الثابتة للأقمشة
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('fabrics', 'fixed_expense', 'rent', 'إيجار المحل', 'Rent', true, 1),
('fabrics', 'fixed_expense', 'electricity', 'الكهرباء', 'Electricity', true, 2),
('fabrics', 'fixed_expense', 'water', 'المياه', 'Water', true, 3),
('fabrics', 'fixed_expense', 'internet', 'الإنترنت', 'Internet', true, 4),
('fabrics', 'fixed_expense', 'phone', 'الهاتف', 'Phone', true, 5),
('fabrics', 'fixed_expense', 'insurance', 'التأمين', 'Insurance', true, 6),
('fabrics', 'fixed_expense', 'maintenance', 'الصيانة', 'Maintenance', true, 7),
('fabrics', 'fixed_expense', 'cleaning', 'النظافة', 'Cleaning', true, 8),
('fabrics', 'fixed_expense', 'other', 'أخرى', 'Other', true, 9);

-- فئات الرواتب للأقمشة
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('fabrics', 'salary', 'monthly_salary', 'راتب شهري', 'Monthly Salary', true, 1),
('fabrics', 'salary', 'daily_wage', 'أجر يومي', 'Daily Wage', true, 2),
('fabrics', 'salary', 'overtime', 'عمل إضافي', 'Overtime', true, 3),
('fabrics', 'salary', 'bonus', 'مكافأة', 'Bonus', true, 4),
('fabrics', 'salary', 'deduction', 'خصم', 'Deduction', true, 5);

-- ============================================================================
-- تعليقات على الجدول والأعمدة
-- ============================================================================

COMMENT ON TABLE accounting_categories IS 'جدول الفئات المحاسبية الديناميكية لجميع الأقسام';
COMMENT ON COLUMN accounting_categories.category_type IS 'نوع الفئة: income (مبيعات), purchase (مشتريات), fixed_expense (مصاريف ثابتة), salary (رواتب)';
COMMENT ON COLUMN accounting_categories.branch IS 'الفرع: tailoring (تفصيل), fabrics (أقمشة), ready_designs (جاهز)';
COMMENT ON COLUMN accounting_categories.category_id IS 'معرف الفئة المستخدم في الكود';
COMMENT ON COLUMN accounting_categories.is_default IS 'الفئات الافتراضية لا يمكن حذفها';

