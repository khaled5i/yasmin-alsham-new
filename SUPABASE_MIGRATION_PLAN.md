# 🚀 خطة التحويل الكاملة من localStorage إلى Supabase

## 📋 نظرة عامة

هذه الوثيقة تحتوي على خطة تفصيلية شاملة لتحويل مشروع ياسمين الشام من استخدام التخزين المحلي (localStorage و Mock Data) إلى استخدام قاعدة بيانات Supabase الحقيقية.

---

## 🎯 المرحلة الأولى: الإعداد والتجهيز

### 1.1 تثبيت حزمة Supabase

```bash
npm install @supabase/supabase-js
```

### 1.2 إنشاء حساب Supabase

1. اذهب إلى [https://supabase.com](https://supabase.com)
2. انقر على "Start your project"
3. سجل الدخول باستخدام GitHub أو البريد الإلكتروني
4. انقر على "New Project"
5. املأ البيانات التالية:
   - **Name**: yasmin-alsham
   - **Database Password**: (احفظ كلمة المرور في مكان آمن)
   - **Region**: اختر أقرب منطقة (مثل: Frankfurt أو Bahrain)
   - **Pricing Plan**: Free (للبداية)
6. انقر على "Create new project"
7. انتظر حتى يتم إنشاء المشروع (2-3 دقائق)

### 1.3 الحصول على API Keys

1. بعد إنشاء المشروع، اذهب إلى **Settings** → **API**
2. ستجد:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: مفتاح عام للاستخدام في Frontend
   - **service_role key**: مفتاح خاص للعمليات الإدارية (لا تشاركه أبداً)

### 1.4 تكوين متغيرات البيئة

أنشئ ملف `.env.local` في جذر المشروع:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here

# Optional: Service Role Key (للعمليات الإدارية فقط)
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Application Settings
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_WHATSAPP_NUMBER=+966598862609
```

⚠️ **مهم جداً**: أضف `.env.local` إلى `.gitignore` لحماية المفاتيح السرية.

### 1.5 إنشاء ملف عميل Supabase

أنشئ ملف `src/lib/supabase.ts`:

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  global: {
    headers: {
      'X-Client-Info': 'yasmin-alsham@1.0.0',
    },
  },
})

// دالة للتحقق من اتصال Supabase
export const isSupabaseConfigured = (): boolean => {
  return !!(supabaseUrl && supabaseAnonKey)
}

// دالة لاختبار الاتصال
export const testConnection = async () => {
  try {
    const { data, error } = await supabase.from('users').select('count').limit(1)
    if (error) throw error
    return { success: true, message: 'Connected to Supabase successfully' }
  } catch (error) {
    return { success: false, message: 'Failed to connect to Supabase', error }
  }
}
```

### 1.6 تحديث next.config.ts

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  trailingSlash: false,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizePackageImports: ['lucide-react', '@supabase/supabase-js'],
  },
  // تحسين Webpack لـ Supabase
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    return config
  },
  // تحسين تقسيم الحزم
  transpilePackages: ['@supabase/supabase-js'],
};

