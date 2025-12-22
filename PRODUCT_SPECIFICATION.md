# Product Specification Document (PRD)
# مستند مواصفات المنتج

**Project Name:** Yasmin Al-Sham Tailoring Management System  
**اسم المشروع:** نظام إدارة تفصيل ياسمين الشام

**Version:** 1.0.0  
**Date:** December 19, 2025  
**Framework:** Next.js 15.3.6 with TypeScript  
**Database:** Supabase (PostgreSQL)

---

## 1. Executive Summary | الملخص التنفيذي

### 1.1 Product Overview
Yasmin Al-Sham is a comprehensive web-based tailoring management system designed for a custom dress tailoring business. The platform enables customers to browse designs, book appointments, place custom orders, and track their orders. It also provides a complete admin dashboard for managing workers, orders, appointments, inventory, and accounting.

نظام ياسمين الشام هو منصة ويب شاملة لإدارة أعمال تفصيل الفساتين. يتيح للعملاء تصفح التصاميم، حجز المواعيد، تقديم طلبات مخصصة، وتتبع طلباتهم. كما يوفر لوحة تحكم إدارية كاملة لإدارة العمال، الطلبات، المواعيد، المخزون، والمحاسبة.

### 1.2 Target Users | المستخدمون المستهدفون
- **Customers (العملاء):** Women seeking custom-tailored dresses
- **Admin (المدير):** Business owner managing all operations
- **Workers (العمال):** Tailors working on orders
- **Guests (الزوار):** Visitors browsing the website

### 1.3 Key Objectives | الأهداف الرئيسية
1. Streamline appointment booking process
2. Manage custom orders efficiently
3. Track worker assignments and productivity
4. Provide real-time order status updates
5. Enable online product browsing and purchasing
6. Comprehensive accounting and financial management

---

## 2. Core Features | الميزات الأساسية

### 2.1 Public Website (Frontend)

#### 2.1.1 Home Page (الصفحة الرئيسية)
- **Hero Section:** Eye-catching banner with call-to-action
- **Ready Designs:** Showcase of available dress designs
- **Featured Fabrics:** Display of premium fabrics
- **Mobile-First Design:** Snap scroll experience on mobile (TikTok/Reels style)
- **Responsive Layout:** Optimized for all screen sizes

#### 2.1.2 Designs Gallery (/designs)
- **Product Listing:** Grid view of all available designs
- **Search & Filter:** By category, price, fabric, occasion
- **Sort Options:** Price, popularity, newest
- **Quick View:** Modal preview of products
- **View Modes:** Grid 2x2 or 3x3 layout
- **Pagination:** Efficient loading of products

#### 2.1.3 Product Details (/designs/[id])
- **Image Gallery:** Multiple product images with zoom
- **Product Information:** Name, price, description, features
- **Size & Color Selection:** Available options
- **Add to Cart:** Shopping cart functionality
- **Add to Favorites:** Wishlist feature
- **Related Products:** Suggestions based on category

#### 2.1.4 Appointment Booking (/book-appointment)
- **Date Selection:** Calendar interface for choosing appointment date
- **Time Slots:** Available time slots (9:00 AM - 6:00 PM)
- **Customer Information:** Name, phone, email
- **Service Type:** Consultation, fitting, pickup
- **Notes:** Additional customer requirements
- **Real-time Availability:** Shows booked slots
- **Confirmation:** Success message with appointment details

### 2.2 Admin Dashboard (/dashboard)

#### 2.2.1 Dashboard Overview
- **Statistics Cards:**
  - Total Orders (إجمالي الطلبات)
  - Pending Orders (الطلبات المعلقة)
  - Completed Orders (الطلبات المكتملة)
  - Total Revenue (الإيرادات الإجمالية)
  - Active Workers (العمال النشطون)
  - Today's Appointments (مواعيد اليوم)
- **Charts & Analytics:** Visual representation of business metrics
- **Recent Activity:** Latest orders and appointments
- **Quick Actions:** Shortcuts to common tasks

#### 2.2.2 Orders Management (/dashboard/orders)
- **Order Listing:** All orders with status indicators
- **Search & Filter:** By status, worker, date, customer
- **Order Details:** Complete order information
- **Status Management:**
  - Pending (معلق)
  - In Progress (قيد التنفيذ)
  - Completed (مكتمل)
  - Delivered (تم التسليم)
  - Cancelled (ملغي)
- **Worker Assignment:** Assign orders to tailors
- **Payment Tracking:** Total amount, paid amount, remaining amount
- **Order Timeline:** Track progress stages
- **Edit & Delete:** Modify or remove orders
- **Completed Work Upload:** Upload photos of finished work

