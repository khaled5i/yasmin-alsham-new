-- ========================================
-- Yasmin Alsham RLS Policies
-- سياسات الأمان لقاعدة بيانات ياسمين الشام
-- Version: 3.0
-- ========================================

-- ملاحظة: يجب تنفيذ هذا الملف بعد تنفيذ supabase-schema.sql

-- ========================================
-- دوال مساعدة للتحقق من الأدوار
-- ========================================

-- دالة للتحقق من أن المستخدم Admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة للتحقق من أن المستخدم Worker
CREATE OR REPLACE FUNCTION is_worker()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'worker'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- دالة للحصول على دور المستخدم
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT role FROM users WHERE id = auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 1. سياسات جدول المستخدمين (Users)
-- ========================================

-- القراءة: المستخدمون يمكنهم رؤية ملفاتهم الشخصية فقط، Admin يرى الجميع
CREATE POLICY "Users can view their own profile"
ON users FOR SELECT
USING (
  auth.uid() = id 
  OR 
  is_admin()
);

-- التحديث: المستخدمون يمكنهم تحديث ملفاتهم الشخصية فقط
CREATE POLICY "Users can update their own profile"
ON users FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- الإضافة: يتم التعامل معها عبر Supabase Auth
-- الحذف: Admin فقط
CREATE POLICY "Admins can delete users"
ON users FOR DELETE
USING (is_admin());

-- ========================================
-- 2. سياسات جدول العمال (Workers)
-- ========================================

-- القراءة: الجميع يمكنهم رؤية العمال النشطين
CREATE POLICY "Anyone can view active workers"
ON workers FOR SELECT
USING (is_available = true OR is_admin());

-- التحديث: العامل يمكنه تحديث ملفه، Admin يمكنه تحديث الجميع
CREATE POLICY "Workers can update their own profile"
ON workers FOR UPDATE
USING (
  user_id = auth.uid() 
  OR 
  is_admin()
)
WITH CHECK (
  user_id = auth.uid() 
  OR 
  is_admin()
);

-- الإضافة والحذف: Admin فقط
CREATE POLICY "Admins can insert workers"
ON workers FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can delete workers"
ON workers FOR DELETE
USING (is_admin());

-- ========================================
-- 3. سياسات جدول التصاميم (Designs)
-- ========================================

-- القراءة: الجميع يمكنهم رؤية التصاميم النشطة
CREATE POLICY "Anyone can view active designs"
ON designs FOR SELECT
USING (is_active = true OR is_admin());

-- الإضافة والتحديث والحذف: Admin فقط
CREATE POLICY "Admins can insert designs"
ON designs FOR INSERT
WITH CHECK (is_admin());

CREATE POLICY "Admins can update designs"
ON designs FOR UPDATE
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Admins can delete designs"
ON designs FOR DELETE
USING (is_admin());

-- ========================================
-- 4. سياسات جدول الأقمشة (Fabrics)
-- ========================================

-- القراءة: الجميع يمكنهم رؤية الأقمشة النشطة
CREATE POLICY "Anyone can view active fabrics"
ON fabrics FOR SELECT
USING (is_active = true OR is_admin());

-- الإضافة والتحديث والحذف: Admin فقط
CREATE POLICY "Admins can manage fabrics"
ON fabrics FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- ========================================
-- 5. سياسات جدول المواعيد (Appointments)
-- ========================================

-- القراءة: المستخدمون يرون مواعيدهم فقط، Admin يرى الجميع
CREATE POLICY "Users can view their own appointments"
ON appointments FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  is_admin()
);

-- الإضافة: الجميع يمكنهم حجز مواعيد (حتى الضيوف)
-- هذه السياسة مهمة جداً لدعم الحجز المجهول
CREATE POLICY "Anyone can insert appointments"
ON appointments FOR INSERT
WITH CHECK (true);

-- التحديث: المستخدم يمكنه تحديث مواعيده، Admin يمكنه تحديث الجميع
CREATE POLICY "Users can update their own appointments"
ON appointments FOR UPDATE
USING (
  auth.uid() = user_id 
  OR 
  is_admin()
)
WITH CHECK (
  auth.uid() = user_id 
  OR 
  is_admin()
);

-- الحذف: المستخدم يمكنه حذف مواعيده، Admin يمكنه حذف الجميع
CREATE POLICY "Users can delete their own appointments"
ON appointments FOR DELETE
USING (
  auth.uid() = user_id 
  OR 
  is_admin()
);

-- ========================================
-- 6. سياسات جدول الطلبات (Orders)
-- ========================================

-- القراءة: المستخدمون يرون طلباتهم، العمال يرون طلباتهم المعينة، Admin يرى الجميع
CREATE POLICY "Users can view their own orders"
ON orders FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  EXISTS (
    SELECT 1 FROM workers 
    WHERE workers.id = orders.worker_id 
    AND workers.user_id = auth.uid()
  )
  OR 
  is_admin()
);

-- الإضافة: Admin فقط (الطلبات تُنشأ من قبل الإدارة)
CREATE POLICY "Admins can insert orders"
ON orders FOR INSERT
WITH CHECK (is_admin());