export default nextConfig;
```

---

## 🗄️ المرحلة الثانية: تصميم قاعدة البيانات

### 2.1 نظرة عامة على الجداول

سنقوم بإنشاء الجداول التالية:

1. **users** - المستخدمون (Admin, Worker, Client)
2. **workers** - معلومات العمال الإضافية
3. **designs** - التصاميم الجاهزة
4. **fabrics** - الأقمشة المتاحة
5. **appointments** - المواعيد (مع دعم الحجز المجهول)
6. **orders** - الطلبات
7. **order_items** - عناصر الطلبات
8. **favorites** - المفضلة
9. **cart_items** - عناصر السلة

### 2.2 مخطط العلاقات (ERD)

```
users (1) ──────< (N) appointments
users (1) ──────< (N) orders
users (1) ──────< (N) favorites
users (1) ──────< (N) cart_items
workers (1) ─────< (N) orders
designs (1) ─────< (N) favorites
designs (1) ─────< (N) cart_items
designs (1) ─────< (N) order_items
fabrics (1) ─────< (N) order_items
orders (1) ──────< (N) order_items
```

### 2.3 إنشاء الجداول - ملف SQL

سيتم إنشاء ملف `supabase-schema.sql` منفصل يحتوي على جميع الجداول.

---

## 🔒 المرحلة الثالثة: سياسات الأمان (RLS Policies)

### 3.1 مبادئ Row Level Security

**Row Level Security (RLS)** هو نظام أمان على مستوى الصفوف يسمح لك بتحديد من يمكنه:
- قراءة البيانات (SELECT)
- إضافة بيانات (INSERT)
- تحديث البيانات (UPDATE)
- حذف البيانات (DELETE)

### 3.2 أدوار المستخدمين

1. **Admin** - صلاحيات كاملة على جميع الجداول
2. **Worker** - قراءة وتحديث الطلبات المعينة له فقط
3. **Client** - قراءة وتحديث بياناته الشخصية فقط
4. **Guest (Anonymous)** - يمكنه حجز المواعيد فقط

### 3.3 سياسات الأمان لكل جدول

سيتم إنشاء ملف `supabase-rls-policies.sql` منفصل يحتوي على جميع السياسات.

---

## 🔄 المرحلة الرابعة: تحويل الخدمات (Services Migration)

### 4.1 إنشاء خدمات Supabase

سنقوم بإنشاء ملف `src/lib/supabase-services.ts` يحتوي على جميع العمليات:

```typescript
// src/lib/supabase-services.ts
import { supabase } from './supabase'
import type { User, Design, Appointment, Order, Worker, Favorite, CartItem } from './types'

// ========================================
// خدمات المستخدمين (Users Service)
// ========================================

export const userService = {
  // جلب جميع المستخدمين (Admin فقط)
  async getAll() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data as User[]
  },

  // جلب مستخدم بواسطة ID
  async getById(id: string) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data as User
  },

  // تحديث مستخدم
  async update(id: string, updates: Partial<User>) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data as User
  },
}

// ========================================
// خدمات التصاميم (Designs Service)
// ========================================

export const designService = {
  // جلب جميع التصاميم
  async getAll() {
    const { data, error } = await supabase
      .from('designs')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data as Design[]
  },

  // جلب تصميم بواسطة ID
  async getById(id: string) {
    const { data, error } = await supabase
      .from('designs')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) throw error
    return data as Design
  },

  // جلب التصاميم حسب الفئة
  async getByCategory(category: string) {
    const { data, error } = await supabase
      .from('designs')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data as Design[]
  },
}

// المزيد من الخدمات في الملف الكامل...
```

### 4.2 تحويل database-safe-v2.ts

سنقوم بتحديث `src/lib/database-safe-v2.ts` ليستخدم Supabase مع fallback للبيانات المحلية:

```typescript
// src/lib/database-safe-v2.ts
import { isSupabaseConfigured } from './supabase'
import * as supabaseServices from './supabase-services'
import { mockData } from './mock-data'

export const getDatabaseStatus = async () => {
  if (isSupabaseConfigured()) {
    try {
      const { testConnection } = await import('./supabase')
      const result = await testConnection()
      
      if (result.success) {
        return {
          connected: true,
          mode: 'supabase',
          message: 'متصل بقاعدة بيانات Supabase - Connected to Supabase',
        }
      }
    } catch (error) {
      console.error('Supabase connection failed:', error)
    }
  }
  
  return {
    connected: false,
    mode: 'local',
    message: 'وضع قاعدة البيانات المحلية - Local database mode',
  }
}

export const getDesigns = async () => {
  if (isSupabaseConfigured()) {
    try {
      return await supabaseServices.designService.getAll()
    } catch (error) {
      console.error('Failed to fetch designs from Supabase:', error)
    }
  }
  return mockData.designs
}

// المزيد من الدوال...
```

---

## 🔐 المرحلة الخامسة: تحويل المصادقة (Authentication)

### 5.1 إعداد Supabase Auth

في لوحة تحكم Supabase:
1. اذهب إلى **Authentication** → **Settings**
2. فعّل **Email Confirmations** (اختياري)
3. أضف **Site URL**: `http://localhost:3000`
4. أضف **Redirect URLs**: `http://localhost:3000/auth/callback`

### 5.2 تحديث authStore.ts

