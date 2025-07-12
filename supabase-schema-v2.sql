-- ياسمين الشام - مخطط قاعدة البيانات الشامل v2.0
-- Yasmin Alsham - Comprehensive Database Schema v2.0
-- تاريخ الإنشاء: 2025-01-11

-- ========================================
-- إعداد الامتدادات والوظائف الأساسية
-- ========================================

-- تمكين UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- تمكين pgcrypto للتشفير
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- وظيفة لتحديث updated_at تلقائياً
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ========================================
-- جدول المستخدمين الأساسي (Users)
-- ========================================
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (role IN ('admin', 'worker', 'client')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    preferences JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول العمال (Workers)
-- ========================================
CREATE TABLE public.workers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    specialty VARCHAR(100) NOT NULL,
    experience_years INTEGER DEFAULT 0,
    hourly_rate DECIMAL(10,2),
    performance_rating DECIMAL(3,2) DEFAULT 0.00 CHECK (performance_rating >= 0 AND performance_rating <= 5),
    total_completed_orders INTEGER DEFAULT 0,
    skills TEXT[],
    availability JSONB DEFAULT '{}', -- أوقات العمل المتاحة
    bio TEXT,
    portfolio_images TEXT[],
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول الأقمشة (Fabrics)
-- ========================================
CREATE TABLE public.fabrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    type VARCHAR(100) NOT NULL, -- قطن، حرير، شيفون، إلخ
    color VARCHAR(100) NOT NULL,
    color_code VARCHAR(7), -- hex color code
    price_per_meter DECIMAL(10,2) NOT NULL,
    stock_quantity INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    supplier VARCHAR(255),
    care_instructions TEXT,
    composition TEXT, -- تركيب القماش
    width_cm INTEGER, -- عرض القماش بالسنتيمتر
    weight_gsm INTEGER, -- وزن القماش
    image_url TEXT,
    images TEXT[],
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول التصاميم (Designs)
-- ========================================
CREATE TABLE public.designs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    description_en TEXT,
    category VARCHAR(100) NOT NULL, -- فستان زفاف، سهرة، يومي، إلخ
    subcategory VARCHAR(100),
    base_price DECIMAL(10,2) NOT NULL,
    estimated_hours INTEGER, -- ساعات العمل المقدرة
    difficulty_level VARCHAR(20) DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard', 'expert')),
    size_range VARCHAR(50) DEFAULT 'XS-XXL',
    main_image TEXT,
    images TEXT[],
    pattern_images TEXT[], -- صور الباترون
    measurements_required TEXT[], -- القياسات المطلوبة
    fabric_requirements JSONB, -- متطلبات الأقمشة
    customization_options JSONB DEFAULT '{}',
    tags TEXT[],
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول المنتجات الجاهزة (Products)
-- ========================================
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    design_id UUID REFERENCES public.designs(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    description_en TEXT,
    sku VARCHAR(100) UNIQUE,
    price DECIMAL(10,2) NOT NULL,
    sale_price DECIMAL(10,2),
    cost_price DECIMAL(10,2),
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    size VARCHAR(20) NOT NULL,
    color VARCHAR(100) NOT NULL,
    fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
    stock_quantity INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 1,
    main_image TEXT,
    images TEXT[],
    weight_grams INTEGER,
    dimensions JSONB, -- الأبعاد
    care_instructions TEXT,
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول المواعيد (Appointments)
-- ========================================
CREATE TABLE public.appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    type VARCHAR(50) NOT NULL DEFAULT 'consultation', -- consultation, fitting, delivery
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show')),
    service_type VARCHAR(100), -- نوع الخدمة المطلوبة
    notes TEXT,
    client_notes TEXT,
    worker_notes TEXT,
    reminder_sent BOOLEAN DEFAULT false,
    confirmation_sent BOOLEAN DEFAULT false,
    cancellation_reason TEXT,
    rescheduled_from UUID REFERENCES public.appointments(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول الطلبات (Orders)
-- ========================================
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    client_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'fitting', 'ready', 'delivered', 'cancelled')),
    order_type VARCHAR(20) DEFAULT 'custom' CHECK (order_type IN ('custom', 'ready_made', 'alteration')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    -- معلومات التسعير
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    fabric_cost DECIMAL(10,2) DEFAULT 0,
    labor_cost DECIMAL(10,2) DEFAULT 0,
    additional_costs DECIMAL(10,2) DEFAULT 0,
    discount_amount DECIMAL(10,2) DEFAULT 0,
    tax_amount DECIMAL(10,2) DEFAULT 0,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    
    -- معلومات الدفع
    payment_status VARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
    payment_method VARCHAR(50),
    paid_amount DECIMAL(10,2) DEFAULT 0,
    
    -- تواريخ مهمة
    estimated_completion_date DATE,
    actual_completion_date DATE,
    delivery_date DATE,
    
    -- ملاحظات
    client_notes TEXT,
    worker_notes TEXT,
    internal_notes TEXT,
    
    -- معلومات إضافية
    measurements JSONB,
    special_instructions TEXT,
    rush_order BOOLEAN DEFAULT false,
    rush_fee DECIMAL(10,2) DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول عناصر الطلب (Order Items)
-- ========================================
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    design_id UUID REFERENCES public.designs(id) ON DELETE SET NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
    
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('design', 'product', 'fabric', 'service')),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(10,2) NOT NULL,
    
    -- تفاصيل التخصيص
    customizations JSONB DEFAULT '{}',
    measurements JSONB DEFAULT '{}',
    special_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول المفضلة (Favorites)
-- ========================================
CREATE TABLE public.favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    design_id UUID REFERENCES public.designs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, design_id)
);

