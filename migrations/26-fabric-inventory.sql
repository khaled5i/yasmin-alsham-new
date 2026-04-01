-- ============================================================================
-- مخزون الأقمشة - ياسمين الشام
-- ============================================================================

-- جدول أصناف المخزون
CREATE TABLE IF NOT EXISTS fabric_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    fabric_type VARCHAR(100),
    unit VARCHAR(20) NOT NULL DEFAULT 'meter' CHECK (unit IN ('meter', 'piece')),
    current_quantity DECIMAL(12, 2) NOT NULL DEFAULT 0,
    cost_per_unit DECIMAL(12, 2),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    supplier_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- جدول حركات المخزون
CREATE TABLE IF NOT EXISTS fabric_inventory_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES fabric_inventory(id) ON DELETE CASCADE,
    movement_type VARCHAR(10) NOT NULL CHECK (movement_type IN ('in', 'out')),
    quantity DECIMAL(12, 2) NOT NULL CHECK (quantity > 0),
    cost_per_unit DECIMAL(12, 2),
    description TEXT,
    purchase_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_name ON fabric_inventory(name);
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_type ON fabric_inventory(fabric_type);
CREATE INDEX IF NOT EXISTS idx_fabric_inventory_supplier ON fabric_inventory(supplier_id);

CREATE INDEX IF NOT EXISTS idx_fim_item_id ON fabric_inventory_movements(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_fim_type ON fabric_inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_fim_date ON fabric_inventory_movements(date);
CREATE INDEX IF NOT EXISTS idx_fim_purchase ON fabric_inventory_movements(purchase_expense_id);

-- تفعيل RLS
ALTER TABLE fabric_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabric_inventory_movements ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان لـ fabric_inventory
CREATE POLICY "fabric_inventory_select" ON fabric_inventory FOR SELECT USING (true);
CREATE POLICY "fabric_inventory_insert" ON fabric_inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "fabric_inventory_update" ON fabric_inventory FOR UPDATE USING (true);
CREATE POLICY "fabric_inventory_delete" ON fabric_inventory FOR DELETE USING (true);

-- سياسات الأمان لـ fabric_inventory_movements
CREATE POLICY "fim_select" ON fabric_inventory_movements FOR SELECT USING (true);
CREATE POLICY "fim_insert" ON fabric_inventory_movements FOR INSERT WITH CHECK (true);
CREATE POLICY "fim_update" ON fabric_inventory_movements FOR UPDATE USING (true);
CREATE POLICY "fim_delete" ON fabric_inventory_movements FOR DELETE USING (true);

-- دالة تحديث updated_at لـ fabric_inventory
CREATE OR REPLACE FUNCTION update_fabric_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fabric_inventory_updated_at_trigger ON fabric_inventory;
CREATE TRIGGER fabric_inventory_updated_at_trigger
    BEFORE UPDATE ON fabric_inventory
    FOR EACH ROW
    EXECUTE FUNCTION update_fabric_inventory_updated_at();

-- دالة تحديث current_quantity تلقائياً عند إضافة أو حذف حركة
CREATE OR REPLACE FUNCTION update_inventory_quantity()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.movement_type = 'in' THEN
            UPDATE fabric_inventory
            SET current_quantity = current_quantity + NEW.quantity
            WHERE id = NEW.inventory_item_id;
        ELSE
            UPDATE fabric_inventory
            SET current_quantity = current_quantity - NEW.quantity
            WHERE id = NEW.inventory_item_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.movement_type = 'in' THEN
            UPDATE fabric_inventory
            SET current_quantity = current_quantity - OLD.quantity
            WHERE id = OLD.inventory_item_id;
        ELSE
            UPDATE fabric_inventory
            SET current_quantity = current_quantity + OLD.quantity
            WHERE id = OLD.inventory_item_id;
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fabric_inventory_quantity_trigger ON fabric_inventory_movements;
CREATE TRIGGER fabric_inventory_quantity_trigger
    AFTER INSERT OR DELETE ON fabric_inventory_movements
    FOR EACH ROW
    EXECUTE FUNCTION update_inventory_quantity();
