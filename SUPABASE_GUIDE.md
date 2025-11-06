# 📚 دليل Supabase الشامل - Comprehensive Supabase Guide

## 📖 القسم الأول: مقدمة عن Supabase

### ما هو Supabase؟

**Supabase** هو بديل مفتوح المصدر لـ Firebase، يوفر:
- 🗄️ **قاعدة بيانات PostgreSQL** - قاعدة بيانات علائقية قوية
- 🔐 **نظام مصادقة** - تسجيل دخول بالبريد الإلكتروني، Google، GitHub، وغيرها
- 📦 **تخزين الملفات** - لتخزين الصور والملفات
- ⚡ **Real-time Subscriptions** - تحديثات فورية عند تغيير البيانات
- 🔒 **Row Level Security (RLS)** - أمان على مستوى الصفوف
- 🚀 **API تلقائي** - يتم إنشاؤه تلقائياً من مخطط قاعدة البيانات

### لماذا نستخدم Supabase؟

#### ✅ المزايا:

1. **قاعدة بيانات حقيقية**
   - بيانات دائمة (لا تُفقد عند إعادة تحميل الصفحة)
   - يمكن الوصول إليها من أي جهاز
   - مشاركة البيانات بين المستخدمين

2. **أمان قوي**
   - Row Level Security (RLS) لحماية البيانات
   - مصادقة آمنة مع JWT Tokens
   - تشفير البيانات

3. **أداء عالي**
   - استعلامات سريعة
   - فهرسة تلقائية
   - تخزين مؤقت (Caching)

4. **سهولة الاستخدام**
   - واجهة مستخدم بسيطة
   - API تلقائي
   - وثائق ممتازة

5. **مجاني للبداية**
   - خطة مجانية سخية
   - 500 MB تخزين
   - 2 GB نقل بيانات شهرياً
   - عدد غير محدود من الطلبات

#### ❌ الفرق بين Supabase والتخزين المحلي:

| الميزة | localStorage | Supabase |
|--------|-------------|----------|
| **الدوام** | يُفقد عند مسح المتصفح | دائم في السحابة |
| **المشاركة** | محلي فقط | يمكن مشاركته بين الأجهزة |
| **الأمان** | ضعيف (يمكن التلاعب به) | قوي مع RLS |
| **الحجم** | محدود (5-10 MB) | غير محدود تقريباً |
| **الاستعلامات** | بسيطة فقط | استعلامات SQL معقدة |
| **Real-time** | لا يدعم | يدعم التحديثات الفورية |
| **التكلفة** | مجاني | مجاني للبداية |

---

## 🗄️ القسم الثاني: كيفية عمل قواعد البيانات في Supabase

### 2.1 PostgreSQL Database

**PostgreSQL** هي قاعدة بيانات علائقية (Relational Database) تعني:
- البيانات مخزنة في **جداول (Tables)**
- كل جدول يحتوي على **صفوف (Rows)** و **أعمدة (Columns)**
- الجداول مرتبطة ببعضها عبر **مفاتيح أجنبية (Foreign Keys)**

#### مثال بسيط:

```
جدول المستخدمين (users):
┌────┬──────────────┬─────────────────────┬──────────┐
│ id │ full_name    │ email               │ role     │
├────┼──────────────┼─────────────────────┼──────────┤
│ 1  │ أحمد محمد    │ ahmed@example.com   │ admin    │
│ 2  │ فاطمة علي    │ fatima@example.com  │ client   │
│ 3  │ خالد سعيد    │ khaled@example.com  │ worker   │
└────┴──────────────┴─────────────────────┴──────────┘

جدول المواعيد (appointments):
┌────┬─────────┬──────────────┬──────────────┬──────────┐
│ id │ user_id │ client_name  │ date         │ status   │
├────┼─────────┼──────────────┼──────────────┼──────────┤
│ 1  │ 2       │ فاطمة علي    │ 2025-11-01   │ confirmed│
│ 2  │ NULL    │ سارة أحمد    │ 2025-11-02   │ pending  │
└────┴─────────┴──────────────┴──────────────┴──────────┘
```

### 2.2 Row Level Security (RLS)

**RLS** هو نظام أمان يسمح لك بتحديد **من يمكنه رؤية أو تعديل كل صف** في الجدول.

#### مثال:
```sql
-- سياسة: المستخدم يمكنه رؤية مواعيده فقط
CREATE POLICY "Users can view their own appointments"
ON appointments
FOR SELECT
USING (auth.uid() = user_id);
```