-- ========================================
-- جدول عربة التسوق (Cart Items)
-- ========================================
CREATE TABLE public.cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    design_id UUID REFERENCES public.designs(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    fabric_id UUID REFERENCES public.fabrics(id) ON DELETE SET NULL,
    
    item_type VARCHAR(20) NOT NULL CHECK (item_type IN ('design', 'product')),
    quantity INTEGER NOT NULL DEFAULT 1,
    customizations JSONB DEFAULT '{}',
    measurements JSONB DEFAULT '{}',
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(user_id, design_id, product_id)
);

-- ========================================
-- جدول الإشعارات (Notifications)
-- ========================================
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- order_update, appointment_reminder, etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_read BOOLEAN DEFAULT false,
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول إعدادات النظام (System Settings)
-- ========================================
CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- جدول تقييمات العمال (Worker Reviews)
-- ========================================
CREATE TABLE public.worker_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id UUID REFERENCES public.workers(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(worker_id, client_id, order_id)
);

-- ========================================
-- جدول سجل الأنشطة (Activity Log)
-- ========================================
CREATE TABLE public.activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- إنشاء الفهارس لتحسين الأداء
-- ========================================

-- فهارس المستخدمين
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_is_active ON public.users(is_active);

-- فهارس العمال
CREATE INDEX idx_workers_user_id ON public.workers(user_id);
CREATE INDEX idx_workers_specialty ON public.workers(specialty);
CREATE INDEX idx_workers_is_available ON public.workers(is_available);
CREATE INDEX idx_workers_performance_rating ON public.workers(performance_rating);

-- فهارس الأقمشة
CREATE INDEX idx_fabrics_type ON public.fabrics(type);
CREATE INDEX idx_fabrics_color ON public.fabrics(color);
CREATE INDEX idx_fabrics_is_available ON public.fabrics(is_available);
CREATE INDEX idx_fabrics_stock_quantity ON public.fabrics(stock_quantity);

-- فهارس التصاميم
CREATE INDEX idx_designs_category ON public.designs(category);
CREATE INDEX idx_designs_is_active ON public.designs(is_active);
CREATE INDEX idx_designs_is_featured ON public.designs(is_featured);
CREATE INDEX idx_designs_created_at ON public.designs(created_at);

