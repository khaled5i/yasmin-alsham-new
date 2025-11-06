# 🌸 ياسمين الشام - مواصفات المشروع الشاملة

## 📋 نظرة عامة على المشروع

**ياسمين الشام** هو موقع ويب متطور لمحل تفصيل الفساتين النسائية، يجمع بين الأناقة الدمشقية التقليدية والتكنولوجيا الحديثة. يهدف المشروع إلى توفير منصة رقمية شاملة تخدم العملاء والإدارة والعمال بكفاءة عالية.

### 🎯 الأهداف الرئيسية
1. **تحديث تجربة العملاء**: توفير واجهة حديثة وسهلة الاستخدام
2. **تبسيط إدارة الأعمال**: أتمتة العمليات وتحسين الكفاءة
3. **تعزيز التواصل**: ربط العملاء بالمحل بطريقة فعالة
4. **توثيق العمليات**: حفظ تفاصيل الطلبات والمراحل
5. **قابلية التوسع**: بناء نظام قابل للنمو والتطوير

## 🏗️ المواصفات التقنية

### Frontend Architecture
- **Framework**: Next.js 15.3.4 مع App Router
- **Language**: TypeScript للكتابة الآمنة
- **Styling**: Tailwind CSS مع تصميم متجاوب (Mobile-first)
- **Animations**: Framer Motion للحركات السلسة
- **Icons**: Lucide React للأيقونات الحديثة
- **Fonts**: Cairo و Noto Kufi Arabic للنصوص العربية

### Backend & Database
- **Database**: Supabase (PostgreSQL) مع Real-time capabilities
- **Authentication**: Supabase Auth مع JWT tokens
- **Security**: Row Level Security (RLS) policies
- **Storage**: Supabase Storage للصور والملفات
- **API**: RESTful API مع TypeScript types

### State Management
- **Primary**: Zustand مع Persist middleware
- **Local Storage**: للبيانات المؤقتة والتفضيلات
- **Real-time**: Supabase subscriptions للتحديثات الفورية

### Development Tools
- **Build Tool**: Next.js مع Turbopack
- **Package Manager**: npm/yarn/pnpm
- **Code Quality**: ESLint + TypeScript
- **Version Control**: Git مع GitHub

## 🎨 مواصفات التصميم

### نظام الألوان
```css
:root {
  --primary: #f472b6;      /* وردي رئيسي */
  --primary-dark: #ec4899; /* وردي داكن */
  --secondary: #f3e8ff;    /* بنفسجي فاتح */
  --accent: #fbbf24;       /* ذهبي للتمييز */
  --background: #fefefe;   /* خلفية بيضاء */
  --foreground: #2d2d2d;   /* نص رمادي داكن */
}
```

### Typography
- **Primary Font**: Cairo (Google Fonts)
- **Arabic Font**: Noto Kufi Arabic
- **Direction**: RTL (Right-to-Left)
- **Font Weights**: 400, 500, 600, 700

### Layout Principles
- **Mobile-First**: تصميم يبدأ من الهاتف المحمول
- **Responsive Grid**: استخدام CSS Grid و Flexbox
- **Spacing**: نظام متسق للمسافات (4px base)
- **Border Radius**: زوايا مدورة (8px, 12px, 16px)
- **Shadows**: ظلال ناعمة للعمق البصري

### Visual Effects
- **Gradients**: تدرجات لونية ناعمة
- **Glass Effect**: تأثير الزجاج الضبابي
- **Hover States**: تفاعلات سلسة عند التمرير
- **Loading States**: مؤشرات تحميل جذابة

## 👥 قصص المستخدم (User Stories)

### العملاء (Guests)

#### US-001: تصفح الموقع
**كعميل، أريد أن أتصفح الموقع بسهولة لأتعرف على الخدمات المتاحة**
- عرض الصفحة الرئيسية مع معلومات المحل
- قائمة تنقل واضحة ومنظمة
- أقسام للخدمات والتصاميم والأقمشة
- معلومات التواصل والموقع

#### US-002: حجز موعد مجهول
**كعميل، أريد أن أحجز موعد دون الحاجة لإنشاء حساب**
- نموذج بسيط لحجز الموعد
- اختيار التاريخ والوقت المناسب
- إدخال معلومات التواصل الأساسية
- تأكيد الحجز عبر رسالة

