-- ============================================================================
-- تعديلات رصيد الصندوق (Cash Box Adjustments)
-- ============================================================================
-- الهدف:
--   1) جعل رصيد الصندوق تراكمياً بين الأشهر (لا يُصفَّر عند بداية شهر جديد).
--      رصيد الصندوق = (إجمالي المبيعات الكاش) - (إجمالي المشتريات من الصندوق)
--                     + (مجموع التعديلات اليدوية المسجّلة هنا)
--   2) السماح لمدير النظام بتعديل المبلغ الموجود في الصندوق يدوياً.
--      يُسجَّل كل تعديل كسجل بالفرق (delta) للحفاظ على تاريخ واضح وقابل للتدقيق.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cash_box_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch VARCHAR(50) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
    amount DECIMAL(12, 2) NOT NULL,       -- قيمة التعديل: موجبة تزيد الرصيد، سالبة تنقصه
    previous_balance DECIMAL(12, 2),      -- الرصيد قبل التعديل (للتوثيق)
    new_balance DECIMAL(12, 2),           -- الرصيد بعد التعديل (للتوثيق)
    note TEXT,                            -- ملاحظة اختيارية عن سبب التعديل
    created_by_name VARCHAR(255),         -- اسم من قام بالتعديل (للتوثيق)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE cash_box_adjustments IS 'تعديلات يدوية على رصيد الصندوق لكل فرع (تُسجَّل كفروقات تراكمية)';
COMMENT ON COLUMN cash_box_adjustments.amount IS 'قيمة التعديل (delta): موجبة تزيد الرصيد وسالبة تنقصه';

CREATE INDEX IF NOT EXISTS idx_cash_box_adjustments_branch ON cash_box_adjustments(branch);
CREATE INDEX IF NOT EXISTS idx_cash_box_adjustments_created_at ON cash_box_adjustments(created_at);

-- تفعيل RLS (نفس نمط جداول المحاسبة الأخرى)
ALTER TABLE cash_box_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_box_adjustments_select_policy" ON cash_box_adjustments
    FOR SELECT USING (true);

CREATE POLICY "cash_box_adjustments_insert_policy" ON cash_box_adjustments
    FOR INSERT WITH CHECK (true);

CREATE POLICY "cash_box_adjustments_update_policy" ON cash_box_adjustments
    FOR UPDATE USING (true);

CREATE POLICY "cash_box_adjustments_delete_policy" ON cash_box_adjustments
    FOR DELETE USING (true);

-- ============================================================================
-- نهاية الهجرة
-- ============================================================================