-- فهارس المنتجات
CREATE INDEX idx_products_design_id ON public.products(design_id);
CREATE INDEX idx_products_category ON public.products(category);
CREATE INDEX idx_products_is_active ON public.products(is_active);
CREATE INDEX idx_products_sku ON public.products(sku);

-- فهارس المواعيد
CREATE INDEX idx_appointments_client_id ON public.appointments(client_id);
CREATE INDEX idx_appointments_worker_id ON public.appointments(worker_id);
CREATE INDEX idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX idx_appointments_status ON public.appointments(status);
CREATE INDEX idx_appointments_date_time ON public.appointments(appointment_date, appointment_time);

-- فهارس الطلبات
CREATE INDEX idx_orders_client_id ON public.orders(client_id);
CREATE INDEX idx_orders_worker_id ON public.orders(worker_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_order_number ON public.orders(order_number);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);
CREATE INDEX idx_orders_completion_date ON public.orders(estimated_completion_date);

-- فهارس عناصر الطلب
CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_order_items_design_id ON public.order_items(design_id);
CREATE INDEX idx_order_items_product_id ON public.order_items(product_id);

-- فهارس المفضلة وعربة التسوق
CREATE INDEX idx_favorites_user_id ON public.favorites(user_id);
CREATE INDEX idx_cart_items_user_id ON public.cart_items(user_id);

-- فهارس الإشعارات
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX idx_notifications_is_read ON public.notifications(is_read);
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at);

-- فهارس سجل الأنشطة
CREATE INDEX idx_activity_log_user_id ON public.activity_log(user_id);
CREATE INDEX idx_activity_log_entity ON public.activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at);

-- ========================================
-- إنشاء المشغلات (Triggers)
-- ========================================

-- مشغلات تحديث updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON public.workers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fabrics_updated_at BEFORE UPDATE ON public.fabrics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_designs_updated_at BEFORE UPDATE ON public.designs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cart_items_updated_at BEFORE UPDATE ON public.cart_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- إعداد Row Level Security (RLS)
-- ========================================

-- تفعيل RLS على جميع الجداول
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- ========================================
-- سياسات الأمان (RLS Policies)
-- ========================================

-- سياسات المستخدمين
CREATE POLICY "Users can view their own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view all users" ON public.users FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Admins can update all users" ON public.users FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات العمال
CREATE POLICY "Workers can view their own profile" ON public.workers FOR SELECT USING (
    user_id = auth.uid()
);
CREATE POLICY "Workers can update their own profile" ON public.workers FOR UPDATE USING (
    user_id = auth.uid()
);
CREATE POLICY "Admins can manage all workers" ON public.workers FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Clients can view workers" ON public.workers FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'client')
);

-- سياسات الأقمشة (عامة للقراءة، إدارة للمشرفين)
CREATE POLICY "Anyone can view available fabrics" ON public.fabrics FOR SELECT USING (is_available = true);
CREATE POLICY "Admins can manage fabrics" ON public.fabrics FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات التصاميم (عامة للقراءة، إدارة للمشرفين)
CREATE POLICY "Anyone can view active designs" ON public.designs FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage designs" ON public.designs FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات المنتجات (عامة للقراءة، إدارة للمشرفين)
CREATE POLICY "Anyone can view active products" ON public.products FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات المواعيد
CREATE POLICY "Clients can view their own appointments" ON public.appointments FOR SELECT USING (
    client_id = auth.uid()
);
CREATE POLICY "Clients can create appointments" ON public.appointments FOR INSERT WITH CHECK (
    client_id = auth.uid()
);
CREATE POLICY "Clients can update their own appointments" ON public.appointments FOR UPDATE USING (
    client_id = auth.uid()
);
CREATE POLICY "Workers can view their appointments" ON public.appointments FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workers WHERE id = appointments.worker_id AND user_id = auth.uid())
);
CREATE POLICY "Workers can update their appointments" ON public.appointments FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workers WHERE id = appointments.worker_id AND user_id = auth.uid())
);
CREATE POLICY "Admins can manage all appointments" ON public.appointments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات الطلبات
CREATE POLICY "Clients can view their own orders" ON public.orders FOR SELECT USING (
    client_id = auth.uid()
);
CREATE POLICY "Clients can create orders" ON public.orders FOR INSERT WITH CHECK (
    client_id = auth.uid()
);
CREATE POLICY "Workers can view their assigned orders" ON public.orders FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.workers WHERE id = orders.worker_id AND user_id = auth.uid())
);
CREATE POLICY "Workers can update their assigned orders" ON public.orders FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.workers WHERE id = orders.worker_id AND user_id = auth.uid())
);
CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات عناصر الطلب
CREATE POLICY "Users can view order items for their orders" ON public.order_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders
        WHERE id = order_items.order_id
        AND (client_id = auth.uid() OR
             EXISTS (SELECT 1 FROM public.workers WHERE id = orders.worker_id AND user_id = auth.uid()) OR
             EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'))
    )
);