#### US-003: تتبع الطلب
**كعميل، أريد أن أتابع حالة طلبي في أي وقت**
- البحث برقم الطلب أو رقم الهاتف
- عرض تفاصيل الطلب والحالة الحالية
- مراحل التقدم مع التواريخ المتوقعة
- إمكانية التواصل مع المحل

#### US-004: استعراض التصاميم
**كعميل، أريد أن أستعرض التصاميم الجاهزة لأختار ما يناسبني**
- معرض للتصاميم مع صور عالية الجودة
- تصنيفات واضحة (زفاف، سهرة، يومي)
- تفاصيل كل تصميم والأسعار
- إمكانية حفظ التصاميم في المفضلة

#### US-005: تصفح الأقمشة
**كعميل، أريد أن أتعرف على أنواع الأقمشة المتاحة وأسعارها**
- كتالوج شامل للأقمشة
- صور وأوصاف تفصيلية
- معلومات العناية والخصائص
- أسعار واضحة ومحدثة

### الإدارة (Admin)

#### US-006: إدارة المواعيد
**كمدير، أريد أن أدير المواعيد المحجوزة بكفاءة**
- عرض جميع المواعيد في تقويم
- تأكيد أو إلغاء المواعيد
- إضافة ملاحظات للمواعيد
- إرسال تذكيرات للعملاء

#### US-007: إدارة الطلبات
**كمدير، أريد أن أدير الطلبات من البداية حتى التسليم**
- إنشاء طلبات جديدة مع التفاصيل
- تعيين الطلبات للعمال المناسبين
- متابعة تقدم العمل
- تحديث حالة الطلبات

#### US-008: إدارة العمال
**كمدير، أريد أن أدير فريق العمل وأتابع أداءهم**
- إضافة وتعديل بيانات العمال
- تعيين الطلبات حسب التخصص
- متابعة الإنتاجية والجودة
- إدارة الصلاحيات والوصول

#### US-009: التقارير والإحصائيات
**كمدير، أريد أن أحصل على تقارير شاملة عن الأعمال**
- إحصائيات المبيعات والإيرادات
- تقارير الأداء والإنتاجية
- تحليل رضا العملاء
- توقعات النمو والتطوير

### العمال (Workers)

#### US-010: عرض الطلبات المعينة
**كعامل، أريد أن أرى الطلبات المعينة لي بوضوح**
- قائمة بالطلبات الحالية
- تفاصيل كل طلب والمتطلبات
- الأولويات والمواعيد النهائية
- تعليمات خاصة من الإدارة

#### US-011: تحديث حالة العمل
**كعامل، أريد أن أحدث حالة تقدم العمل**
- تغيير حالة الطلب (قيد التنفيذ، مكتمل)
- إضافة ملاحظات عن التقدم
- رفع صور للعمل المنجز
- تسجيل الوقت المستغرق

## 🗄️ مخطط قاعدة البيانات التفصيلي

### جدول Users
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'client' CHECK (role IN ('admin', 'worker', 'client')),
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    phone_verified BOOLEAN DEFAULT false,
    preferences JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### جدول Appointments
```sql
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    client_email VARCHAR(255),
    appointment_date DATE NOT NULL,
    appointment_time TIME NOT NULL,
    service_type VARCHAR(100) DEFAULT 'consultation',
    status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
    notes TEXT,
    reminder_sent BOOLEAN DEFAULT false,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### جدول Orders
```sql
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    client_phone VARCHAR(20) NOT NULL,
    client_email VARCHAR(255),
    dress_type VARCHAR(255) NOT NULL,
    fabric_type VARCHAR(255),
    fabric_color VARCHAR(100),
    measurements JSONB NOT NULL,
    special_requests TEXT,
    estimated_price DECIMAL(10,2),
    final_price DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'delivered', 'cancelled')),
    priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    due_date DATE,
    assigned_worker UUID REFERENCES users(id),
    progress_notes TEXT[],
    images TEXT[],
    completed_images TEXT[],
    voice_notes JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### جدول Designs