-- التحديث: العمال يمكنهم تحديث طلباتهم المعينة، Admin يمكنه تحديث الجميع
CREATE POLICY "Workers can update assigned orders"
ON orders FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM workers 
    WHERE workers.id = orders.worker_id 
    AND workers.user_id = auth.uid()
  )
  OR 
  is_admin()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM workers 
    WHERE workers.id = orders.worker_id 
    AND workers.user_id = auth.uid()
  )
  OR 
  is_admin()
);

-- الحذف: Admin فقط
CREATE POLICY "Admins can delete orders"
ON orders FOR DELETE
USING (is_admin());

-- ========================================
-- 7. سياسات جدول عناصر الطلبات (Order Items)
-- ========================================

-- القراءة: نفس صلاحيات جدول الطلبات
CREATE POLICY "Users can view their own order items"
ON order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders 
    WHERE orders.id = order_items.order_id 
    AND (
      orders.user_id = auth.uid() 
      OR 
      EXISTS (
        SELECT 1 FROM workers 
        WHERE workers.id = orders.worker_id 
        AND workers.user_id = auth.uid()
      )
      OR 
      is_admin()
    )
  )
);

-- الإضافة والتحديث والحذف: Admin فقط
CREATE POLICY "Admins can manage order items"
ON order_items FOR ALL
USING (is_admin())
WITH CHECK (is_admin());

-- ========================================
-- 8. سياسات جدول المفضلة (Favorites)
-- ========================================

-- القراءة: المستخدمون يرون مفضلاتهم فقط
CREATE POLICY "Users can view their own favorites"
ON favorites FOR SELECT
USING (auth.uid() = user_id);

-- الإضافة: المستخدمون المسجلون فقط
CREATE POLICY "Authenticated users can add favorites"
ON favorites FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- الحذف: المستخدمون يمكنهم حذف مفضلاتهم فقط
CREATE POLICY "Users can delete their own favorites"
ON favorites FOR DELETE
USING (auth.uid() = user_id);

-- ========================================
-- 9. سياسات جدول السلة (Cart Items)
-- ========================================

-- القراءة: المستخدمون يرون سلتهم فقط
CREATE POLICY "Users can view their own cart"
ON cart_items FOR SELECT
USING (auth.uid() = user_id);

-- الإضافة: المستخدمون المسجلون فقط
CREATE POLICY "Authenticated users can add to cart"
ON cart_items FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- التحديث: المستخدمون يمكنهم تحديث سلتهم فقط
CREATE POLICY "Users can update their own cart"
ON cart_items FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- الحذف: المستخدمون يمكنهم حذف من سلتهم فقط
CREATE POLICY "Users can delete from their own cart"
ON cart_items FOR DELETE
USING (auth.uid() = user_id);

-- ========================================
-- 10. سياسات إضافية للأمان
-- ========================================

-- منع المستخدمين من تغيير أدوارهم
CREATE OR REPLACE FUNCTION prevent_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role != NEW.role AND auth.uid() = OLD.id THEN
    RAISE EXCEPTION 'Users cannot change their own role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER prevent_self_role_change
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_role_change();

-- تحديث تلقائي لعدد الطلبات في جدول العمال
CREATE OR REPLACE FUNCTION update_worker_orders_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.worker_id IS NOT NULL THEN
    UPDATE workers SET total_orders = total_orders + 1 WHERE id = NEW.worker_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.worker_id != NEW.worker_id THEN
    IF OLD.worker_id IS NOT NULL THEN
      UPDATE workers SET total_orders = total_orders - 1 WHERE id = OLD.worker_id;
    END IF;
    IF NEW.worker_id IS NOT NULL THEN
      UPDATE workers SET total_orders = total_orders + 1 WHERE id = NEW.worker_id;
    END IF;
  ELSIF TG_OP = 'DELETE' AND OLD.worker_id IS NOT NULL THEN
    UPDATE workers SET total_orders = total_orders - 1 WHERE id = OLD.worker_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_worker_orders
AFTER INSERT OR UPDATE OR DELETE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_worker_orders_count();

-- تحديث تلقائي لعدد الطلبات في جدول التصاميم
CREATE OR REPLACE FUNCTION update_design_orders_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.design_id IS NOT NULL THEN
    UPDATE designs SET orders_count = orders_count + NEW.quantity WHERE id = NEW.design_id;
  ELSIF TG_OP = 'UPDATE' AND NEW.design_id IS NOT NULL THEN
    UPDATE designs SET orders_count = orders_count - OLD.quantity + NEW.quantity WHERE id = NEW.design_id;
  ELSIF TG_OP = 'DELETE' AND OLD.design_id IS NOT NULL THEN
    UPDATE designs SET orders_count = orders_count - OLD.quantity WHERE id = OLD.design_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_design_orders
AFTER INSERT OR UPDATE OR DELETE ON order_items
FOR EACH ROW
EXECUTE FUNCTION update_design_orders_count();

-- ========================================
-- نهاية سياسات RLS
-- ========================================

-- ملاحظات مهمة:
-- 1. جدول appointments يسمح بالإضافة للجميع (حتى الضيوف) لدعم الحجز المجهول
-- 2. جدول orders يسمح بالإضافة للـ Admin فقط (الطلبات تُنشأ من لوحة التحكم)
-- 3. جميع الجداول محمية بـ RLS
-- 4. Admin لديه صلاحيات كاملة على جميع الجداول
-- 5. Workers يمكنهم رؤية وتحديث طلباتهم المعينة فقط
-- 6. Clients يمكنهم رؤية وتحديث بياناتهم الشخصية فقط

