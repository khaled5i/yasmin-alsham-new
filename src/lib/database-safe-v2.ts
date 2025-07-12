// خدمة قاعدة البيانات الآمنة المحدثة v2.0 - مع بديل عندما لا يكون Supabase مُعد
// Safe database service v2.0 with fallback for when Supabase is not configured

import { supabase, isSupabaseConfigured } from './supabase'
import { 
  userService, 
  workerService, 
  designService, 
  appointmentService, 
  orderService, 
  favoriteService, 
  cartService,
  type Design,
  type Appointment,
  type Order,
  type Worker,
  type User,
  type Favorite,
  type CartItem
} from './database-v2'

// بيانات تجريبية محدثة للتطوير عندما لا يكون Supabase مُعد
const mockData = {
  users: [
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      email: 'client1@example.com',
      full_name: 'سارة علي',
      phone: '+963-987-333333',
      role: 'client' as const,
      is_active: true,
      email_verified: true,
      phone_verified: false,
      preferences: {},
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440004',
      email: 'client2@example.com',
      full_name: 'نور حسن',
      phone: '+963-987-444444',
      role: 'client' as const,
      is_active: true,
      email_verified: true,
      phone_verified: false,
      preferences: {},
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],

  workers: [
    {
      id: 'worker-1',
      user_id: '550e8400-e29b-41d4-a716-446655440001',
      specialty: 'فساتين زفاف',
      experience_years: 8,
      hourly_rate: 50.00,
      performance_rating: 4.8,
      total_completed_orders: 156,
      skills: ['خياطة يدوية', 'تطريز', 'تصميم'],
      availability: {
        sunday: '16:00-22:00',
        monday: '16:00-22:00',
        tuesday: '16:00-22:00',
        wednesday: '16:00-22:00',
        thursday: '16:00-22:00',
        saturday: '16:00-22:00'
      },
      bio: 'خياطة متخصصة في فساتين الزفاف مع خبرة 8 سنوات في التصميم والتطريز اليدوي',
      portfolio_images: ['/portfolio/worker1-1.jpg', '/portfolio/worker1-2.jpg'],
      is_available: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'worker-2',
      user_id: '550e8400-e29b-41d4-a716-446655440002',
      specialty: 'فساتين سهرة',
      experience_years: 5,
      hourly_rate: 40.00,
      performance_rating: 4.5,
      total_completed_orders: 89,
      skills: ['خياطة آلة', 'تفصيل', 'تشطيب'],
      availability: {
        sunday: '16:00-22:00',
        monday: '16:00-22:00',
        tuesday: '16:00-22:00',
        wednesday: '16:00-22:00',
        thursday: '16:00-22:00',
        saturday: '16:00-22:00'
      },
      bio: 'خياطة ماهرة في فساتين السهرة والمناسبات الخاصة',
      portfolio_images: ['/portfolio/worker2-1.jpg'],
      is_available: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ],

  designs: [
    {
      id: 'design-1',
      name: 'فستان زفاف كلاسيكي',
      name_en: 'Classic Wedding Dress',
      description: 'فستان زفاف أنيق بتصميم كلاسيكي مع تطريز يدوي فاخر وتفاصيل دانتيل رقيقة',
      description_en: 'Elegant wedding dress with classic design, luxurious hand embroidery and delicate lace details',
      category: 'زفاف',
      subcategory: 'كلاسيكي',
      base_price: 2500.00,
      estimated_hours: 40,
      difficulty_level: 'hard' as const,
      size_range: 'XS-XXL',
      main_image: '/wedding-dress-1.jpg.jpg',
      images: ['/wedding-dress-1.jpg.jpg', '/wedding-dress-1a.jpg.jpg', '/wedding-dress-1b.jpg.jpg'],
      pattern_images: ['/patterns/wedding-classic-pattern.jpg'],
      measurements_required: ['محيط الصدر', 'محيط الخصر', 'محيط الورك', 'الطول الكامل', 'طول الكم'],
      fabric_requirements: {
        main_fabric: 'ساتان أو شيفون عالي الجودة',
        lining: 'قطن ناعم',
        decoration: 'دانتيل فرنسي',
        meters_needed: 8
      },
      customization_options: {
        sleeve_style: ['بدون أكمام', 'أكمام طويلة', 'أكمام قصيرة', 'أكمام 3/4'],
        train_length: ['بدون ذيل', 'ذيل قصير', 'ذيل متوسط', 'ذيل طويل'],
        neckline: ['مستدير', 'على شكل V', 'مربع', 'قارب'],
        embroidery: ['بدون تطريز', 'تطريز فضي', 'تطريز ذهبي', 'تطريز ملون']
      },
      tags: ['زفاف', 'كلاسيكي', 'أنيق', 'فاخر'],
      is_featured: true,
      is_active: true,
      view_count: 245,
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'design-2',
      name: 'فستان سهرة فاخر',
      name_en: 'Luxury Evening Dress',
      description: 'فستان سهرة فاخر مناسب للمناسبات الخاصة والحفلات الراقية',
      description_en: 'Luxury evening dress perfect for special occasions and elegant parties',
      category: 'سهرة',
      subcategory: 'فاخر',
      base_price: 1800.00,
      estimated_hours: 25,
      difficulty_level: 'medium' as const,
      size_range: 'XS-XL',
      main_image: '/wedding-dress-2.jpg.jpg',
      images: ['/wedding-dress-2.jpg.jpg', '/wedding-dress-2a.jpg.jpg', '/wedding-dress-2b.jpg.jpg'],
      pattern_images: ['/patterns/evening-luxury-pattern.jpg'],
      measurements_required: ['محيط الصدر', 'محيط الخصر', 'محيط الورك', 'الطول'],
      fabric_requirements: {
        main_fabric: 'ساتان أو شيفون',
        decoration: 'تطريز أو خرز',
        meters_needed: 5
      },
      customization_options: {
        color: ['أحمر', 'أزرق', 'أسود', 'ذهبي', 'فضي', 'وردي'],
        length: ['قصير', 'متوسط', 'طويل'],
        back_style: ['مغلق', 'مفتوح', 'نصف مفتوح'],
        decoration: ['بدون زينة', 'خرز', 'ترتر', 'تطريز']
      },
      tags: ['سهرة', 'فاخر', 'مناسبات', 'أنيق'],
      is_featured: true,
      is_active: true,
      view_count: 189,
      created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'design-3',
      name: 'فستان يومي عملي',
      name_en: 'Casual Daily Dress',
      description: 'فستان يومي مريح وعملي للاستخدام اليومي والعمل',
      description_en: 'Comfortable and practical daily dress for everyday wear and work',
      category: 'يومي',
      subcategory: 'عملي',
      base_price: 800.00,
      estimated_hours: 15,
      difficulty_level: 'easy' as const,
      size_range: 'XS-XXL',
      main_image: '/wedding-dress-3.jpg.jpg',
      images: ['/wedding-dress-3.jpg.jpg', '/wedding-dress-3a.jpg.jpg'],
      pattern_images: ['/patterns/daily-casual-pattern.jpg'],
      measurements_required: ['محيط الصدر', 'محيط الخصر', 'الطول'],
      fabric_requirements: {
        main_fabric: 'قطن أو كتان',
        meters_needed: 3
      },
      customization_options: {
        sleeve_length: ['بدون أكمام', 'أكمام قصيرة', 'أكمام 3/4', 'أكمام طويلة'],
        pattern: ['سادة', 'مخطط', 'منقط', 'مزهر'],
        fit: ['ضيق', 'عادي', 'واسع'],
        collar: ['بدون ياقة', 'ياقة مستديرة', 'ياقة V', 'ياقة قميص']
      },
      tags: ['يومي', 'مريح', 'عملي', 'بسيط'],
      is_featured: false,
      is_active: true,
      view_count: 156,
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'design-4',
      name: 'فستان خطوبة رومانسي',
      name_en: 'Romantic Engagement Dress',
      description: 'فستان خطوبة رومانسي بتفاصيل دانتيل وتصميم أنثوي ناعم',
      description_en: 'Romantic engagement dress with lace details and soft feminine design',
      category: 'خطوبة',
      subcategory: 'رومانسي',
      base_price: 1500.00,
      estimated_hours: 30,
      difficulty_level: 'medium' as const,
      size_range: 'XS-XL',
      main_image: '/wedding-dress-4.jpg.jpg',
      images: ['/wedding-dress-4.jpg.jpg', '/wedding-dress-4a.jpg.jpg', '/wedding-dress-4b.jpg.jpg'],
      pattern_images: ['/patterns/engagement-romantic-pattern.jpg'],
      measurements_required: ['محيط الصدر', 'محيط الخصر', 'محيط الورك', 'الطول'],
      fabric_requirements: {
        main_fabric: 'شيفون أو تول',
        decoration: 'دانتيل',
        meters_needed: 6
      },
      customization_options: {
        color: ['أبيض', 'كريمي', 'وردي فاتح', 'خوخي', 'بيج'],
        skirt_style: ['A-line', 'مستقيم', 'منفوش', 'حورية البحر'],
        waist_style: ['طبيعي', 'عالي', 'منخفض'],
        lace_amount: ['قليل', 'متوسط', 'كثير']
      },
      tags: ['خطوبة', 'رومانسي', 'دانتيل', 'ناعم'],
      is_featured: true,
      is_active: true,
      view_count: 203,
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ],

  appointments: [
    {
      id: 'appointment-1',
      client_id: '550e8400-e29b-41d4-a716-446655440003',
      worker_id: 'worker-1',
      appointment_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      appointment_time: '16:00',
      duration_minutes: 60,
      type: 'consultation' as const,
      status: 'scheduled' as const,
      service_type: 'استشارة تصميم فستان زفاف',
      notes: 'العميلة تريد فستان زفاف كلاسيكي مع تطريز ذهبي',
      client_notes: 'أفضل الألوان الفاتحة والتصاميم الكلاسيكية',
      worker_notes: '',
      reminder_sent: false,
      confirmation_sent: true,
      cancellation_reason: '',
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'appointment-2',
      client_id: '550e8400-e29b-41d4-a716-446655440004',
      worker_id: 'worker-2',
      appointment_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      appointment_time: '18:00',
      duration_minutes: 90,
      type: 'fitting' as const,
      status: 'confirmed' as const,
      service_type: 'قياس فستان سهرة',
      notes: 'قياس أولي لفستان السهرة الأحمر',
      client_notes: 'أريد الفستان ضيق من الأعلى وواسع من الأسفل',
      worker_notes: 'تحتاج تعديل في منطقة الخصر',
      reminder_sent: false,
      confirmation_sent: true,
      cancellation_reason: '',
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ],

  orders: [
    {
      id: 'order-1',
      order_number: '2025001',
      client_id: '550e8400-e29b-41d4-a716-446655440003',
      worker_id: 'worker-1',
      status: 'in_progress' as const,
      order_type: 'custom' as const,
      priority: 'normal' as const,
      subtotal: 2500.00,
      fabric_cost: 300.00,
      labor_cost: 2200.00,
      additional_costs: 0.00,
      discount_amount: 0.00,
      tax_amount: 0.00,
      total_amount: 2500.00,
      payment_status: 'partial' as const,
      payment_method: 'cash',
      paid_amount: 1000.00,
      estimated_completion_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      client_notes: 'فستان زفاف أبيض مع تطريز ذهبي، أريده جاهز قبل نهاية الشهر',
      worker_notes: 'تم البدء في التفصيل، القياسات مأخوذة',
      internal_notes: 'عميلة مهمة، يجب الانتهاء في الوقت المحدد',
      measurements: {
        chest: '90cm',
        waist: '70cm',
        hips: '95cm',
        length: '160cm',
        sleeve_length: '60cm'
      },
      special_instructions: 'تطريز ذهبي على الصدر والأكمام',
      rush_order: false,
      rush_fee: 0.00,
      created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'order-2',
      order_number: '2025002',
      client_id: '550e8400-e29b-41d4-a716-446655440004',
      worker_id: 'worker-2',
      status: 'confirmed' as const,
      order_type: 'custom' as const,
      priority: 'normal' as const,
      subtotal: 1800.00,
      fabric_cost: 250.00,
      labor_cost: 1550.00,
      additional_costs: 0.00,
      discount_amount: 0.00,
      tax_amount: 0.00,
      total_amount: 1800.00,
      payment_status: 'pending' as const,
      payment_method: '',
      paid_amount: 0.00,
      estimated_completion_date: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      client_notes: 'فستان سهرة أحمر للحفلة، أريده أنيق ومميز',
      worker_notes: 'في انتظار تأكيد القياسات النهائية',
      internal_notes: '',
      measurements: {
        chest: '85cm',
        waist: '65cm',
        hips: '90cm',
        length: '140cm'
      },
      special_instructions: 'ظهر مفتوح مع إغلاق خفي',
      rush_order: false,
      rush_fee: 0.00,
      created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ],

  favorites: [
    {
      id: 'favorite-1',
      user_id: '550e8400-e29b-41d4-a716-446655440003',
      design_id: 'design-1',
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'favorite-2',
      user_id: '550e8400-e29b-41d4-a716-446655440003',
      design_id: 'design-4',
      created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
    },
    {
      id: 'favorite-3',
      user_id: '550e8400-e29b-41d4-a716-446655440004',
      design_id: 'design-2',
      created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
    }
  ],

  cartItems: [
    {
      id: 'cart-1',
      user_id: '550e8400-e29b-41d4-a716-446655440004',
      design_id: 'design-3',
      product_id: undefined,
      fabric_id: undefined,
      item_type: 'design' as const,
      quantity: 1,
      customizations: {
        color: 'أزرق',
        size: 'M',
        sleeve_length: 'أكمام قصيرة',
        pattern: 'سادة'
      },
      measurements: {
        chest: '85cm',
        waist: '65cm',
        length: '120cm'
      },
      notes: 'أريده مريح للعمل',
      created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }
  ]
}

// خدمة قاعدة البيانات الآمنة المحدثة
export const safeDatabase = {
  // خدمة التصاميم
  designs: {
    async getAll(filters?: { category?: string; featured?: boolean }) {
      if (!isSupabaseConfigured()) {
        let designs = [...mockData.designs]

        if (filters?.category) {
          designs = designs.filter(d => d.category === filters.category)
        }

        if (filters?.featured) {
          designs = designs.filter(d => d.is_featured === true)
        }

        return { data: designs, error: null }
      }

      try {
        return await designService.getAllDesigns(filters)
      } catch (error) {
        console.warn('Supabase error, using mock data:', error)
        return { data: mockData.designs, error: null }
      }
    },

    async getById(id: string) {
      if (!isSupabaseConfigured()) {
        const design = mockData.designs.find(d => d.id === id)
        if (design) {
          // محاكاة زيادة عداد المشاهدات
          design.view_count += 1
        }
        return { data: design || null, error: design ? null : 'Design not found' }
      }

      try {
        return await designService.getDesign(id)
      } catch (error) {
        console.warn('Supabase error:', error)
        const design = mockData.designs.find(d => d.id === id)
        return { data: design || null, error: design ? null : 'Design not found' }
      }
    },

    async create(design: any) {
      if (!isSupabaseConfigured()) {
        const newDesign = {
          ...design,
          id: `design-${Date.now()}`,
          view_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        mockData.designs.push(newDesign)
        return { data: newDesign, error: null }
      }

      try {
        return await designService.createDesign(design)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to create design' }
      }
    }
  },

  // خدمة المواعيد
  appointments: {
    async getAll(filters?: { clientId?: string; workerId?: string; status?: string }) {
      if (!isSupabaseConfigured()) {
        let appointments = [...mockData.appointments]

        if (filters?.clientId) {
          appointments = appointments.filter(a => a.client_id === filters.clientId)
        }

        if (filters?.workerId) {
          appointments = appointments.filter(a => a.worker_id === filters.workerId)
        }

        if (filters?.status) {
          appointments = appointments.filter(a => a.status === filters.status)
        }

        return { data: appointments, error: null }
      }

      try {
        return await appointmentService.getAllAppointments(filters)
      } catch (error) {
        console.warn('Supabase error, using mock data:', error)
        return { data: mockData.appointments, error: null }
      }
    },

    async create(appointment: any) {
      if (!isSupabaseConfigured()) {
        const newAppointment = {
          ...appointment,
          id: `appointment-${Date.now()}`,
          reminder_sent: false,
          confirmation_sent: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        mockData.appointments.push(newAppointment)
        return { data: newAppointment, error: null }
      }

      try {
        return await appointmentService.createAppointment(appointment)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to create appointment' }
      }
    },

    async update(appointmentId: string, updates: any) {
      if (!isSupabaseConfigured()) {
        const appointmentIndex = mockData.appointments.findIndex(a => a.id === appointmentId)
        if (appointmentIndex !== -1) {
          mockData.appointments[appointmentIndex] = {
            ...mockData.appointments[appointmentIndex],
            ...updates,
            updated_at: new Date().toISOString()
          }
          return { data: mockData.appointments[appointmentIndex], error: null }
        }
        return { data: null, error: 'Appointment not found' }
      }

      try {
        return await appointmentService.updateAppointment(appointmentId, updates)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to update appointment' }
      }
    }
  },

  // خدمة الطلبات
  orders: {
    async getAll(filters?: { clientId?: string; workerId?: string; status?: string }) {
      if (!isSupabaseConfigured()) {
        let orders = [...mockData.orders]

        if (filters?.clientId) {
          orders = orders.filter(o => o.client_id === filters.clientId)
        }

        if (filters?.workerId) {
          orders = orders.filter(o => o.worker_id === filters.workerId)
        }

        if (filters?.status) {
          orders = orders.filter(o => o.status === filters.status)
        }

        return { data: orders, error: null }
      }

      try {
        return await orderService.getAllOrders(filters)
      } catch (error) {
        console.warn('Supabase error, using mock data:', error)
        return { data: mockData.orders, error: null }
      }
    },

    async getById(orderId: string) {
      if (!isSupabaseConfigured()) {
        const order = mockData.orders.find(o => o.id === orderId)
        return { data: order || null, error: order ? null : 'Order not found' }
      }

      try {
        return await orderService.getOrder(orderId)
      } catch (error) {
        console.warn('Supabase error:', error)
        const order = mockData.orders.find(o => o.id === orderId)
        return { data: order || null, error: order ? null : 'Order not found' }
      }
    },

    async create(orderData: any, orderItems: any[]) {
      if (!isSupabaseConfigured()) {
        const newOrder = {
          ...orderData,
          id: `order-${Date.now()}`,
          order_number: `2025${String(mockData.orders.length + 1).padStart(3, '0')}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        mockData.orders.push(newOrder)
        return { data: newOrder, error: null }
      }

      try {
        return await orderService.createOrder(orderData, orderItems)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to create order' }
      }
    },

    async update(orderId: string, updates: any) {
      if (!isSupabaseConfigured()) {
        const orderIndex = mockData.orders.findIndex(o => o.id === orderId)
        if (orderIndex !== -1) {
          mockData.orders[orderIndex] = {
            ...mockData.orders[orderIndex],
            ...updates,
            updated_at: new Date().toISOString()
          }
          return { data: mockData.orders[orderIndex], error: null }
        }
        return { data: null, error: 'Order not found' }
      }

      try {
        return await orderService.updateOrder(orderId, updates)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to update order' }
      }
    }
  },

  // خدمة العمال
  workers: {
    async getAll() {
      if (!isSupabaseConfigured()) {
        return { data: mockData.workers, error: null }
      }

      try {
        return await workerService.getAllWorkers()
      } catch (error) {
        console.warn('Supabase error, using mock data:', error)
        return { data: mockData.workers, error: null }
      }
    },

    async getById(workerId: string) {
      if (!isSupabaseConfigured()) {
        const worker = mockData.workers.find(w => w.id === workerId)
        return { data: worker || null, error: worker ? null : 'Worker not found' }
      }

      try {
        return await workerService.getWorker(workerId)
      } catch (error) {
        console.warn('Supabase error:', error)
        const worker = mockData.workers.find(w => w.id === workerId)
        return { data: worker || null, error: worker ? null : 'Worker not found' }
      }
    }
  },

  // خدمة المفضلة
  favorites: {
    async getUserFavorites(userId: string) {
      if (!isSupabaseConfigured()) {
        const userFavorites = mockData.favorites
          .filter(f => f.user_id === userId)
          .map(f => ({
            ...f,
            design: mockData.designs.find(d => d.id === f.design_id)
          }))
        return { data: userFavorites, error: null }
      }

      try {
        return await favoriteService.getUserFavorites(userId)
      } catch (error) {
        console.warn('Supabase error, using mock data:', error)
        return { data: [], error: null }
      }
    },

    async addToFavorites(userId: string, designId: string) {
      if (!isSupabaseConfigured()) {
        const newFavorite = {
          id: `favorite-${Date.now()}`,
          user_id: userId,
          design_id: designId,
          created_at: new Date().toISOString()
        }
        mockData.favorites.push(newFavorite)
        return { data: newFavorite, error: null }
      }

      try {
        return await favoriteService.addToFavorites(userId, designId)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to add to favorites' }
      }
    },

    async removeFromFavorites(userId: string, designId: string) {
      if (!isSupabaseConfigured()) {
        const favoriteIndex = mockData.favorites.findIndex(
          f => f.user_id === userId && f.design_id === designId
        )
        if (favoriteIndex !== -1) {
          mockData.favorites.splice(favoriteIndex, 1)
        }
        return { error: null }
      }

      try {
        return await favoriteService.removeFromFavorites(userId, designId)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { error: 'Failed to remove from favorites' }
      }
    }
  },

  // خدمة عربة التسوق
  cart: {
    async getCartItems(userId: string) {
      if (!isSupabaseConfigured()) {
        const userCartItems = mockData.cartItems
          .filter(c => c.user_id === userId)
          .map(c => ({
            ...c,
            design: c.design_id ? mockData.designs.find(d => d.id === c.design_id) : undefined
          }))
        return { data: userCartItems, error: null }
      }

      try {
        return await cartService.getCartItems(userId)
      } catch (error) {
        console.warn('Supabase error, using mock data:', error)
        return { data: [], error: null }
      }
    },

    async addToCart(cartItemData: any) {
      if (!isSupabaseConfigured()) {
        const newCartItem = {
          ...cartItemData,
          id: `cart-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
        mockData.cartItems.push(newCartItem)
        return { data: newCartItem, error: null }
      }

      try {
        return await cartService.addToCart(cartItemData)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to add to cart' }
      }
    },

    async updateCartItem(cartItemId: string, updates: any) {
      if (!isSupabaseConfigured()) {
        const cartItemIndex = mockData.cartItems.findIndex(c => c.id === cartItemId)
        if (cartItemIndex !== -1) {
          mockData.cartItems[cartItemIndex] = {
            ...mockData.cartItems[cartItemIndex],
            ...updates,
            updated_at: new Date().toISOString()
          }
          return { data: mockData.cartItems[cartItemIndex], error: null }
        }
        return { data: null, error: 'Cart item not found' }
      }

      try {
        return await cartService.updateCartItem(cartItemId, updates)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to update cart item' }
      }
    },

    async removeFromCart(cartItemId: string) {
      if (!isSupabaseConfigured()) {
        const cartItemIndex = mockData.cartItems.findIndex(c => c.id === cartItemId)
        if (cartItemIndex !== -1) {
          mockData.cartItems.splice(cartItemIndex, 1)
        }
        return { error: null }
      }

      try {
        return await cartService.removeFromCart(cartItemId)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { error: 'Failed to remove from cart' }
      }
    },

    async clearCart(userId: string) {
      if (!isSupabaseConfigured()) {
        mockData.cartItems = mockData.cartItems.filter(c => c.user_id !== userId)
        return { error: null }
      }

      try {
        return await cartService.clearCart(userId)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { error: 'Failed to clear cart' }
      }
    }
  },

  // خدمة المستخدمين
  users: {
    async getProfile(userId: string) {
      if (!isSupabaseConfigured()) {
        const user = mockData.users.find(u => u.id === userId)
        return { data: user || null, error: user ? null : 'User not found' }
      }

      try {
        return await userService.getUserProfile(userId)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to get user profile' }
      }
    },

    async updateProfile(userId: string, updates: any) {
      if (!isSupabaseConfigured()) {
        const userIndex = mockData.users.findIndex(u => u.id === userId)
        if (userIndex !== -1) {
          mockData.users[userIndex] = {
            ...mockData.users[userIndex],
            ...updates,
            updated_at: new Date().toISOString()
          }
          return { data: mockData.users[userIndex], error: null }
        }
        return { data: null, error: 'User not found' }
      }

      try {
        return await userService.updateUserProfile(userId, updates)
      } catch (error) {
        console.warn('Supabase error:', error)
        return { data: null, error: 'Failed to update user profile' }
      }
    }
  }
}

// دالة مساعدة للتحقق من حالة قاعدة البيانات
export const getDatabaseStatus = () => {
  const supabaseStatus = isSupabaseConfigured()

  return {
    connected: supabaseStatus,
    mode: supabaseStatus ? 'production' : 'development',
    message: supabaseStatus
      ? 'متصل بقاعدة البيانات - Connected to database'
      : 'وضع التطوير - بيانات تجريبية - Development mode - Mock data',
    mockDataStats: {
      designs: mockData.designs.length,
      appointments: mockData.appointments.length,
      orders: mockData.orders.length,
      workers: mockData.workers.length,
      favorites: mockData.favorites.length,
      cartItems: mockData.cartItems.length
    }
  }
}
