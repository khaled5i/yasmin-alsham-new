# 📦 المرحلة 1: تحويل جدول العمال إلى Supabase

## 📋 نظرة عامة

هذه هي المرحلة الأولى من خطة التحويل التدريجي لمشروع ياسمين الشام إلى Supabase.

في هذه المرحلة، سنقوم بتحويل:
- ✅ جدول المستخدمين (Users) - المطلوب للعمال
- ✅ جدول العمال (Workers)
- ✅ سياسات RLS للأمان
- ✅ خدمات Supabase للعمال
- ✅ تحديث واجهة المستخدم

---

## 📁 الملفات المتضمنة

### 1. ملفات SQL

| الملف | الوصف |
|------|-------|
| `01-workers-migration.sql` | ملف SQL الكامل لإنشاء الجداول والسياسات |

### 2. ملفات الخدمات

| الملف | الوصف |
|------|-------|
| `src/lib/supabase.ts` | تهيئة عميل Supabase |
| `src/lib/services/worker-service.ts` | خدمة العمال مع Supabase |
| `src/store/workerStore.ts` | مخزن Zustand للعمال |

### 3. ملفات التوثيق

| الملف | الوصف |
|------|-------|
| `01-workers-README.md` | هذا الملف |
| `01-workers-testing-guide.md` | دليل الاختبار التفصيلي |

---

## 🚀 خطوات التنفيذ

### الخطوة 1: تحديث متغيرات البيئة

تأكد من أن ملف `.env.local` يحتوي على:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### الخطوة 2: تنفيذ ملف SQL

1. افتح Supabase Dashboard
2. اذهب إلى SQL Editor
3. انسخ محتوى `01-workers-migration.sql`
4. الصقه ونفذه
5. تحقق من رسالة النجاح

### الخطوة 3: إنشاء مستخدم Admin

```sql
-- 1. أنشئ المستخدم عبر Authentication → Users في Dashboard
-- 2. ثم نفذ هذا الاستعلام (استبدل UUID):

INSERT INTO users (id, email, full_name, phone, role, is_active)
VALUES (
  'UUID-من-Supabase-Auth',
  'admin@yasminalsh.com',
  'مدير النظام',
  '+966500000000',
  'admin',
  true
);
```

### الخطوة 4: إنشاء عامل تجريبي

```sql
-- 1. أنشئ المستخدم عبر Authentication → Users
-- 2. ثم نفذ:

INSERT INTO users (id, email, full_name, phone, role, is_active)
VALUES (
  'UUID-من-Supabase-Auth',
  'fatima@yasminalsh.com',
  'فاطمة أحمد',
  '+966501234567',
  'worker',
  true
);

INSERT INTO workers (
  user_id, specialty, experience_years, hourly_rate,
  performance_rating, skills, bio, is_available
)
VALUES (
  'UUID-من-Supabase-Auth',
  'فساتين زفاف',
  8,
  50.00,
  4.8,
  ARRAY['خياطة يدوية', 'تطريز', 'تصميم'],
  'خياطة متخصصة في فساتين الزفاف',
  true
);
```

### الخطوة 5: اختبار التطبيق

```bash
npm run dev
```

ثم:
1. سجل الدخول كـ Admin
2. اذهب إلى صفحة العمال
3. جرب إضافة/تحديث/حذف عامل

---

## 🗄️ بنية قاعدة البيانات

### جدول users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT CHECK (role IN ('admin', 'worker', 'client')),
  is_active BOOLEAN DEFAULT true,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### جدول workers

```sql
CREATE TABLE workers (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  experience_years INTEGER DEFAULT 0,
  hourly_rate DECIMAL(10, 2),
  performance_rating DECIMAL(3, 2),
  total_completed_orders INTEGER DEFAULT 0,
  skills TEXT[],
  availability JSONB,
  bio TEXT,
  portfolio_images TEXT[],
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔒 سياسات RLS

### سياسات جدول users

- ✅ الجميع يمكنهم قراءة المستخدمين النشطين
- ✅ المستخدم يمكنه قراءة ملفه الشخصي
- ✅ Admin يمكنه قراءة/إنشاء/تحديث/حذف جميع المستخدمين
- ✅ المستخدم يمكنه تحديث ملفه (ما عدا الدور)

### سياسات جدول workers

- ✅ الجميع يمكنهم قراءة العمال المتاحين
- ✅ Admin يمكنه قراءة/إنشاء/تحديث/حذف جميع العمال
- ✅ Worker يمكنه قراءة وتحديث ملفه الشخصي

---

## 📊 الوظائف المتاحة

### في workerService

```typescript
// جلب جميع العمال
const { data, error } = await workerService.getAll()

