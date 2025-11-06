-- ============================================================================
-- المرحلة 1: تحويل جدول العمال (Workers Migration)
-- Phase 1: Workers Table Migration
-- ============================================================================
-- هذا الملف يحتوي على:
-- 1. إنشاء جدول users (المطلوب للعمال)
-- 2. إنشاء جدول workers
-- 3. سياسات RLS للأمان
-- 4. Triggers للتحديثات التلقائية
-- 5. بيانات تجريبية (اختيارية)
-- ============================================================================

-- تفعيل UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. جدول المستخدمين (Users Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'worker', 'client')),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهرس للبحث السريع بالبريد الإلكتروني
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================================
-- 2. جدول العمال (Workers Table)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  experience_years INTEGER DEFAULT 0,
  hourly_rate DECIMAL(10, 2) DEFAULT 0.00,
  performance_rating DECIMAL(3, 2) DEFAULT 0.00 CHECK (performance_rating >= 0 AND performance_rating <= 5),
  total_completed_orders INTEGER DEFAULT 0,
  skills TEXT[] DEFAULT '{}',
  availability JSONB DEFAULT '{}',
  bio TEXT,
  portfolio_images TEXT[] DEFAULT '{}',
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- فهارس للأداء
CREATE INDEX IF NOT EXISTS idx_workers_user_id ON workers(user_id);
CREATE INDEX IF NOT EXISTS idx_workers_specialty ON workers(specialty);
CREATE INDEX IF NOT EXISTS idx_workers_is_available ON workers(is_available);

-- ============================================================================
-- 3. Trigger للتحديث التلقائي لـ updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- تطبيق Trigger على جدول users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- تطبيق Trigger على جدول workers
DROP TRIGGER IF EXISTS update_workers_updated_at ON workers;
CREATE TRIGGER update_workers_updated_at
  BEFORE UPDATE ON workers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. Row Level Security (RLS) Policies
-- ============================================================================

-- تفعيل RLS على الجداول
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE workers ENABLE ROW LEVEL SECURITY;

-- دالة مساعدة للتحقق من دور Admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة مساعدة للتحقق من دور Worker
CREATE OR REPLACE FUNCTION is_worker()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'worker' AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- سياسات جدول Users
-- ============================================================================

-- السماح للجميع بقراءة المستخدمين النشطين (للعرض العام)
DROP POLICY IF EXISTS "Anyone can view active users" ON users;
CREATE POLICY "Anyone can view active users"
ON users FOR SELECT
USING (is_active = true);

-- المستخدم يمكنه قراءة ملفه الشخصي
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
USING (auth.uid() = id);

-- Admin يمكنه قراءة جميع المستخدمين
DROP POLICY IF EXISTS "Admins can view all users" ON users;
CREATE POLICY "Admins can view all users"
ON users FOR SELECT
USING (is_admin());

-- Admin يمكنه إنشاء مستخدمين جدد
DROP POLICY IF EXISTS "Admins can insert users" ON users;
CREATE POLICY "Admins can insert users"
ON users FOR INSERT
WITH CHECK (is_admin());

-- Admin يمكنه تحديث أي مستخدم
DROP POLICY IF EXISTS "Admins can update users" ON users;
CREATE POLICY "Admins can update users"
ON users FOR UPDATE
USING (is_admin());

-- المستخدم يمكنه تحديث ملفه الشخصي (ما عدا الدور)
DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
ON users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND role = (SELECT role FROM users WHERE id = auth.uid()));

-- Admin يمكنه حذف مستخدمين
DROP POLICY IF EXISTS "Admins can delete users" ON users;
CREATE POLICY "Admins can delete users"
ON users FOR DELETE
USING (is_admin());

-- ============================================================================
-- سياسات جدول Workers
-- ============================================================================

-- الجميع يمكنهم قراءة العمال المتاحين
DROP POLICY IF EXISTS "Anyone can view available workers" ON workers;
CREATE POLICY "Anyone can view available workers"
ON workers FOR SELECT
USING (is_available = true);

