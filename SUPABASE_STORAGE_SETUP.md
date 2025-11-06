# إعداد Supabase Storage لصور المنتجات

## نظرة عامة

هذا الدليل يشرح كيفية إعداد Supabase Storage لتخزين صور المنتجات في متجر الفساتين الجاهزة.

---

## الخطوات

### 1. إنشاء Storage Bucket

#### الطريقة الأولى: عبر SQL Editor (موصى بها)

1. افتح **Supabase Dashboard**
2. اذهب إلى **SQL Editor**
3. انسخ والصق محتوى ملف `migrations/05-storage-setup.sql`
4. اضغط **Run** أو **F5**
5. يجب أن ترى رسالة نجاح

#### الطريقة الثانية: عبر واجهة Storage

1. افتح **Supabase Dashboard**
2. اذهب إلى **Storage**
3. اضغط **Create a new bucket**
4. املأ البيانات:
   - **Name:** `product-images`
   - **Public bucket:** ✅ نعم
   - **File size limit:** `5242880` (5MB)
   - **Allowed MIME types:** `image/jpeg, image/jpg, image/png, image/webp`
5. اضغط **Create bucket**

### 2. إعداد Storage Policies (RLS)

إذا استخدمت الطريقة الأولى (SQL Editor)، فإن Policies تم إنشاؤها تلقائياً.

إذا استخدمت الطريقة الثانية، قم بإنشاء Policies يدوياً:

#### Policy 1: Public Read Access

```sql
CREATE POLICY "Public Access for Product Images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');
```

#### Policy 2: Admin Upload

```sql
CREATE POLICY "Admin Upload Product Images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  )
);
```

#### Policy 3: Admin Update

```sql
CREATE POLICY "Admin Update Product Images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  )
);
```

#### Policy 4: Admin Delete

```sql
CREATE POLICY "Admin Delete Product Images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IN (
    SELECT id FROM public.users WHERE role = 'admin'
  )
);
```

### 3. التحقق من الإعداد

#### التحقق من Bucket

```sql
SELECT * FROM storage.buckets WHERE id = 'product-images';
```

**النتيجة المتوقعة:**
```
id              | name            | public | file_size_limit | allowed_mime_types
----------------|-----------------|--------|-----------------|--------------------
product-images  | product-images  | true   | 5242880         | {image/jpeg, ...}
```

#### التحقق من Policies

```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'objects' 
  AND policyname LIKE '%Product Images%';
```

**النتيجة المتوقعة:**
يجب أن ترى 4 policies:
- Public Access for Product Images (SELECT)
- Admin Upload Product Images (INSERT)
- Admin Update Product Images (UPDATE)
- Admin Delete Product Images (DELETE)

### 4. اختبار رفع الصور

#### من لوحة التحكم

1. افتح التطبيق: `http://localhost:3000`
2. سجل دخول كمدير
3. اذهب إلى `/dashboard/ready-designs`
4. اضغط **إضافة فستان جديد**
5. ارفع صورة (JPG, PNG, أو WEBP)
6. راقب Progress Bar
7. يجب أن ترى:
   - شريط تقدم يتحرك من 0% إلى 100%
   - رسالة "جاري الضغط..." ثم "جاري الرفع..." ثم "تم بنجاح"
   - أيقونة ✓ خضراء عند النجاح

#### من Supabase Dashboard

1. افتح **Supabase Dashboard**
2. اذهب إلى **Storage** → **product-images**
3. يجب أن ترى مجلدين:
   - `products/` (الصور الأساسية)
   - `products/thumbnails/` (الصور المصغرة)
4. افتح `products/` → يجب أن ترى الصورة المرفوعة
5. افتح `products/thumbnails/` → يجب أن ترى thumbnail بنفس الاسم

### 5. اختبار الحذف

1. في لوحة التحكم، احذف منتج يحتوي على صور
2. تحقق من حذف الصور من Storage
3. افتح Supabase Storage → يجب أن تكون الصور محذوفة

---

## البنية المتوقعة

```
product-images/
  ├── products/
  │   ├── 1730419200000-abc123.jpg      (الصورة الأساسية)
  │   ├── 1730419201000-def456.png
  │   └── 1730419202000-ghi789.webp
  └── products/thumbnails/
      ├── thumb_1730419200000-abc123.jpg (الصورة المصغرة 300x400)
      ├── thumb_1730419201000-def456.png
      └── thumb_1730419202000-ghi789.webp
```

---

## استكشاف الأخطاء

### خطأ: "Bucket not found"

**السبب:** Bucket غير موجود أو الاسم خاطئ

**الحل:**
1. تحقق من وجود Bucket في Storage
2. تحقق من أن الاسم `product-images` (بدون مسافات)
3. أعد تشغيل SQL من `migrations/05-storage-setup.sql`

### خطأ: "Permission denied"

**السبب:** RLS policies غير صحيحة أو المستخدم ليس admin

**الحل:**
1. تحقق من أن المستخدم الحالي لديه `role = 'admin'` في جدول `users`
2. تحقق من وجود جميع الـ 4 policies
3. أعد تشغيل SQL من `migrations/05-storage-setup.sql`

### خطأ: "File too large"

**السبب:** حجم الملف أكبر من 5MB

**الحل:**
1. ضغط الصورة قبل الرفع
2. أو زيادة `file_size_limit` في Bucket settings

### خطأ: "Invalid file type"

**السبب:** نوع الملف غير مدعوم

**الحل:**
1. استخدم JPG, PNG, أو WEBP فقط
2. أو إضافة أنواع أخرى في `allowed_mime_types`

### الصور لا تظهر في الموقع

**السبب:** Bucket ليس public أو URLs خاطئة

**الحل:**
1. تحقق من أن Bucket public: `SELECT public FROM storage.buckets WHERE id = 'product-images'` → يجب أن يكون `true`
2. تحقق من URLs في جدول `products` → يجب أن تبدأ بـ `https://...supabase.co/storage/v1/object/public/product-images/...`
3. افتح URL في المتصفح → يجب أن تظهر الصورة

---

## الميزات

✅ **ضغط تلقائي:**
- الصور الأساسية: max width 1920px, quality 80%
- Thumbnails: 300x400px, quality 80%

✅ **Progress Tracking:**
- شريط تقدم لكل صورة
- حالات: compressing, uploading, success, error
- نسبة الإنجاز (0-100%)

✅ **التحقق من الملفات:**
- نوع الملف: JPG, PNG, WEBP فقط
- حجم الملف: max 5MB
- رسائل خطأ واضحة

✅ **الأمان:**
- RLS policies: المدراء فقط يمكنهم الرفع/التعديل/الحذف
- الجميع يمكنهم القراءة (public access)

---

## الملفات ذات الصلة

- `migrations/05-storage-setup.sql` - SQL لإنشاء Bucket و Policies
- `src/lib/services/image-service.ts` - خدمة رفع الصور
- `src/components/ImageUpload.tsx` - مكون رفع الصور
- `STORE_MIGRATION_GUIDE.md` - دليل شامل للترحيل

---

**تاريخ الإنشاء:** 2025-11-01  
**الحالة:** ✅ جاهز للاستخدام

