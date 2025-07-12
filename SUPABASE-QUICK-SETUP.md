# إعداد Supabase السريع - Supabase Quick Setup

## 🚀 الإعداد السريع (5 دقائق)

### الخطوة 1: إنشاء مشروع Supabase

1. **اذهب إلى:** https://app.supabase.com/
2. **اضغط:** "New Project"
3. **اختر:** Organization (أو أنشئ واحدة جديدة)
4. **املأ البيانات:**
   - Project name: `yasmin-alsham`
   - Database password: (اختر كلمة مرور قوية)
   - Region: `Central EU (Frankfurt)` (الأقرب للشرق الأوسط)
5. **اضغط:** "Create new project"
6. **انتظر:** 2-3 دقائق حتى يكتمل الإعداد

### الخطوة 2: الحصول على بيانات الاتصال

1. **في لوحة التحكم:** اذهب إلى **Settings** > **API**
2. **انسخ القيم التالية:**
   - **Project URL** (مثال: `https://abcdefghijklmnop.supabase.co`)
   - **anon public** key (مفتاح طويل يبدأ بـ `eyJ...`)

### الخطوة 3: تحديث ملف .env.local

1. **افتح ملف:** `.env.local` في مجلد المشروع
2. **استبدل القيم:**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

### الخطوة 4: إنشاء قاعدة البيانات

1. **في لوحة التحكم:** اذهب إلى **SQL Editor**
2. **انسخ محتوى ملف:** `supabase-schema.sql`
3. **الصق في SQL Editor**
4. **اضغط:** "Run" أو `Ctrl+Enter`
5. **تأكد من ظهور:** "Success. No rows returned"

### الخطوة 5: إعداد المصادقة (اختياري)

1. **اذهب إلى:** **Authentication** > **Settings**
2. **فعّل:** "Enable email confirmations" (إذا أردت)
3. **في:** **Authentication** > **Providers**
4. **تأكد من تفعيل:** Email provider

### الخطوة 6: اختبار الاتصال

1. **أعد تشغيل الخادم:**
   ```bash
   npm run dev
   ```
2. **افتح المتصفح:** http://localhost:3001
3. **تحقق من اختفاء:** رسالة التحذير الصفراء
4. **افتح Developer Tools:** للتأكد من عدم وجود أخطاء

## ✅ علامات نجاح الإعداد

- ✅ اختفاء رسالة التحذير الصفراء من الموقع
- ✅ عدم وجود أخطاء في Console
- ✅ ظهور رسالة "Supabase Connected" (إذا كانت مفعلة)
- ✅ إمكانية تصفح الموقع بدون أخطاء

## 🔧 استكشاف الأخطاء

### خطأ: "Invalid API key"
**الحل:** تأكد من نسخ `anon public key` وليس `service_role key`

### خطأ: "relation does not exist"
**الحل:** تأكد من تنفيذ ملف `supabase-schema.sql` بالكامل

### خطأ: "supabaseUrl is required"
**الحل:** تأكد من حفظ ملف `.env.local` وإعادة تشغيل الخادم

### الموقع لا يزال يظهر رسالة تحذير
**الحل:** 
1. تأكد من حفظ ملف `.env.local`
2. أعد تشغيل الخادم (`Ctrl+C` ثم `npm run dev`)
3. امسح cache المتصفح (`Ctrl+F5`)

## 📋 قائمة التحقق السريعة

- [ ] تم إنشاء مشروع Supabase
- [ ] تم نسخ Project URL و anon key
- [ ] تم تحديث ملف .env.local
- [ ] تم تنفيذ supabase-schema.sql
- [ ] تم إعادة تشغيل الخادم
- [ ] اختفت رسائل الخطأ

## 🎯 الخطوات التالية

بعد إكمال الإعداد:

1. **إضافة بيانات تجريبية:** استخدم Table Editor لإضافة منتجات وتصاميم
2. **اختبار الوظائف:** جرب إنشاء طلب أو حجز موعد
3. **تخصيص الإعدادات:** حسب احتياجات العمل
4. **إعداد النسخ الاحتياطي:** في إعدادات المشروع

## 📞 الدعم

إذا واجهت مشاكل:
1. تحقق من **Logs** في لوحة تحكم Supabase
2. راجع **Console** في المتصفح (F12)
3. تأكد من صحة متغيرات البيئة
4. راجع الدليل الشامل في `SUPABASE-SETUP-GUIDE.md`

---

**ملاحظة:** هذا الإعداد للتطوير المحلي. للإنتاج، ستحتاج إلى إعدادات إضافية للأمان والأداء.
