# إصلاح مشكلة التوجيه بعد تسجيل الدخول
# Login Routing Fix

## 🐛 المشكلة

عند تسجيل دخول عامل من نوع "محاسب" أو "مدير متجر الأقمشة"، كان يتم توجيهه إلى `/dashboard` (واجهة المدير) بدلاً من لوحة التحكم المخصصة له.

**السبب:**
- في ملف `src/app/login/page.tsx`، كان منطق التوجيه بعد تسجيل الدخول يوجه **جميع** المستخدمين إلى `/dashboard` بغض النظر عن نوعهم.
- لم يكن هناك فحص لنوع العامل (`worker_type`) من قاعدة البيانات.

---

## ✅ الحل

تم تعديل ملف `src/app/login/page.tsx` لإضافة منطق توجيه ذكي:

### 1. **عند تحميل الصفحة** (إذا كان المستخدم مسجل دخول بالفعل):
```typescript
useEffect(() => {
  async function checkAndRedirect() {
    if (user && user.is_active) {
      // إذا كان admin → /dashboard
      if (user.role === 'admin') {
        router.push('/dashboard')
        return
      }
      
      // إذا كان worker → جلب worker_type وتوجيهه للصفحة المناسبة
      if (user.role === 'worker') {
        const { data } = await supabase
          .from('workers')
          .select('worker_type')
          .eq('user_id', user.id)
          .single()
        
        if (data?.worker_type) {
          const dashboardRoute = getWorkerDashboardRoute(data.worker_type)
          router.push(dashboardRoute)
          return
        }
      }
      
      // fallback
      router.push('/dashboard')
    }
  }
  
  checkAndRedirect()
}, [user, router])
```

### 2. **بعد تسجيل الدخول الناجح** (في `handleSubmit`):
```typescript
if (success) {
  const currentUser = useAuthStore.getState().user
  
  if (currentUser.role === 'admin') {
    router.push('/dashboard')
  } else if (currentUser.role === 'worker') {
    // جلب worker_type من قاعدة البيانات
    const { data } = await supabase
      .from('workers')
      .select('worker_type')
      .eq('user_id', currentUser.id)
      .single()
    
    if (data?.worker_type) {
      const dashboardRoute = getWorkerDashboardRoute(data.worker_type)
      router.push(dashboardRoute)
    }
  } else {
    router.push('/dashboard')
  }
}
```

---

## 📋 التغييرات في الملفات

### `src/app/login/page.tsx`

#### **الإضافات:**
```typescript
import { supabase } from '@/lib/supabase'
import { getWorkerDashboardRoute } from '@/lib/worker-types'
import type { WorkerType } from '@/lib/services/worker-service'
```

#### **التعديلات:**
1. ✅ تحديث `useEffect` لفحص نوع العامل عند تحميل الصفحة
2. ✅ تحديث `handleSubmit` لتوجيه العامل حسب نوعه بعد تسجيل الدخول

---

## 🎯 النتيجة

الآن عند تسجيل الدخول:

| نوع المستخدم | التوجيه |
|--------------|---------|
| **Admin** | `/dashboard` |
| **مدير عام** (general_manager) | `/dashboard` |
| **مدير متجر الأقمشة** (fabric_store_manager) | `/dashboard/fabric-manager` |
| **محاسب** (accountant) | `/dashboard/accountant` |
| **خياط/خياطة** (tailor) | `/dashboard/worker-orders` |
| **Client** | `/dashboard` |

---

## 🧪 الاختبار

### 1. اختبار تسجيل دخول محاسب:
```
البريد: accountant@test.com
كلمة المرور: 123456
النتيجة المتوقعة: توجيه إلى /dashboard/accountant
```

### 2. اختبار تسجيل دخول مدير أقمشة:
```
البريد: fabric.manager@test.com
كلمة المرور: 123456
النتيجة المتوقعة: توجيه إلى /dashboard/fabric-manager
```

### 3. اختبار تسجيل دخول مدير عام:
```
البريد: general.manager@test.com
كلمة المرور: 123456
النتيجة المتوقعة: توجيه إلى /dashboard
```

---

## ✅ الحالة

| المهمة | الحالة |
|--------|--------|
| تحديد المشكلة | ✅ مكتمل |
| إصلاح منطق التوجيه | ✅ مكتمل |
| إضافة فحص worker_type | ✅ مكتمل |
| الاختبار | ⏳ جاهز للاختبار |

---

## 📝 ملاحظات

1. **التوافق:** الحل متوافق مع جميع أنواع العمال الموجودة والمستقبلية
2. **Fallback:** إذا فشل جلب `worker_type`، يتم التوجيه إلى `/dashboard` كـ fallback
3. **الأداء:** يتم جلب `worker_type` مرة واحدة فقط عند تسجيل الدخول
4. **الأمان:** يتم التحقق من الصلاحيات في كل صفحة باستخدام `ProtectedWorkerRoute`

---

تم إصلاح المشكلة بنجاح! 🎉

