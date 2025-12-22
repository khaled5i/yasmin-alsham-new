-- ============================================================================
-- نظام ياسمين الشام المحاسبي المتكامل
-- Yasmin Al-Sham Integrated Accounting System (YIAS)
-- الإصدار: 1.0
-- التاريخ: ديسمبر 2024
-- ============================================================================

-- ============================================================================
-- القسم 1: جدول الموردين (يجب إنشاؤه أولاً لأن الجداول الأخرى تعتمد عليه)
-- ============================================================================

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_code VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  name_en VARCHAR(100),
  contact_person VARCHAR(100),
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  tax_number VARCHAR(50),
  payment_terms INTEGER DEFAULT 30,
  credit_limit DECIMAL(15, 2) DEFAULT 0,
  balance DECIMAL(15, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس الموردين
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active);

-- ============================================================================
-- القسم 2: جدول دليل الحسابات (Chart of Accounts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code VARCHAR(10) UNIQUE NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  account_name_en VARCHAR(100),
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_account_id UUID REFERENCES accounts(id),
  level INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  normal_balance VARCHAR(10) CHECK (normal_balance IN ('debit', 'credit')),
  current_balance DECIMAL(15, 2) DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس دليل الحسابات
CREATE INDEX IF NOT EXISTS idx_accounts_code ON accounts(account_code);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_accounts_active ON accounts(is_active);

-- ============================================================================
-- القسم 3: جدول القيود اليومية (Journal Entries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number VARCHAR(20) UNIQUE NOT NULL,
  entry_date DATE NOT NULL,
  reference_type VARCHAR(30) NOT NULL CHECK (reference_type IN (
    'manual', 'sales_invoice', 'purchase_invoice', 'payment_receipt', 
    'payment_voucher', 'order', 'adjustment', 'opening_balance', 'closing'
  )),
  reference_id UUID,
  description TEXT NOT NULL,
  total_debit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  total_credit DECIMAL(15, 2) NOT NULL DEFAULT 0,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  fiscal_year INTEGER NOT NULL,
  fiscal_period INTEGER NOT NULL,
  created_by UUID,
  posted_by UUID,
  posted_at TIMESTAMPTZ,
  reversed_by UUID,
  reversed_at TIMESTAMPTZ,
  reversal_entry_id UUID REFERENCES journal_entries(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT check_balanced CHECK (total_debit = total_credit)
);

-- فهارس القيود اليومية
CREATE INDEX IF NOT EXISTS idx_journal_entries_number ON journal_entries(entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference ON journal_entries(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_fiscal ON journal_entries(fiscal_year, fiscal_period);

-- ============================================================================
-- القسم 4: جدول سطور القيود (Journal Entry Lines)
-- ============================================================================

CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id),
  debit_amount DECIMAL(15, 2) DEFAULT 0,
  credit_amount DECIMAL(15, 2) DEFAULT 0,
  description TEXT,
  cost_center VARCHAR(20) CHECK (cost_center IN ('CC-001', 'CC-002', 'CC-003', 'CC-004', 'CC-005')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس سطور القيود
CREATE INDEX IF NOT EXISTS idx_jel_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_jel_cost_center ON journal_entry_lines(cost_center);

-- ============================================================================
-- القسم 5: جدول الفواتير (Invoices)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(20) UNIQUE NOT NULL,
  invoice_type VARCHAR(20) NOT NULL CHECK (invoice_type IN ('sales', 'purchase', 'credit_note', 'debit_note')),
  invoice_date DATE NOT NULL,
  due_date DATE NOT NULL,
  
  -- الطرف الآخر
  party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  party_id UUID,
  party_name VARCHAR(100) NOT NULL,
  party_phone VARCHAR(20),
  party_address TEXT,
  
  -- الفرع
  branch VARCHAR(20) NOT NULL CHECK (branch IN ('tailoring', 'fabrics', 'ready_designs')),
  cost_center VARCHAR(20),
  
  -- المبالغ
  subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(15, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(15, 2) DEFAULT 0,
  
  -- الحالة
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled')),
  payment_status VARCHAR(20) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  
  -- الربط
  order_id UUID,
  journal_entry_id UUID REFERENCES journal_entries(id),
  
  -- التتبع
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس الفواتير
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_party ON invoices(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_payment_status ON invoices(payment_status);
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices(branch);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

-- ============================================================================
-- القسم 6: جدول بنود الفواتير (Invoice Items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('product', 'fabric', 'service', 'labor', 'other')),
  item_id UUID,
  description TEXT NOT NULL,
  quantity DECIMAL(10, 3) NOT NULL,
  unit VARCHAR(20) DEFAULT 'piece',
  unit_price DECIMAL(15, 2) NOT NULL,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(15, 2) DEFAULT 0,
  tax_percent DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(15, 2) DEFAULT 0,
  total DECIMAL(15, 2) NOT NULL,
  cost_price DECIMAL(15, 2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس بنود الفواتير
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_item ON invoice_items(item_type, item_id);

-- ============================================================================
-- القسم 7: جدول المدفوعات (Payments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number VARCHAR(20) UNIQUE NOT NULL,
  payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('receipt', 'payment')),
  payment_date DATE NOT NULL,

  -- الطرف
  party_type VARCHAR(20) NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  party_id UUID,
  party_name VARCHAR(100) NOT NULL,

  -- المبلغ
  amount DECIMAL(15, 2) NOT NULL,
  payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'card', 'check')),

  -- الربط
  invoice_id UUID REFERENCES invoices(id),
  order_id UUID,
  journal_entry_id UUID REFERENCES journal_entries(id),

  -- التفاصيل
  reference_number VARCHAR(50),
  bank_account VARCHAR(50),
  check_number VARCHAR(50),
  check_date DATE,
  notes TEXT,

  -- التتبع
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس المدفوعات
CREATE INDEX IF NOT EXISTS idx_payments_number ON payments(payment_number);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(party_type, party_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(payment_method);

-- ============================================================================
-- القسم 8: جدول حركات المخزون (Inventory Movements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_type VARCHAR(20) NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'transfer', 'return', 'waste')),
  movement_date TIMESTAMPTZ DEFAULT NOW(),
  item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('product', 'fabric', 'material')),
  item_id UUID NOT NULL,
  quantity DECIMAL(10, 3) NOT NULL,
  unit_cost DECIMAL(15, 2) NOT NULL,
  total_cost DECIMAL(15, 2) NOT NULL,
  quantity_before DECIMAL(10, 3) NOT NULL,
  quantity_after DECIMAL(10, 3) NOT NULL,
  reference_type VARCHAR(30),
  reference_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس حركات المخزون
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements(item_type, item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_date ON inventory_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_type ON inventory_movements(movement_type);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_reference ON inventory_movements(reference_type, reference_id);

-- ============================================================================
-- القسم 9: جدول سجل التدقيق (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  changed_fields TEXT[],
  user_id UUID,
  user_name VARCHAR(100),
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس سجل التدقيق
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_date ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ============================================================================
-- القسم 10: جدول الفترات المالية (Fiscal Periods)
-- ============================================================================

CREATE TABLE IF NOT EXISTS fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year INTEGER NOT NULL,
  period_number INTEGER NOT NULL,
  period_name VARCHAR(50) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(fiscal_year, period_number)
);

-- فهارس الفترات المالية
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_year ON fiscal_periods(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_fiscal_periods_dates ON fiscal_periods(start_date, end_date);

-- ============================================================================
-- القسم 11: التعديلات على الجداول الحالية
-- ============================================================================

-- تعديلات جدول الطلبات (orders)
DO $$
BEGIN
  -- إضافة حقول التكلفة
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'cost_breakdown') THEN
    ALTER TABLE orders ADD COLUMN cost_breakdown JSONB DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'fabric_cost') THEN
    ALTER TABLE orders ADD COLUMN fabric_cost DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'labor_cost') THEN
    ALTER TABLE orders ADD COLUMN labor_cost DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'accessories_cost') THEN
    ALTER TABLE orders ADD COLUMN accessories_cost DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'overhead_cost') THEN
    ALTER TABLE orders ADD COLUMN overhead_cost DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'total_cost') THEN
    ALTER TABLE orders ADD COLUMN total_cost DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'profit_margin') THEN
    ALTER TABLE orders ADD COLUMN profit_margin DECIMAL(5, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'invoice_id') THEN
    ALTER TABLE orders ADD COLUMN invoice_id UUID;
  END IF;
