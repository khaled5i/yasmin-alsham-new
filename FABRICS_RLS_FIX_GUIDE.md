
# 🔧 دليل إصلاح مشاكل RLS للأقمشة
# Fabrics RLS Issues Fix Guide

---

## 🐛 **المشاكل المكتشفة:**

### **المشكلة 1: التعديل لا يُحفظ فعلياً**
- **الوصف:** عند تعديل قماش والضغط على "حفظ"، تظهر رسالة نجاح لكن البيانات لا تتغير في قاعدة البيانات
- **السبب:** سياسات RLS تمنع مدير الأقمشة من تنفيذ عملية UPDATE
- **الحالة:** ✅ تم الإصلاح

### **المشكلة 2: خطأ عند رفع صورة**
- **الخطأ:** `new row violates row-level security policy`
- **الوصف:** عند رفع صورة لقماش جديد، يظهر خطأ RLS
- **السبب:** سياسات Storage تسمح فقط لـ admin برفع الصور
- **الحالة:** ✅ تم الإصلاح

---

## 🔍 **تحليل المشكلة:**

### **السياسات القديمة:**

#### **جدول `fabrics`:**
```sql
-- ❌ السياسة القديمة: فقط admin
CREATE POLICY "Only admins can update fabrics"
ON public.fabrics
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = auth.uid()
    AND users.role = 'admin'  -- ❌ فقط admin
  )
);
```

#### **Storage `product-images`:**
```sql
-- ❌ السياسة القديمة: فقط admin
CREATE POLICY "Admin Upload Product Images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'  -- ❌ فقط admin
  )
);
```

### **المشكلة:**
- السياسات تسمح فقط لـ `role = 'admin'`
- مدير الأقمشة لديه `role = 'worker'` و `worker_type = 'fabric_store_manager'`
- لذلك، لا يمكنه تعديل الأقمشة أو رفع الصور

---

## ✅ **الحل المطبق:**

### **1. إنشاء دالة مساعدة:**

```sql
CREATE OR REPLACE FUNCTION public.can_manage_fabrics()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users u
    LEFT JOIN public.workers w ON w.user_id = u.id
    WHERE u.id = auth.uid()
    AND u.is_active = true
    AND (
      -- Admin
      u.role = 'admin'
      OR
      -- Fabric Store Manager
      (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
      OR
      -- General Manager
      (u.role = 'worker' AND w.worker_type = 'general_manager')
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**الفوائد:**
- ✅ دالة واحدة للتحقق من الصلاحيات
- ✅ سهولة الصيانة والتحديث
- ✅ تدعم 3 أنواع من المستخدمين

### **2. تحديث سياسات جدول `fabrics`:**

```sql
-- ✅ السياسة الجديدة: admin + fabric_store_manager + general_manager
CREATE POLICY "Managers can update fabrics"
ON public.fabrics
FOR UPDATE
TO authenticated
USING (can_manage_fabrics())
WITH CHECK (can_manage_fabrics());
```

### **3. تحديث سياسات Storage:**

```sql
-- ✅ السياسة الجديدة: admin + fabric_store_manager + general_manager
CREATE POLICY "Managers can upload images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
      )
    )
  )
);
```

---

## 📋 **خطوات التطبيق:**

### **الخطوة 1: تطبيق Migration في Supabase**

1. افتح **Supabase Dashboard**
2. اذهب إلى **SQL Editor**
3. افتح ملف `supabase/migrations/fix_fabrics_rls_policies.sql`
4. انسخ المحتوى بالكامل
5. الصقه في SQL Editor
6. اضغط **Run** أو **F5**

### **الخطوة 2: التحقق من نجاح التطبيق**

قم بتشغيل هذا الاستعلام للتحقق:

```sql
-- عرض السياسات الجديدة
SELECT 
  policyname,
  cmd,
  roles::text
FROM pg_policies 
WHERE tablename = 'fabrics'
ORDER BY cmd, policyname;
```

**النتيجة المتوقعة:**
```
policyname                      | cmd    | roles
--------------------------------|--------|------------------
Anyone can view available...    | SELECT | {public}
Managers can view all fabrics   | SELECT | {authenticated}
Managers can insert fabrics     | INSERT | {authenticated}
Managers can update fabrics     | UPDATE | {authenticated}
Managers can delete fabrics     | DELETE | {authenticated}
```

### **الخطوة 3: اختبار الصلاحيات**

```sql
-- اختبار دالة can_manage_fabrics()
SELECT 
  auth.uid() AS user_id,
  can_manage_fabrics() AS can_manage;