```typescript
// src/store/authStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

interface User {
  id: string
  email: string
  full_name: string
  role: 'admin' | 'worker' | 'client'
  avatar_url?: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  
  // Actions
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  register: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,

      login: async (email: string, password: string) => {
        if (!isSupabaseConfigured()) {
          // Fallback to localStorage auth
          // ... existing localStorage logic
        }

        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          })

          if (error) throw error

          // جلب بيانات المستخدم من جدول users
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', data.user.id)
            .single()

          if (userError) throw userError

          set({
            user: userData,
            isAuthenticated: true,
            isLoading: false,
          })

          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      },

      logout: async () => {
        if (isSupabaseConfigured()) {
          await supabase.auth.signOut()
        }
        
        set({
          user: null,
          isAuthenticated: false,
        })
      },

      register: async (email: string, password: string, fullName: string) => {
        if (!isSupabaseConfigured()) {
          // Fallback logic
        }

        try {
          // إنشاء حساب في Supabase Auth
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
          })

          if (authError) throw authError

          // إنشاء سجل في جدول users
          const { data: userData, error: userError } = await supabase
            .from('users')
            .insert({
              id: authData.user!.id,
              email,
              full_name: fullName,
              role: 'client',
            })
            .select()
            .single()

          if (userError) throw userError

          set({
            user: userData,
            isAuthenticated: true,
            isLoading: false,
          })

          return { success: true }
        } catch (error: any) {
          return { success: false, error: error.message }
        }
      },

      checkAuth: async () => {
        if (!isSupabaseConfigured()) {
          set({ isLoading: false })
          return
        }

        try {
          const { data: { session } } = await supabase.auth.getSession()

          if (session) {
            const { data: userData } = await supabase
              .from('users')
              .select('*')
              .eq('id', session.user.id)
              .single()

            set({
              user: userData,
              isAuthenticated: true,
              isLoading: false,
            })
          } else {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            })
          }
        } catch (error) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          })
        }
      },
    }),
    {
      name: 'yasmin-alsham-auth',
    }
  )
)
```

---

## 📊 المرحلة السادسة: تحويل إدارة الحالة

### 6.1 تحديث shopStore.ts

سنقوم بمزامنة المفضلة والسلة مع Supabase:

```typescript
// src/store/shopStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useAuthStore } from './authStore'

// ... existing types

export const useShopStore = create<ShopState>()(
  persist(
    (set, get) => ({
      favorites: [],
      cartItems: [],

      // مزامنة المفضلة مع Supabase
      syncFavorites: async () => {
        const { user } = useAuthStore.getState()
        if (!user || !isSupabaseConfigured()) return

        try {
          const { data, error } = await supabase
            .from('favorites')
            .select('*, designs(*)')
            .eq('user_id', user.id)

          if (error) throw error

          set({ favorites: data.map(f => f.designs) })
        } catch (error) {
          console.error('Failed to sync favorites:', error)
        }
      },

      addToFavorites: async (design) => {
        const { user } = useAuthStore.getState()
        
        if (user && isSupabaseConfigured()) {
          try {
            await supabase
              .from('favorites')
              .insert({
                user_id: user.id,
                design_id: design.id,
              })
          } catch (error) {
            console.error('Failed to add to favorites:', error)
          }
        }

        set((state) => ({
          favorites: [...state.favorites, design],
        }))
      },

      // ... المزيد من الدوال
    }),
    {
      name: 'yasmin-alsham-shop',
    }
  )
)
```

---

## ✅ المرحلة السابعة: الاختبار والنشر

### 7.1 اختبار الوظائف

قائمة الاختبارات المطلوبة:

- [ ] تسجيل الدخول
- [ ] تسجيل حساب جديد
- [ ] تسجيل الخروج
- [ ] حجز موعد (مجهول)
- [ ] حجز موعد (مستخدم مسجل)
- [ ] إضافة إلى المفضلة
- [ ] إزالة من المفضلة
- [ ] إضافة إلى السلة
- [ ] تحديث كمية في السلة
- [ ] إزالة من السلة
- [ ] إنشاء طلب
- [ ] تتبع طلب
- [ ] تحديث حالة طلب (Admin)
- [ ] تعيين عامل لطلب (Admin)

### 7.2 نقل البيانات التجريبية

