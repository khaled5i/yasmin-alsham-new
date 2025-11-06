-- ============================================================================
-- Migration: Store/Shop Management System
-- Description: إنشاء جداول المتجر (التصاميم الجاهزة) مع RLS policies
-- Created: 2025-01-XX
-- ============================================================================

-- ============================================================================
-- 1. إنشاء جدول الفئات (Categories)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  name_en TEXT,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.categories IS 'فئات المنتجات (فساتين زفاف، فساتين سهرة، إلخ)';

-- ============================================================================
-- 2. إنشاء جدول المنتجات/التصاميم (Products/Designs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- معلومات أساسية
  title TEXT NOT NULL,
  title_en TEXT,
  description TEXT NOT NULL,
  description_en TEXT,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  category_name TEXT, -- للتوافق مع البيانات الحالية
  
  -- السعر والتوفر
  price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
  is_available BOOLEAN DEFAULT true,
  stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
  
  -- الصور
  images TEXT[] DEFAULT '{}', -- مصفوفة من URLs أو base64
  thumbnail_image TEXT, -- الصورة المصغرة الرئيسية
  
  -- تفاصيل المنتج
  fabric TEXT, -- نوع القماش
  colors TEXT[] DEFAULT '{}', -- الألوان المتوفرة
  sizes TEXT[] DEFAULT '{}', -- المقاسات المتوفرة (XS, S, M, L, XL, XXL)
  features TEXT[] DEFAULT '{}', -- المميزات
  occasions TEXT[] DEFAULT '{}', -- المناسبات المناسبة
  care_instructions TEXT[] DEFAULT '{}', -- تعليمات العناية
  
  -- التقييمات
  rating DECIMAL(3, 2) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  reviews_count INTEGER DEFAULT 0 CHECK (reviews_count >= 0),
  
  -- SEO والبحث
  slug TEXT UNIQUE, -- للروابط الصديقة لمحركات البحث
  tags TEXT[] DEFAULT '{}', -- وسوم للبحث
  
  -- الحالة
  is_featured BOOLEAN DEFAULT false, -- منتج مميز
  is_new BOOLEAN DEFAULT false, -- منتج جديد
  is_on_sale BOOLEAN DEFAULT false, -- عرض خاص
  sale_price DECIMAL(10, 2) CHECK (sale_price >= 0 OR sale_price IS NULL),
  
  -- التواريخ
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  
  -- بيانات إضافية (JSONB للمرونة)
  metadata JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE public.products IS 'منتجات المتجر (التصاميم الجاهزة)';
COMMENT ON COLUMN public.products.images IS 'مصفوفة من روابط الصور أو base64 strings';
COMMENT ON COLUMN public.products.metadata IS 'بيانات إضافية مرنة (JSON)';

-- ============================================================================
-- 3. إنشاء Indexes للأداء
-- ============================================================================

-- Index للبحث السريع بالعنوان
CREATE INDEX IF NOT EXISTS idx_products_title ON public.products USING gin(to_tsvector('arabic', title));

-- Index للفئة
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_category_name ON public.products(category_name);

-- Index للحالة والتوفر
CREATE INDEX IF NOT EXISTS idx_products_is_available ON public.products(is_available);
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON public.products(is_featured);

-- Index للسعر (للفرز)
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products(price);

-- Index للتقييم (للفرز)
CREATE INDEX IF NOT EXISTS idx_products_rating ON public.products(rating DESC);

-- Index للتواريخ
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_published_at ON public.products(published_at DESC);

-- Index للبحث بالوسوم
CREATE INDEX IF NOT EXISTS idx_products_tags ON public.products USING gin(tags);

-- Index للـ slug (للروابط الصديقة)
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);

-- ============================================================================
-- 4. إنشاء Trigger لتحديث updated_at تلقائياً
-- ============================================================================

-- Trigger للمنتجات
CREATE OR REPLACE FUNCTION update_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION update_products_updated_at();

-- Trigger للفئات
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION update_categories_updated_at();