#### 2.2.3 Appointments Management (/dashboard/appointments)
- **Appointment Calendar:** Visual calendar view
- **Appointment List:** All scheduled appointments
- **Status Management:**
  - Scheduled (مجدول)
  - Confirmed (مؤكد)
  - Completed (مكتمل)
  - Cancelled (ملغي)
- **Customer Details:** Contact information and notes
- **Reschedule:** Change appointment date/time
- **Convert to Order:** Create order from appointment

#### 2.2.4 Workers Management (/dashboard/workers)
- **Worker Profiles:** Name, specialty, contact info
- **Active/Inactive Status:** Enable/disable workers
- **Workload Tracking:** Number of assigned orders
- **Performance Metrics:** Completed orders, ratings
- **Add/Edit/Delete:** Manage worker records

#### 2.2.5 Products Management (/dashboard/products)
- **Product Catalog:** All products with images
- **Add New Product:** Create product listings
- **Edit Product:** Update product details
- **Stock Management:** Track inventory levels
- **Category Management:** Organize products
- **Featured Products:** Mark products as featured
- **Sale Pricing:** Set discounted prices

#### 2.2.6 Accounting System (/dashboard/accounting)
- **Chart of Accounts:** Complete account hierarchy
- **Journal Entries:** Record financial transactions
- **Invoices:** Generate and manage invoices
- **Payments:** Track incoming and outgoing payments
- **Suppliers:** Manage supplier information
- **Financial Reports:**
  - Trial Balance (ميزان المراجعة)
  - General Ledger (دفتر الأستاذ)
  - Balance Sheet (الميزانية العمومية)
  - Income Statement (قائمة الدخل)
  - Cash Flow (التدفق النقدي)

---

## 3. Technical Specifications | المواصفات التقنية

### 3.1 Technology Stack

#### Frontend
- **Framework:** Next.js 15.3.6 (React 19)
- **Language:** TypeScript 5
- **Styling:** TailwindCSS 4
- **State Management:** Zustand 5.0.5
- **Forms:** React Hook Form 7.58.1 + Zod 3.25.67
- **Animations:** Framer Motion 12.18.1
- **Icons:** Lucide React 0.522.0
- **Notifications:** React Hot Toast 2.6.0
- **Internationalization:** next-intl 4.1.0
- **Carousel:** Embla Carousel 8.6.0

#### Backend
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth
- **Storage:** Supabase Storage
- **API:** Next.js API Routes
- **ORM:** Supabase Client 2.76.1

#### Development Tools
- **Package Manager:** npm
- **Linting:** ESLint 9
- **Type Checking:** TypeScript
- **Build Tool:** Next.js with Turbopack

### 3.2 Database Schema

#### Core Tables
1. **users** - User accounts (admin, worker, customer)
2. **workers** - Tailor profiles and information
3. **appointments** - Customer appointment bookings
4. **orders** - Custom tailoring orders
5. **products** - Ready-made designs catalog
6. **categories** - Product categorization
7. **fabrics** - Available fabric inventory
8. **favorites** - Customer wishlist
9. **cart_items** - Shopping cart items

#### Accounting Tables
10. **accounts** - Chart of accounts
11. **journal_entries** - Financial transactions
12. **invoices** - Customer invoices
13. **payments** - Payment records
14. **suppliers** - Supplier information

### 3.3 Security Features
- **Row Level Security (RLS):** Supabase policies for data access
- **Authentication:** Secure user login and session management
- **Authorization:** Role-based access control (Admin, Worker, Customer)
- **Data Validation:** Zod schemas for form validation
- **Environment Variables:** Secure API key storage
- **HTTPS:** Encrypted data transmission

### 3.4 Performance Optimizations
- **Code Splitting:** Dynamic imports for heavy components
- **Image Optimization:** Next.js Image component with WebP/AVIF
- **Caching:** Client-side caching with Zustand persist
- **Lazy Loading:** On-demand component loading
- **Database Indexing:** Optimized queries
- **CDN:** Static asset delivery via Vercel

---

## 4. User Flows | تدفقات المستخدم

### 4.1 Customer Journey - Appointment Booking
1. Visit homepage
2. Click "Book Appointment" (حجز موعد)
3. Select date from calendar
4. Choose available time slot
5. Fill in contact information
6. Select service type
7. Add notes (optional)
8. Submit booking
9. Receive confirmation

### 4.2 Customer Journey - Order Placement
1. Browse designs gallery
2. View product details
3. Select size and color
4. Add to cart or favorites
5. Proceed to checkout
6. Fill in delivery information
7. Confirm order
8. Track order status

### 4.3 Admin Workflow - Order Management
1. Login to dashboard
2. View new orders
3. Assign order to worker
4. Update order status
5. Track payment
6. Upload completed work photos
7. Mark as delivered
8. Generate invoice

### 4.4 Worker Workflow
1. Login to dashboard
2. View assigned orders
3. Start working on order
4. Update progress
5. Upload completed work
6. Mark order as complete