```

**النتيجة المتوقعة:**
- إذا كنت `admin` أو `fabric_store_manager` أو `general_manager` → `true`
- غير ذلك → `false`

---

## 🧪 **اختبار الإصلاح:**

### **اختبار 1: تعديل قماش موجود**

1. سجل الدخول كـ **مدير أقمشة** (fabric_store_manager)
2. اذهب إلى `/dashboard/fabrics`
3. اضغط على قماش موجود
4. عدّل أي حقل (مثل الاسم أو السعر)
5. اضغط **"حفظ"**

**النتيجة المتوقعة:**
- ✅ رسالة "تم حفظ التعديل بنجاح"
- ✅ التعديل يظهر فوراً في الواجهة
- ✅ عند إعادة تحميل الصفحة، التعديل محفوظ
- ✅ لا توجد أخطاء في Console

### **اختبار 2: إضافة قماش جديد مع صورة**

1. سجل الدخول كـ **مدير أقمشة**
2. اذهب إلى `/dashboard/fabrics`
3. اضغط **"إضافة قماش جديد"**
4. املأ البيانات
5. ارفع صورة للقماش
6. اضغط **"حفظ"**

**النتيجة المتوقعة:**
- ✅ رسالة "تم إضافة القماش بنجاح"
- ✅ الصورة تُرفع بنجاح
- ✅ القماش الجديد يظهر في القائمة
- ✅ لا توجد أخطاء RLS

---

## 🎯 **من يمكنه إدارة الأقمشة الآن:**

| نوع المستخدم | role | worker_type | الصلاحيات |
|--------------|------|-------------|-----------|
| **Admin** | `admin` | - | ✅ جميع العمليات |
| **مدير الأقمشة** | `worker` | `fabric_store_manager` | ✅ جميع العمليات |
| **المدير العام** | `worker` | `general_manager` | ✅ جميع العمليات |
| **الخياط** | `worker` | `tailor` | ❌ عرض فقط |
| **المحاسب** | `worker` | `accountant` | ❌ عرض فقط |
| **العميل** | `client` | - | ❌ عرض المتاح فقط |

---

## 📊 **الصلاحيات التفصيلية:**

### **جدول `fabrics`:**

| العملية | الجميع | المدراء | مدير الأقمشة | المدير العام |
|---------|---------|---------|--------------|--------------|
| **SELECT (المتاح)** | ✅ | ✅ | ✅ | ✅ |
| **SELECT (الكل)** | ❌ | ✅ | ✅ | ✅ |
| **INSERT** | ❌ | ✅ | ✅ | ✅ |
| **UPDATE** | ❌ | ✅ | ✅ | ✅ |
| **DELETE** | ❌ | ✅ | ✅ | ✅ |

### **Storage `product-images`:**

| العملية | الجميع | المدراء | مدير الأقمشة | المدير العام |
|---------|---------|---------|--------------|--------------|
| **SELECT** | ✅ | ✅ | ✅ | ✅ |
| **INSERT** | ❌ | ✅ | ✅ | ✅ |
| **UPDATE** | ❌ | ✅ | ✅ | ✅ |
| **DELETE** | ❌ | ✅ | ✅ | ✅ |

---

## 🔧 **استكشاف الأخطاء:**

### **المشكلة: لا يزال الخطأ "new row violates row-level security policy"**

**الحلول المحتملة:**

#### **1. تحقق من تطبيق Migration:**
```sql
-- تحقق من وجود الدالة
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'can_manage_fabrics';

-- يجب أن ترى: can_manage_fabrics
```

#### **2. تحقق من بيانات المستخدم:**
```sql
SELECT
  u.id,
  u.email,
  u.role,
  w.worker_type,
  u.is_active
FROM public.users u
LEFT JOIN public.workers w ON w.user_id = u.id
WHERE u.id = auth.uid();

-- تحقق من:
-- ✅ role = 'worker'
-- ✅ worker_type = 'fabric_store_manager'
-- ✅ is_active = true
```

#### **3. اختبر الدالة مباشرة:**
```sql
SELECT can_manage_fabrics();

