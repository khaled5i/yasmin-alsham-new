# دليل استخدام TestSprite MCP Server
# TestSprite MCP Server Usage Guide

## 📋 نظرة عامة | Overview

تم إعداد سيرفر **TestSprite MCP** لإجراء اختبارات آلية على موقع ياسمين الشام.
The **TestSprite MCP** server has been configured to run automated tests on Yasmin Alsham website.

---

## ⚙️ التكوين | Configuration

### 1. ملف التكوين | Configuration File
تم إنشاء ملف `.mcp-config.json` في جذر المشروع:

```json
{
  "mcpServers": {
    "TestSprite": {
      "command": "npx",
      "args": ["@testsprite/testsprite-mcp@latest"],
      "env": {
        "API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 2. متغيرات البيئة | Environment Variables
تم إضافة المفتاح إلى ملف `.env.local`:
```
TESTSPRITE_API_KEY=sk-user-V3AB0gDPY3CxQY4ycKCYaxzd8yx8cCErMJP5-UhHDNvlw4aB2gQud7lHWHK2LUT9wqkS3etWr42O0vwOfHp_yRCmC3GmV_L2ufDmCVunoOW8lJ8hsUGdM5otKuh1yporor4
```

---

## 🚀 كيفية الاستخدام | How to Use

### الطريقة 1: استخدام أدوات TestSprite المتاحة
يمكنك الآن استخدام أدوات TestSprite من خلال Augment Agent:

1. **Bootstrap Tests** - تهيئة الاختبارات
2. **Generate Code Summary** - إنشاء ملخص للكود
3. **Generate PRD** - إنشاء وثيقة متطلبات المنتج
4. **Generate Test Plan** - إنشاء خطة اختبار
5. **Execute Tests** - تنفيذ الاختبارات

### الطريقة 2: تشغيل السيرفر يدوياً

```bash
# تشغيل سيرفر TestSprite
npx @testsprite/testsprite-mcp@latest
```

---

## 📝 خطوات إجراء الاختبار الكامل

### الخطوة 1: تشغيل موقعك المحلي
```bash
npm run dev
# الموقع سيعمل على http://localhost:3001
```

### الخطوة 2: تهيئة الاختبارات (Bootstrap)
استخدم أداة `testsprite_bootstrap_tests_test` مع المعلومات التالية:
- **localPort**: 3001
- **type**: frontend
- **projectPath**: المسار الكامل للمشروع
- **testScope**: codebase

### الخطوة 3: إنشاء خطة الاختبار
استخدم أداة `testsprite_generate_frontend_test_plan_test`

### الخطوة 4: تنفيذ الاختبارات
استخدم أداة `testsprite_generate_code_and_execute_test`

---

## 🎯 أنواع الاختبارات المتاحة

### اختبارات Frontend:
- ✅ اختبار واجهة المستخدم (UI Testing)
- ✅ اختبار التنقل (Navigation Testing)
- ✅ اختبار النماذج (Form Testing)
- ✅ اختبار الاستجابة (Responsive Testing)
- ✅ اختبار الأداء (Performance Testing)

### اختبارات Backend:
- ✅ اختبار API Endpoints
- ✅ اختبار قاعدة البيانات
- ✅ اختبار المصادقة والتفويض

---

## 📊 معلومات المشروع

- **اسم المشروع**: yasmin-alsham
- **Framework**: Next.js 15.3.6
- **Port**: 3001
- **اللغة**: TypeScript
- **قاعدة البيانات**: Supabase

---

## 🔒 ملاحظات أمنية | Security Notes

⚠️ **مهم جداً**:
1. لا تشارك ملف `.env.local` مع أي شخص
2. لا تقم برفع المفتاح إلى GitHub
3. تأكد من إضافة `.env.local` إلى `.gitignore`

---

## 🆘 المساعدة والدعم

إذا واجهت أي مشاكل:
1. تحقق من أن الموقع يعمل على المنفذ الصحيح (3001)
2. تأكد من صحة API Key
3. راجع وثائق TestSprite: https://testsprite.com/docs

---

## 📞 الاتصال

للمزيد من المعلومات، قم بزيارة:
- موقع TestSprite: https://testsprite.com
- الوثائق: https://docs.testsprite.com

---

**تم الإعداد بنجاح! ✨**
**Setup completed successfully! ✨**