---

## 5. API Endpoints | نقاط النهاية

### 5.1 Appointments API
- `GET /api/appointments` - List all appointments
- `POST /api/appointments` - Create new appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Cancel appointment

### 5.2 Orders API
- `GET /api/orders` - List all orders
- `POST /api/orders` - Create new order
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Delete order

### 5.3 Products API
- `GET /api/products` - List all products
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product (admin)
- `PUT /api/products/:id` - Update product (admin)

### 5.4 Workers API
- `GET /api/workers` - List all workers
- `POST /api/workers` - Add new worker
- `PUT /api/workers/:id` - Update worker
- `DELETE /api/workers/:id` - Remove worker

---

## 6. Non-Functional Requirements | المتطلبات غير الوظيفية

### 6.1 Performance
- Page load time: < 3 seconds
- Time to Interactive (TTI): < 5 seconds
- First Contentful Paint (FCP): < 2 seconds
- Mobile performance score: > 90

### 6.2 Scalability
- Support 1000+ concurrent users
- Handle 10,000+ products
- Process 100+ orders per day

### 6.3 Availability
- Uptime: 99.9%
- Backup frequency: Daily
- Disaster recovery: < 24 hours

### 6.4 Usability
- Mobile-first responsive design
- RTL (Right-to-Left) support for Arabic
- Bilingual interface (Arabic/English)
- Accessibility: WCAG 2.1 Level AA

### 6.5 Browser Support
- Chrome (latest 2 versions)
- Firefox (latest 2 versions)
- Safari (latest 2 versions)
- Edge (latest 2 versions)
- Mobile browsers (iOS Safari, Chrome Mobile)

---

## 7. Future Enhancements | التحسينات المستقبلية

### Phase 2 Features
- [ ] SMS notifications for appointments
- [ ] Email notifications for order updates
- [ ] Customer portal for order tracking
- [ ] Online payment integration
- [ ] Fabric customization tool
- [ ] 3D dress preview
- [ ] Customer reviews and ratings
- [ ] Loyalty program
- [ ] Referral system

### Phase 3 Features
- [ ] Mobile app (iOS/Android)
- [ ] AI-powered design recommendations
- [ ] Virtual fitting room
- [ ] Live chat support
- [ ] Multi-location support
- [ ] Advanced analytics dashboard
- [ ] Inventory forecasting
- [ ] Automated marketing campaigns

---

## 8. Success Metrics | مقاييس النجاح

### 8.1 Business Metrics
- Number of appointments booked per month
- Order conversion rate
- Average order value
- Customer retention rate
- Revenue growth

### 8.2 Technical Metrics
- Page load performance
- Error rate
- API response time
- Database query performance
- User engagement metrics

### 8.3 User Satisfaction
- Customer satisfaction score (CSAT)
- Net Promoter Score (NPS)
- User feedback and reviews
- Support ticket volume

---

## 9. Deployment Information | معلومات النشر

### 9.1 Hosting
- **Platform:** Vercel
- **Region:** US East (iad1)
- **Domain:** TBD
- **SSL:** Automatic HTTPS

### 9.2 Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL=<supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<supabase-service-role-key>
TESTSPRITE_API_KEY=<testsprite-api-key>
```

### 9.3 Build Configuration
- **Build Command:** `npm run build`
- **Install Command:** `npm install`
- **Dev Command:** `npm run dev`
- **Port:** 3001 (development)

---

## 10. Testing Strategy | استراتيجية الاختبار

### 10.1 Test Types
- **Unit Tests:** Component and function testing
- **Integration Tests:** API and database testing
- **E2E Tests:** User flow testing with TestSprite
- **Performance Tests:** Load and stress testing
- **Security Tests:** Vulnerability scanning

### 10.2 Test Coverage Goals
- Code coverage: > 80%
- Critical paths: 100%
- API endpoints: 100%

### 10.3 Testing Tools
- **TestSprite MCP:** Automated E2E testing
- **Jest:** Unit testing
- **React Testing Library:** Component testing
- **Playwright:** Browser automation

---

## Appendix | الملحق

### A. Glossary | المصطلحات
- **PRD:** Product Requirements Document
- **RTL:** Right-to-Left
- **RLS:** Row Level Security
- **API:** Application Programming Interface
- **E2E:** End-to-End
- **CSAT:** Customer Satisfaction Score
- **NPS:** Net Promoter Score

### B. References | المراجع
- Next.js Documentation: https://nextjs.org/docs
- Supabase Documentation: https://supabase.com/docs
- TailwindCSS Documentation: https://tailwindcss.com/docs
- TestSprite Documentation: https://testsprite.com/docs

---

**Document Status:** ✅ Approved for Testing
**Last Updated:** December 19, 2025
**Prepared By:** Yasmin Al-Sham Development Team