END $$;

-- تعديلات جدول المنتجات (products)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cost_price') THEN
    ALTER TABLE products ADD COLUMN cost_price DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'supplier_id') THEN
    ALTER TABLE products ADD COLUMN supplier_id UUID REFERENCES suppliers(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'last_purchase_date') THEN
    ALTER TABLE products ADD COLUMN last_purchase_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'last_purchase_price') THEN
    ALTER TABLE products ADD COLUMN last_purchase_price DECIMAL(15, 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'average_cost') THEN
    ALTER TABLE products ADD COLUMN average_cost DECIMAL(15, 2) DEFAULT 0;
  END IF;
END $$;

-- تعديلات جدول الأقمشة (fabrics)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabrics' AND column_name = 'cost_per_meter') THEN
    ALTER TABLE fabrics ADD COLUMN cost_per_meter DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabrics' AND column_name = 'supplier_id') THEN
    ALTER TABLE fabrics ADD COLUMN supplier_id UUID REFERENCES suppliers(id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabrics' AND column_name = 'last_purchase_date') THEN
    ALTER TABLE fabrics ADD COLUMN last_purchase_date DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabrics' AND column_name = 'last_purchase_price') THEN
    ALTER TABLE fabrics ADD COLUMN last_purchase_price DECIMAL(15, 2);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabrics' AND column_name = 'average_cost') THEN
    ALTER TABLE fabrics ADD COLUMN average_cost DECIMAL(15, 2) DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fabrics' AND column_name = 'reorder_level') THEN
    ALTER TABLE fabrics ADD COLUMN reorder_level DECIMAL(10, 2) DEFAULT 0;
  END IF;
END $$;

-- ============================================================================
-- القسم 12: إدراج دليل الحسابات الافتراضي
-- ============================================================================

INSERT INTO accounts (account_code, account_name, account_name_en, account_type, level, is_system, normal_balance, description) VALUES
-- الأصول (1000-1999)
('1000', 'الأصول', 'Assets', 'asset', 1, true, 'debit', 'إجمالي الأصول'),
('1100', 'الأصول المتداولة', 'Current Assets', 'asset', 2, true, 'debit', 'الأصول المتداولة'),
('1110', 'النقدية والبنوك', 'Cash and Banks', 'asset', 3, true, 'debit', 'النقدية في الصندوق والبنوك'),
('1111', 'الصندوق', 'Cash on Hand', 'asset', 4, false, 'debit', 'النقدية في الصندوق'),
('1112', 'البنك', 'Bank Account', 'asset', 4, false, 'debit', 'الحساب البنكي'),
('1120', 'الذمم المدينة', 'Accounts Receivable', 'asset', 3, true, 'debit', 'المبالغ المستحقة من العملاء'),
('1121', 'ذمم العملاء - تفصيل', 'AR - Tailoring', 'asset', 4, false, 'debit', 'ذمم عملاء التفصيل'),
('1122', 'ذمم العملاء - جاهز', 'AR - Ready Designs', 'asset', 4, false, 'debit', 'ذمم عملاء الملابس الجاهزة'),
('1123', 'ذمم العملاء - أقمشة', 'AR - Fabrics', 'asset', 4, false, 'debit', 'ذمم عملاء الأقمشة'),
('1130', 'المخزون', 'Inventory', 'asset', 3, true, 'debit', 'إجمالي المخزون'),
('1131', 'مخزون الملابس الجاهزة', 'Ready Designs Inventory', 'asset', 4, false, 'debit', 'مخزون الملابس الجاهزة'),
('1132', 'مخزون الأقمشة', 'Fabrics Inventory', 'asset', 4, false, 'debit', 'مخزون الأقمشة'),
('1133', 'مخزون المواد الخام', 'Raw Materials Inventory', 'asset', 4, false, 'debit', 'مخزون المواد الخام للتفصيل'),
('1200', 'الأصول الثابتة', 'Fixed Assets', 'asset', 2, true, 'debit', 'الأصول الثابتة'),
('1210', 'المعدات والآلات', 'Equipment & Machinery', 'asset', 3, false, 'debit', 'ماكينات الخياطة والمعدات'),
('1220', 'الأثاث والتجهيزات', 'Furniture & Fixtures', 'asset', 3, false, 'debit', 'أثاث المتجر والتجهيزات'),

-- الالتزامات (2000-2999)
('2000', 'الالتزامات', 'Liabilities', 'liability', 1, true, 'credit', 'إجمالي الالتزامات'),
('2100', 'الالتزامات المتداولة', 'Current Liabilities', 'liability', 2, true, 'credit', 'الالتزامات المتداولة'),
('2110', 'الذمم الدائنة', 'Accounts Payable', 'liability', 3, true, 'credit', 'المبالغ المستحقة للموردين'),
('2111', 'ذمم الموردين', 'Suppliers Payable', 'liability', 4, false, 'credit', 'المبالغ المستحقة لموردي الأقمشة والمواد'),
('2120', 'المقدمات من العملاء', 'Customer Advances', 'liability', 3, false, 'credit', 'العربون والدفعات المقدمة'),
('2130', 'المصاريف المستحقة', 'Accrued Expenses', 'liability', 3, false, 'credit', 'المصاريف المستحقة غير المدفوعة'),

-- حقوق الملكية (3000-3999)
('3000', 'حقوق الملكية', 'Equity', 'equity', 1, true, 'credit', 'إجمالي حقوق الملكية'),
('3100', 'رأس المال', 'Capital', 'equity', 2, true, 'credit', 'رأس المال المستثمر'),
('3200', 'الأرباح المحتجزة', 'Retained Earnings', 'equity', 2, true, 'credit', 'الأرباح المتراكمة'),
('3300', 'أرباح/خسائر العام', 'Current Year P&L', 'equity', 2, true, 'credit', 'نتيجة العام الحالي'),

-- الإيرادات (4000-4999)
('4000', 'الإيرادات', 'Revenue', 'revenue', 1, true, 'credit', 'إجمالي الإيرادات'),
('4100', 'إيرادات المبيعات', 'Sales Revenue', 'revenue', 2, true, 'credit', 'إيرادات المبيعات'),
('4110', 'مبيعات التفصيل', 'Tailoring Sales', 'revenue', 3, false, 'credit', 'إيرادات خدمات التفصيل'),
('4120', 'مبيعات الملابس الجاهزة', 'Ready Designs Sales', 'revenue', 3, false, 'credit', 'إيرادات بيع الملابس الجاهزة'),
('4130', 'مبيعات الأقمشة', 'Fabrics Sales', 'revenue', 3, false, 'credit', 'إيرادات بيع الأقمشة'),
('4200', 'إيرادات أخرى', 'Other Revenue', 'revenue', 2, false, 'credit', 'إيرادات متنوعة'),

-- تكلفة المبيعات (5000-5499)
('5000', 'تكلفة المبيعات', 'Cost of Goods Sold', 'expense', 1, true, 'debit', 'إجمالي تكلفة المبيعات'),
('5100', 'تكلفة التفصيل', 'Tailoring COGS', 'expense', 2, true, 'debit', 'تكلفة خدمات التفصيل'),
('5110', 'تكلفة الأقمشة - تفصيل', 'Fabric Cost - Tailoring', 'expense', 3, false, 'debit', 'تكلفة الأقمشة المستخدمة في التفصيل'),
('5120', 'تكلفة العمالة - تفصيل', 'Labor Cost - Tailoring', 'expense', 3, false, 'debit', 'أجور الخياطين'),
('5130', 'تكلفة الإكسسوارات', 'Accessories Cost', 'expense', 3, false, 'debit', 'تكلفة الأزرار والسحابات'),
('5200', 'تكلفة الملابس الجاهزة', 'Ready Designs COGS', 'expense', 2, false, 'debit', 'تكلفة الملابس الجاهزة المباعة'),
('5300', 'تكلفة الأقمشة المباعة', 'Fabrics COGS', 'expense', 2, false, 'debit', 'تكلفة الأقمشة المباعة'),

-- المصروفات التشغيلية (6000-6999)
('6000', 'المصروفات التشغيلية', 'Operating Expenses', 'expense', 1, true, 'debit', 'إجمالي المصروفات التشغيلية'),
('6100', 'مصروفات الرواتب', 'Salary Expenses', 'expense', 2, true, 'debit', 'رواتب وأجور الموظفين'),
('6110', 'رواتب الإدارة', 'Admin Salaries', 'expense', 3, false, 'debit', 'رواتب الموظفين الإداريين'),
('6120', 'رواتب المبيعات', 'Sales Salaries', 'expense', 3, false, 'debit', 'رواتب موظفي المبيعات'),
('6200', 'مصروفات الإيجار', 'Rent Expense', 'expense', 2, false, 'debit', 'إيجار المتجر والورشة'),
('6300', 'مصروفات المرافق', 'Utilities Expense', 'expense', 2, false, 'debit', 'كهرباء، ماء، إنترنت'),
('6400', 'مصروفات التسويق', 'Marketing Expense', 'expense', 2, false, 'debit', 'إعلانات وتسويق'),
('6500', 'مصروفات الصيانة', 'Maintenance Expense', 'expense', 2, false, 'debit', 'صيانة المعدات والمتجر'),
('6600', 'مصروفات متنوعة', 'Miscellaneous Expense', 'expense', 2, false, 'debit', 'مصروفات أخرى')
ON CONFLICT (account_code) DO NOTHING;

-- تحديث parent_account_id للحسابات
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '1000') WHERE account_code IN ('1100', '1200');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '1100') WHERE account_code IN ('1110', '1120', '1130');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '1110') WHERE account_code IN ('1111', '1112');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '1120') WHERE account_code IN ('1121', '1122', '1123');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '1130') WHERE account_code IN ('1131', '1132', '1133');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '1200') WHERE account_code IN ('1210', '1220');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '2000') WHERE account_code = '2100';
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '2100') WHERE account_code IN ('2110', '2120', '2130');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '2110') WHERE account_code = '2111';
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '3000') WHERE account_code IN ('3100', '3200', '3300');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '4000') WHERE account_code IN ('4100', '4200');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '4100') WHERE account_code IN ('4110', '4120', '4130');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '5000') WHERE account_code IN ('5100', '5200', '5300');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '5100') WHERE account_code IN ('5110', '5120', '5130');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '6000') WHERE account_code IN ('6100', '6200', '6300', '6400', '6500', '6600');
UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE account_code = '6100') WHERE account_code IN ('6110', '6120');