-- يجب أن ترى: true
-- إذا كانت false، هناك مشكلة في البيانات
```

#### **4. تحقق من السياسات:**
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'fabrics'
AND policyname LIKE '%Managers%';

-- يجب أن ترى 4 سياسات:
-- - Managers can view all fabrics (SELECT)
-- - Managers can insert fabrics (INSERT)
-- - Managers can update fabrics (UPDATE)
-- - Managers can delete fabrics (DELETE)
```

### **المشكلة: التعديل لا يُحفظ (بدون خطأ)**

**الحلول:**

#### **1. تحقق من Console:**
افتح Developer Tools → Console وابحث عن:
```
✅ تم تحديث القماش بنجاح
```

إذا رأيت هذه الرسالة لكن البيانات لم تتغير، المشكلة في RLS.

#### **2. تحقق من الصلاحيات في Supabase:**
```sql
-- جرب التحديث مباشرة
UPDATE public.fabrics
SET name = 'اختبار'
WHERE id = 'FABRIC_ID_HERE';

-- إذا ظهر خطأ RLS، السياسات لم تُطبق بشكل صحيح
```

#### **3. أعد تطبيق Migration:**
- احذف السياسات القديمة يدوياً
- أعد تشغيل `fix_fabrics_rls_policies.sql`

### **المشكلة: خطأ في رفع الصورة**

**الحلول:**

#### **1. تحقق من Storage Policies:**
```sql
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
AND tablename = 'objects'
AND policyname LIKE '%images%';

-- يجب أن ترى:
-- - Public Access for Product Images (SELECT)
-- - Managers can upload images (INSERT)
-- - Managers can update images (UPDATE)
-- - Managers can delete images (DELETE)
```

#### **2. تحقق من Bucket:**
```sql
SELECT id, name, public
FROM storage.buckets
WHERE id = 'product-images';

-- يجب أن ترى:
-- id: product-images
-- name: product-images
-- public: true
```

#### **3. جرب رفع صورة من Supabase Dashboard:**
- اذهب إلى Storage → product-images
- جرب رفع صورة يدوياً
- إذا نجح، المشكلة في الكود
- إذا فشل، المشكلة في السياسات

---

## 📝 **الملفات المعدلة:**

| الملف | الوصف | الحالة |
|------|-------|--------|
| `supabase/migrations/fix_fabrics_rls_policies.sql` | Migration لإصلاح RLS | ✅ جاهز للتطبيق |
| `FABRICS_RLS_FIX_GUIDE.md` | دليل الإصلاح | ✅ مكتمل |

---

## ✅ **الخلاصة:**

### **ما تم إصلاحه:**
1. ✅ سياسات RLS لجدول `fabrics` - تسمح الآن لمدير الأقمشة
2. ✅ سياسات Storage للصور - تسمح الآن لمدير الأقمشة
3. ✅ دالة مساعدة `can_manage_fabrics()` للتحقق من الصلاحيات
4. ✅ دعم 3 أنواع من المستخدمين: admin, fabric_store_manager, general_manager

### **الخطوات التالية:**
1. ⏳ تطبيق Migration في Supabase Dashboard
2. ⏳ اختبار تعديل قماش موجود
3. ⏳ اختبار إضافة قماش جديد مع صورة
4. ⏳ التحقق من عدم وجود أخطاء RLS

### **النتيجة المتوقعة:**
- ✅ مدير الأقمشة يستطيع تعديل الأقمشة
- ✅ مدير الأقمشة يستطيع إضافة أقمشة جديدة
- ✅ مدير الأقمشة يستطيع رفع صور
- ✅ التعديلات تُحفظ فعلياً في قاعدة البيانات
- ✅ لا توجد أخطاء RLS

---

## 🎉 **جاهز للتطبيق!**

الآن يمكنك تطبيق Migration في Supabase وحل جميع مشاكل RLS للأقمشة.

**ملاحظة مهمة:** بعد تطبيق Migration، قد تحتاج إلى:
- تسجيل الخروج وإعادة تسجيل الدخول
- مسح Cache المتصفح
- إعادة تحميل الصفحة

---

## 📞 **الدعم:**

إذا واجهت أي مشاكل بعد تطبيق Migration:
1. تحقق من Console للأخطاء
2. تحقق من Supabase Logs
3. راجع قسم "استكشاف الأخطاء" أعلاه
4. تأكد من تطبيق Migration بشكل صحيح