-- ============================================================================
-- 5. إنشاء دالة لتوليد Slug تلقائياً
-- ============================================================================

CREATE OR REPLACE FUNCTION generate_product_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  -- إذا كان الـ slug موجود بالفعل، لا تفعل شيء
  IF NEW.slug IS NOT NULL AND NEW.slug != '' THEN
    RETURN NEW;
  END IF;
  
  -- توليد slug من العنوان
  base_slug := lower(regexp_replace(NEW.title, '[^a-zA-Z0-9\u0600-\u06FF]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  final_slug := base_slug;
  
  -- التحقق من عدم وجود تكرار
  WHILE EXISTS (SELECT 1 FROM public.products WHERE slug = final_slug AND id != NEW.id) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  NEW.slug := final_slug;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_product_slug
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION generate_product_slug();

-- ============================================================================
-- 6. Row Level Security (RLS) Policies
-- ============================================================================

-- تفعيل RLS على الجداول
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6.1 Policies للمنتجات (Products)
-- ============================================================================

-- Policy: الجميع يمكنهم عرض المنتجات المتاحة والمنشورة
CREATE POLICY "Anyone can view available products"
  ON public.products
  FOR SELECT
  USING (
    is_available = true 
    AND published_at IS NOT NULL 
    AND published_at <= NOW()
  );

-- Policy: Admin يمكنه عرض جميع المنتجات
CREATE POLICY "Admins can view all products"
  ON public.products
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Policy: Admin فقط يمكنه إضافة منتجات
CREATE POLICY "Only admins can insert products"
  ON public.products
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Policy: Admin فقط يمكنه تعديل المنتجات
CREATE POLICY "Only admins can update products"
  ON public.products
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Policy: Admin فقط يمكنه حذف المنتجات
CREATE POLICY "Only admins can delete products"
  ON public.products
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- ============================================================================
-- 6.2 Policies للفئات (Categories)
-- ============================================================================

-- Policy: الجميع يمكنهم عرض الفئات النشطة
CREATE POLICY "Anyone can view active categories"
  ON public.categories
  FOR SELECT
  USING (is_active = true);

-- Policy: Admin يمكنه عرض جميع الفئات
CREATE POLICY "Admins can view all categories"
  ON public.categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- Policy: Admin فقط يمكنه إدارة الفئات
CREATE POLICY "Only admins can manage categories"
  ON public.categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
      AND users.is_active = true
    )
  );

-- ============================================================================
-- 7. إدراج بيانات الفئات الافتراضية
-- ============================================================================

INSERT INTO public.categories (name, name_en, description, display_order) VALUES
  ('فساتين زفاف', 'Wedding Dresses', 'فساتين زفاف فاخرة بتصاميم كلاسيكية وعصرية', 1),
  ('فساتين سهرة', 'Evening Dresses', 'فساتين سهرة راقية للمناسبات الخاصة', 2),
  ('فساتين كوكتيل', 'Cocktail Dresses', 'فساتين كوكتيل أنيقة للحفلات', 3),
  ('فساتين خطوبة', 'Engagement Dresses', 'فساتين خطوبة مميزة', 4),
  ('فساتين مناسبات', 'Occasion Dresses', 'فساتين للمناسبات المختلفة', 5)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 8. منح الصلاحيات
-- ============================================================================

-- منح صلاحيات القراءة للمستخدمين المصادق عليهم
GRANT SELECT ON public.products TO authenticated;
GRANT SELECT ON public.categories TO authenticated;

-- منح صلاحيات كاملة للمستخدمين المصادق عليهم (سيتم التحكم بها عبر RLS)
GRANT ALL ON public.products TO authenticated;
GRANT ALL ON public.categories TO authenticated;

-- منح صلاحيات القراءة للمستخدمين غير المصادق عليهم (للعرض العام)
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.categories TO anon;

-- ============================================================================
-- نهاية Migration
-- ============================================================================

COMMENT ON SCHEMA public IS 'تم إنشاء جداول المتجر بنجاح';

