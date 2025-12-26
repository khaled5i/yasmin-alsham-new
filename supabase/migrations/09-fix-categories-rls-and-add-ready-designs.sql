-- ============================================================================
-- إصلاح سياسات RLS وإضافة بيانات قسم الجاهز
-- Fix RLS Policies and Add Ready Designs Categories
-- ============================================================================

-- حذف السياسات القديمة
DROP POLICY IF EXISTS "Admins and managers can insert categories" ON accounting_categories;
DROP POLICY IF EXISTS "Admins and managers can update categories" ON accounting_categories;
DROP POLICY IF EXISTS "Admins and managers can delete non-default categories" ON accounting_categories;

-- سياسة الإضافة: المدراء والمحاسبون
CREATE POLICY "Admins, managers and accountants can insert categories"
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
        OR (u.role = 'worker' AND w.worker_type IN ('fabric_store_manager', 'general_manager', 'accountant'))
      )
    )
  );

-- سياسة التحديث: المدراء والمحاسبون
CREATE POLICY "Admins, managers and accountants can update categories"
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
        OR (u.role = 'worker' AND w.worker_type IN ('fabric_store_manager', 'general_manager', 'accountant'))
      )
    )
  );

-- سياسة الحذف: المدراء والمحاسبون (يمكنهم حذف جميع الفئات الآن)
CREATE POLICY "Admins, managers and accountants can delete categories"
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
        OR (u.role = 'worker' AND w.worker_type IN ('fabric_store_manager', 'general_manager', 'accountant'))
      )
    )
  );

-- ============================================================================
-- إدراج الفئات الافتراضية لقسم الجاهز (Ready Designs)
-- ============================================================================

-- فئات المبيعات للجاهز
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('ready_designs', 'income', 'evening_dress', 'فساتين سهرة', 'Evening Dresses', true, 1),
('ready_designs', 'income', 'casual_dress', 'فساتين كاجوال', 'Casual Dresses', true, 2),
('ready_designs', 'income', 'wedding_dress', 'فساتين زفاف', 'Wedding Dresses', true, 3),
('ready_designs', 'income', 'party_dress', 'فساتين حفلات', 'Party Dresses', true, 4),
('ready_designs', 'income', 'abaya', 'عباءات', 'Abayas', true, 5),
('ready_designs', 'income', 'wholesale', 'بيع جملة', 'Wholesale', true, 6),
('ready_designs', 'income', 'retail', 'بيع تجزئة', 'Retail', true, 7),
('ready_designs', 'income', 'other', 'أخرى', 'Other', true, 8)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;

-- فئات المشتريات للجاهز
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('ready_designs', 'purchase', 'evening_dress', 'فساتين سهرة', 'Evening Dresses', true, 1),
('ready_designs', 'purchase', 'casual_dress', 'فساتين كاجوال', 'Casual Dresses', true, 2),
('ready_designs', 'purchase', 'wedding_dress', 'فساتين زفاف', 'Wedding Dresses', true, 3),
('ready_designs', 'purchase', 'party_dress', 'فساتين حفلات', 'Party Dresses', true, 4),
('ready_designs', 'purchase', 'abaya', 'عباءات', 'Abayas', true, 5),
('ready_designs', 'purchase', 'accessories', 'إكسسوارات', 'Accessories', true, 6),
('ready_designs', 'purchase', 'packaging', 'مواد التغليف', 'Packaging Materials', true, 7),
('ready_designs', 'purchase', 'other', 'أخرى', 'Other', true, 8)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;

-- فئات المصاريف الثابتة للجاهز
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('ready_designs', 'fixed_expense', 'rent', 'إيجار المحل', 'Rent', true, 1),
('ready_designs', 'fixed_expense', 'electricity', 'الكهرباء', 'Electricity', true, 2),
('ready_designs', 'fixed_expense', 'water', 'المياه', 'Water', true, 3),
('ready_designs', 'fixed_expense', 'internet', 'الإنترنت', 'Internet', true, 4),
('ready_designs', 'fixed_expense', 'phone', 'الهاتف', 'Phone', true, 5),
('ready_designs', 'fixed_expense', 'insurance', 'التأمين', 'Insurance', true, 6),
('ready_designs', 'fixed_expense', 'maintenance', 'الصيانة', 'Maintenance', true, 7),
('ready_designs', 'fixed_expense', 'cleaning', 'النظافة', 'Cleaning', true, 8),
('ready_designs', 'fixed_expense', 'security', 'الأمن', 'Security', true, 9),
('ready_designs', 'fixed_expense', 'other', 'أخرى', 'Other', true, 10)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;

