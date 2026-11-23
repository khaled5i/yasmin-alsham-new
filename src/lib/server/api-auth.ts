/**
 * بوابة تفويض موحّدة لمسارات API الخادمية.
 *
 * المبدأ — وهو نفس النمط المعتمد في مسارات alostaz و workers:
 *   1. نتحقق من الرمز عبر خدمة المصادقة.
 *   2. نقرأ الملف بـ**عميل الخدمة** لا بعميل anon، حتى لا يعتمد قرار الصلاحية
 *      على أي سياسة RLS ولا يتأثر بأي ترحيل لاحق.
 *   3. نفحص `is_active` **صراحةً**: الحساب الموقوف الذي ما زال يحمل رمزاً
 *      صالحاً يجب أن يُرفض. لا نعتمد على شرط ضمني داخل سياسة قراءة.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { getDefaultPermission, type StaffPermissionKey } from '@/lib/staff-permissions'
import type { WorkerType } from '@/lib/services/worker-service'

let adminClient: SupabaseClient | null = null

function getAdminClient(): SupabaseClient | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null
  }
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return adminClient
}

/** Shared server client for staff-only guards; never imported by browser code. */
export function getStaffServiceClient(): SupabaseClient | null {
  return getAdminClient()
}

export interface StaffIdentity {
  userId: string
  role: string
  email: string | null
}

export type StaffAuthResult =
  | { ok: true; staff: StaffIdentity }
  | { ok: false; response: NextResponse }

/**
 * يقبل فقط مستخدماً مسجّلاً ونشطاً بدور موظف (admin أو worker).
 *
 * رسائل الخطأ مقصودة العموم: لا تكشف سبب الرفض الدقيق ولا وجود الحساب،
 * ولا أي تفصيل عن الإعدادات الخادمية.
 */
export async function requireActiveStaff(request: NextRequest): Promise<StaffAuthResult> {
  const deny = (status: number, error: string) =>
    ({ ok: false as const, response: NextResponse.json({ error }, { status }) })

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return deny(401, 'غير مصرح')
  }
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) {
    return deny(401, 'غير مصرح')
  }

  const admin = getAdminClient()
  if (!admin) {
    console.error('requireActiveStaff: Supabase service role is not configured')
    return deny(500, 'خطأ في إعدادات الخادم')
  }

  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData?.user) {
    return deny(401, 'غير مصرح')
  }

  const { data: profile, error: profileError } = await admin
    .from('users')
    .select('role, is_active, email')
    .eq('id', authData.user.id)
    .single()

  if (profileError || !profile?.is_active) {
    return deny(403, 'غير مسموح - الحساب غير نشط أو غير موجود')
  }

  if (profile.role !== 'admin' && profile.role !== 'worker') {
    return deny(403, 'غير مسموح')
  }

  return {
    ok: true,
    staff: { userId: authData.user.id, role: profile.role, email: profile.email ?? null },
  }
}

/**
 * هل يملك الموظف أياً من الصلاحيات؟ المدير الأكبر (admin) دائماً نعم.
 *
 * القرار من قاعدة البيانات (public.staff_can_user). إن لم تكن الهجرة مطبّقة بعد
 * (الدالة غير موجودة) نرجع لافتراضيات نوع العامل في الكود حتى لا يتوقف أحد عن عمله
 * أثناء النشر. أي خطأ آخر = رفض.
 */
export async function staffHasPermission(
  userId: string,
  role: string,
  keys: StaffPermissionKey | StaffPermissionKey[]
): Promise<boolean> {
  if (role === 'admin') return true
  if (role !== 'worker') return false
  const list = Array.isArray(keys) ? keys : [keys]
  if (list.length === 0) return false

  const client = getAdminClient()
  if (!client) return false

  const { data, error } = await client.rpc('staff_can_user', { p_user_id: userId, p_keys: list })
  if (!error) return data === true

  const missingFunction = error.code === 'PGRST202' || error.code === '42883' ||
    /staff_can_user/.test(error.message || '') && /not find|does not exist/i.test(error.message || '')
  if (!missingFunction) {
    console.error('staffHasPermission: permission check failed', error.message)
    return false
  }

  const { data: worker } = await client
    .from('workers')
    .select('worker_type')
    .eq('user_id', userId)
    .maybeSingle()
  const workerType = (worker?.worker_type ?? null) as WorkerType | null
  return list.some(key => getDefaultPermission(workerType, key))
}

/** requireActiveStaff + الصلاحية المطلوبة (أو أي واحدة منها). */
export async function requireStaffPermission(
  request: NextRequest,
  keys: StaffPermissionKey | StaffPermissionKey[],
  deniedMessage = 'غير مسموح - لا تملك صلاحية هذا الإجراء'
): Promise<StaffAuthResult> {
  const auth = await requireActiveStaff(request)
  if (!auth.ok) return auth
  if (await staffHasPermission(auth.staff.userId, auth.staff.role, keys)) return auth
  return { ok: false, response: NextResponse.json({ error: deniedMessage }, { status: 403 }) }
}
