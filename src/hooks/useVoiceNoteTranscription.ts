'use client'

import { useEffect, useRef, useState } from 'react'
import { recordingBlobToWav } from '@/lib/audio-utils'
import { getAuthHeader } from '@/lib/client-auth'

// Own the lifetime of requests, separately from the persisted voice-note data.
export function useVoiceNoteTranscription(onBusyChange?: (busy: boolean) => void, isSessionActive?: () => boolean) {
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
  const requests = useRef(new Map<string, AbortController>())
  const recording = useRef(false)
  const active = useRef(true)
  const session = useRef(isSessionActive)
  session.current = isSessionActive
  const isActive = () => active.current && (session.current?.() ?? true)
  const notify = useRef(onBusyChange)
  notify.current = onBusyChange

  const publish = () => {
    if (!isActive()) return
    setPendingIds(new Set(requests.current.keys()))
    notify.current?.(recording.current || requests.current.size > 0)
  }

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      for (const controller of requests.current.values()) controller.abort()
      requests.current.clear()
      recording.current = false
      notify.current?.(false)
    }
  }, [])

  const cancel = (id: string) => {
    requests.current.get(id)?.abort()
    requests.current.delete(id)
    publish()
  }

  const transcribe = async (id: string, blob: Blob, accept: (text: string) => void) => {
    if (!isActive()) return
    requests.current.get(id)?.abort()
    const controller = new AbortController()
    requests.current.set(id, controller)
    publish()
    const isCurrent = () => isActive() && !controller.signal.aborted && requests.current.get(id) === controller
    // Bound conversion + upload + polling, so a stalled request cannot lock saving forever.
    const timeout = setTimeout(() => {
      if (requests.current.get(id) === controller) cancel(id)
    }, 150_000)
    try {
      let upload = blob
      let filename = 'recording.webm'
      try {
        upload = await recordingBlobToWav(blob)
        filename = 'recording.wav'
      } catch {
        // Preserve the original audio if the browser cannot decode it.
      }
      if (!isCurrent()) return
      const headers = await getAuthHeader()
      if (!isCurrent()) return
      const form = new FormData()
      form.append('audio', upload, filename)
      const response = await fetch('/api/soniox-async-transcribe/', {
        method: 'POST', headers, body: form, signal: controller.signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error('Voice transcription failed')
      const text = typeof body.text === 'string'
        ? body.text.replace(/<end>/gi, '\n').replace(/\n{2,}/g, '\n').trim()
        : ''
      if (text && isCurrent()) accept(text)
    } catch {
      // The recording is already stored; failure leaves an audio-only note.
    } finally {
      clearTimeout(timeout)
      if (requests.current.get(id) === controller) {
        requests.current.delete(id)
        publish()
      }
    }
  }

  return {
    pendingIds, transcribe, cancel,
    isActive,
    beginRecording: () => { recording.current = true; publish() },
    finishRecording: () => { recording.current = false; publish() },
  }
}
