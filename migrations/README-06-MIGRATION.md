# Migration 06: Favorites & Cart - localStorage to Supabase

## 📋 نظرة عامة

هذا الـ Migration ينقل ميزات المفضلة (Favorites) والسلة (Cart) من localStorage إلى قاعدة بيانات Supabase مع دعم كامل للمستخدمين المجهولين.

## ⚠️ تحديث مهم

تم تحديث Migration ليتوافق مع البنية الحالية لقاعدة البيانات:
- ✅ استخدام جدول `products` بدلاً من `designs`
- ✅ استخدام `product_id` بدلاً من `design_id`
- ✅ استخدام `title` بدلاً من `name`
- ✅ استخدام `thumbnail_image` بدلاً من `image_url`
- ✅ استخدام `gen_random_uuid()` بدلاً من `uuid_generate_v4()`
- ✅ استخدام `public` schema بشكل صريح

---

## 🚀 خطوات التطبيق

### الطريقة 1: عبر Supabase Dashboard (موصى بها)

1. **افتح Supabase Dashboard:**
   ```
   https://supabase.com/dashboard/project/qbbijtyrikhybgszzbjz
   ```

2. **انتقل إلى SQL Editor:**
   - من القائمة الجانبية، اختر **SQL Editor**
   - أو اذهب مباشرة إلى: `https://supabase.com/dashboard/project/qbbijtyrikhybgszzbjz/sql`

3. **انسخ محتوى الملف:**
   - افتح ملف `migrations/06-favorites-cart-migration.sql`
   - انسخ المحتوى بالكامل (Ctrl+A ثم Ctrl+C)

4. **الصق وشغّل:**
   - الصق المحتوى في SQL Editor
   - اضغط على **Run** أو (Ctrl+Enter)

5. **تحقق من النجاح:**
   - يجب أن ترى رسالة "Success. No rows returned"
   - تحقق من إنشاء الجداول والدوال

---

### الطريقة 2: عبر Supabase CLI (للمطورين)

```bash
# 1. تسجيل الدخول إلى Supabase
supabase login

# 2. ربط المشروع
supabase link --project-ref qbbijtyrikhybgszzbjz

# 3. تطبيق Migration
supabase db push

# أو تطبيق ملف محدد
psql $DATABASE_URL -f migrations/06-favorites-cart-migration.sql
```

---

## ✅ التحقق من النجاح

بعد تطبيق Migration، تحقق من:

### 1. الجداول المنشأة/المحدثة:

```sql
-- تحقق من جدول favorites
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'favorites';

-- يجب أن ترى:
-- - id (uuid)
-- - user_id (uuid, nullable)
-- - session_id (text, nullable)
-- - design_id (uuid)
-- - created_at (timestamptz)
-- - updated_at (timestamptz)
```

```sql
-- تحقق من جدول cart_items
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'cart_items';

-- يجب أن ترى:
-- - id (uuid)
-- - user_id (uuid, nullable)
-- - session_id (text, nullable)
-- - design_id (uuid)
-- - quantity (integer)
-- - selected_size (text)
-- - selected_color (text)
-- - customizations (jsonb)
-- - last_activity_at (timestamptz)
-- - created_at (timestamptz)
-- - updated_at (timestamptz)
```

### 2. سياسات RLS:

```sql
-- تحقق من سياسات favorites
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'favorites';

-- يجب أن ترى 4 سياسات:
-- - Users and sessions can view their favorites (SELECT)
-- - Users and sessions can add favorites (INSERT)
-- - Users and sessions can remove favorites (DELETE)
-- - Users can update their favorites (UPDATE)
```

```sql
-- تحقق من سياسات cart_items
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'cart_items';

-- يجب أن ترى 4 سياسات مشابهة
```

### 3. الدوال المساعدة:

```sql
-- تحقق من وجود دالة merge_session_to_user
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'merge_session_to_user';

-- تحقق من وجود دالة cleanup_old_carts
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name = 'cleanup_old_carts';
```

---

## 🧪 اختبار الوظائف

### اختبار 1: إضافة مفضلة كمستخدم مجهول

```sql
-- إضافة مفضلة بـ session_id
INSERT INTO favorites (session_id, design_id)
VALUES ('test-session-123', 'design-uuid-here');

-- التحقق
SELECT * FROM favorites WHERE session_id = 'test-session-123';
```

### اختبار 2: إضافة عنصر للسلة كمستخدم مسجل

```sql
-- إضافة عنصر للسلة
INSERT INTO cart_items (user_id, design_id, quantity)
VALUES ('user-uuid-here', 'design-uuid-here', 2);

-- التحقق
SELECT * FROM cart_items WHERE user_id = 'user-uuid-here';
```

### اختبار 3: دمج بيانات الجلسة

```sql
-- دمج بيانات session مع user
SELECT merge_session_to_user('test-session-123', 'user-uuid-here');

-- التحقق من نقل البيانات
SELECT * FROM favorites WHERE user_id = 'user-uuid-here';
SELECT * FROM cart_items WHERE user_id = 'user-uuid-here';
```

