# 🔧 دليل إصلاح مشكلة تحديث بيانات العامل

## 📋 ملخص المشكلة والحل

تم تشخيص وإصلاح مشكلة عدم حفظ تعديلات بيانات العامل في قاعدة البيانات.

### ✅ المشكلة: تحديث بيانات العامل لا يُحفظ
**الحالة:** تم الإصلاح ✅

---

## 🐛 المشكلة

### الأعراض:
- ✅ تعديل كلمة المرور يعمل بشكل صحيح
- ❌ تعديل الحقول الأخرى (الاسم، البريد الإلكتروني، الهاتف، التخصص) لا يُحفظ
- تظهر رسالة "تم التحديث بنجاح" لكن البيانات لا تتغير
- عند إعادة تحميل الصفحة، تظهر البيانات القديمة

### السبب الجذري:

**في `src/app/dashboard/workers/page.tsx` (دالة `handleSaveWorker`):**

<augment_code_snippet path="src/app/dashboard/workers/page.tsx" mode="EXCERPT">
```typescript
// ❌ المشكلة: لا يتم إرسال full_name, phone, email
const updates: any = {
  specialty: editingWorker.specialty,
  is_available: editingWorker.is_available ?? true
}

// فقط الحقول الاختيارية
if (editingWorker.hourly_rate) updates.hourly_rate = editingWorker.hourly_rate
if (editingWorker.bio) updates.bio = editingWorker.bio
if (editingWorker.experience_years) updates.experience_years = editingWorker.experience_years

// ❌ لا يتم إرسال full_name, phone إلى دالة التحديث
const result = await updateWorkerSupabase(editingWorker.id, updates)
```
</augment_code_snippet>

**ماذا كان يحدث:**
1. المستخدم يعدل الاسم الكامل أو رقم الهاتف في النموذج ✅
2. لكن هذه الحقول **لا تُضاف إلى كائن `updates`** ❌
3. يتم إرسال فقط `specialty` و `is_available` إلى دالة التحديث
4. دالة `update` في `worker-service.ts` لا تتلقى `full_name` أو `phone`
5. لذلك لا يتم تحديث جدول `users` في Supabase
6. النتيجة: البيانات لا تُحفظ ❌

---

## ✅ الحل

### 1. إصلاح `handleSaveWorker` في `src/app/dashboard/workers/page.tsx`:

**قبل الإصلاح:**
```typescript
const updates: any = {
  specialty: editingWorker.specialty,
  is_available: editingWorker.is_available ?? true
}

if (editingWorker.hourly_rate) updates.hourly_rate = editingWorker.hourly_rate
if (editingWorker.bio) updates.bio = editingWorker.bio
if (editingWorker.experience_years) updates.experience_years = editingWorker.experience_years
```

**بعد الإصلاح:**
```typescript
const updates: any = {
  // حقول جدول workers
  specialty: editingWorker.specialty,
  is_available: editingWorker.is_available ?? true,
  
  // ✅ حقول جدول users (تم إضافتها)
  full_name: editingWorker.full_name,
  phone: editingWorker.phone
}

// إضافة الحقول الاختيارية
if (editingWorker.hourly_rate !== undefined) updates.hourly_rate = editingWorker.hourly_rate
if (editingWorker.bio) updates.bio = editingWorker.bio
if (editingWorker.experience_years !== undefined) updates.experience_years = editingWorker.experience_years

console.log('📝 Updating worker with data:', updates)
```

### 2. تحديث `UpdateWorkerData` Interface في `src/lib/services/worker-service.ts`:

**قبل الإصلاح:**
```typescript
export interface UpdateWorkerData {
  full_name?: string
  phone?: string
  specialty?: string
  // ... باقي الحقول
}
```

**بعد الإصلاح:**
```typescript
export interface UpdateWorkerData {
  full_name?: string
  email?: string      // ✅ تم إضافة دعم تحديث البريد الإلكتروني
  phone?: string
  specialty?: string
  // ... باقي الحقول
}
```

### 3. تحسين دالة `update` في `src/lib/services/worker-service.ts`:

**التحسينات:**
- ✅ إضافة رسائل console تفصيلية لتتبع عملية التحديث
- ✅ تحديث جدول `users` أولاً (full_name, email, phone)
- ✅ ثم تحديث جدول `workers` (specialty, experience_years, إلخ)
- ✅ معالجة الأخطاء بشكل أفضل
- ✅ التحقق من وجود القيم قبل التحديث (`!== undefined`)