// جلب عامل واحد
const { data, error } = await workerService.getById(workerId)

// جلب العمال المتاحين
const { data, error } = await workerService.getAvailable()

// إنشاء عامل جديد
const { data, error } = await workerService.create({
  email: 'worker@example.com',
  password: 'password123',
  full_name: 'اسم العامل',
  phone: '+966501234567',
  specialty: 'فساتين زفاف'
})

// تحديث عامل
const { data, error } = await workerService.update(workerId, {
  specialty: 'فساتين سهرة',
  hourly_rate: 60.00
})

// حذف عامل
const { success, error } = await workerService.delete(workerId)
```

### في useWorkerStore

```typescript
const { 
  workers,
  isLoading,
  error,
  loadWorkers,
  createWorker,
  updateWorker,
  deleteWorker
} = useWorkerStore()

// تحميل العمال
await loadWorkers()

// إنشاء عامل
await createWorker({
  email: 'worker@example.com',
  password: 'password123',
  full_name: 'اسم العامل',
  specialty: 'فساتين زفاف'
})
```

---

## 🧪 الاختبار

راجع ملف `01-workers-testing-guide.md` للحصول على دليل اختبار تفصيلي.

### اختبارات سريعة

```bash
# 1. تشغيل التطبيق
npm run dev

# 2. افتح المتصفح
http://localhost:3000

# 3. سجل الدخول كـ Admin
admin@yasminalsh.com

# 4. اذهب إلى صفحة العمال
/dashboard/workers

# 5. جرب:
- إضافة عامل جديد
- تحديث عامل موجود
- حذف عامل
```

---

## ✅ قائمة التحقق

- [ ] تم تثبيت `@supabase/supabase-js`
- [ ] تم تحديث `.env.local` بالقيم الصحيحة
- [ ] تم إنشاء `src/lib/supabase.ts`
- [ ] تم تنفيذ `01-workers-migration.sql`
- [ ] تم إنشاء جدولي users و workers
- [ ] تم إنشاء مستخدم Admin
- [ ] تم إنشاء عامل تجريبي واحد على الأقل
- [ ] تم إنشاء `src/lib/services/worker-service.ts`
- [ ] تم إنشاء `src/store/workerStore.ts`
- [ ] تم اختبار إضافة عامل من التطبيق
- [ ] تم اختبار تحديث عامل
- [ ] تم اختبار حذف عامل
- [ ] RLS Policies تعمل بشكل صحيح
- [ ] Fallback يعمل عند تعطيل Supabase

---

## 🐛 حل المشاكل

### المشكلة: "Supabase is not configured"

**الحل:**
1. تحقق من ملف `.env.local`
2. تأكد من صحة URL و ANON_KEY
3. أعد تشغيل التطبيق

### المشكلة: "RLS policy violation"

**الحل:**
1. تأكد من تسجيل الدخول كـ Admin
2. تحقق من تنفيذ سياسات RLS بشكل صحيح
3. راجع ملف SQL

### المشكلة: البيانات لا تظهر

**الحل:**
1. افتح Console في المتصفح
2. ابحث عن أخطاء
3. تحقق من اتصال Supabase
4. جرب Fallback mode

---

## 📈 الخطوة التالية

بعد التأكد من نجاح هذه المرحلة:

**توقف واسأل المستخدم:**

> ✅ **هل تم تخزين العمال بنجاح في Supabase؟**
> 
> يرجى التحقق من:
> - [ ] يمكنك رؤية العمال في صفحة Dashboard
> - [ ] يمكنك إضافة عامل جديد
> - [ ] يمكنك تحديث بيانات عامل
> - [ ] يمكنك حذف عامل
> - [ ] البيانات محفوظة في Supabase (تحقق من Dashboard)
> 
> **هل تريد المتابعة إلى المرحلة التالية (المواعيد)؟**

---

**تاريخ الإنشاء:** 2025-10-25  
**الحالة:** جاهز للتنفيذ  
**المرحلة:** 1 من 8

