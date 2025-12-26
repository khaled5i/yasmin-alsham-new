# تعليمات تطبيق التحديث على قاعدة البيانات

## المشكلة
لا يمكن حذف الفئات الافتراضية في قسم الأقمشة بسبب سياسة RLS في قاعدة البيانات.

## الحل
تم إنشاء ملف migration جديد لتحديث سياسة RLS للسماح بحذف جميع الفئات.

## خطوات التطبيق

### الطريقة 1: استخدام Supabase CLI (الموصى بها)

1. تأكد من تثبيت Supabase CLI:
```bash
npm install -g supabase
```

2. قم بتسجيل الدخول إلى Supabase:
```bash
supabase login
```

3. ربط المشروع المحلي بمشروع Supabase:
```bash
supabase link --project-ref YOUR_PROJECT_REF
```

4. تطبيق الـ migration:
```bash
supabase db push
```

### الطريقة 2: تطبيق يدوي عبر Supabase Dashboard

1. افتح Supabase Dashboard: https://app.supabase.com
2. اختر مشروعك
3. اذهب إلى **SQL Editor**
4. انسخ محتوى الملف `supabase/migrations/08-allow-delete-default-categories.sql`
5. الصق المحتوى في SQL Editor
6. اضغط على **Run** لتنفيذ الأمر

### الطريقة 3: تطبيق مباشر عبر SQL

قم بتنفيذ الأوامر التالية في SQL Editor:

```sql
-- حذف السياسة القديمة
DROP POLICY IF EXISTS "Admins and managers can delete non-default categories" ON accounting_categories;

-- إنشاء سياسة جديدة
CREATE POLICY "Admins and managers can delete all categories"
  ON accounting_categories
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
        OR (u.role = 'worker' AND w.worker_type = 'accountant')
      )
    )
  );
```

## التحقق من التطبيق

بعد تطبيق الـ migration، يمكنك التحقق من نجاح العملية:

1. اذهب إلى **Database** → **Policies** في Supabase Dashboard
2. ابحث عن جدول `accounting_categories`
3. تأكد من وجود سياسة باسم `"Admins and managers can delete all categories"`
4. تأكد من عدم وجود شرط `is_default = false` في السياسة

## ملاحظات مهمة

- ⚠️ **تحذير**: بعد تطبيق هذا التحديث، سيتمكن المدراء من حذف الفئات الافتراضية
- ✅ الواجهة (UI) تعرض رسالة تحذير عند محاولة حذف فئة افتراضية
- ✅ تم إضافة المحاسب (accountant) إلى قائمة المستخدمين المسموح لهم بحذف الفئات
- 💡 يمكنك التراجع عن هذا التحديث بإعادة تطبيق السياسة القديمة

## التراجع عن التحديث (Rollback)

إذا أردت التراجع عن هذا التحديث وإعادة الحماية للفئات الافتراضية:

```sql
DROP POLICY IF EXISTS "Admins and managers can delete all categories" ON accounting_categories;

CREATE POLICY "Admins and managers can delete non-default categories"
  ON accounting_categories
  FOR DELETE
  TO authenticated
  USING (
    is_default = false
    AND auth.uid() IN (
      SELECT u.id FROM public.users u
      LEFT JOIN public.workers w ON w.user_id = u.id
      WHERE u.is_active = true
      AND (
        u.role = 'admin'
        OR (u.role = 'worker' AND w.worker_type = 'fabric_store_manager')
        OR (u.role = 'worker' AND w.worker_type = 'general_manager')
      )
    )
  );
```