-- سياسات المفضلة
CREATE POLICY "Users can manage their own favorites" ON public.favorites FOR ALL USING (
    user_id = auth.uid()
);

-- سياسات عربة التسوق
CREATE POLICY "Users can manage their own cart" ON public.cart_items FOR ALL USING (
    user_id = auth.uid()
);

-- سياسات الإشعارات
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT USING (
    user_id = auth.uid()
);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (
    user_id = auth.uid()
);
CREATE POLICY "Admins can create notifications" ON public.notifications FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات إعدادات النظام
CREATE POLICY "Anyone can view public settings" ON public.system_settings FOR SELECT USING (is_public = true);
CREATE POLICY "Admins can manage all settings" ON public.system_settings FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات تقييمات العمال
CREATE POLICY "Clients can create reviews for their orders" ON public.worker_reviews FOR INSERT WITH CHECK (
    client_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.orders WHERE id = worker_reviews.order_id AND client_id = auth.uid())
);
CREATE POLICY "Anyone can view approved reviews" ON public.worker_reviews FOR SELECT USING (is_approved = true);
CREATE POLICY "Clients can view their own reviews" ON public.worker_reviews FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Admins can manage all reviews" ON public.worker_reviews FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- سياسات سجل الأنشطة
CREATE POLICY "Admins can view activity log" ON public.activity_log FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
);

-- ========================================
-- وظائف مساعدة
-- ========================================

-- وظيفة لتوليد رقم طلب فريد
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TEXT AS $$
DECLARE
    new_number TEXT;
    counter INTEGER;
BEGIN
    -- الحصول على العداد الحالي للسنة الحالية
    SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 6) AS INTEGER)), 0) + 1
    INTO counter
    FROM public.orders
    WHERE order_number LIKE EXTRACT(YEAR FROM NOW()) || '%';

    -- تكوين رقم الطلب الجديد
    new_number := EXTRACT(YEAR FROM NOW()) || LPAD(counter::TEXT, 4, '0');

    RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- وظيفة لحساب إجمالي الطلب
CREATE OR REPLACE FUNCTION calculate_order_total(order_uuid UUID)
RETURNS DECIMAL AS $$
DECLARE
    total DECIMAL := 0;
BEGIN
    SELECT COALESCE(SUM(total_price), 0)
    INTO total
    FROM public.order_items
    WHERE order_id = order_uuid;

    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- مشغل لتحديث إجمالي الطلب تلقائياً
CREATE OR REPLACE FUNCTION update_order_total()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.orders
    SET subtotal = calculate_order_total(COALESCE(NEW.order_id, OLD.order_id)),
        total_amount = subtotal + COALESCE(fabric_cost, 0) + COALESCE(labor_cost, 0) +
                      COALESCE(additional_costs, 0) + COALESCE(tax_amount, 0) - COALESCE(discount_amount, 0)
    WHERE id = COALESCE(NEW.order_id, OLD.order_id);

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_order_total_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.order_items
    FOR EACH ROW EXECUTE FUNCTION update_order_total();