**الكود الجديد:**
```typescript
async update(workerId: string, updates: UpdateWorkerData) {
  // 1. الحصول على worker لمعرفة user_id
  const { data: currentWorker } = await supabase
    .from('workers')
    .select('user_id')
    .eq('id', workerId)
    .single()

  // 2. تحديث بيانات المستخدم في جدول users
  if (updates.full_name || updates.email || updates.phone) {
    const userUpdates: any = {}
    if (updates.full_name) userUpdates.full_name = updates.full_name
    if (updates.email) userUpdates.email = updates.email
    if (updates.phone) userUpdates.phone = updates.phone

    await supabase
      .from('users')
      .update(userUpdates)
      .eq('id', currentWorker.user_id)
  }

  // 3. تحديث بيانات العامل في جدول workers
  const workerUpdates: any = {}
  if (updates.specialty !== undefined) workerUpdates.specialty = updates.specialty
  if (updates.experience_years !== undefined) workerUpdates.experience_years = updates.experience_years
  // ... باقي الحقول

  const { data: workerData } = await supabase
    .from('workers')
    .update(workerUpdates)
    .eq('id', workerId)
    .select(`*, user:users(*)`)
    .single()

  return { data: workerData, error: null }
}
```

---

## 📊 الحقول التي تم إصلاحها

| الحقل | الجدول | الحالة قبل | الحالة بعد |
|------|--------|-----------|-----------|
| **الاسم الكامل** (full_name) | `users` | ❌ لا يُحفظ | ✅ يُحفظ |
| **البريد الإلكتروني** (email) | `users` | ❌ غير مدعوم | ✅ مدعوم |
| **رقم الهاتف** (phone) | `users` | ❌ لا يُحفظ | ✅ يُحفظ |
| **التخصص** (specialty) | `workers` | ✅ يُحفظ | ✅ يُحفظ |
| **سنوات الخبرة** (experience_years) | `workers` | ✅ يُحفظ | ✅ يُحفظ |
| **الأجر بالساعة** (hourly_rate) | `workers` | ✅ يُحفظ | ✅ يُحفظ |
| **الحالة** (is_available) | `workers` | ✅ يُحفظ | ✅ يُحفظ |
| **السيرة الذاتية** (bio) | `workers` | ✅ يُحفظ | ✅ يُحفظ |

---

## 🚀 خطوات الاختبار

### الخطوة 1️⃣: اختبار تحديث الاسم الكامل

1. افتح صفحة العمال: http://localhost:3001/dashboard/workers

2. اضغط على زر "تعديل" لأي عامل

3. غيّر **الاسم الكامل** (مثلاً: من "أحمد محمد" إلى "أحمد علي")

4. اضغط "حفظ"

5. **يجب أن ترى رسالة "تم التحديث بنجاح"** ✅

6. أعد فتح نافذة التعديل

7. **يجب أن ترى الاسم الجديد** ✅

8. أعد تحميل الصفحة (F5)

9. **يجب أن ترى الاسم الجديد في قائمة العمال** ✅

### الخطوة 2️⃣: اختبار تحديث رقم الهاتف

1. افتح نافذة تعديل عامل

2. غيّر **رقم الهاتف** (مثلاً: من "0123456789" إلى "0987654321")

3. اضغط "حفظ"

4. **يجب أن يُحفظ الرقم الجديد** ✅

5. تحقق من Supabase Dashboard → Table Editor → users

6. **يجب أن ترى رقم الهاتف الجديد** ✅

### الخطوة 3️⃣: اختبار تحديث التخصص

1. افتح نافذة تعديل عامل

2. غيّر **التخصص** (مثلاً: من "خياطة" إلى "تطريز")

3. اضغط "حفظ"

4. **يجب أن يُحفظ التخصص الجديد** ✅

5. تحقق من Supabase Dashboard → Table Editor → workers

6. **يجب أن ترى التخصص الجديد** ✅

### الخطوة 4️⃣: اختبار تحديث عدة حقول معاً

1. افتح نافذة تعديل عامل

2. غيّر:
   - الاسم الكامل
   - رقم الهاتف
   - التخصص
   - سنوات الخبرة
   - الأجر بالساعة

3. اضغط "حفظ"

4. **يجب أن تُحفظ جميع التغييرات** ✅

5. أعد فتح نافذة التعديل

6. **يجب أن ترى جميع التغييرات** ✅

---

## 🔍 رسائل Console المتوقعة

### عند تحديث عامل:

افتح Console (F12) وابحث عن هذه الرسائل:

```
📝 Updating worker with data: {
  specialty: "تطريز",
  is_available: true,
  full_name: "أحمد علي",
  phone: "0987654321",
  hourly_rate: 50,
  experience_years: 5
}

🔄 Updating worker: abc123... with updates: {...}
👤 Updating user table: { full_name: "أحمد علي", phone: "0987654321" }
✅ User table updated
👷 Updating workers table: { specialty: "تطريز", hourly_rate: 50, ... }
✅ Workers table updated
✅ Worker updated successfully
```

### لا يجب أن ترى:

```
❌ Error updating worker
❌ Error updating users table
❌ Error updating workers table
❌ Cannot coerce the result to a single JSON object
```

---

## 📁 الملفات المعدلة

### 1. `src/app/dashboard/workers/page.tsx`
**التغييرات:**
- إضافة `full_name` و `phone` إلى كائن `updates`
- تحسين شرط الحقول الاختيارية (`!== undefined`)
- إضافة رسالة console لتتبع البيانات المرسلة

### 2. `src/lib/services/worker-service.ts`
**التغييرات:**
- إضافة `email` إلى `UpdateWorkerData` interface
- إعادة كتابة دالة `update` بالكامل:
  - الحصول على `user_id` أولاً
  - تحديث جدول `users` (full_name, email, phone)
  - تحديث جدول `workers` (specialty, experience_years, إلخ)
  - إضافة رسائل console تفصيلية
  - معالجة أخطاء أفضل

---

## ⚠️ ملاحظات مهمة

### 1. تحديث البريد الإلكتروني

**الآن مدعوم:**
```typescript
const updates = {
  email: 'newemail@example.com'
}
await updateWorker(workerId, updates)
```

**لكن:**
- تحديث البريد الإلكتروني في جدول `users` فقط ✅
- **لا يتم تحديثه في Supabase Auth** ❌
- لتحديثه في Auth، يجب استخدام `supabase.auth.admin.updateUserById()`
- هذا يتطلب Service Role Key (API Route)

### 2. سياسات RLS

**السياسات الحالية تسمح بالتحديث:**
```sql
-- Admin يمكنه تحديث أي مستخدم
CREATE POLICY "Admins can update users"
ON users FOR UPDATE
USING (is_admin());

-- Admin يمكنه تحديث أي عامل
CREATE POLICY "Admins can update workers"
ON workers FOR UPDATE
USING (is_admin());
```

**إذا واجهت مشاكل:**
- تحقق من أنك مسجل دخول كـ Admin
- تحقق من أن `role` في جدول `users` هو `'admin'`

### 3. الحقول الاختيارية

**استخدام `!== undefined` بدلاً من truthy check:**
```typescript
// ❌ خطأ: إذا كانت القيمة 0، لن يتم تحديثها
if (updates.hourly_rate) workerUpdates.hourly_rate = updates.hourly_rate

// ✅ صحيح: يتم تحديثها حتى لو كانت 0
if (updates.hourly_rate !== undefined) workerUpdates.hourly_rate = updates.hourly_rate
```

---

## 🎯 الخطوات التالية

بعد تطبيق الإصلاحات:

1. ✅ أعد تشغيل خادم التطوير (إذا لزم الأمر)
2. ✅ افتح صفحة العمال
3. ✅ اختبر تحديث الاسم الكامل
4. ✅ اختبر تحديث رقم الهاتف
5. ✅ اختبر تحديث التخصص
6. ✅ اختبر تحديث عدة حقول معاً
7. ✅ تحقق من Console (F12) للرسائل
8. ✅ تحقق من Supabase Dashboard (Table Editor)
9. ✅ أخبرني بالنتيجة!

---

## 📞 إذا واجهت مشاكل

### المشكلة: لا تزال البيانات لا تُحفظ

**الحل:**
1. افتح Console (F12)
2. ابحث عن رسائل الخطأ
3. تحقق من أن رسالة `📝 Updating worker with data:` تحتوي على جميع الحقول
4. تحقق من سياسات RLS في Supabase

### المشكلة: خطأ "Cannot coerce to single JSON object"

**الحل:**
1. تحقق من أنك مسجل دخول كـ Admin
2. تحقق من أن Service Role Key موجود في `.env.local`
3. أعد تشغيل خادم التطوير

### المشكلة: بعض الحقول تُحفظ وبعضها لا

**الحل:**
1. افتح Console (F12)
2. ابحث عن رسالة `👤 Updating user table:` و `👷 Updating workers table:`
3. تحقق من أن الحقول موجودة في الكائنات المرسلة
4. تحقق من أن الحقول موجودة في `editingWorker` state

---

**تاريخ الإنشاء:** 2025-10-31  
**الحالة:** ✅ جاهز للاختبار  
**الأولوية:** عالية 🔴  
**الوقت المتوقع للاختبار:** 5 دقائق ⏱️