-- ============================================================================
-- القسم 13: إنشاء الفترة المالية الافتراضية
-- ============================================================================

INSERT INTO fiscal_periods (fiscal_year, period_number, period_name, start_date, end_date) VALUES
(2024, 1, 'يناير 2024', '2024-01-01', '2024-01-31'),
(2024, 2, 'فبراير 2024', '2024-02-01', '2024-02-29'),
(2024, 3, 'مارس 2024', '2024-03-01', '2024-03-31'),
(2024, 4, 'أبريل 2024', '2024-04-01', '2024-04-30'),
(2024, 5, 'مايو 2024', '2024-05-01', '2024-05-31'),
(2024, 6, 'يونيو 2024', '2024-06-01', '2024-06-30'),
(2024, 7, 'يوليو 2024', '2024-07-01', '2024-07-31'),
(2024, 8, 'أغسطس 2024', '2024-08-01', '2024-08-31'),
(2024, 9, 'سبتمبر 2024', '2024-09-01', '2024-09-30'),
(2024, 10, 'أكتوبر 2024', '2024-10-01', '2024-10-31'),
(2024, 11, 'نوفمبر 2024', '2024-11-01', '2024-11-30'),
(2024, 12, 'ديسمبر 2024', '2024-12-01', '2024-12-31'),
(2025, 1, 'يناير 2025', '2025-01-01', '2025-01-31'),
(2025, 2, 'فبراير 2025', '2025-02-01', '2025-02-28'),
(2025, 3, 'مارس 2025', '2025-03-01', '2025-03-31'),
(2025, 4, 'أبريل 2025', '2025-04-01', '2025-04-30'),
(2025, 5, 'مايو 2025', '2025-05-01', '2025-05-31'),
(2025, 6, 'يونيو 2025', '2025-06-01', '2025-06-30'),
(2025, 7, 'يوليو 2025', '2025-07-01', '2025-07-31'),
(2025, 8, 'أغسطس 2025', '2025-08-01', '2025-08-31'),
(2025, 9, 'سبتمبر 2025', '2025-09-01', '2025-09-30'),
(2025, 10, 'أكتوبر 2025', '2025-10-01', '2025-10-31'),
(2025, 11, 'نوفمبر 2025', '2025-11-01', '2025-11-30'),
(2025, 12, 'ديسمبر 2025', '2025-12-01', '2025-12-31')
ON CONFLICT (fiscal_year, period_number) DO NOTHING;