-- مشغل لتوليد رقم الطلب تلقائياً
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
        NEW.order_number := generate_order_number();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number_trigger
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- ========================================
-- إدخال البيانات التجريبية
-- ========================================

-- إدخال إعدادات النظام الأساسية
INSERT INTO public.system_settings (key, value, description, category, is_public) VALUES
('business_name', '"ياسمين الشام"', 'اسم المحل', 'general', true),
('business_name_en', '"Yasmin Alsham"', 'Business name in English', 'general', true),
('business_phone', '"+963-11-1234567"', 'رقم هاتف المحل', 'contact', true),
('business_whatsapp', '"+963-987-654321"', 'رقم واتساب المحل', 'contact', true),
('business_email', '"info@yasmin-alsham.com"', 'بريد إلكتروني للمحل', 'contact', true),
('business_address', '"دمشق، سوريا"', 'عنوان المحل', 'contact', true),
('working_hours', '{"sunday": "16:00-22:00", "monday": "16:00-22:00", "tuesday": "16:00-22:00", "wednesday": "16:00-22:00", "thursday": "16:00-22:00", "friday": "closed", "saturday": "16:00-22:00"}', 'ساعات العمل', 'business', true),
('appointment_duration', '60', 'مدة الموعد الافتراضية بالدقائق', 'appointments', false),
('max_daily_appointments', '7', 'الحد الأقصى للمواعيد اليومية', 'appointments', false),
('currency', '"SYP"', 'العملة المستخدمة', 'financial', true),
('tax_rate', '0.0', 'معدل الضريبة', 'financial', false);

-- إدخال أقمشة تجريبية
INSERT INTO public.fabrics (name, name_en, type, color, color_code, price_per_meter, stock_quantity, supplier, care_instructions, composition, width_cm, weight_gsm, image_url) VALUES
('شيفون أبيض', 'White Chiffon', 'شيفون', 'أبيض', '#FFFFFF', 150.00, 50, 'مورد الأقمشة الدمشقي', 'غسيل يدوي بماء بارد', '100% بوليستر', 150, 80, '/fabrics/white-chiffon.jpg'),
('ساتان أحمر', 'Red Satin', 'ساتان', 'أحمر', '#DC143C', 200.00, 30, 'مورد الأقمشة الدمشقي', 'تنظيف جاف فقط', '100% حرير', 140, 120, '/fabrics/red-satin.jpg'),
('دانتيل كريمي', 'Cream Lace', 'دانتيل', 'كريمي', '#F5F5DC', 300.00, 20, 'مورد الأقمشة الفرنسي', 'غسيل يدوي بعناية', '90% قطن، 10% إيلاستان', 130, 100, '/fabrics/cream-lace.jpg'),
('تول وردي', 'Pink Tulle', 'تول', 'وردي', '#FFB6C1', 120.00, 40, 'مورد الأقمشة المحلي', 'غسيل آلة دورة لطيفة', '100% نايلون', 160, 60, '/fabrics/pink-tulle.jpg'),
('قطن أزرق', 'Blue Cotton', 'قطن', 'أزرق', '#4169E1', 80.00, 60, 'مورد الأقمشة المحلي', 'غسيل آلة عادي', '100% قطن', 150, 140, '/fabrics/blue-cotton.jpg');

-- إدخال تصاميم تجريبية
INSERT INTO public.designs (name, name_en, description, description_en, category, subcategory, base_price, estimated_hours, difficulty_level, main_image, images, measurements_required, fabric_requirements, customization_options, tags) VALUES
('فستان زفاف كلاسيكي', 'Classic Wedding Dress', 'فستان زفاف أنيق بتصميم كلاسيكي مع تطريز يدوي', 'Elegant wedding dress with classic design and hand embroidery', 'زفاف', 'كلاسيكي', 2500.00, 40, 'hard', '/designs/wedding-classic.jpg', ARRAY['/designs/wedding-classic-1.jpg', '/designs/wedding-classic-2.jpg'], ARRAY['محيط الصدر', 'محيط الخصر', 'محيط الورك', 'الطول الكامل', 'طول الكم'], '{"main_fabric": "ساتان أو شيفون", "lining": "قطن", "decoration": "دانتيل"}', '{"sleeve_style": ["بدون أكمام", "أكمام طويلة", "أكمام قصيرة"], "train_length": ["بدون ذيل", "ذيل قصير", "ذيل طويل"], "neckline": ["مستدير", "على شكل V", "مربع"]}', ARRAY['زفاف', 'كلاسيكي', 'أنيق']),

