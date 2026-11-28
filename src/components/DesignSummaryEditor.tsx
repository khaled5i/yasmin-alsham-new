'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import type { DesignSummaryNote } from './InteractiveImageAnnotation'
import { getAuthHeader } from '@/lib/client-auth'

interface Draft {
  text: string
  translation?: string
}

interface Props {
  note: DesignSummaryNote
  number: number
  onCancel: () => void
  onSave: (text: string, translation?: string) => Promise<boolean>
}

export default function DesignSummaryEditor({ note, number, onCancel, onSave }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const request = useRef<AbortController | null>(null)
  const id = useId()
  const original = note.sourceTranscription || note.transcription
  const [draft, setDraft] = useState<Draft>({ text: note.transcription ?? original ?? '' })
  const [previous, setPrevious] = useState<Draft | null>(null)
  const [busy, setBusy] = useState<'refine' | 'save' | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => {
      request.current?.abort()
      element?.close()
    }
  }, [])

  async function refine() {
    if (busy || !draft.text.trim()) return
    const controller = new AbortController()
    request.current = controller
    const timeout = setTimeout(() => controller.abort(), 180_000)
    setBusy('refine')
    setMessage('')
    try {
      const response = await fetch('/api/refine-design-summary/', {
        method: 'POST',
        headers: { ...await getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.text.trim(), mode: 'polish' }),
        signal: controller.signal,
      })
      const result = await response.json()
      if (!response.ok || !result.transcription?.trim() || !result.translatedText?.trim()) throw new Error()
      setPrevious(draft)
      setDraft({ text: result.transcription.trim(), translation: result.translatedText.trim() })
      setMessage('الصياغة الجديدة جاهزة للمراجعة.')
    } catch {
      setMessage('تعذّر تحسين الصياغة. مسودتك محفوظة في المحرّر ويمكنك إعادة المحاولة.')
    } finally {
      clearTimeout(timeout)
      setBusy(null)
    }
  }

  async function save() {
    setBusy('save')
    try {
      if (await onSave(draft.text.trim(), draft.translation)) return
    } finally {
      setBusy(null)
    }
    setMessage('تعذّر حفظ التعديل. يمكنك إعادة المحاولة.')
  }

  return (
    <dialog ref={dialog} dir="rtl" aria-labelledby={id}
      onCancel={event => { event.preventDefault(); if (busy !== 'save') onCancel() }}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-start text-slate-900 shadow-2xl backdrop:bg-slate-950/50">
      <div className="flex max-h-[90dvh] flex-col">
        <header className="border-b border-slate-200 px-5 py-4">
          <p className="mb-1 text-xs font-semibold text-teal-700">ملخص التصميم · التسجيل {number}</p>
          <h2 id={id} className="text-xl font-bold">تعديل النص المحسّن</h2>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
          {original && <details className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-slate-700">عرض النص الأصلي</summary>
            <p dir="auto" className="mt-2 whitespace-pre-wrap text-start leading-7">{original}</p>
          </details>}
          <label className="block text-sm font-bold" htmlFor={id + '-draft'}>صياغة تعليمات الخياطة</label>
          <textarea id={id + '-draft'} dir="auto" autoFocus rows={7} readOnly={!!busy}
            value={draft.text} onChange={event => { setDraft({ text: event.target.value }); setMessage('') }}
            placeholder="اكتب تفاصيل التصميم هنا…"
            className="block w-full resize-y rounded-xl border border-slate-300 px-4 py-3 text-start text-base leading-8 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!!busy || !draft.text.trim() || draft.text.trim().length > 24000} onClick={refine}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-teal-50 px-4 text-sm font-bold text-teal-800 hover:bg-teal-100 disabled:opacity-50">
              {busy === 'refine' ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {busy === 'refine' ? 'جارٍ تحسين الصياغة…' : 'تحسين الصياغة'}
            </button>
            {previous && <button type="button" disabled={!!busy} onClick={() => {
              setDraft(previous); setPrevious(null); setMessage('تم استرجاع الصياغة السابقة.')
            }} className="inline-flex min-h-11 items-center gap-1 text-sm text-slate-700"><Undo2 size={16} /> تراجع عن التحسين</button>}
          </div>
          <p role="status" className="text-sm text-slate-600">{draft.text.trim().length > 24000 ? 'يتطلب تحسين الصياغة نصًا من ٢٤٬٠٠٠ حرف أو أقل.' : message}</p>
        </div>
        <footer className="flex shrink-0 items-center gap-3 border-t border-slate-200 px-5 py-3">
          <button type="button" disabled={!!busy} onClick={save}
            className="min-h-11 rounded-lg bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50">
            {busy === 'save' ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
          </button>
          <button type="button" disabled={busy === 'save'} onClick={onCancel} className="min-h-11 px-3 text-sm text-slate-700">إلغاء</button>
        </footer>
      </div>
    </dialog>
  )
}