-- Admin يمكنه قراءة جميع العمال
DROP POLICY IF EXISTS "Admins can view all workers" ON workers;
CREATE POLICY "Admins can view all workers"
ON workers FOR SELECT
USING (is_admin());

-- Worker يمكنه قراءة ملفه الشخصي
DROP POLICY IF EXISTS "Workers can view own profile" ON workers;
CREATE POLICY "Workers can view own profile"
ON workers FOR SELECT
USING (user_id = auth.uid());

-- Admin يمكنه إنشاء عمال جدد
DROP POLICY IF EXISTS "Admins can insert workers" ON workers;
CREATE POLICY "Admins can insert workers"
ON workers FOR INSERT
WITH CHECK (is_admin());

-- Admin يمكنه تحديث أي عامل
DROP POLICY IF EXISTS "Admins can update workers" ON workers;
CREATE POLICY "Admins can update workers"
ON workers FOR UPDATE
USING (is_admin());

-- Worker يمكنه تحديث ملفه الشخصي (ما عدا total_completed_orders)
DROP POLICY IF EXISTS "Workers can update own profile" ON workers;
CREATE POLICY "Workers can update own profile"
ON workers FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid() AND
  total_completed_orders = (SELECT total_completed_orders FROM workers WHERE user_id = auth.uid())
);

-- Admin يمكنه حذف عمال
DROP POLICY IF EXISTS "Admins can delete workers" ON workers;
CREATE POLICY "Admins can delete workers"
ON workers FOR DELETE
USING (is_admin());

-- ============================================================================
-- 5. Trigger لمنع المستخدمين من تغيير أدوارهم
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  -- السماح للـ Admin بتغيير الأدوار
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  
  -- منع المستخدمين العاديين من تغيير أدوارهم
  IF NEW.role != OLD.role THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_users_role_change ON users;
CREATE TRIGGER prevent_users_role_change
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_change();

-- ============================================================================
-- 6. بيانات تجريبية (اختيارية - قم بتعديل UUIDs بعد إنشاء المستخدمين عبر Supabase Auth)
-- ============================================================================

-- ملاحظة: يجب إنشاء المستخدمين عبر Supabase Auth أولاً، ثم تحديث UUIDs هنا
-- يمكنك تخطي هذا القسم إذا كنت ستضيف البيانات يدوياً

-- مثال على إضافة مستخدم Admin (استبدل UUID بالقيمة الحقيقية)
-- INSERT INTO users (id, email, full_name, phone, role, is_active) VALUES
-- ('00000000-0000-0000-0000-000000000001', 'admin@yasminalsh.com', 'مدير النظام', '+966500000000', 'admin', true);

-- مثال على إضافة عامل (استبدل UUIDs بالقيم الحقيقية)
-- INSERT INTO users (id, email, full_name, phone, role, is_active) VALUES
-- ('00000000-0000-0000-0000-000000000002', 'fatima@yasminalsh.com', 'فاطمة أحمد', '+966501234567', 'worker', true);

-- INSERT INTO workers (user_id, specialty, experience_years, hourly_rate, performance_rating, skills, bio, is_available) VALUES
-- ('00000000-0000-0000-0000-000000000002', 'فساتين زفاف', 8, 50.00, 4.8, ARRAY['خياطة يدوية', 'تطريز', 'تصميم'], 'خياطة متخصصة في فساتين الزفاف', true);

-- ============================================================================
-- 7. التحقق من نجاح الإنشاء
-- ============================================================================

-- عرض جميع الجداول المنشأة
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name IN ('users', 'workers');

-- عرض جميع السياسات
SELECT schemaname, tablename, policyname FROM pg_policies 
WHERE tablename IN ('users', 'workers');

-- ============================================================================
-- انتهى ملف المرحلة الأولى
-- ============================================================================