('فستان سهرة فاخر', 'Luxury Evening Dress', 'فستان سهرة فاخر مناسب للمناسبات الخاصة', 'Luxury evening dress perfect for special occasions', 'سهرة', 'فاخر', 1800.00, 25, 'medium', '/designs/evening-luxury.jpg', ARRAY['/designs/evening-luxury-1.jpg', '/designs/evening-luxury-2.jpg'], ARRAY['محيط الصدر', 'محيط الخصر', 'محيط الورك', 'الطول'], '{"main_fabric": "ساتان أو شيفون", "decoration": "تطريز أو خرز"}', '{"color": ["أحمر", "أزرق", "أسود", "ذهبي"], "length": ["قصير", "متوسط", "طويل"], "back_style": ["مغلق", "مفتوح", "نصف مفتوح"]}', ARRAY['سهرة', 'فاخر', 'مناسبات']),

('فستان يومي عملي', 'Casual Daily Dress', 'فستان يومي مريح وعملي للاستخدام اليومي', 'Comfortable and practical daily dress for everyday wear', 'يومي', 'عملي', 800.00, 15, 'easy', '/designs/daily-casual.jpg', ARRAY['/designs/daily-casual-1.jpg'], ARRAY['محيط الصدر', 'محيط الخصر', 'الطول'], '{"main_fabric": "قطن أو كتان"}', '{"sleeve_length": ["بدون أكمام", "أكمام قصيرة", "أكمام 3/4"], "pattern": ["سادة", "مخطط", "منقط"], "fit": ["ضيق", "عادي", "واسع"]}', ARRAY['يومي', 'مريح', 'عملي']),

('فستان خطوبة رومانسي', 'Romantic Engagement Dress', 'فستان خطوبة رومانسي بتفاصيل دانتيل', 'Romantic engagement dress with lace details', 'خطوبة', 'رومانسي', 1500.00, 30, 'medium', '/designs/engagement-romantic.jpg', ARRAY['/designs/engagement-romantic-1.jpg', '/designs/engagement-romantic-2.jpg'], ARRAY['محيط الصدر', 'محيط الخصر', 'محيط الورك', 'الطول'], '{"main_fabric": "شيفون أو تول", "decoration": "دانتيل"}', '{"color": ["أبيض", "كريمي", "وردي فاتح"], "skirt_style": ["A-line", "مستقيم", "منفوش"], "waist_style": ["طبيعي", "عالي", "منخفض"]}', ARRAY['خطوبة', 'رومانسي', 'دانتيل']);

-- إدخال منتجات جاهزة تجريبية
INSERT INTO public.products (design_id, name, name_en, description, sku, price, category, subcategory, size, color, stock_quantity, main_image, images) VALUES
((SELECT id FROM public.designs WHERE name = 'فستان يومي عملي'), 'فستان يومي أزرق - مقاس M', 'Blue Daily Dress - Size M', 'فستان يومي مريح باللون الأزرق', 'DD-BLUE-M-001', 850.00, 'يومي', 'عملي', 'M', 'أزرق', 3, '/products/daily-blue-m.jpg', ARRAY['/products/daily-blue-m-1.jpg', '/products/daily-blue-m-2.jpg']),
((SELECT id FROM public.designs WHERE name = 'فستان يومي عملي'), 'فستان يومي أزرق - مقاس L', 'Blue Daily Dress - Size L', 'فستان يومي مريح باللون الأزرق', 'DD-BLUE-L-001', 850.00, 'يومي', 'عملي', 'L', 'أزرق', 2, '/products/daily-blue-l.jpg', ARRAY['/products/daily-blue-l-1.jpg']);

