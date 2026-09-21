/**
 * جلسة بوابة «شركاء النجاح» (المشاهير).
 *
 * المشهور ليس مستخدم Supabase Auth: لا يملك أي صلاحية على بقية النظام.
 * الدخول يعيد رمزاً عشوائياً يُحفظ في كوكي httpOnly، وقاعدة البيانات تخزّن
 * بصمته (sha256) فقط. كل دوال البوابة متاحة لـ service_role وحده، أي عبر
 * هذه المسارات على الخادم.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { NextRequest, NextResponse } from 'next/server'

export const PARTNER_SESSION_COOKIE = 'ys_partner_session'
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

let serviceClient: SupabaseClient | null = null

export function getPartnerServiceClient(): SupabaseClient | null {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return null
  }
  if (!serviceClient) {
    serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
  }
  return serviceClient
}

export function readPartnerToken(request: NextRequest): string | null {
  const token = request.cookies.get(PARTNER_SESSION_COOKIE)?.value || ''
  return /^[0-9a-f]{64}$/.test(token) ? token : null
}

export function setPartnerSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(PARTNER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function clearPartnerSessionCookie(response: NextResponse) {
  response.cookies.set(PARTNER_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}
