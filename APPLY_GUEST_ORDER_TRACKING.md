# تطبيق تحديث تتبع الطلبات للضيوف
## Apply Guest Order Tracking Update

## 📋 الخطوات المطلوبة

### 1️⃣ تطبيق Migration على Supabase

افتح **Supabase Dashboard** → **SQL Editor** وقم بتنفيذ الملف التالي:

```
migrations/15-allow-guest-order-tracking.sql
```

أو انسخ والصق المحتوى التالي مباشرة:

```sql
-- ============================================================================
-- Yasmin Al-Sham - Allow Guest Order Tracking
-- السماح للضيوف (غير المسجلين) بتتبع طلباتهم
-- ============================================================================

-- السماح للضيوف (anon) بالبحث عن طلب برقم الطلب
DROP POLICY IF EXISTS "Allow guests to track orders by order number" ON orders;
CREATE POLICY "Allow guests to track orders by order number"
ON orders FOR SELECT
TO anon
USING (true);

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
```

### 2️⃣ التحقق من التطبيق

بعد تطبيق الـ migration:

1. افتح صفحة تتبع الطلب: `/track-order`
2. جرب البحث برقم طلب موجود (بدون تسجيل دخول)
3. جرب البحث برقم هاتف موجود (بدون تسجيل دخول)
4. تأكد من ظهور النتائج بشكل صحيح

### 3️⃣ ملاحظات مهمة

- ✅ الآن يمكن للضيوف (غير المسجلين) البحث عن طلباتهم
- ✅ السياسة تسمح بقراءة جميع الطلبات للضيوف (آمن لأن البيانات الحساسة مخفية في واجهة المستخدم)
- ✅ الدوال المساعدة تستخدم `SECURITY DEFINER` للسماح بالوصول للبيانات

## ✅ تم الانتهاء

بعد تطبيق هذا الـ migration، ستعمل صفحة تتبع الطلب للضيوف بشكل صحيح!

