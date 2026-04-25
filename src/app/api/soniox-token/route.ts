import { NextResponse } from 'next/server'

export async function GET() {
  const apiKey = process.env.SONIOX_API_KEY
  if (!apiKey || apiKey === 'your_soniox_api_key_here') {
    return NextResponse.json(
      { error: 'Soniox API key not configured' },
      { status: 500 }
    )
  }
  return NextResponse.json({ apiKey })
}
