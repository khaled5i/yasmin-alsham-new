# تطبيق إصلاح الفئات المحاسبية

## المشكلة
- صفحات إدارة الفئات لا تعمل (لا تظهر الفئات ولا يمكن إضافة فئات جديدة)
- سياسات RLS لا تسمح للمحاسبين بإضافة أو تعديل الفئات
- لا توجد فئات افتراضية لقسم الجاهز (ready_designs)

## الحل
يجب تطبيق الملف: `supabase/migrations/09-fix-categories-rls-and-add-ready-designs.sql`

## خطوات التطبيق اليدوي

### الطريقة 1: من خلال Supabase Dashboard (موصى بها)

1. **افتح Supabase Dashboard**
   - اذهب إلى: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new
   - استبدل `YOUR_PROJECT_ID` برقم مشروعك

2. **انسخ محتوى الملف**
   - افتح الملف: `supabase/migrations/09-fix-categories-rls-and-add-ready-designs.sql`
   - انسخ كامل محتوى الملف

3. **الصق في SQL Editor**
   - الصق المحتوى في محرر SQL في لوحة التحكم
   - انقر على زر "Run" أو اضغط Ctrl+Enter

4. **تحقق من النجاح**
   - يجب أن تظهر رسالة "Success" باللون الأخضر
   - تحقق من أن الفئات تم إضافتها بنجاح

### الطريقة 2: باستخدام psql (للمتقدمين)

```bash
# استبدل القيم بقيمك الخاصة
psql "postgresql://postgres:[PASSWORD]@[PROJECT_REF].supabase.co:5432/postgres" -f supabase/migrations/09-fix-categories-rls-and-add-ready-designs.sql
```

## ما يفعله الـ Migration

### 1. تحديث سياسات RLS (Row Level Security)
- ✅ يضيف `accountant` إلى قائمة الأدوار المسموح لها بإضافة وتعديل وحذف الفئات
- ✅ يسمح بحذف جميع الفئات (حتى الافتراضية) للمدراء والمحاسبين

### 2. إضافة فئات افتراضية لقسم الجاهز (ready_designs)

#### المبيعات (8 فئات):
- فساتين سهرة
- فساتين كاجوال
- فساتين زفاف
- فساتين حفلات
- عباءات
- بيع جملة
- بيع تجزئة
- أخرى

#### المشتريات (8 فئات):
- فساتين سهرة
- فساتين كاجوال
- فساتين زفاف
- فساتين حفلات
- عباءات
- إكسسوارات
- مواد التغليف
- أخرى

#### المصاريف الثابتة (10 فئات):
- إيجار المحل
- الكهرباء
- المياه
- الإنترنت
- الهاتف
- التأمين
- الصيانة
- النظافة
- الأمن
- أخرى

#### الرواتب (6 فئات):
- راتب شهري
- أجر يومي
- عمل إضافي
- مكافأة
- عمولة
- خصم

### 3. إضافة فئات افتراضية لقسم التفصيل (tailoring)
- يضيف الفئات الأساسية لقسم التفصيل في حال لم تكن موجودة

## التحقق من نجاح التطبيق

بعد تطبيق الـ migration، قم بما يلي:

1. **أعد تشغيل السيرفر**
   ```bash
   # أوقف السيرفر (Ctrl+C) ثم
   npm run dev
   ```

2. **اختبر صفحة إدارة الفئات**
   - اذهب إلى: `/dashboard/accounting/fabrics/categories`
   - يجب أن ترى الفئات الافتراضية للأقمشة
   - جرب إضافة فئة جديدة

3. **اختبر صفحة إدارة فئات الجاهز**
   - اذهب إلى: `/dashboard/accounting/ready-designs/categories`
   - يجب أن ترى الفئات الافتراضية للجاهز
   - جرب إضافة فئة جديدة

4. **اختبر صفحات المبيعات**
   - اذهب إلى: `/dashboard/accounting/fabrics/income`
   - يجب أن ترى قائمة الفئات في نموذج إضافة مبيعة جديدة
   - اذهب إلى: `/dashboard/accounting/ready-designs/income`
   - يجب أن ترى قائمة الفئات للجاهز

## استكشاف الأخطاء

### خطأ: "permission denied for table accounting_categories"
- **الحل**: تأكد أنك مسجل دخول كـ Admin أو Accountant
- تحقق من أن الـ migration تم تطبيقه بنجاح

### خطأ: "no category options available"
- **السبب**: الـ migration لم يتم تطبيقه أو فشل
- **الحل**: أعد تطبيق الـ migration من خلال SQL Editor

### الفئات لا تظهر بعد التطبيق
- **الحل**:
  1. امسح الـ cache من المتصفح (Ctrl+Shift+R)
  2. أعد تشغيل السيرفر
  3. تحقق من Console في المتصفح من وجود أخطاء

### خطأ: "duplicate key value violates unique constraint"
- **السبب**: الفئات موجودة مسبقاً
- **الحل**: هذا عادي، الـ migration يستخدم `ON CONFLICT DO NOTHING`

## ملاحظات مهمة

- ⚠️ هذا الـ migration آمن ويستخدم `ON CONFLICT DO NOTHING` لتجنب الأخطاء
- ⚠️ لن يؤثر على البيانات الموجودة مسبقاً
- ✅ يمكن تشغيله عدة مرات دون مشاكل
- ✅ يعمل مع جميع الفروع: fabrics, ready_designs, tailoring

## الدعم

إذا واجهت أي مشاكل:
1. تحقق من Console في المتصفح
2. تحقق من Network tab في Developer Tools
3. تحقق من أن User الحالي لديه دور Admin أو Accountant