سيتم إنشاء ملف `supabase-seed-data.sql` لإدخال البيانات التجريبية.

### 7.3 النشر على الإنتاج

1. تحديث متغيرات البيئة في Vercel/Netlify
2. التأكد من تفعيل RLS على جميع الجداول
3. اختبار الموقع في بيئة الإنتاج
4. مراقبة الأخطاء والأداء

---

---

## 📊 المرحلة الثامنة: خطة التنفيذ التفصيلية

### الأسبوع الأول: الإعداد والتجهيز

**اليوم 1-2: إعداد Supabase**
- [ ] إنشاء حساب Supabase
- [ ] إنشاء مشروع جديد
- [ ] الحصول على API Keys
- [ ] إعداد متغيرات البيئة
- [ ] تثبيت حزمة `@supabase/supabase-js`
- [ ] إنشاء ملف `src/lib/supabase.ts`

**اليوم 3-4: إنشاء قاعدة البيانات**
- [ ] تنفيذ `supabase-schema.sql` في SQL Editor
- [ ] التحقق من إنشاء جميع الجداول
- [ ] التحقق من العلاقات (Foreign Keys)
- [ ] التحقق من الفهارس (Indexes)

**اليوم 5-7: إعداد الأمان**
- [ ] تنفيذ `supabase-rls-policies.sql`
- [ ] اختبار سياسات RLS
- [ ] إنشاء مستخدمين تجريبيين عبر Supabase Auth
- [ ] تنفيذ `supabase-seed-data.sql`

### الأسبوع الثاني: تحويل الخدمات

**اليوم 8-10: خدمات التصاميم والأقمشة**
- [ ] إنشاء `src/lib/services/design-service.ts`
- [ ] إنشاء `src/lib/services/fabric-service.ts`
- [ ] تحديث `src/lib/database-safe-v2.ts`
- [ ] اختبار جلب التصاميم من Supabase

**اليوم 11-12: خدمات المواعيد**
- [ ] تحديث `src/lib/appointments.ts`
- [ ] اختبار حجز موعد مجهول
- [ ] اختبار حجز موعد لمستخدم مسجل
- [ ] التحقق من عمل RLS للمواعيد

**اليوم 13-14: خدمات الطلبات**
- [ ] إنشاء `src/lib/services/order-service.ts`
- [ ] اختبار إنشاء طلب
- [ ] اختبار تحديث حالة طلب
- [ ] اختبار تعيين عامل لطلب

### الأسبوع الثالث: تحويل المصادقة وإدارة الحالة

**اليوم 15-17: المصادقة**
- [ ] تحديث `src/store/authStore.ts`
- [ ] اختبار تسجيل الدخول
- [ ] اختبار تسجيل حساب جديد
- [ ] اختبار تسجيل الخروج
- [ ] إضافة Email Verification (اختياري)

**اليوم 18-19: إدارة الحالة**
- [ ] تحديث `src/store/shopStore.ts`
- [ ] مزامنة المفضلة مع Supabase
- [ ] مزامنة السلة مع Supabase
- [ ] اختبار Real-time Subscriptions (اختياري)

**اليوم 20-21: تحديث المكونات**
- [ ] تحديث صفحة التصاميم
- [ ] تحديث صفحة المفضلة
- [ ] تحديث صفحة السلة
- [ ] تحديث لوحة التحكم

### الأسبوع الرابع: الاختبار والنشر

**اليوم 22-24: الاختبار الشامل**
- [ ] اختبار جميع الوظائف
- [ ] اختبار سياسات الأمان
- [ ] اختبار الأداء
- [ ] إصلاح الأخطاء

**اليوم 25-26: التحسين**
- [ ] تحسين الاستعلامات
- [ ] إضافة Caching
- [ ] تحسين الصور
- [ ] تحسين الأداء

**اليوم 27-28: النشر**
- [ ] تحديث متغيرات البيئة في Vercel/Netlify
- [ ] النشر على الإنتاج
- [ ] اختبار الموقع المنشور
- [ ] مراقبة الأخطاء

---

## 🎯 نقاط مهمة يجب تذكرها

### ✅ الأولويات

1. **الأمان أولاً**
   - تأكد من تفعيل RLS على جميع الجداول
   - لا تشارك service_role key أبداً
   - استخدم anon key فقط في Frontend