-- إدخال مستخدمين تجريبيين (سيتم ربطهم بـ Supabase Auth لاحقاً)
-- ملاحظة: في الإنتاج، سيتم إنشاء هؤلاء المستخدمين عبر نظام المصادقة
INSERT INTO public.users (id, email, full_name, phone, role, is_active, email_verified) VALUES
('550e8400-e29b-41d4-a716-446655440000', 'admin@yasmin-alsham.com', 'مدير النظام', '+963-11-1234567', 'admin', true, true),
('550e8400-e29b-41d4-a716-446655440001', 'worker1@yasmin-alsham.com', 'فاطمة أحمد', '+963-987-111111', 'worker', true, true),
('550e8400-e29b-41d4-a716-446655440002', 'worker2@yasmin-alsham.com', 'عائشة محمد', '+963-987-222222', 'worker', true, true),
('550e8400-e29b-41d4-a716-446655440003', 'client1@example.com', 'سارة علي', '+963-987-333333', 'client', true, true),
('550e8400-e29b-41d4-a716-446655440004', 'client2@example.com', 'نور حسن', '+963-987-444444', 'client', true, true);

-- إدخال عمال تجريبيين
INSERT INTO public.workers (user_id, specialty, experience_years, hourly_rate, performance_rating, skills, bio, is_available) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'فساتين زفاف', 8, 50.00, 4.8, ARRAY['خياطة يدوية', 'تطريز', 'تصميم'], 'خياطة متخصصة في فساتين الزفاف مع خبرة 8 سنوات', true),
('550e8400-e29b-41d4-a716-446655440002', 'فساتين سهرة', 5, 40.00, 4.5, ARRAY['خياطة آلة', 'تفصيل', 'تشطيب'], 'خياطة ماهرة في فساتين السهرة والمناسبات', true);

-- إدخال مواعيد تجريبية
INSERT INTO public.appointments (client_id, worker_id, appointment_date, appointment_time, type, status, service_type, notes) VALUES
('550e8400-e29b-41d4-a716-446655440003', (SELECT id FROM public.workers WHERE user_id = '550e8400-e29b-41d4-a716-446655440001'), CURRENT_DATE + INTERVAL '3 days', '16:00', 'consultation', 'scheduled', 'استشارة تصميم فستان زفاف', 'العميلة تريد فستان زفاف كلاسيكي'),
('550e8400-e29b-41d4-a716-446655440004', (SELECT id FROM public.workers WHERE user_id = '550e8400-e29b-41d4-a716-446655440002'), CURRENT_DATE + INTERVAL '5 days', '18:00', 'fitting', 'confirmed', 'قياس فستان سهرة', 'قياس أولي لفستان السهرة');

-- إدخال طلبات تجريبية
INSERT INTO public.orders (client_id, worker_id, status, order_type, subtotal, total_amount, estimated_completion_date, client_notes) VALUES
('550e8400-e29b-41d4-a716-446655440003', (SELECT id FROM public.workers WHERE user_id = '550e8400-e29b-41d4-a716-446655440001'), 'in_progress', 'custom', 2500.00, 2500.00, CURRENT_DATE + INTERVAL '30 days', 'فستان زفاف أبيض مع تطريز ذهبي'),
('550e8400-e29b-41d4-a716-446655440004', (SELECT id FROM public.workers WHERE user_id = '550e8400-e29b-41d4-a716-446655440002'), 'confirmed', 'custom', 1800.00, 1800.00, CURRENT_DATE + INTERVAL '20 days', 'فستان سهرة أحمر للحفلة');

