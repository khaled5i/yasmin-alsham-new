-- إضافة حقل branch لجدول الموردين لتمييز موردي كل قسم
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch VARCHAR(20) CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs'));

-- الموردين الموجودين (بدون branch) تابعون للتفصيل للحفاظ على التوافق
UPDATE suppliers SET branch = 'tailoring' WHERE branch IS NULL AND is_active = true;

-- فهرس للأداء
CREATE INDEX IF NOT EXISTS idx_suppliers_branch ON suppliers(branch);