### اختبار 4: تنظيف البيانات القديمة

```sql
-- تنظيف السلات القديمة (أكثر من 30 يوم)
SELECT cleanup_old_carts();

-- تحقق من النتيجة
-- يجب أن ترى عدد السجلات المحذوفة
```

---

## 🔧 استكشاف الأخطاء

### الخطأ: `relation "favorites" does not exist`

**السبب:** جدول favorites غير موجود

**الحل:** 
- تأكد من تطبيق `supabase-schema.sql` أولاً
- أو استخدم الـ Migration المحدث الذي ينشئ الجداول تلقائياً

### الخطأ: `relation "users" does not exist`

**السبب:** جدول users غير موجود (مطلوب للـ Foreign Keys)

**الحل:**
- تطبيق `supabase-schema.sql` أولاً لإنشاء جميع الجداول الأساسية

### الخطأ: `relation "designs" does not exist`

**السبب:** جدول designs غير موجود (مطلوب للـ Foreign Keys)

**الحل:**
- تطبيق `supabase-schema.sql` أولاً

### الخطأ: `column "user_id" cannot be null`

**السبب:** القيد NOT NULL لم يُحذف بعد

**الحل:**
- تأكد من تطبيق Migration بالكامل
- أو قم بتشغيل:
  ```sql
  ALTER TABLE favorites ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE cart_items ALTER COLUMN user_id DROP NOT NULL;
  ```

---

## 📝 ملاحظات مهمة

1. **الترتيب مهم:**
   - يجب تطبيق `supabase-schema.sql` أولاً (إذا لم يكن مطبقاً)
   - ثم تطبيق `06-favorites-cart-migration.sql`

2. **الجداول الموجودة:**
   - إذا كانت الجداول موجودة مسبقاً، سيتم تحديثها فقط
   - لن يتم حذف أي بيانات موجودة

3. **RLS:**
   - سيتم حذف السياسات القديمة وإنشاء سياسات جديدة
   - تأكد من أن RLS مفعّل على الجداول

4. **الأداء:**
   - الفهارس ستُنشأ تلقائياً لتحسين الأداء
   - قد يستغرق إنشاء الفهارس بعض الوقت على الجداول الكبيرة

---

## 🔄 التراجع (Rollback)

إذا احتجت للتراجع عن Migration:

```sql
-- 1. حذف الدوال المساعدة
DROP FUNCTION IF EXISTS merge_session_to_user(TEXT, UUID);
DROP FUNCTION IF EXISTS cleanup_old_carts();
DROP FUNCTION IF EXISTS update_cart_last_activity();

-- 2. حذف السياسات الجديدة
DROP POLICY IF EXISTS "Users and sessions can view their favorites" ON favorites;
DROP POLICY IF EXISTS "Users and sessions can add favorites" ON favorites;
DROP POLICY IF EXISTS "Users and sessions can remove favorites" ON favorites;
DROP POLICY IF EXISTS "Users can update their favorites" ON favorites;

DROP POLICY IF EXISTS "Users and sessions can view their cart" ON cart_items;
DROP POLICY IF EXISTS "Users and sessions can add to cart" ON cart_items;
DROP POLICY IF EXISTS "Users and sessions can update cart" ON cart_items;
DROP POLICY IF EXISTS "Users and sessions can remove from cart" ON cart_items;

-- 3. حذف الأعمدة الجديدة
ALTER TABLE favorites DROP COLUMN IF EXISTS session_id;
ALTER TABLE favorites DROP COLUMN IF EXISTS updated_at;
ALTER TABLE cart_items DROP COLUMN IF EXISTS session_id;
ALTER TABLE cart_items DROP COLUMN IF EXISTS last_activity_at;

-- 4. إعادة القيد NOT NULL
ALTER TABLE favorites ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE cart_items ALTER COLUMN user_id SET NOT NULL;

-- 5. إعادة القيد الفريد القديم
ALTER TABLE favorites ADD CONSTRAINT favorites_user_id_design_id_key UNIQUE(user_id, design_id);
```

---

## 📞 الدعم

إذا واجهت أي مشاكل:

1. تحقق من Console في المتصفح للأخطاء
2. تحقق من Supabase Logs
3. راجع ملف `FAVORITES_CART_MIGRATION_COMPLETED.md` للتفاصيل الكاملة

---

## ✅ الخطوات التالية

بعد تطبيق Migration بنجاح:

1. ✅ اختبر إضافة مفضلة كمستخدم مجهول
2. ✅ اختبر إضافة عنصر للسلة كمستخدم مسجل
3. ✅ اختبر دمج البيانات عند تسجيل الدخول
4. ✅ قم بترحيل البيانات الموجودة في localStorage (إن وجدت)
5. ✅ راقب الأداء والأخطاء

---

**تاريخ الإنشاء:** 2025-11-03  
**الإصدار:** 1.0  
**الحالة:** جاهز للتطبيق ✅

