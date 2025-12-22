-- ============================================================================
-- نظام المحاسبة البسيط - ياسمين الشام
-- ============================================================================

-- جدول المصروفات
CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
    type VARCHAR(50) NOT NULL CHECK (type IN ('material', 'fixed', 'salary', 'other')),
    category VARCHAR(100) NOT NULL,
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- جدول الواردات (للواردات اليدوية - الواردات التلقائية تأتي من الطلبات)
CREATE TABLE IF NOT EXISTS income (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
    order_id UUID REFERENCES orders(id),
    customer_name VARCHAR(255),
    description TEXT,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_automatic BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch);
CREATE INDEX IF NOT EXISTS idx_expenses_type ON expenses(type);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_type ON expenses(branch, type);
CREATE INDEX IF NOT EXISTS idx_expenses_branch_date ON expenses(branch, date);

CREATE INDEX IF NOT EXISTS idx_income_branch ON income(branch);
CREATE INDEX IF NOT EXISTS idx_income_date ON income(date);
CREATE INDEX IF NOT EXISTS idx_income_order_id ON income(order_id);
CREATE INDEX IF NOT EXISTS idx_income_branch_date ON income(branch, date);

-- تفعيل RLS
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE income ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان للمصروفات
CREATE POLICY "expenses_select_policy" ON expenses
    FOR SELECT USING (true);

CREATE POLICY "expenses_insert_policy" ON expenses
    FOR INSERT WITH CHECK (true);

CREATE POLICY "expenses_update_policy" ON expenses
    FOR UPDATE USING (true);

CREATE POLICY "expenses_delete_policy" ON expenses
    FOR DELETE USING (true);

-- سياسات الأمان للواردات
CREATE POLICY "income_select_policy" ON income
    FOR SELECT USING (true);

CREATE POLICY "income_insert_policy" ON income
    FOR INSERT WITH CHECK (true);

CREATE POLICY "income_update_policy" ON income
    FOR UPDATE USING (true);

CREATE POLICY "income_delete_policy" ON income
    FOR DELETE USING (true);

-- دالة لتحديث updated_at
CREATE OR REPLACE FUNCTION update_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger لتحديث updated_at
DROP TRIGGER IF EXISTS expenses_updated_at_trigger ON expenses;
CREATE TRIGGER expenses_updated_at_trigger
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION update_expenses_updated_at();

-- ============================================================================
-- بيانات تجريبية (اختياري)
-- ============================================================================

-- مصروفات مواد تجريبية
INSERT INTO expenses (branch, type, category, description, amount, date) VALUES
('tailoring', 'material', 'fabric', 'قماش ساتان أبيض', 150000, CURRENT_DATE - INTERVAL '5 days'),
('tailoring', 'material', 'thread', 'خيوط تطريز ذهبية', 25000, CURRENT_DATE - INTERVAL '3 days'),
('tailoring', 'material', 'buttons', 'أزرار لؤلؤية', 15000, CURRENT_DATE - INTERVAL '2 days'),
('tailoring', 'material', 'zipper', 'سحابات متنوعة', 10000, CURRENT_DATE - INTERVAL '1 day');

-- مصاريف ثابتة تجريبية
INSERT INTO expenses (branch, type, category, description, amount, date) VALUES
('tailoring', 'fixed', 'rent', 'إيجار المحل - شهر ديسمبر', 500000, CURRENT_DATE - INTERVAL '15 days'),
('tailoring', 'fixed', 'electricity', 'فاتورة الكهرباء', 75000, CURRENT_DATE - INTERVAL '10 days'),
('tailoring', 'fixed', 'internet', 'اشتراك الإنترنت', 25000, CURRENT_DATE - INTERVAL '8 days');

-- رواتب تجريبية
INSERT INTO expenses (branch, type, category, description, amount, date) VALUES
('tailoring', 'salary', 'monthly_salary', 'فاطمة - راتب شهري', 300000, CURRENT_DATE - INTERVAL '5 days'),
('tailoring', 'salary', 'monthly_salary', 'سارة - راتب شهري', 250000, CURRENT_DATE - INTERVAL '5 days'),
('tailoring', 'salary', 'bonus', 'فاطمة - مكافأة', 50000, CURRENT_DATE - INTERVAL '2 days');

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================

