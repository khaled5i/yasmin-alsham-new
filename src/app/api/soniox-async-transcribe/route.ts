import { NextRequest, NextResponse } from 'next/server'

const SONIOX_API = 'https://api.soniox.com/v1'
const MODEL = 'stt-async-v4'
const POLL_INTERVAL_MS = 2000
const MAX_WAIT_MS = 120_000

export async function POST(request: NextRequest) {
  const apiKey = process.env.SONIOX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Soniox API key not configured' }, { status: 500 })
  }

  const headers = { Authorization: `Bearer ${apiKey}` }
  let fileId = ''

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const formData: any = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // 1. رفع الملف الصوتي
    const uploadForm = new FormData()
    uploadForm.append('file', audioFile, audioFile.name || 'recording.webm')

    const uploadRes = await fetch(`${SONIOX_API}/files`, {
      method: 'POST',
      headers,
      body: uploadForm,
    })
    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      throw new Error(`File upload failed: ${err}`)
    }
    const uploadData = await uploadRes.json() as { id: string }
    fileId = uploadData.id

    // 2. إنشاء مهمة التحويل
    const txRes = await fetch(`${SONIOX_API}/transcriptions`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        model: MODEL,
        language_hints: ['ar'],
      }),
    })
    if (!txRes.ok) {
      const err = await txRes.text()
      throw new Error(`Transcription create failed: ${err}`)
    }
    const txData = await txRes.json() as { id: string }
    const transcriptionId = txData.id

    // 3. انتظار اكتمال المهمة
    const deadline = Date.now() + MAX_WAIT_MS
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))

      const statusRes = await fetch(`${SONIOX_API}/transcriptions/${transcriptionId}`, { headers })
      if (!statusRes.ok) continue

      const statusData = await statusRes.json() as {
        status: string
        error_message?: string
      }

      if (statusData.status === 'completed') {
        const transcriptRes = await fetch(
          `${SONIOX_API}/transcriptions/${transcriptionId}/transcript`,
          { headers }
        )
        const transcriptData = await transcriptRes.json() as { text?: string }
        const text = (transcriptData.text || '').trim()
        return NextResponse.json({ text, success: true })
      }

      if (statusData.status === 'failed') {
        throw new Error(`Transcription failed: ${statusData.error_message || 'unknown'}`)
      }
    }

    throw new Error('Transcription timed out')

  } catch (error) {
    console.error('Soniox async transcription error:', error)
    return NextResponse.json(
      { error: 'Failed to transcribe audio', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  } finally {
    // 4. حذف الملف من Soniox بعد الانتهاء
    if (fileId) {
      fetch(`${SONIOX_API}/files/${fileId}`, { method: 'DELETE', headers }).catch(() => {})
    }
  }
}
