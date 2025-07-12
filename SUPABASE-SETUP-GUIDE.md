# دليل إعداد Supabase لموقع ياسمين الشام
# Supabase Setup Guide for Yasmin Alsham Website

## الخطوة 1: إعداد متغيرات البيئة

### 1. إنشاء ملف `.env.local`
قم بإنشاء ملف `.env.local` في مجلد المشروع الرئيسي وأضف المعلومات التالية:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 2. الحصول على بيانات الاتصال من Supabase
1. ادخل إلى [https://app.supabase.com/](https://app.supabase.com/)
2. اختر مشروعك
3. اذهب إلى **Project Settings** > **API**
4. انسخ:
   - **Project URL** (مثال: `https://abcdefghijklmnop.supabase.co`)
   - **anon public key** (مفتاح طويل يبدأ بـ `eyJ...`)

### 3. تحديث ملف `.env.local`
استبدل القيم في ملف `.env.local` بالقيم الحقيقية:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## الخطوة 2: إنشاء قاعدة البيانات

### 1. تنفيذ ملف SQL
1. اذهب إلى **SQL Editor** في لوحة تحكم Supabase
2. انسخ محتوى ملف `supabase-schema.sql`
3. اضغط **Run** لإنشاء جميع الجداول

### 2. التحقق من إنشاء الجداول
اذهب إلى **Table Editor** وتأكد من وجود الجداول التالية:
- `users`
- `workers`
- `products`
- `designs`
- `appointments`
- `orders`
- `favorites`
- `cart_items`
- `fabrics`
- `notifications`
- `system_settings`

## الخطوة 3: إعداد المصادقة (Authentication)

### 1. تفعيل المصادقة
1. اذهب إلى **Authentication** > **Settings**
2. فعّل **Enable email confirmations** إذا أردت
3. فعّل **Enable phone confirmations** إذا أردت

### 2. إعداد مزودي المصادقة
في **Authentication** > **Providers**:
- فعّل **Email** للمصادقة بالبريد الإلكتروني
- فعّل **Phone** للمصادقة بالهاتف (اختياري)

## الخطوة 4: إعداد RLS (Row Level Security)

### 1. التحقق من سياسات الأمان
تأكد من أن RLS مفعل على جميع الجداول وأن السياسات تعمل بشكل صحيح.

### 2. اختبار السياسات
يمكنك اختبار السياسات من خلال:
1. **Authentication** > **Users** - إنشاء مستخدم تجريبي
2. **SQL Editor** - اختبار الاستعلامات

## الخطوة 5: اختبار الاتصال

### 1. تشغيل الخادم
```bash
npm run dev
```

### 2. اختبار الاتصال
افتح المتصفح واذهب إلى `http://localhost:3000` أو `http://localhost:3001`

### 3. التحقق من الأخطاء
افتح **Developer Tools** > **Console** للتحقق من أي أخطاء في الاتصال.

## الخطوة 6: إضافة بيانات تجريبية

### 1. إضافة منتجات تجريبية
يمكنك إضافة منتجات تجريبية من خلال:
1. **Table Editor** > **products**
2. اضغط **Insert** وأضف منتج جديد

### 2. إضافة تصاميم تجريبية
1. **Table Editor** > **designs**
2. اضغط **Insert** وأضف تصميم جديد

### 3. إضافة عمال تجريبيين
1. **Table Editor** > **workers**
2. اضغط **Insert** وأضف عامل جديد

## الخطوة 7: ربط المكونات بقاعدة البيانات

### 1. تحديث المتاجر (Stores)
تم إنشاء ملف `src/lib/database.ts` مع جميع الخدمات المطلوبة.

### 2. استخدام الخدمات في المكونات
مثال على استخدام خدمة التصاميم:

```typescript
import { designService } from '@/lib/database'

// جلب جميع التصاميم
const { designs, error } = await designService.getAllDesigns()

// جلب تصميم واحد
const { design, error } = await designService.getDesign(1)
```

### 3. تحديث المتاجر الحالية
يمكنك تحديث المتاجر الموجودة لاستخدام قاعدة البيانات بدلاً من localStorage.

## الخطوة 8: إعداد الإشعارات (اختياري)

### 1. إعداد Webhooks
إذا أردت إشعارات فورية:
1. اذهب إلى **Database** > **Webhooks**
2. أنشئ webhook جديد للأحداث المهمة

### 2. إعداد Email Templates
في **Authentication** > **Email Templates**:
- خصص رسائل تأكيد البريد الإلكتروني
- خصص رسائل إعادة تعيين كلمة المرور

## الخطوة 9: المراقبة والتحسين

### 1. مراقبة الأداء
1. **Dashboard** > **Analytics** - مراقبة الاستعلامات
2. **Logs** - مراقبة الأخطاء

### 2. تحسين الأداء
1. **Database** > **Indexes** - إضافة فهارس إضافية
2. **Edge Functions** - إنشاء دوال للحسابات المعقدة

## استكشاف الأخطاء

### مشاكل شائعة:

#### 1. خطأ في الاتصال
```
Error: Invalid API key
```
**الحل:** تأكد من صحة `NEXT_PUBLIC_SUPABASE_ANON_KEY`

#### 2. خطأ في الجداول
```
Error: relation "table_name" does not exist
```
**الحل:** تأكد من تنفيذ ملف `supabase-schema.sql` بشكل صحيح

#### 3. خطأ في RLS
```
Error: new row violates row-level security policy
```
**الحل:** تأكد من إعداد سياسات RLS بشكل صحيح

#### 4. خطأ في المصادقة
```
Error: Invalid login credentials
```
**الحل:** تأكد من إعداد مزودي المصادقة

## روابط مفيدة

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
- [Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Database Functions](https://supabase.com/docs/guides/database/functions)

## الدعم

إذا واجهت أي مشاكل:
1. تحقق من **Logs** في لوحة تحكم Supabase
2. راجع **Console** في المتصفح
3. تأكد من صحة متغيرات البيئة
4. تحقق من إعدادات RLS والسياسات 