-- ============================================================================
-- القسم 14: سياسات RLS (Row Level Security)
-- ============================================================================

-- تفعيل RLS للجداول الجديدة
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_periods ENABLE ROW LEVEL SECURITY;

-- سياسات القراءة العامة (للمستخدمين المصادق عليهم)
CREATE POLICY "Allow authenticated read accounts" ON accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read journal_entries" ON journal_entries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read journal_entry_lines" ON journal_entry_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read invoices" ON invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read invoice_items" ON invoice_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read payments" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read suppliers" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read inventory_movements" ON inventory_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read audit_log" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read fiscal_periods" ON fiscal_periods FOR SELECT TO authenticated USING (true);

-- سياسات الإدراج والتعديل والحذف (للمستخدمين المصادق عليهم)
CREATE POLICY "Allow authenticated insert accounts" ON accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update accounts" ON accounts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete accounts" ON accounts FOR DELETE TO authenticated USING (NOT is_system);

CREATE POLICY "Allow authenticated insert journal_entries" ON journal_entries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update journal_entries" ON journal_entries FOR UPDATE TO authenticated USING (status = 'draft');
CREATE POLICY "Allow authenticated delete journal_entries" ON journal_entries FOR DELETE TO authenticated USING (status = 'draft');

CREATE POLICY "Allow authenticated insert journal_entry_lines" ON journal_entry_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update journal_entry_lines" ON journal_entry_lines FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete journal_entry_lines" ON journal_entry_lines FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert invoices" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update invoices" ON invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete invoices" ON invoices FOR DELETE TO authenticated USING (status = 'draft');

CREATE POLICY "Allow authenticated insert invoice_items" ON invoice_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update invoice_items" ON invoice_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete invoice_items" ON invoice_items FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert payments" ON payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update payments" ON payments FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete payments" ON payments FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert suppliers" ON suppliers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update suppliers" ON suppliers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated delete suppliers" ON suppliers FOR DELETE TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert inventory_movements" ON inventory_movements FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated insert audit_log" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated insert fiscal_periods" ON fiscal_periods FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated update fiscal_periods" ON fiscal_periods FOR UPDATE TO authenticated USING (true);

-- ============================================================================
-- نهاية ملف الهجرة
-- ============================================================================