-- إدخال عناصر الطلبات
INSERT INTO public.order_items (order_id, design_id, item_type, name, quantity, unit_price, total_price, customizations) VALUES
((SELECT id FROM public.orders WHERE client_id = '550e8400-e29b-41d4-a716-446655440003' LIMIT 1),
 (SELECT id FROM public.designs WHERE name = 'فستان زفاف كلاسيكي'),
 'design', 'فستان زفاف كلاسيكي مخصص', 1, 2500.00, 2500.00,
 '{"color": "أبيض", "train_length": "ذيل طويل", "sleeve_style": "أكمام طويلة", "embroidery": "تطريز ذهبي"}'),
((SELECT id FROM public.orders WHERE client_id = '550e8400-e29b-41d4-a716-446655440004' LIMIT 1),
 (SELECT id FROM public.designs WHERE name = 'فستان سهرة فاخر'),
 'design', 'فستان سهرة فاخر مخصص', 1, 1800.00, 1800.00,
 '{"color": "أحمر", "length": "طويل", "back_style": "مفتوح"}');

-- إدخال مفضلات تجريبية
INSERT INTO public.favorites (user_id, design_id) VALUES
('550e8400-e29b-41d4-a716-446655440003', (SELECT id FROM public.designs WHERE name = 'فستان زفاف كلاسيكي')),
('550e8400-e29b-41d4-a716-446655440003', (SELECT id FROM public.designs WHERE name = 'فستان خطوبة رومانسي')),
('550e8400-e29b-41d4-a716-446655440004', (SELECT id FROM public.designs WHERE name = 'فستان سهرة فاخر'));

-- إدخال عناصر عربة التسوق التجريبية
INSERT INTO public.cart_items (user_id, design_id, item_type, quantity, customizations) VALUES
('550e8400-e29b-41d4-a716-446655440004', (SELECT id FROM public.designs WHERE name = 'فستان يومي عملي'), 'design', 1, '{"color": "أزرق", "size": "M", "sleeve_length": "أكمام قصيرة"}');

-- إدخال إشعارات تجريبية
INSERT INTO public.notifications (user_id, type, title, message, priority) VALUES
('550e8400-e29b-41d4-a716-446655440003', 'appointment_reminder', 'تذكير بالموعد', 'لديك موعد غداً في الساعة 4:00 مساءً', 'high'),
('550e8400-e29b-41d4-a716-446655440004', 'order_update', 'تحديث الطلب', 'تم تأكيد طلبك وبدء العمل عليه', 'normal'),
('550e8400-e29b-41d4-a716-446655440003', 'order_ready', 'الطلب جاهز', 'فستان الزفاف الخاص بك جاهز للاستلام', 'high');

-- إدخال تقييمات تجريبية
INSERT INTO public.worker_reviews (worker_id, client_id, order_id, rating, review_text, is_approved) VALUES
((SELECT id FROM public.workers WHERE user_id = '550e8400-e29b-41d4-a716-446655440001'),
 '550e8400-e29b-41d4-a716-446655440003',
 (SELECT id FROM public.orders WHERE client_id = '550e8400-e29b-41d4-a716-446655440003' LIMIT 1),
 5, 'عمل ممتاز وجودة عالية، أنصح بشدة!', true),
((SELECT id FROM public.workers WHERE user_id = '550e8400-e29b-41d4-a716-446655440002'),
 '550e8400-e29b-41d4-a716-446655440004',
 (SELECT id FROM public.orders WHERE client_id = '550e8400-e29b-41d4-a716-446655440004' LIMIT 1),
 4, 'خياطة ماهرة ونتيجة جميلة', true);

-- ========================================
-- رسائل النجاح
-- ========================================

-- عرض رسالة نجاح
DO $$
BEGIN
    RAISE NOTICE '✅ تم إنشاء قاعدة البيانات بنجاح!';
    RAISE NOTICE '📊 تم إدخال البيانات التجريبية';
    RAISE NOTICE '🔒 تم تفعيل سياسات الأمان (RLS)';
    RAISE NOTICE '⚡ تم إنشاء الفهارس لتحسين الأداء';
    RAISE NOTICE '🎯 قاعدة البيانات جاهزة للاستخدام!';
END $$;