2. **الحفاظ على الوظائف الحالية**
   - حجز المواعيد المجهول يجب أن يعمل
   - جميع الوظائف الحالية يجب أن تستمر في العمل
   - استخدم fallback للبيانات المحلية في حالة فشل Supabase

3. **الأداء**
   - استخدم Indexes على الأعمدة المستخدمة في WHERE و JOIN
   - استخدم Pagination للبيانات الكبيرة
   - استخدم select() لجلب الأعمدة المطلوبة فقط

4. **معالجة الأخطاء**
   - تعامل مع جميع الأخطاء المحتملة
   - أظهر رسائل خطأ واضحة للمستخدم
   - سجل الأخطاء للمراجعة

### ⚠️ مخاطر محتملة

1. **فقدان البيانات**
   - احتفظ بنسخة احتياطية من البيانات المحلية
   - لا تحذف البيانات المحلية حتى تتأكد من عمل Supabase

2. **مشاكل الأداء**
   - راقب عدد الاستعلامات
   - استخدم Supabase Dashboard لمراقبة الأداء
   - أضف Indexes عند الحاجة

3. **مشاكل الأمان**
   - اختبر RLS Policies جيداً
   - تأكد من عدم تسريب بيانات المستخدمين
   - استخدم HTTPS دائماً

---

## 📝 الخطوات التالية

بعد قراءة هذه الخطة، راجع الملفات التالية بالترتيب:

1. **SUPABASE_GUIDE.md** - دليل شامل لفهم Supabase (ابدأ هنا!)
2. **supabase-schema.sql** - مخطط قاعدة البيانات الكامل
3. **supabase-rls-policies.sql** - سياسات الأمان
4. **supabase-seed-data.sql** - البيانات التجريبية

### خطوات البداية السريعة:

```bash
# 1. تثبيت Supabase
npm install @supabase/supabase-js

# 2. إنشاء ملف البيئة
cp .env.example .env.local
# ثم أضف SUPABASE_URL و SUPABASE_ANON_KEY

# 3. إنشاء ملف عميل Supabase
# راجع المرحلة الأولى في هذا الملف

# 4. تنفيذ SQL في Supabase Dashboard
# افتح SQL Editor وانسخ محتوى supabase-schema.sql

# 5. تنفيذ RLS Policies
# انسخ محتوى supabase-rls-policies.sql

# 6. إدخال البيانات التجريبية
# انسخ محتوى supabase-seed-data.sql

# 7. اختبار الاتصال
npm run dev
# افتح المتصفح وتحقق من Console
```

---

## 🆘 الدعم والمساعدة

### موارد Supabase الرسمية:
- 📚 [Supabase Documentation](https://supabase.com/docs)
- 💬 [Supabase Discord](https://discord.supabase.com)
- 🎥 [Supabase YouTube](https://www.youtube.com/c/supabase)
- 📖 [Supabase Blog](https://supabase.com/blog)

### موارد إضافية:
- [Next.js + Supabase Tutorial](https://supabase.com/docs/guides/getting-started/tutorials/with-nextjs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Supabase Auth Guide](https://supabase.com/docs/guides/auth)

### إذا واجهت مشاكل:
1. راجع ملف `TROUBLESHOOTING.md` في المشروع
2. ابحث في [Supabase Discussions](https://github.com/supabase/supabase/discussions)
3. اسأل في [Supabase Discord](https://discord.supabase.com)
4. راجع [Supabase Status](https://status.supabase.com) للتحقق من حالة الخدمة

---

## 📈 مقاييس النجاح

بعد إكمال التحويل، يجب أن تحقق:

- ✅ جميع الوظائف تعمل بشكل صحيح
- ✅ البيانات محفوظة بشكل دائم في Supabase
- ✅ RLS Policies تعمل بشكل صحيح
- ✅ المصادقة تعمل عبر Supabase Auth
- ✅ الأداء جيد (استعلامات سريعة)
- ✅ لا توجد أخطاء في Console
- ✅ التطبيق يعمل على الإنتاج

---

**تاريخ إنشاء الخطة**: 2025-10-25
**الإصدار**: 3.0
**الحالة**: جاهز للتنفيذ

حظاً موفقاً! 🚀

