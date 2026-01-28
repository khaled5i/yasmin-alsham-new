# تطبيق Migration لإضافة مدير الورشة
# Apply Workshop Manager Migration

## 🚀 خطوات سريعة

### الخطوة 1: افتح Supabase Dashboard
1. اذهب إلى: https://supabase.com/dashboard
2. اختر مشروعك
3. من القائمة الجانبية، اختر **SQL Editor**

---

### الخطوة 2: نفذ الكود التالي

انسخ والصق الكود التالي في SQL Editor واضغط **Run**:

```sql
-- ============================================================================
-- إضافة نوع عامل جديد: مدير الورشة (Workshop Manager)
-- ============================================================================

-- الخطوة 1: حذف القيد القديم
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'workers' AND column_name = 'worker_type'
  ) THEN
    ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_worker_type_check;
    RAISE NOTICE 'تم حذف القيد القديم workers_worker_type_check';
  END IF;
END $$;

-- الخطوة 2: إضافة القيد الجديد مع 'workshop_manager'
ALTER TABLE workers 
ADD CONSTRAINT workers_worker_type_check 
CHECK (worker_type IN ('tailor', 'fabric_store_manager', 'accountant', 'general_manager', 'workshop_manager'));

-- التحقق من نجاح العملية
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'workers_worker_type_check';
```

---

### الخطوة 3: تحقق من النتيجة

يجب أن ترى:
- ✅ رسالة: "تم حذف القيد القديم workers_worker_type_check"
- ✅ جدول يعرض القيد الجديد مع جميع أنواع العمال الخمسة

---

## ✅ التحقق من نجاح التطبيق

### اختبار 1: التحقق من القيد
```sql
SELECT 
  constraint_name,
  check_clause
FROM information_schema.check_constraints
WHERE constraint_name = 'workers_worker_type_check';
```

**النتيجة المتوقعة:**
```
constraint_name: workers_worker_type_check
check_clause: (worker_type IN ('tailor', 'fabric_store_manager', 'accountant', 'general_manager', 'workshop_manager'))
```

---

### اختبار 2: إنشاء مدير ورشة تجريبي
```sql
-- إنشاء مستخدم تجريبي
INSERT INTO users (email, full_name, role, is_active)
VALUES ('test.workshop@example.com', 'مدير ورشة تجريبي', 'worker', true)
RETURNING id;

-- استخدم الـ id من النتيجة أعلاه في الاستعلام التالي
-- استبدل 'USER_ID_HERE' بالـ id الفعلي
INSERT INTO workers (user_id, specialty, worker_type, is_available)
VALUES ('USER_ID_HERE', 'مدير ورشة', 'workshop_manager', true);
```

**إذا نجح الاستعلام:** ✅ Migration تم تطبيقه بنجاح!  
**إذا فشل:** ❌ هناك مشكلة، راجع الخطوات أعلاه

---

### اختبار 3: عرض جميع أنواع العمال
```sql
SELECT DISTINCT worker_type 
FROM workers 
ORDER BY worker_type;
```

---

## 🧹 حذف البيانات التجريبية (اختياري)

إذا أنشأت مستخدم تجريبي، يمكنك حذفه:

```sql
-- حذف العامل التجريبي
DELETE FROM workers 
WHERE user_id IN (
  SELECT id FROM users WHERE email = 'test.workshop@example.com'
);

-- حذف المستخدم التجريبي
DELETE FROM users 
WHERE email = 'test.workshop@example.com';
```

---

## 🎉 تم بنجاح!

الآن يمكنك:
1. ✅ إضافة عمال جدد من نوع "مدير الورشة"
2. ✅ تسجيل الدخول بحساب مدير ورشة
3. ✅ الوصول إلى لوحة التحكم `/dashboard/workshop-manager`
4. ✅ متابعة الطلبات (الحديثة، المكتملة، المسلمة)

---

## 🐛 حل المشاكل

### المشكلة: "constraint already exists"
**الحل:** القيد موجود بالفعل، لا حاجة لتنفيذ Migration مرة أخرى

### المشكلة: "permission denied"
**الحل:** تأكد من أنك مسجل دخول كمدير في Supabase Dashboard

### المشكلة: "table workers does not exist"
**الحل:** تأكد من تطبيق migrations السابقة أولاً

---

**تاريخ الإنشاء:** 2024-12-26  
**الحالة:** ✅ جاهز للتطبيق

