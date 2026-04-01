-- ============================================================================
-- ألوان مخزون الأقمشة - ياسمين الشام
-- Migration 28: إضافة جدول ألوان الأقمشة
-- ============================================================================

-- جدول ألوان الأقمشة (كل قماش يمكن أن يحتوي على عدة ألوان)
CREATE TABLE IF NOT EXISTS fabric_inventory_colors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES fabric_inventory(id) ON DELETE CASCADE,
    color_name VARCHAR(100) NOT NULL,
    color_hex VARCHAR(7),  -- اختياري: رمز اللون (#FFFFFF)
    current_quantity DECIMAL(12, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- إضافة عمود color_id إلى جدول الحركات (اختياري - يمكن أن تكون الحركة لكامل الصنف بدون لون محدد)
ALTER TABLE fabric_inventory_movements
    ADD COLUMN IF NOT EXISTS color_id UUID REFERENCES fabric_inventory_colors(id) ON DELETE SET NULL;

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_fic_item_id ON fabric_inventory_colors(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_fim_color_id ON fabric_inventory_movements(color_id);

-- تفعيل RLS
ALTER TABLE fabric_inventory_colors ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان
CREATE POLICY "fic_select" ON fabric_inventory_colors FOR SELECT USING (true);
CREATE POLICY "fic_insert" ON fabric_inventory_colors FOR INSERT WITH CHECK (true);
CREATE POLICY "fic_update" ON fabric_inventory_colors FOR UPDATE USING (true);
CREATE POLICY "fic_delete" ON fabric_inventory_colors FOR DELETE USING (true);

-- دالة تحديث كمية اللون تلقائياً عند إضافة أو حذف حركة مرتبطة بلون محدد
CREATE OR REPLACE FUNCTION update_color_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.color_id IS NOT NULL THEN
            IF NEW.movement_type = 'in' THEN
                UPDATE fabric_inventory_colors
                SET current_quantity = current_quantity + NEW.quantity
                WHERE id = NEW.color_id;
            ELSE
                UPDATE fabric_inventory_colors
                SET current_quantity = current_quantity - NEW.quantity
                WHERE id = NEW.color_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.color_id IS NOT NULL THEN
            IF OLD.movement_type = 'in' THEN
                UPDATE fabric_inventory_colors
                SET current_quantity = current_quantity - OLD.quantity
                WHERE id = OLD.color_id;
            ELSE
                UPDATE fabric_inventory_colors
                SET current_quantity = current_quantity + OLD.quantity
                WHERE id = OLD.color_id;
            END IF;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fabric_color_quantity_trigger ON fabric_inventory_movements;
CREATE TRIGGER fabric_color_quantity_trigger
    AFTER INSERT OR DELETE ON fabric_inventory_movements
    FOR EACH ROW
    EXECUTE FUNCTION update_color_quantity();