هذا يعني:
- المستخدم رقم 2 يمكنه رؤية الموعد رقم 1 فقط
- المستخدم رقم 3 لا يمكنه رؤية أي مواعيد
- Admin يمكنه رؤية جميع المواعيد (بسياسة منفصلة)

### 2.3 Policies (السياسات)

**Policy** هي قاعدة تحدد الصلاحيات. كل سياسة تحتوي على:

1. **الجدول** - أي جدول تنطبق عليه
2. **العملية** - SELECT, INSERT, UPDATE, DELETE
3. **الشرط** - متى تنطبق السياسة

#### أنواع السياسات:

```sql
-- 1. سياسة القراءة (SELECT)
CREATE POLICY "policy_name"
ON table_name
FOR SELECT
USING (condition);

-- 2. سياسة الإضافة (INSERT)
CREATE POLICY "policy_name"
ON table_name
FOR INSERT
WITH CHECK (condition);

-- 3. سياسة التحديث (UPDATE)
CREATE POLICY "policy_name"
ON table_name
FOR UPDATE
USING (condition)
WITH CHECK (condition);

-- 4. سياسة الحذف (DELETE)
CREATE POLICY "policy_name"
ON table_name
FOR DELETE
USING (condition);
```

### 2.4 Foreign Keys (المفاتيح الأجنبية)

**Foreign Key** هو عمود يربط جدولين ببعضهما.

#### مثال:

```sql
-- جدول المواعيد يحتوي على user_id
-- user_id هو Foreign Key يشير إلى جدول users

CREATE TABLE appointments (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id), -- Foreign Key
  client_name TEXT,
  date DATE
);
```

هذا يضمن:
- ✅ لا يمكن إضافة موعد لمستخدم غير موجود
- ✅ عند حذف مستخدم، يمكن حذف مواعيده تلقائياً (CASCADE)
- ✅ الحفاظ على سلامة البيانات (Data Integrity)

### 2.5 Indexes (الفهارس)

**Index** هو بنية بيانات تسرع الاستعلامات.

#### متى نستخدم Index؟

- ✅ الأعمدة التي نبحث فيها كثيراً (WHERE, JOIN)
- ✅ الأعمدة التي نرتب بها (ORDER BY)
- ✅ Foreign Keys

#### مثال:

```sql
-- إنشاء فهرس على email للبحث السريع
CREATE INDEX idx_users_email ON users(email);

-- إنشاء فهرس على user_id في جدول appointments
CREATE INDEX idx_appointments_user_id ON appointments(user_id);
```

---

## 🚀 القسم الثالث: خطوات العمل مع Supabase

### الخطوة 1: إنشاء حساب على Supabase

