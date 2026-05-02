import { supabase, isSupabaseConfigured } from '../supabase'

// ============================================================================
// Types
// ============================================================================

export type VisitReason = 'tailoring' | 'alteration_ours' | 'alteration_other' | 'pickup' | 'other'
export type QueueStatus = 'waiting' | 'called' | 'done' | 'removed'

export interface QueueEntry {
  id: string
  customer_name: string
  visit_reason: VisitReason
  phone: string | null
  status: QueueStatus
  session_token: string
  notification_count: number
  notified_at: string | null
  created_at: string
  updated_at: string
}

export interface JoinQueueData {
  customerName: string
  visitReason: VisitReason
  phone?: string
  sessionToken: string
}

export interface AvailableDates {
  normalDate: Date | null   // next day with < 4 orders
  urgentDate: Date | null   // next day with < 6 orders
}

// ============================================================================
// Queue Service
// ============================================================================

export const queueService = {

  // --------------------------------------------------------------------------
  // Customer side
  // --------------------------------------------------------------------------

  async joinQueue(data: JoinQueueData): Promise<{ data: QueueEntry | null; error: string | null }> {
    if (!isSupabaseConfigured()) return { data: null, error: 'Supabase not configured.' }

    try {
      const { data: entry, error } = await supabase
        .from('walk_in_queue')
        .insert({
          customer_name: data.customerName,
          visit_reason: data.visitReason,
          phone: data.phone || null,
          session_token: data.sessionToken,
          status: 'waiting',
        })
        .select()
        .single()

      if (error) throw error
      return { data: entry, error: null }
    } catch (err: any) {
      return { data: null, error: err.message || 'خطأ في حجز الدور' }
    }
  },

  async getMyEntry(sessionToken: string): Promise<QueueEntry | null> {
    if (!isSupabaseConfigured()) return null
    const today = new Date().toISOString().split('T')[0]

    const { data } = await supabase
      .from('walk_in_queue')
      .select('*')
      .eq('session_token', sessionToken)
      .gte('created_at', today)
      .maybeSingle()

    return data ?? null
  },

  async getPeopleAheadCount(entryId: string, createdAt: string): Promise<number> {
    if (!isSupabaseConfigured()) return 0
    const today = new Date().toISOString().split('T')[0]

    const { count } = await supabase
      .from('walk_in_queue')
      .select('*', { count: 'exact', head: true })
      .in('status', ['waiting', 'called'])
      .gte('created_at', today)
      .lt('created_at', createdAt)
      .neq('id', entryId)

    return count ?? 0
  },

  // --------------------------------------------------------------------------
  // Admin side
  // --------------------------------------------------------------------------

  async getActiveQueue(): Promise<QueueEntry[]> {
    if (!isSupabaseConfigured()) return []
    const today = new Date().toISOString().split('T')[0]

    const { data } = await supabase
      .from('walk_in_queue')
      .select('*')
      .gte('created_at', today)
      .in('status', ['waiting', 'called'])
      .order('created_at', { ascending: true })

    return data ?? []
  },

  async callCustomer(id: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured()) return { error: 'Supabase not configured.' }

    // Read current count first, then increment
    const { data: current } = await supabase
      .from('walk_in_queue')
      .select('notification_count')
      .eq('id', id)
      .single()

    const { error } = await supabase
      .from('walk_in_queue')
      .update({
        status: 'called',
        notified_at: new Date().toISOString(),
        notification_count: (current?.notification_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return { error: error?.message ?? null }
  },

  async markDone(id: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured()) return { error: 'Supabase not configured.' }

    const { error } = await supabase
      .from('walk_in_queue')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', id)

    return { error: error?.message ?? null }
  },

  async removeEntry(id: string): Promise<{ error: string | null }> {
    if (!isSupabaseConfigured()) return { error: 'Supabase not configured.' }

    const { error } = await supabase
      .from('walk_in_queue')
      .delete()
      .eq('id', id)

    return { error: error?.message ?? null }
  },

  async addAdminEntry(): Promise<{ data: QueueEntry | null; error: string | null }> {
    if (!isSupabaseConfigured()) return { data: null, error: 'Supabase not configured.' }

    const sessionToken = crypto.randomUUID()
    return this.joinQueue({
      customerName: 'زائر',
      visitReason: 'other',
      sessionToken,
    })
  },

  // --------------------------------------------------------------------------
  // Pickup orders lookup
  // --------------------------------------------------------------------------

  async getOrdersByPhone(phone: string): Promise<any[]> {
    if (!isSupabaseConfigured()) return []

    const { data } = await supabase
      .from('orders')
      .select('id, order_number, client_name, client_phone, status, due_date')
      .eq('client_phone', phone)
      .in('status', ['pending', 'in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .limit(5)

    return data ?? []
  },

  // --------------------------------------------------------------------------
  // Available dates calculation
  // --------------------------------------------------------------------------

  async getNextAvailableDates(): Promise<AvailableDates> {
    if (!isSupabaseConfigured()) return { normalDate: null, urgentDate: null }

    // Build local date string (YYYY-MM-DD) without timezone shift
    const localDateStr = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)

    const fromStr = localDateStr(tomorrow)
    const until = new Date(today)
    until.setDate(today.getDate() + 90)
    const untilStr = localDateStr(until)

    // due_date is a DATE column — no timezone issues
    const { data } = await supabase
      .from('orders')
      .select('due_date')
      .gte('due_date', fromStr)
      .lte('due_date', untilStr)
      .in('status', ['pending', 'in_progress'])

    // Count orders per due_date
    const countByDate: Record<string, number> = {}
    for (const row of data ?? []) {
      const key: string = row.due_date
      countByDate[key] = (countByDate[key] ?? 0) + 1
    }

    let normalDate: Date | null = null
    let urgentDate: Date | null = null

    for (let i = 0; i < 90; i++) {
      const candidate = new Date(tomorrow)
      candidate.setDate(tomorrow.getDate() + i)

      // استثناء الجمعة (5) والسبت (6)
      const day = candidate.getDay()
      if (day === 5 || day === 6) continue

      const key = localDateStr(candidate)
      const count = countByDate[key] ?? 0

      if (!normalDate && count < 4) normalDate = candidate
      if (!urgentDate && count < 6) urgentDate = candidate
      if (normalDate && urgentDate) break
    }

    return { normalDate, urgentDate }
  },

  // --------------------------------------------------------------------------
  // Waiting count for admin badge
  // --------------------------------------------------------------------------

  async getWaitingCount(): Promise<number> {
    if (!isSupabaseConfigured()) return 0
    const today = new Date().toISOString().split('T')[0]

    const { count } = await supabase
      .from('walk_in_queue')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', today)
      .in('status', ['waiting', 'called'])

    return count ?? 0
  },
}
