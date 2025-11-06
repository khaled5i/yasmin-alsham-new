# 💻 أمثلة كود Supabase العملية

هذا الملف يحتوي على أمثلة كود جاهزة للاستخدام في مشروع ياسمين الشام.

---

## 📁 1. ملف خدمات التصاميم (Design Service)

```typescript
// src/lib/services/design-service.ts
import { supabase } from '../supabase'
import type { Design } from '../types'

export const designService = {
  /**
   * جلب جميع التصاميم النشطة
   */
  async getAll(): Promise<{ data: Design[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error fetching designs:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب تصميم واحد بواسطة ID
   */
  async getById(id: string): Promise<{ data: Design | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error fetching design:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب التصاميم حسب الفئة
   */
  async getByCategory(category: string): Promise<{ data: Design[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('category', category)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error fetching designs by category:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب التصاميم المميزة
   */
  async getFeatured(): Promise<{ data: Design[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .eq('is_featured', true)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(6)

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error fetching featured designs:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * البحث في التصاميم
   */
  async search(query: string): Promise<{ data: Design[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('designs')
        .select('*')
        .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error searching designs:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * زيادة عدد المشاهدات
   */
  async incrementViews(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.rpc('increment_design_views', { design_id: id })

      if (error) throw error

      return { success: true, error: null }
    } catch (error: any) {
      console.error('Error incrementing views:', error)
      return { success: false, error: error.message }
    }
  },
}
```

---

## 📁 2. ملف خدمات المواعيد (Appointment Service)

```typescript
// src/lib/services/appointment-service.ts
import { supabase } from '../supabase'
import type { Appointment } from '../types'

export const appointmentService = {
  /**
   * حجز موعد جديد (يدعم الحجز المجهول)
   */
  async create(appointmentData: {
    client_name: string
    client_phone: string
    client_email?: string
    appointment_date: string
    appointment_time: string
    service_type?: string
    notes?: string
    user_id?: string
  }): Promise<{ data: Appointment | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .insert({
          user_id: appointmentData.user_id || null,
          client_name: appointmentData.client_name,
          client_phone: appointmentData.client_phone,
          client_email: appointmentData.client_email,
          appointment_date: appointmentData.appointment_date,
          appointment_time: appointmentData.appointment_time,
          service_type: appointmentData.service_type,
          notes: appointmentData.notes,
          status: 'pending',
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error creating appointment:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب مواعيد المستخدم
   */
  async getByUserId(userId: string): Promise<{ data: Appointment[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', userId)
        .order('appointment_date', { ascending: true })

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error fetching user appointments:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * جلب جميع المواعيد (Admin فقط)
   */
  async getAll(): Promise<{ data: Appointment[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('appointment_date', { ascending: true })

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error fetching all appointments:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * تحديث حالة موعد
   */
  async updateStatus(
    id: string,
    status: 'pending' | 'confirmed' | 'completed' | 'cancelled'
  ): Promise<{ data: Appointment | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error: any) {
      console.error('Error updating appointment status:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * حذف موعد
   */
  async delete(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase.from('appointments').delete().eq('id', id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error: any) {
      console.error('Error deleting appointment:', error)
      return { success: false, error: error.message }
    }
  },
}
```

---

## 📁 3. ملف خدمات المفضلة (Favorites Service)

```typescript
// src/lib/services/favorite-service.ts
import { supabase } from '../supabase'
import type { Design } from '../types'

export const favoriteService = {
  /**
   * جلب مفضلات المستخدم
   */
  async getByUserId(userId: string): Promise<{ data: Design[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('design_id, designs(*)')
        .eq('user_id', userId)

      if (error) throw error

      // استخراج التصاميم من النتيجة
      const designs = data?.map((fav: any) => fav.designs) || []

      return { data: designs, error: null }
    } catch (error: any) {
      console.error('Error fetching favorites:', error)
      return { data: null, error: error.message }
    }
  },

  /**
   * إضافة إلى المفضلة
   */
  async add(userId: string, designId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('favorites')
        .insert({ user_id: userId, design_id: designId })

      if (error) throw error

      return { success: true, error: null }
    } catch (error: any) {
      console.error('Error adding to favorites:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * إزالة من المفضلة
   */
  async remove(userId: string, designId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('design_id', designId)

      if (error) throw error

      return { success: true, error: null }
    } catch (error: any) {
      console.error('Error removing from favorites:', error)
      return { success: false, error: error.message }
    }
  },

  /**
   * التحقق من وجود تصميم في المفضلة
   */
  async isFavorite(userId: string, designId: string): Promise<{ isFavorite: boolean; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('id')
        .eq('user_id', userId)
        .eq('design_id', designId)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return { isFavorite: !!data, error: null }
    } catch (error: any) {
      console.error('Error checking favorite:', error)
      return { isFavorite: false, error: error.message }
    }
  },
}
```