```sql
CREATE TABLE designs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    description TEXT,
    description_en TEXT,
    category VARCHAR(100) NOT NULL,
    subcategory VARCHAR(100),
    base_price DECIMAL(10,2) NOT NULL,
    estimated_hours INTEGER,
    difficulty_level VARCHAR(20) DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard', 'expert')),
    size_range VARCHAR(50) DEFAULT 'XS-XXL',
    main_image TEXT,
    images TEXT[],
    pattern_images TEXT[],
    measurements_required TEXT[],
    fabric_requirements JSONB DEFAULT '{}',
    customization_options JSONB DEFAULT '{}',
    tags TEXT[],
    is_featured BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### جدول Fabrics
```sql
CREATE TABLE fabrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255),
    type VARCHAR(100) NOT NULL,
    color VARCHAR(100),
    color_code VARCHAR(7),
    price_per_meter DECIMAL(8,2) NOT NULL,
    stock_meters INTEGER DEFAULT 0,
    supplier VARCHAR(255),
    care_instructions TEXT,
    composition VARCHAR(255),
    width_cm INTEGER,
    weight_gsm INTEGER,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### جدول Favorites
```sql
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, design_id)
);
```

### جدول Cart
```sql
CREATE TABLE cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    design_id UUID REFERENCES designs(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    selected_size VARCHAR(10),
    selected_color VARCHAR(100),
    customizations JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🔐 سياسات الأمان (RLS Policies)

### سياسات المواعيد
```sql
-- السماح للجميع بإنشاء مواعيد (حجز مجهول)
CREATE POLICY "Anyone can create appointments" ON appointments
    FOR INSERT WITH CHECK (true);

-- السماح للإدارة والعمال بعرض جميع المواعيد
CREATE POLICY "Admin and workers can view all appointments" ON appointments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'worker')
            AND users.is_active = true
        )
    );

-- السماح للإدارة بتحديث المواعيد
CREATE POLICY "Admin can update appointments" ON appointments
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
            AND users.is_active = true
        )
    );
```

### سياسات الطلبات
```sql
-- السماح للإدارة فقط بإنشاء طلبات
CREATE POLICY "Only admin can create orders" ON orders
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
            AND users.is_active = true
        )
    );

-- السماح للإدارة بعرض جميع الطلبات
CREATE POLICY "Admin can view all orders" ON orders
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'admin'
            AND users.is_active = true
        )
    );

-- السماح للعمال بعرض الطلبات المعينة لهم
CREATE POLICY "Workers can view assigned orders" ON orders
    FOR SELECT USING (
        assigned_worker = auth.uid() AND
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role = 'worker'
            AND users.is_active = true
        )
    );
```

## 🧩 مكونات واجهة المستخدم

### Header Component
```typescript
interface HeaderProps {
  isAuthenticated?: boolean;
  userRole?: 'admin' | 'worker' | 'client';
}

// المميزات:
// - شعار قابل للنقر (3 نقرات للوصول لتسجيل الدخول)
// - قائمة تنقل متجاوبة
// - أيقونات المفضلة والسلة مع العدادات
// - تبديل اللغة (عربي/إنجليزي)
// - قائمة منسدلة للمستخدم المسجل
```

### Hero Section
```typescript
// المميزات:
// - عنوان جذاب مع تأثيرات حركية
// - وصف مختصر للخدمات
// - أزرار دعوة للعمل (CTA)
// - صور خلفية متدرجة
// - تصميم متجاوب
```

### Services Grid
```typescript
interface Service {
  icon: LucideIcon;
  title: string;
  description: string;
  link: string;
  color: string;
  bgColor: string;
}

// الخدمات:
// 1. حجز موعد
// 2. استعلام عن الطلب
// 3. تفصيل احترافي
// 4. استشارة مجانية
```

### Ready Designs Showcase
```typescript
interface Design {
  id: number;
  title: string;
  description: string;
  category: string;
  images: string[];
  price: number;
  rating?: number;
  features?: string[];
}

// المميزات:
// - عرض شبكي متجاوب
// - تنقل بين صور التصميم
// - أزرار المفضلة والسلة
// - تصفية حسب الفئة
// - تأثيرات hover جذابة
```

### Appointment Booking Form
```typescript
interface AppointmentForm {
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  appointmentDate: string;
  appointmentTime: string;
  serviceType: string;
  notes?: string;
}