1. اذهب إلى [https://supabase.com](https://supabase.com)
2. انقر على **"Start your project"**
3. سجل الدخول باستخدام:
   - GitHub (موصى به)
   - Google
   - البريد الإلكتروني

### الخطوة 2: إنشاء مشروع جديد

1. بعد تسجيل الدخول، انقر على **"New Project"**
2. املأ البيانات:
   - **Organization**: اختر أو أنشئ منظمة
   - **Name**: `yasmin-alsham`
   - **Database Password**: أنشئ كلمة مرور قوية (احفظها!)
   - **Region**: اختر أقرب منطقة:
     - `Frankfurt (eu-central-1)` - أوروبا
     - `Bahrain (me-south-1)` - الشرق الأوسط
     - `Singapore (ap-southeast-1)` - آسيا
   - **Pricing Plan**: Free (للبداية)
3. انقر على **"Create new project"**
4. انتظر 2-3 دقائق حتى يتم إنشاء المشروع

### الخطوة 3: إنشاء الجداول عبر SQL Editor

1. في لوحة التحكم، اذهب إلى **SQL Editor**
2. انقر على **"New query"**
3. انسخ والصق محتوى ملف `supabase-schema.sql`
4. انقر على **"Run"** أو اضغط `Ctrl+Enter`
5. تأكد من ظهور رسالة "Success"

### الخطوة 4: إعداد Row Level Security

1. اذهب إلى **Authentication** → **Policies**
2. لكل جدول، انقر على **"New Policy"**
3. اختر نوع السياسة:
   - **"Enable read access for all users"** - للقراءة العامة
   - **"Enable insert for authenticated users only"** - للإضافة للمستخدمين المسجلين
   - **"Custom policy"** - لسياسة مخصصة
4. أو استخدم SQL Editor لتنفيذ ملف `supabase-rls-policies.sql`

### الخطوة 5: إنشاء Policies للأمان

#### مثال: سياسة للمواعيد المجهولة

```sql
-- تفعيل RLS على جدول appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- سياسة 1: الجميع يمكنهم إضافة مواعيد (حتى الضيوف)
CREATE POLICY "Anyone can insert appointments"
ON appointments
FOR INSERT
WITH CHECK (true);

-- سياسة 2: المستخدمون يمكنهم رؤية مواعيدهم فقط
CREATE POLICY "Users can view their own appointments"
ON appointments
FOR SELECT
USING (
  auth.uid() = user_id 
  OR 
  auth.jwt() ->> 'role' = 'admin'
);

-- سياسة 3: Admin يمكنه تحديث جميع المواعيد
CREATE POLICY "Admins can update all appointments"
ON appointments
FOR UPDATE
USING (auth.jwt() ->> 'role' = 'admin')
WITH CHECK (auth.jwt() ->> 'role' = 'admin');
```

### الخطوة 6: الحصول على API Keys

1. اذهب إلى **Settings** → **API**
2. ستجد:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public key**: للاستخدام في Frontend
   - **service_role key**: للعمليات الإدارية (لا تشاركه!)

3. انسخ القيم وضعها في `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### الخطوة 7: ربط المشروع بـ Next.js

1. ثبت حزمة Supabase:
```bash
npm install @supabase/supabase-js
```

2. أنشئ ملف `src/lib/supabase.ts`:
```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

3. استخدمه في المكونات:
```typescript
import { supabase } from '@/lib/supabase'

const { data, error } = await supabase
  .from('designs')
  .select('*')
```

### الخطوة 8: كتابة الاستعلامات (Queries)

#### 8.1 SELECT - جلب البيانات

```typescript
// جلب جميع التصاميم
const { data, error } = await supabase
  .from('designs')
  .select('*')

// جلب تصميم واحد
const { data, error } = await supabase
  .from('designs')
  .select('*')
  .eq('id', '123')
  .single()

// جلب مع شرط
const { data, error } = await supabase
  .from('designs')
  .select('*')
  .eq('category', 'wedding')
  .gte('price', 1000)
  .order('created_at', { ascending: false })

// جلب مع علاقات (JOIN)
const { data, error } = await supabase
  .from('orders')
  .select(`
    *,
    user:users(*),
    worker:workers(*),
    items:order_items(*, design:designs(*))
  `)
```

#### 8.2 INSERT - إضافة بيانات

```typescript
// إضافة سجل واحد
const { data, error } = await supabase
  .from('appointments')
  .insert({
    client_name: 'فاطمة أحمد',
    client_phone: '+966501234567',
    appointment_date: '2025-11-01',
    appointment_time: '10:00',
    service_type: 'قياس فستان زفاف',
  })
  .select()
  .single()

// إضافة عدة سجلات
const { data, error } = await supabase
  .from('designs')
  .insert([
    { name: 'فستان 1', price: 2000 },
    { name: 'فستان 2', price: 3000 },
  ])
  .select()
```

#### 8.3 UPDATE - تحديث بيانات

```typescript
// تحديث سجل واحد
const { data, error } = await supabase
  .from('appointments')
  .update({ status: 'confirmed' })
  .eq('id', '123')
  .select()
  .single()

// تحديث عدة سجلات
const { data, error } = await supabase
  .from('orders')
  .update({ status: 'completed' })
  .eq('worker_id', 'worker-123')
  .select()
```

#### 8.4 DELETE - حذف بيانات

```typescript
// حذف سجل واحد
const { error } = await supabase
  .from('appointments')
  .delete()
  .eq('id', '123')

// حذف عدة سجلات
const { error } = await supabase
  .from('cart_items')
  .delete()
  .eq('user_id', 'user-123')
```

### الخطوة 9: معالجة الأخطاء

```typescript
const { data, error } = await supabase
  .from('designs')
  .select('*')

if (error) {
  console.error('Error fetching designs:', error)
  
  // أنواع الأخطاء الشائعة:
  if (error.code === 'PGRST116') {
    // لا توجد نتائج
    console.log('No results found')
  } else if (error.code === '42501') {
    // خطأ في الصلاحيات (RLS)
    console.log('Permission denied')
  } else {
    // خطأ عام
    console.log('Unknown error:', error.message)
  }
  
  return
}

// استخدام البيانات
console.log('Designs:', data)
```

### الخطوة 10: اختبار الاتصال

```typescript
// src/lib/supabase.ts
export const testConnection = async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('count')
      .limit(1)
    
    if (error) throw error
    
    console.log('✅ Connected to Supabase successfully')
    return { success: true }
  } catch (error) {
    console.error('❌ Failed to connect to Supabase:', error)
    return { success: false, error }
  }
}
```

---

## 💡 القسم الرابع: أمثلة عملية

### مثال 1: إنشاء جدول Users

```sql
-- إنشاء جدول المستخدمين
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'worker', 'client')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إنشاء فهرس على email
CREATE INDEX idx_users_email ON users(email);

-- إنشاء فهرس على role
CREATE INDEX idx_users_role ON users(role);

-- تفعيل RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
```

### مثال 2: إضافة RLS Policy

```sql
-- سياسة: المستخدمون يمكنهم رؤية ملفاتهم الشخصية فقط
CREATE POLICY "Users can view their own profile"
ON users
FOR SELECT
USING (auth.uid() = id);

-- سياسة: المستخدمون يمكنهم تحديث ملفاتهم الشخصية فقط
CREATE POLICY "Users can update their own profile"
ON users
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- سياسة: Admin يمكنه رؤية جميع المستخدمين
CREATE POLICY "Admins can view all users"
ON users
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### مثال 3: استعلام SELECT مع JOIN

```typescript
// جلب جميع الطلبات مع بيانات المستخدم والعامل
const { data: orders, error } = await supabase
  .from('orders')
  .select(`
    id,
    order_number,
    status,
    total_price,
    created_at,
    client:users!orders_user_id_fkey (
      id,
      full_name,
      email,
      phone
    ),
    worker:workers (
      id,
      full_name,
      specialization
    ),
    items:order_items (
      id,
      quantity,
      price,
      design:designs (
        id,
        name,
        image_url
      )
    )
  `)
  .order('created_at', { ascending: false })

if (error) {
  console.error('Error:', error)
  return
}

console.log('Orders:', orders)
```

---

## ⚡ القسم الخامس: أفضل الممارسات

### 5.1 تنظيم الكود

```typescript
// ❌ سيء: كل الاستعلامات في المكونات
function MyComponent() {
  const [data, setData] = useState([])
  
  useEffect(() => {
    supabase.from('designs').select('*').then(...)
  }, [])
}

// ✅ جيد: فصل الخدمات في ملفات منفصلة
// src/lib/services/design-service.ts
export const designService = {
  async getAll() {
    const { data, error } = await supabase
      .from('designs')
      .select('*')
    if (error) throw error
    return data
  }
}

// في المكون
function MyComponent() {
  const [data, setData] = useState([])
  
  useEffect(() => {
    designService.getAll().then(setData)
  }, [])
}
```

### 5.2 معالجة الأخطاء

```typescript
// ❌ سيء: تجاهل الأخطاء
const { data } = await supabase.from('designs').select('*')

// ✅ جيد: معالجة الأخطاء بشكل صحيح
try {
  const { data, error } = await supabase
    .from('designs')
    .select('*')
  
  if (error) throw error
  
  return { success: true, data }
} catch (error) {
  console.error('Failed to fetch designs:', error)
  return { success: false, error: error.message }
}
```

### 5.3 تحسين الأداء

```typescript
// ❌ سيء: جلب جميع الأعمدة
const { data } = await supabase
  .from('orders')
  .select('*')

// ✅ جيد: جلب الأعمدة المطلوبة فقط
const { data } = await supabase
  .from('orders')
  .select('id, order_number, status, total_price')

// ✅ أفضل: استخدام pagination
const { data } = await supabase
  .from('orders')
  .select('id, order_number, status, total_price')
  .range(0, 9) // أول 10 سجلات
  .order('created_at', { ascending: false })
```

### 5.4 تأمين البيانات

```typescript
// ❌ سيء: استخدام service_role key في Frontend
const supabase = createClient(url, SERVICE_ROLE_KEY) // خطر!

// ✅ جيد: استخدام anon key فقط
const supabase = createClient(url, ANON_KEY)

// ✅ الاعتماد على RLS للأمان
// لا تثق بالـ Frontend أبداً، استخدم RLS دائماً
```

---

## 🎓 الخلاصة

الآن أنت تعرف:
- ✅ ما هو Supabase ولماذا نستخدمه
- ✅ كيف تعمل قواعد البيانات في Supabase
- ✅ كيفية إنشاء مشروع وجداول
- ✅ كيفية إعداد RLS Policies
- ✅ كيفية كتابة الاستعلامات
- ✅ أفضل الممارسات

**الخطوة التالية**: راجع ملف `SUPABASE_MIGRATION_PLAN.md` لبدء تحويل المشروع!