---

## 📁 4. استخدام الخدمات في المكونات

### مثال: صفحة التصاميم

```typescript
// src/app/designs/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { designService } from '@/lib/services/design-service'
import type { Design } from '@/lib/types'

export default function DesignsPage() {
  const [designs, setDesigns] = useState<Design[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadDesigns()
  }, [])

  const loadDesigns = async () => {
    setIsLoading(true)
    const { data, error } = await designService.getAll()

    if (error) {
      setError(error)
    } else {
      setDesigns(data || [])
    }

    setIsLoading(false)
  }

  if (isLoading) {
    return <div>جاري التحميل...</div>
  }

  if (error) {
    return <div>خطأ: {error}</div>
  }

  return (
    <div>
      <h1>التصاميم</h1>
      <div className="grid grid-cols-3 gap-4">
        {designs.map((design) => (
          <div key={design.id}>
            <img src={design.image_url} alt={design.name} />
            <h2>{design.name}</h2>
            <p>{design.price} ريال</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### مثال: حجز موعد

```typescript
// src/app/book-appointment/page.tsx
'use client'

import { useState } from 'react'
import { appointmentService } from '@/lib/services/appointment-service'
import { useAuthStore } from '@/store/authStore'

export default function BookAppointmentPage() {
  const { user } = useAuthStore()
  const [formData, setFormData] = useState({
    client_name: user?.full_name || '',
    client_phone: user?.phone || '',
    client_email: user?.email || '',
    appointment_date: '',
    appointment_time: '',
    service_type: '',
    notes: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setMessage(null)

    const { data, error } = await appointmentService.create({
      ...formData,
      user_id: user?.id,
    })

    if (error) {
      setMessage({ type: 'error', text: error })
    } else {
      setMessage({ type: 'success', text: 'تم حجز الموعد بنجاح!' })
      // إعادة تعيين النموذج
      setFormData({
        client_name: '',
        client_phone: '',
        client_email: '',
        appointment_date: '',
        appointment_time: '',
        service_type: '',
        notes: '',
      })
    }

    setIsSubmitting(false)
  }

  return (
    <div>
      <h1>حجز موعد</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="الاسم"
          value={formData.client_name}
          onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
          required
        />
        <input
          type="tel"
          placeholder="رقم الهاتف"
          value={formData.client_phone}
          onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
          required
        />
        <input
          type="date"
          value={formData.appointment_date}
          onChange={(e) => setFormData({ ...formData, appointment_date: e.target.value })}
          required
        />
        <input
          type="time"
          value={formData.appointment_time}
          onChange={(e) => setFormData({ ...formData, appointment_time: e.target.value })}
          required
        />
        <textarea
          placeholder="ملاحظات"
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'جاري الحجز...' : 'حجز موعد'}
        </button>
      </form>

      {message && (
        <div className={message.type === 'success' ? 'text-green-600' : 'text-red-600'}>
          {message.text}
        </div>
      )}
    </div>
  )
}
```

---

## 🔄 Real-time Subscriptions

```typescript
// مثال: الاستماع للتحديثات الفورية على جدول المواعيد
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export function useRealtimeAppointments() {
  useEffect(() => {
    const channel = supabase
      .channel('appointments-changes')
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'appointments',
        },
        (payload) => {
          console.log('Appointment changed:', payload)
          // تحديث الحالة هنا
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])
}
```

---

هذه الأمثلة جاهزة للاستخدام المباشر في المشروع! 🚀

