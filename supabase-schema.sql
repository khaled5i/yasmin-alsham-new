-- ياسمين الشام - تصميم قاعدة البيانات لـ Supabase
-- Yasmin Alsham - Supabase Database Schema

-- تمكين UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- جدول المستخدمين (Users)
-- ========================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'worker', 'client')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول العمال (Workers)
-- ========================================
CREATE TABLE workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    specialty VARCHAR(100),
    role VARCHAR(20) DEFAULT 'worker' CHECK (role = 'worker'),
    is_active BOOLEAN DEFAULT true,
    experience_years INTEGER,
    hourly_rate DECIMAL(10,2),
    performance_rating DECIMAL(3,2) DEFAULT 0.00,
    total_completed_orders INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول المنتجات (Products)
-- ========================================
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    image VARCHAR(500),
    description TEXT,
    category VARCHAR(100),
    sizes JSONB, -- مصفوفة من المقاسات المتاحة
    colors JSONB, -- مصفوفة من الألوان المتاحة
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول التصاميم الجاهزة (Designs)
-- ========================================
CREATE TABLE designs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100) NOT NULL,
    images JSONB NOT NULL, -- مصفوفة من روابط الصور
    price DECIMAL(10,2) NOT NULL,
    fabric VARCHAR(255),
    colors JSONB, -- مصفوفة من الألوان
    sizes JSONB, -- مصفوفة من المقاسات
    features JSONB, -- مصفوفة من المميزات
    occasions JSONB, -- مصفوفة من المناسبات
    care_instructions JSONB, -- مصفوفة من تعليمات العناية
    rating DECIMAL(3,2) DEFAULT 0.00,
    reviews_count INTEGER DEFAULT 0,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول المواعيد (Appointments)
-- ========================================
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول الطلبات (Orders)
-- ========================================
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    fabric VARCHAR(255),
    measurements JSONB, -- قياسات الفستان كاملة
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delivered', 'cancelled')),
    assigned_worker_id UUID REFERENCES workers(id),
    due_date DATE NOT NULL,
    notes TEXT,
    voice_notes JSONB, -- مصفوفة من الملاحظات الصوتية
    images JSONB, -- مصفوفة من الصور (base64)
    completed_images JSONB, -- صور العمل المكتمل
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول المفضلة (Favorites)
-- ========================================
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- ========================================
-- جدول سلة التسوق (Cart Items)
-- ========================================
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    selected_size VARCHAR(50),
    selected_color VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول الأقمشة (Fabrics)
-- ========================================
CREATE TABLE fabrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description_ar TEXT,
    description_en TEXT,
    image_url VARCHAR(500),
    price_per_meter DECIMAL(10,2),
    is_available BOOLEAN DEFAULT true,
    category VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول تحديثات الطلبات (Order Updates)
-- ========================================
CREATE TABLE order_updates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES workers(id),
    status VARCHAR(20) NOT NULL,
    notes TEXT,
    image_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول الإشعارات (Notifications)
-- ========================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'appointment_reminder', 'order_update', 'system'
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول إعدادات النظام (System Settings)
-- ========================================
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- إدراج البيانات الأولية
-- ========================================

-- إدراج المستخدم الافتراضي (مدير النظام)
INSERT INTO users (email, password_hash, full_name, role, is_active) VALUES
('admin@yasminalsham.com', '$2a$10$hashed_password_here', 'مدير النظام', 'admin', true);

-- إدراج الإعدادات الافتراضية
INSERT INTO system_settings (key, value, description) VALUES
('working_hours_start', '16:00', 'بداية ساعات العمل'),
('working_hours_end', '22:00', 'نهاية ساعات العمل'),
('max_daily_appointments', '7', 'عدد المواعيد اليومية القصوى'),
('working_days', '["sunday","monday","tuesday","wednesday","thursday","saturday"]', 'أيام العمل'),
('reminder_hours_before', '2', 'عدد الساعات قبل إرسال التذكير');

-- إدراج بعض التصاميم الجاهزة
INSERT INTO designs (title, description, category, images, price, fabric, colors, sizes, features, occasions, care_instructions, rating, reviews_count) VALUES
('فستان زفاف كلاسيكي', 'فستان زفاف أنيق بتصميم كلاسيكي مع تطريز يدوي رائع', 'فساتين زفاف', 
 '["/wedding-dress-1.jpg.jpg", "/wedding-dress-1a.jpg.jpg", "/wedding-dress-1b.jpg.jpg"]', 
 1299.00, 'شيفون حريري', 
 '["أبيض", "كريمي", "عاجي"]', 
 '["XS", "S", "M", "L", "XL", "XXL"]',
 '["تطريز يدوي فاخر", "قماش شيفون حريري عالي الجودة", "تصميم كلاسيكي خالد"]',
 '["حفلات الزفاف", "المناسبات الرسمية", "الحفلات الخاصة"]',
 '["تنظيف جاف فقط", "تجنب التعرض المباشر لأشعة الشمس", "تخزين في مكان جاف وبارد"]',
 4.9, 127);

