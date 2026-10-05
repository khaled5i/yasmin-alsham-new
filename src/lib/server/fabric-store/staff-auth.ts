/**
 * من يدير طلبات المتجر الإلكتروني (المرحلة 7، قرار المالك 29 سبتمبر): **المدير** و
 * **مدير متجر الأقمشة** (fabric_store_manager) — لا غيرهما.
 *
 * المتصفح يرسل رمز جلسته (`Authorization: Bearer …`) كما في «إرسال للمحاسبة»؛ الخادم
 * يتحقق منه عند Supabase Auth، ثم يقرأ الدور بعميل الخدمة (لا يعتمد على سياسات القراءة
 * في users/workers). معرّف المستخدم يُمرَّر لدوال القاعدة فيُسجَّل في سجل الطلب.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest, NextResponse } from 'next/server'
import { errorResponse, getFabricStoreServiceClient } from './http'

export function isOrdersServerEnabled(): boolean {
  return (process.env.FABRIC_STORE_ORDERS_ENABLED ?? '').trim().toLowerCase() === 'true'
}

/**
 * المرحلة 8: الاسترداد وإعادة المخزون والإشعار الدائن — مفتاح مستقل، مطفأ افتراضياً.
 * عند الإطفاء تستمر مطابقة النداءات المرسلة، لكن لا يبدأ نداء استرداد جديد من المهمة.
 */
export function isRefundsServerEnabled(): boolean {
  return (process.env.FABRIC_STORE_REFUNDS_ENABLED ?? '').trim().toLowerCase() === 'true'
}

export interface FabricStoreStaff {
  userId: string
  role: 'admin' | 'fabric_store_manager'
  client: SupabaseClient
}

export async function requireFabricStoreStaff(
  request: NextRequest
): Promise<{ ok: true; staff: FabricStoreStaff } | { ok: false; response: NextResponse }> {
  if (!isOrdersServerEnabled()) {
    return { ok: false, response: errorResponse(404, 'not-found', 'غير موجود') }
  }
  const client = getFabricStoreServiceClient()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!client || !anonKey || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, response: errorResponse(503, 'not-configured', 'غير مهيّأ') }
  }

  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { ok: false, response: errorResponse(401, 'unauthorized', 'سجّلي الدخول من جديد') }

  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error: authError } = await auth.auth.getUser(token)
  if (authError || !user) return { ok: false, response: errorResponse(401, 'unauthorized', 'سجّلي الدخول من جديد') }

  const { data: account } = await client.from('users').select('role, is_active').eq('id', user.id).maybeSingle()
  if (!account?.is_active) return { ok: false, response: errorResponse(403, 'forbidden', 'غير مسموح') }
  if (account.role === 'admin') return { ok: true, staff: { userId: user.id, role: 'admin', client } }
  if (account.role === 'worker') {
    const { data: worker } = await client.from('workers').select('worker_type').eq('user_id', user.id).maybeSingle()
    if (worker?.worker_type === 'fabric_store_manager') {
      return { ok: true, staff: { userId: user.id, role: 'fabric_store_manager', client } }
    }
  }
  return { ok: false, response: errorResponse(403, 'forbidden', 'إدارة طلبات المتجر للمدير ومدير متجر الأقمشة فقط') }
}