-- فئات الرواتب للجاهز
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('ready_designs', 'salary', 'monthly_salary', 'راتب شهري', 'Monthly Salary', true, 1),
('ready_designs', 'salary', 'daily_wage', 'أجر يومي', 'Daily Wage', true, 2),
('ready_designs', 'salary', 'overtime', 'عمل إضافي', 'Overtime', true, 3),
('ready_designs', 'salary', 'bonus', 'مكافأة', 'Bonus', true, 4),
('ready_designs', 'salary', 'commission', 'عمولة', 'Commission', true, 5),
('ready_designs', 'salary', 'deduction', 'خصم', 'Deduction', true, 6)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;

-- ============================================================================
-- إدراج الفئات الافتراضية لقسم التفصيل (Tailoring) - في حال لم تكن موجودة
-- ============================================================================

-- فئات المبيعات للتفصيل
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('tailoring', 'income', 'custom_dress', 'فساتين مفصلة', 'Custom Dresses', true, 1),
('tailoring', 'income', 'alterations', 'تعديلات', 'Alterations', true, 2),
('tailoring', 'income', 'embroidery', 'تطريز', 'Embroidery', true, 3),
('tailoring', 'income', 'measurements', 'أخذ مقاسات', 'Measurements', true, 4),
('tailoring', 'income', 'other', 'أخرى', 'Other', true, 5)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;

-- فئات المصروفات للتفصيل (المواد)
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('tailoring', 'purchase', 'fabrics', 'أقمشة', 'Fabrics', true, 1),
('tailoring', 'purchase', 'threads', 'خيوط', 'Threads', true, 2),
('tailoring', 'purchase', 'zippers', 'سحابات', 'Zippers', true, 3),
('tailoring', 'purchase', 'buttons', 'أزرار', 'Buttons', true, 4),
('tailoring', 'purchase', 'accessories', 'إكسسوارات', 'Accessories', true, 5),
('tailoring', 'purchase', 'tools', 'أدوات', 'Tools', true, 6),
('tailoring', 'purchase', 'other', 'أخرى', 'Other', true, 7)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;

-- فئات المصاريف الثابتة للتفصيل
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('tailoring', 'fixed_expense', 'rent', 'إيجار الورشة', 'Workshop Rent', true, 1),
('tailoring', 'fixed_expense', 'electricity', 'الكهرباء', 'Electricity', true, 2),
('tailoring', 'fixed_expense', 'water', 'المياه', 'Water', true, 3),
('tailoring', 'fixed_expense', 'internet', 'الإنترنت', 'Internet', true, 4),
('tailoring', 'fixed_expense', 'phone', 'الهاتف', 'Phone', true, 5),
('tailoring', 'fixed_expense', 'maintenance', 'صيانة الآلات', 'Machine Maintenance', true, 6),
('tailoring', 'fixed_expense', 'cleaning', 'النظافة', 'Cleaning', true, 7),
('tailoring', 'fixed_expense', 'other', 'أخرى', 'Other', true, 8)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;

-- فئات الرواتب للتفصيل
INSERT INTO accounting_categories (branch, category_type, category_id, label_ar, label_en, is_default, display_order) VALUES
('tailoring', 'salary', 'monthly_salary', 'راتب شهري', 'Monthly Salary', true, 1),
('tailoring', 'salary', 'daily_wage', 'أجر يومي', 'Daily Wage', true, 2),
('tailoring', 'salary', 'piece_rate', 'أجر القطعة', 'Piece Rate', true, 3),
('tailoring', 'salary', 'overtime', 'عمل إضافي', 'Overtime', true, 4),
('tailoring', 'salary', 'bonus', 'مكافأة', 'Bonus', true, 5),
('tailoring', 'salary', 'deduction', 'خصم', 'Deduction', true, 6)
ON CONFLICT (branch, category_type, category_id) DO NOTHING;
