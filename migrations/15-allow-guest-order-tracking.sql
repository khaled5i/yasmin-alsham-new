-- ============================================================================
-- Yasmin Al-Sham - Allow Guest Order Tracking
-- السماح للضيوف (غير المسجلين) بتتبع طلباتهم
-- ============================================================================

-- ============================================================================
-- 1. إضافة سياسة RLS للسماح للضيوف بالبحث عن طلباتهم برقم الطلب
-- ============================================================================

-- السماح للضيوف (anon) بالبحث عن طلب برقم الطلب
DROP POLICY IF EXISTS "Allow guests to track orders by order number" ON orders;
CREATE POLICY "Allow guests to track orders by order number"
ON orders FOR SELECT
TO anon
USING (true); -- السماح بقراءة جميع الطلبات للضيوف (سيتم التحكم في البيانات المعروضة من جانب التطبيق)

-- ============================================================================
-- 2. إضافة سياسة RLS للسماح للضيوف بالبحث عن طلباتهم برقم الهاتف
-- ============================================================================

-- السماح للضيوف (anon) بالبحث عن طلبات برقم الهاتف
-- نفس السياسة أعلاه تغطي هذا الاستخدام

-- ============================================================================
-- 3. تحديث الدوال المساعدة لتعمل مع الضيوف
-- ============================================================================

-- تحديث دالة البحث برقم الهاتف لتعمل مع الضيوف
DROP FUNCTION IF EXISTS get_orders_by_phone(TEXT);
CREATE OR REPLACE FUNCTION get_orders_by_phone(phone_number TEXT)
RETURNS SETOF orders AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM orders
  WHERE client_phone = phone_number
  ORDER BY created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- تحديث دالة البحث برقم الطلب لتعمل مع الضيوف
DROP FUNCTION IF EXISTS get_order_by_number(TEXT);
CREATE OR REPLACE FUNCTION get_order_by_number(order_num TEXT)
RETURNS SETOF orders AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM orders
  WHERE order_number = order_num
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. تعليقات على التحديثات
-- ============================================================================

COMMENT ON POLICY "Allow guests to track orders by order number" ON orders IS 
'يسمح للضيوف (غير المسجلين) بالبحث عن طلباتهم برقم الطلب أو رقم الهاتف من صفحة تتبع الطلب';

-- ============================================================================
-- نهاية Migration
-- ============================================================================