-- ========================================
-- إنشاء الفهارس لتحسين الأداء
-- ========================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_workers_email ON workers(email);
CREATE INDEX idx_workers_user_id ON workers(user_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_is_available ON products(is_available);
CREATE INDEX idx_designs_category ON designs(category);
CREATE INDEX idx_designs_is_available ON designs(is_available);
CREATE INDEX idx_appointments_date ON appointments(appointment_date);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_worker_id ON orders(assigned_worker_id);
CREATE INDEX idx_orders_due_date ON orders(due_date);
CREATE INDEX idx_favorites_user_id ON favorites(user_id);
CREATE INDEX idx_cart_items_user_id ON cart_items(user_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read);

-- ========================================
-- إنشاء دوال التحديث التلقائي للوقت
-- ========================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- تطبيق دوال التحديث على الجداول
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON designs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON cart_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fabrics_updated_at BEFORE UPDATE ON fabrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- إنشاء RLS (Row Level Security) Policies
-- ========================================

-- تفعيل RLS على جميع الجداول
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- سياسات للمنتجات (قراءة عامة)
CREATE POLICY "Products are viewable by everyone" ON products
    FOR SELECT USING (true);

-- سياسات للتصاميم (قراءة عامة)
CREATE POLICY "Designs are viewable by everyone" ON designs
    FOR SELECT USING (true);

-- سياسات للأقمشة (قراءة عامة)
CREATE POLICY "Fabrics are viewable by everyone" ON fabrics
    FOR SELECT USING (true);

-- سياسات للمواعيد (المدير والعمال يمكنهم رؤية جميع المواعيد)
CREATE POLICY "Appointments viewable by admin and workers" ON appointments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'worker')
        )
    );

-- سياسات للطلبات (المدير والعمال يمكنهم رؤية جميع الطلبات)
CREATE POLICY "Orders viewable by admin and workers" ON orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE users.id = auth.uid() 
            AND users.role IN ('admin', 'worker')
        )
    );

-- سياسات للمفضلة (المستخدم يمكنه رؤية مفضلاته فقط)
CREATE POLICY "Users can view their own favorites" ON favorites
    FOR SELECT USING (user_id = auth.uid());

-- سياسات لسلة التسوق (المستخدم يمكنه رؤية سلته فقط)
CREATE POLICY "Users can view their own cart" ON cart_items
    FOR SELECT USING (user_id = auth.uid());

-- سياسات للإشعارات (المستخدم يمكنه رؤية إشعاراته فقط)
CREATE POLICY "Users can view their own notifications" ON notifications
    FOR SELECT USING (user_id = auth.uid());

-- ========================================
-- إنشاء Views مفيدة
-- ========================================

-- View لإحصائيات الطلبات
CREATE VIEW order_stats AS
SELECT 
    COUNT(*) as total_orders,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
    COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_orders,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
    SUM(CASE WHEN status = 'completed' OR status = 'delivered' THEN price ELSE 0 END) as total_revenue
FROM orders;

-- View لإحصائيات المواعيد
CREATE VIEW appointment_stats AS
SELECT 
    COUNT(*) as total_appointments,
    COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_appointments,
    COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_appointments,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_appointments,
    COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_appointments
FROM appointments;

-- ========================================
-- إنشاء Functions مفيدة
-- ========================================

-- Function لحساب إجمالي سلة المستخدم
CREATE OR REPLACE FUNCTION get_cart_total(user_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
    total DECIMAL := 0;
BEGIN
    SELECT COALESCE(SUM(ci.quantity * p.price), 0)
    INTO total
    FROM cart_items ci
    JOIN products p ON ci.product_id = p.id
    WHERE ci.user_id = user_uuid;
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function لحساب عدد عناصر سلة المستخدم
CREATE OR REPLACE FUNCTION get_cart_items_count(user_uuid UUID)
RETURNS INTEGER AS $$
DECLARE
    count INTEGER := 0;
BEGIN
    SELECT COALESCE(SUM(ci.quantity), 0)
    INTO count
    FROM cart_items ci
    WHERE ci.user_id = user_uuid;
    
    RETURN count;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- إنشاء Triggers مفيدة
-- ========================================

-- Trigger لتحديث عدد المراجعات عند إضافة تقييم جديد
CREATE OR REPLACE FUNCTION update_design_rating()
RETURNS TRIGGER AS $$
BEGIN
    -- هنا يمكن إضافة منطق لتحديث التقييم
    -- سيتم تنفيذها عند إضافة جدول التقييمات
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- تعليقات توضيحية
-- ========================================

COMMENT ON TABLE users IS 'جدول المستخدمين الأساسي';
COMMENT ON TABLE workers IS 'جدول العمال مع معلومات إضافية';
COMMENT ON TABLE products IS 'جدول المنتجات المتاحة للبيع';
COMMENT ON TABLE designs IS 'جدول التصاميم الجاهزة';
COMMENT ON TABLE appointments IS 'جدول المواعيد';
COMMENT ON TABLE orders IS 'جدول الطلبات المخصصة';
COMMENT ON TABLE favorites IS 'جدول المفضلة للمستخدمين';
COMMENT ON TABLE cart_items IS 'جدول عناصر سلة التسوق';
COMMENT ON TABLE fabrics IS 'جدول الأقمشة المتاحة';
COMMENT ON TABLE order_updates IS 'جدول تحديثات الطلبات';
COMMENT ON TABLE notifications IS 'جدول الإشعارات';
COMMENT ON TABLE system_settings IS 'جدول إعدادات النظام';

COMMENT ON COLUMN orders.measurements IS 'قياسات الفستان كـ JSONB';
COMMENT ON COLUMN orders.voice_notes IS 'ملاحظات صوتية كـ JSONB';
COMMENT ON COLUMN orders.images IS 'صور الطلب كـ JSONB';
COMMENT ON COLUMN orders.completed_images IS 'صور العمل المكتمل كـ JSONB';
COMMENT ON COLUMN designs.images IS 'روابط صور التصميم كـ JSONB';
COMMENT ON COLUMN designs.colors IS 'الألوان المتاحة كـ JSONB';
COMMENT ON COLUMN designs.sizes IS 'المقاسات المتاحة كـ JSONB';
COMMENT ON COLUMN designs.features IS 'مميزات التصميم كـ JSONB';
COMMENT ON COLUMN designs.occasions IS 'المناسبات المناسبة كـ JSONB';
COMMENT ON COLUMN designs.care_instructions IS 'تعليمات العناية كـ JSONB'; 