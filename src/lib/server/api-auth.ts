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
