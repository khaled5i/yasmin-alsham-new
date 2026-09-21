import { NextRequest, NextResponse } from 'next/server'
import {
  clearPartnerSessionCookie,
  getPartnerServiceClient,
  readPartnerToken,
} from '@/lib/server/partner-session'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const token = readPartnerToken(request)
  const client = getPartnerServiceClient()
  if (token && client) {
    const { error } = await client.rpc('partner_portal_logout', { p_token: token })
    if (error) console.error('partner logout failed:', error.message)
  }
  const response = NextResponse.json({ ok: true })
  clearPartnerSessionCookie(response)
  return response
}