// المميزات:
// - تحقق من صحة البيانات
// - اختيار التاريخ والوقت
// - رسائل تأكيد
// - حفظ في قاعدة البيانات
```

### Order Tracking Interface
```typescript
interface OrderStatus {
  order_number: string;
  client_name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'delivered';
  progress_percentage: number;
  estimated_completion: string;
  current_stage: string;
}

// المميزات:
// - البحث برقم الطلب أو الهاتف
// - عرض مراحل التقدم
// - تواريخ متوقعة
// - معلومات التواصل
```

## 📱 تصميم متجاوب (Mobile-First)

### Breakpoints
```css
/* Mobile First Approach */
.container {
  /* Mobile: 320px - 767px */
  padding: 1rem;

  /* Tablet: 768px - 1023px */
  @media (min-width: 768px) {
    padding: 2rem;
  }

  /* Desktop: 1024px+ */
  @media (min-width: 1024px) {
    padding: 3rem;
    max-width: 1200px;
    margin: 0 auto;
  }
}
```

### Navigation Patterns
- **Mobile**: قائمة همبرغر منزلقة
- **Tablet**: قائمة أفقية مختصرة
- **Desktop**: قائمة كاملة مع قوائم فرعية

### Grid Systems
```css
.grid-responsive {
  display: grid;
  gap: 1rem;

  /* Mobile: عمود واحد */
  grid-template-columns: 1fr;

  /* Tablet: عمودين */
  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }

  /* Desktop: أربعة أعمدة */
  @media (min-width: 1024px) {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

## 🔄 تدفق العمليات (Business Logic)

### تدفق حجز الموعد
1. **العميل يملأ النموذج**
   - اختيار التاريخ والوقت
   - إدخال معلومات التواصل
   - تحديد نوع الخدمة

2. **التحقق من التوفر**
   - فحص المواعيد المحجوزة
   - التأكد من ساعات العمل
   - تجنب التعارض

3. **حفظ الموعد**
   - إنشاء سجل في قاعدة البيانات
   - إرسال تأكيد للعميل
   - إشعار الإدارة

4. **المتابعة**
   - إرسال تذكيرات
   - إمكانية التعديل أو الإلغاء
   - تحديث الحالة

### تدفق إدارة الطلبات
1. **إنشاء الطلب (الإدارة)**
   - إدخال بيانات العميل
   - تحديد نوع الفستان والقماش
   - أخذ القياسات
   - تحديد السعر والموعد

2. **تعيين العامل**
   - اختيار العامل المناسب
   - تحديد الأولوية
   - إرسال إشعار للعامل

3. **تنفيذ العمل**
   - العامل يبدأ العمل
   - تحديث حالة التقدم
   - رفع صور للمراحل
   - إضافة ملاحظات

4. **الإنجاز والتسليم**
   - إنهاء العمل
   - مراجعة الجودة
   - إشعار العميل
   - تحديث الحالة لـ "مسلم"

### تدفق تتبع الطلب
1. **البحث**
   - إدخال رقم الطلب أو الهاتف
   - التحقق من وجود الطلب
   - عرض النتائج

2. **عرض التفاصيل**
   - معلومات الطلب الأساسية
   - الحالة الحالية
   - مراحل التقدم
   - التواريخ المتوقعة

3. **التفاعل**
   - إمكانية التواصل
   - طلب تحديثات
   - تقييم الخدمة

## 🎯 متطلبات التكامل

### تكامل Supabase
```typescript
// إعداد العميل
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
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
```

### تكامل WhatsApp
```typescript
// إرسال طلبات عبر واتساب
const generateWhatsAppMessage = (cartItems: CartItem[]) => {
  const message = `
🌸 *طلب جديد من ياسمين الشام*

${cartItems.map(item => `
📦 *${item.name}*
   المقاس: ${item.selectedSize}
   اللون: ${item.selectedColor}
   الكمية: ${item.quantity}
   السعر: ${formatPrice(item.price)}
`).join('\n')}

💰 *المجموع*: ${formatPrice(getCartTotal())}

يرجى التواصل لتأكيد الطلب وتحديد موعد أخذ القياسات.
  `
  return encodeURIComponent(message.trim())
}
```

### تكامل الصور والملفات
```typescript
// رفع الصور إلى Supabase Storage
export const uploadImage = async (file: File, bucket: string, path: string) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (error) throw error
  return data
}

// تحويل الصور إلى Base64 للتخزين المحلي
export const convertToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = error => reject(error)
  })
}
```

## 🔧 متطلبات الأداء والأمان

### تحسين الأداء
1. **تحسين الصور**
   - استخدام Next.js Image component
   - تحسين تلقائي للأحجام
   - Lazy loading للصور

2. **تقسيم الكود**
   - Dynamic imports للمكونات الكبيرة
   - Route-based code splitting
   - تحميل المكتبات عند الحاجة

3. **التخزين المؤقت**
   - Zustand persist للحالة
   - Browser caching للأصول الثابتة
   - CDN للصور والملفات

### متطلبات الأمان
1. **مصادقة قوية**
   - JWT tokens مع انتهاء صلاحية
   - تشفير كلمات المرور
   - تحقق من الجلسات

2. **حماية البيانات**
   - Row Level Security في Supabase
   - تشفير البيانات الحساسة
   - تحقق من الصلاحيات

3. **حماية من الهجمات**
   - CSRF protection
   - XSS prevention
   - Rate limiting للAPI

## 📋 قائمة المهام للتطوير

### المرحلة الأولى: الأساسيات ✅
- [x] إعداد Next.js مع TypeScript
- [x] تكوين Tailwind CSS
- [x] إعداد Supabase
- [x] إنشاء مخطط قاعدة البيانات
- [x] تطوير المكونات الأساسية
- [x] تطبيق نظام إدارة الحالة

### المرحلة الثانية: الوظائف الأساسية ✅
- [x] صفحة حجز المواعيد
- [x] صفحة تتبع الطلبات
- [x] معرض التصاميم
- [x] كتالوج الأقمشة
- [x] نظام المفضلة والسلة
- [x] لوحة تحكم الإدارة

### المرحلة الثالثة: الميزات المتقدمة ✅
- [x] نظام إدارة العمال
- [x] رفع الصور والملاحظات الصوتية
- [x] نظام الترجمة ثنائي اللغة
- [x] تقارير وإحصائيات
- [x] تحسين الأداء والأمان

### المرحلة الرابعة: التحسينات والنشر 🔄
- [ ] اختبارات شاملة
- [ ] تحسين SEO
- [ ] إضافة PWA capabilities
- [ ] تحسين الأداء
- [ ] النشر على الإنتاج

## 🚀 تعليمات النشر

### متطلبات الإنتاج
1. **خادم الويب**: Vercel أو Netlify
2. **قاعدة البيانات**: Supabase Production
3. **CDN**: للصور والملفات الثابتة
4. **Domain**: نطاق مخصص
5. **SSL**: شهادة أمان

### خطوات النشر
1. **إعداد البيئة**
   ```bash
   # بناء المشروع
   npm run build

   # اختبار البناء
   npm run start
   ```

2. **إعداد متغيرات البيئة**
   ```env
   NEXT_PUBLIC_SUPABASE_URL=production_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=production_key
   NEXT_PUBLIC_APP_URL=https://yasminalsham.com
   ```

3. **نشر على Vercel**
   ```bash
   npm i -g vercel
   vercel --prod
   ```

## 📚 الوثائق والمراجع

### مراجع تقنية
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Framer Motion Documentation](https://www.framer.com/motion/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)

### أدلة التطوير
- [React Best Practices](https://react.dev/learn)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Performance Optimization](https://web.dev/performance/)

---

## 🎯 الخلاصة

هذا المشروع يمثل حلاً شاملاً ومتطوراً لمحل تفصيل الفساتين النسائية، يجمع بين:

1. **التقنيات الحديثة**: Next.js, TypeScript, Supabase
2. **تجربة مستخدم متميزة**: تصميم متجاوب وسهل الاستخدام
3. **إدارة فعالة**: أتمتة العمليات وتحسين الكفاءة
4. **أمان عالي**: حماية البيانات والمعاملات
5. **قابلية التوسع**: بنية قابلة للنمو والتطوير

المشروع جاهز للاستخدام ويمكن تطويره وتخصيصه حسب الحاجة، مع إمكانية إضافة ميزات جديدة بسهولة.

---

<div align="center">
  <p><strong>🌸 ياسمين الشام - حيث تلتقي الأناقة بالتكنولوجيا 🌸</strong></p>
  <p>© 2024 جميع الحقوق محفوظة</p>
</div>
