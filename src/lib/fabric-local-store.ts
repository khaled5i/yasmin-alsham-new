'use client'

/**
 * طبقة التخزين المحلي للسلة والمفضلة.
 *
 * الحفظ في هذا المتصفح فقط — لا مزامنة بين الأجهزة ولا حساب. كل قراءة تمرّ
 * على تحقق Zod، وأي JSON تالف أو إصدار قديم يُطرح بهدوء بدل أن يكسر الصفحة،
 * وتعطيل التخزين (التصفح الخاص مثلاً) يُكتشف ويُعرض للمستخدم بدل الفشل الصامت.
 */

import type { z } from 'zod'

export type StorageWriteResult = 'ok' | 'blocked'

/** هل التخزين المحلي متاح للكتابة أصلاً؟ */
export function isLocalStorageWritable(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const probe = '__yasmin_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/**
 * يقرأ قيمة محفوظة ويتحقق منها. يُرجع null لأي سبب (غياب، JSON تالف،
 * إصدار مختلف، بيانات لا تطابق العقد) ويمسح القيمة الفاسدة حتى لا تتكرر.
 */
export function readValidated<T>(key: string, schema: z.ZodType<T>): T | null {
  if (typeof window === 'undefined') return null

  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(key)
  } catch {
    return null
  }
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    discard(key)
    return null
  }

  const result = schema.safeParse(parsed)
  if (!result.success) {
    // إصدار قديم أو بيانات لا تطابق العقد: نبدأ نظيفين بدل ترحيل أعمى.
    discard(key)
    return null
  }
  return result.data
}

/** يكتب قيمة. يُرجع 'blocked' إذا رفض المتصفح التخزين (خاص/ممتلئ/معطّل). */
export function writeValidated(key: string, value: unknown): StorageWriteResult {
  if (typeof window === 'undefined') return 'blocked'
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return 'ok'
  } catch {
    return 'blocked'
  }
}

export function discard(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* لا شيء نفعله إذا كان التخزين معطّلاً. */
  }
}

/**
 * مزامنة التبويبات: يستمع لتغيّر نفس المفتاح في تبويب آخر.
 * حدث `storage` لا يُطلق في التبويب الذي كتب القيمة، فلا تنشأ حلقة تحديث.
 */
export function subscribeToStorageKey(key: string, onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const handler = (event: StorageEvent) => {
    if (event.key !== null && event.key !== key) return
    onChange()
  }

  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
