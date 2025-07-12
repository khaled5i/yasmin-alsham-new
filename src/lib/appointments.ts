import { supabase, isSupabaseConfigured } from './supabase'
import { Appointment } from './database'

export interface AppointmentSlot {
  date: string
  time: string
  isAvailable: boolean
}

export class AppointmentService {
  // إعدادات النظام الافتراضية
  private static readonly WORKING_HOURS_START = '16:00'
  private static readonly WORKING_HOURS_END = '22:00'
  private static readonly MAX_DAILY_APPOINTMENTS = 7
  private static readonly WORKING_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'saturday']
  
  // حساب المواعيد المتاحة
  static async getAvailableSlots(startDate: Date, endDate: Date): Promise<AppointmentSlot[]> {
    const slots: AppointmentSlot[] = []

    // للتطوير: استخدام الإعدادات الافتراضية
    const workingHoursStart = this.WORKING_HOURS_START
    const workingHoursEnd = this.WORKING_HOURS_END
    const maxDailyAppointments = this.MAX_DAILY_APPOINTMENTS
    const workingDays = this.WORKING_DAYS

    // للتطوير: محاكاة بعض المواعيد المحجوزة
    const bookedSlots = new Set([
      `${new Date().toISOString().split('T')[0]}_16:00`,
      `${new Date().toISOString().split('T')[0]}_18:00`
    ])

    // حساب عدد المواعيد لكل يوم (للتطوير: افتراض يوم واحد محجوز جزئياً)
    const dailyCount: { [key: string]: number } = {
      [new Date().toISOString().split('T')[0]]: 2
    }
    
    // إنشاء المواعيد المتاحة
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dayName = this.getDayName(currentDate)
      const dateStr = currentDate.toISOString().split('T')[0]
      
      // تحقق من أن اليوم من أيام العمل
      if (workingDays.includes(dayName)) {
        // تحقق من أن اليوم لم يصل للحد الأقصى من المواعيد
        if ((dailyCount[dateStr] || 0) < maxDailyAppointments) {
          const timeSlots = this.generateTimeSlots(workingHoursStart, workingHoursEnd, maxDailyAppointments)
          
          timeSlots.forEach(time => {
            const slotKey = `${dateStr}_${time}`
            const isAvailable = !bookedSlots.has(slotKey)
            
            slots.push({
              date: dateStr,
              time,
              isAvailable
            })
          })
        }
      }
      
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    return slots
  }
  
  // إنشاء أوقات المواعيد
  private static generateTimeSlots(startTime: string, endTime: string, maxSlots: number): string[] {
    const slots: string[] = []
    const start = this.timeToMinutes(startTime)
    const end = this.timeToMinutes(endTime)
    const duration = (end - start) / maxSlots
    
    for (let i = 0; i < maxSlots; i++) {
      const slotTime = start + (duration * i)
      slots.push(this.minutesToTime(slotTime))
    }
    
    return slots
  }
  
  // تحويل الوقت إلى دقائق
  private static timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number)
    return hours * 60 + minutes
  }
  
  // تحويل الدقائق إلى وقت
  private static minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }
  
  // الحصول على اسم اليوم
  private static getDayName(date: Date): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    return days[date.getDay()]
  }
  
  // حجز موعد جديد
  static async bookAppointment(appointmentData: {
    client_name: string
    client_phone: string
    appointment_date: string
    appointment_time: string
    notes?: string
  }): Promise<{ appointment: Appointment | null, error: string | null }> {
    try {
      // للتطوير: محاكاة حجز الموعد
      await new Promise(resolve => setTimeout(resolve, 1000))

      // محاكاة التحقق من توفر الموعد
      const slotKey = `${appointmentData.appointment_date}_${appointmentData.appointment_time}`
      const bookedSlots = new Set([
        `${new Date().toISOString().split('T')[0]}_16:00`,
        `${new Date().toISOString().split('T')[0]}_18:00`
      ])

      if (bookedSlots.has(slotKey)) {
        return { appointment: null, error: 'هذا الموعد محجوز بالفعل' }
      }

      // محاكاة إنشاء الموعد
      const appointment: Appointment = {
        id: `apt_${Date.now()}`,
        client_name: appointmentData.client_name,
        client_phone: appointmentData.client_phone,
        appointment_date: appointmentData.appointment_date,
        appointment_time: appointmentData.appointment_time,
        status: 'scheduled',
        notes: appointmentData.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      return { appointment, error: null }
    } catch (error) {
      return { appointment: null, error: 'خطأ في حجز الموعد' }
    }
  }
  
  // جلب إعدادات النظام (للتطوير)
  private static async getSystemSettings(): Promise<{ [key: string]: string }> {
    // للتطوير: إرجاع الإعدادات الافتراضية
    return {
      working_hours_start: this.WORKING_HOURS_START,
      working_hours_end: this.WORKING_HOURS_END,
      max_daily_appointments: this.MAX_DAILY_APPOINTMENTS.toString(),
      working_days: JSON.stringify(this.WORKING_DAYS)
    }
  }
  
  // جلب المواعيد
  static async getAppointments(filters?: {
    status?: string
    date?: string
    limit?: number
  }): Promise<Appointment[]> {
    let query = supabase
      .from('appointments')
      .select('*')
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true })
    
    if (filters?.status) {
      query = query.eq('status', filters.status)
    }
    
    if (filters?.date) {
      query = query.eq('appointment_date', filters.date)
    }
    
    if (filters?.limit) {
      query = query.limit(filters.limit)
    }
    
    // محاكاة البيانات للتطوير
    return []
  }
  
  // تحديث حالة الموعد
  static async updateAppointmentStatus(
    appointmentId: string,
    status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled'
  ): Promise<{ success: boolean, error: string | null }> {
    try {
      // محاكاة التحديث للتطوير
      return { success: true, error: null }
    } catch (error) {
      return { success: false, error: 'خطأ في تحديث الموعد' }
    }
  }
}
