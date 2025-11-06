-- ========================================
-- Yasmin Alsham Database Schema
-- مخطط قاعدة بيانات ياسمين الشام
-- Version: 3.0
-- ========================================

-- تفعيل UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. جدول المستخدمين (Users)
-- ========================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'worker', 'client')),
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  phone_verified BOOLEAN DEFAULT false,
  preferences JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس لتحسين الأداء
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_is_active ON users(is_active);

-- تعليق على الجدول
COMMENT ON TABLE users IS 'جدول المستخدمين - يحتوي على جميع المستخدمين (Admin, Worker, Client)';

-- ========================================
-- 2. جدول العمال (Workers)
-- ========================================

CREATE TABLE workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  specialization TEXT NOT NULL,
  experience_years INTEGER DEFAULT 0,
  hourly_rate DECIMAL(10, 2),
  is_available BOOLEAN DEFAULT true,
  skills TEXT[] DEFAULT '{}',
  bio TEXT,
  rating DECIMAL(3, 2) DEFAULT 0.00,
  total_orders INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس
CREATE INDEX idx_workers_user_id ON workers(user_id);
CREATE INDEX idx_workers_is_available ON workers(is_available);
CREATE INDEX idx_workers_specialization ON workers(specialization);

COMMENT ON TABLE workers IS 'جدول العمال - معلومات إضافية عن العمال';

-- ========================================
-- 3. جدول التصاميم (Designs)
-- ========================================

CREATE TABLE designs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  description_en TEXT,
  category TEXT NOT NULL CHECK (category IN ('wedding', 'evening', 'casual', 'traditional')),
  price DECIMAL(10, 2) NOT NULL,
  image_url TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  available_sizes TEXT[] DEFAULT ARRAY['S', 'M', 'L', 'XL', 'XXL'],
  available_colors TEXT[] DEFAULT '{}',
  fabric_requirements JSONB DEFAULT '{}',
  measurements_required JSONB DEFAULT '{}',
  estimated_days INTEGER DEFAULT 14,
  tags TEXT[] DEFAULT '{}',
  views_count INTEGER DEFAULT 0,
  favorites_count INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس
CREATE INDEX idx_designs_category ON designs(category);
CREATE INDEX idx_designs_is_active ON designs(is_active);
CREATE INDEX idx_designs_is_featured ON designs(is_featured);
CREATE INDEX idx_designs_price ON designs(price);

COMMENT ON TABLE designs IS 'جدول التصاميم - كتالوج التصاميم الجاهزة';

-- ========================================
-- 4. جدول الأقمشة (Fabrics)
-- ========================================

CREATE TABLE fabrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_en TEXT,
  description TEXT,
  type TEXT NOT NULL,
  available_colors TEXT[] DEFAULT '{}',
  price_per_meter DECIMAL(10, 2) NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  stock_quantity DECIMAL(10, 2) DEFAULT 0,
  care_instructions TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس
CREATE INDEX idx_fabrics_type ON fabrics(type);
CREATE INDEX idx_fabrics_is_active ON fabrics(is_active);

COMMENT ON TABLE fabrics IS 'جدول الأقمشة - كتالوج الأقمشة المتاحة';

-- ========================================
-- 5. جدول المواعيد (Appointments)
-- ========================================

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  appointment_date DATE NOT NULL,
  appointment_time TIME NOT NULL,
  service_type TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  notes TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_phone ON appointments(client_phone);

COMMENT ON TABLE appointments IS 'جدول المواعيد - يدعم الحجز المجهول (user_id يمكن أن يكون NULL)';

-- ========================================
-- 6. جدول الطلبات (Orders)
-- ========================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  worker_id UUID REFERENCES workers(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'in_progress', 'quality_check', 
    'ready', 'delivered', 'cancelled'
  )),
  total_price DECIMAL(10, 2) NOT NULL,
  paid_amount DECIMAL(10, 2) DEFAULT 0,
  payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  measurements JSONB DEFAULT '{}',
  special_requests TEXT,
  admin_notes TEXT,
  estimated_delivery_date DATE,
  actual_delivery_date DATE,
  images TEXT[] DEFAULT '{}',
  voice_notes TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس
CREATE INDEX idx_orders_order_number ON orders(order_number);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_worker_id ON orders(worker_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_payment_status ON orders(payment_status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

COMMENT ON TABLE orders IS 'جدول الطلبات - طلبات الخياطة';

-- ========================================
-- 7. جدول عناصر الطلبات (Order Items)
-- ========================================

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  design_id UUID REFERENCES designs(id) ON DELETE SET NULL,
  fabric_id UUID REFERENCES fabrics(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  price DECIMAL(10, 2) NOT NULL,
  selected_size TEXT,
  selected_color TEXT,
  customizations JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_design_id ON order_items(design_id);
CREATE INDEX idx_order_items_fabric_id ON order_items(fabric_id);

COMMENT ON TABLE order_items IS 'جدول عناصر الطلبات - تفاصيل كل عنصر في الطلب';

-- ========================================
-- 8. جدول المفضلة (Favorites)
-- ========================================

CREATE TABLE favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, design_id)
);

-- فهارس
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_favorites_design_id ON favorites(design_id);

COMMENT ON TABLE favorites IS 'جدول المفضلة - التصاميم المفضلة للمستخدمين';

-- ========================================
-- 9. جدول السلة (Cart Items)
-- ========================================

CREATE TABLE cart_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,
  selected_size TEXT,
  selected_color TEXT,
  customizations JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس
CREATE INDEX idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX idx_cart_items_design_id ON cart_items(design_id);

COMMENT ON TABLE cart_items IS 'جدول السلة - عناصر سلة التسوق';

-- ========================================
-- 10. Triggers لتحديث updated_at تلقائياً
-- ========================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق trigger على جميع الجداول
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON designs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_fabrics_updated_at BEFORE UPDATE ON fabrics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON cart_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 11. Functions مساعدة
-- ========================================

-- دالة لتوليد رقم طلب فريد
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
  new_number TEXT;
  counter INTEGER;
BEGIN
  counter := (SELECT COUNT(*) FROM orders) + 1;
  new_number := 'YAS-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(counter::TEXT, 4, '0');
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- دالة لزيادة عدد المشاهدات
CREATE OR REPLACE FUNCTION increment_design_views(design_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE designs SET views_count = views_count + 1 WHERE id = design_id;
END;
$$ LANGUAGE plpgsql;

-- دالة لتحديث عدد المفضلة في جدول التصاميم
CREATE OR REPLACE FUNCTION update_design_favorites_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE designs SET favorites_count = favorites_count + 1 WHERE id = NEW.design_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE designs SET favorites_count = favorites_count - 1 WHERE id = OLD.design_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_favorites_count
AFTER INSERT OR DELETE ON favorites
FOR EACH ROW EXECUTE FUNCTION update_design_favorites_count();

-- ========================================
-- 12. تفعيل Row Level Security على جميع الجداول
-- ========================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- ========================================
-- نهاية المخطط
-- ========================================

-- ملاحظة: سياسات RLS موجودة في ملف منفصل: supabase-rls-policies.sql

