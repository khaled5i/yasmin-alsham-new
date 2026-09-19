'use client'

/**
 * ربط السلة والمفضلة المحفوظتين محلياً ببيانات الأقمشة الحيّة.
 *
 * العدّادات تعتمد على الحالة المحفوظة وحدها فلا تحمّل الكتالوج؛ الأقمشة
 * تُجلب بمعرّفاتها فقط عند فتح السلة أو المفضلة.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  computeCartTotals,
  resolveCartLine,
  type FabricCartTotals,
  type ResolvedFabricCartLine,
} from '@/lib/fabric-commerce'
import { fabricService } from '@/lib/services/fabric-service'
import { convertSupabaseFabric, useFabricStore, type Fabric } from '@/store/fabricStore'
import {
  initFabricCartSync,
  useFabricCartStore,
} from '@/store/fabricCartStore'
import {
  initFabricFavoritesSync,
  useFabricFavoritesStore,
} from '@/store/fabricFavoritesStore'

/**
 * تحميل السلة والمفضلة من التخزين المحلي مرة واحدة + مزامنة التبويبات.
 * يُركَّب من `FabricCommerceProvider` فقط.
 */
export function useFabricCommerceSync(): void {
  useEffect(() => {
    const unsubscribeCart = initFabricCartSync()
    const unsubscribeFavorites = initFabricFavoritesSync()
    return () => {
      unsubscribeCart()
      unsubscribeFavorites()
    }
  }, [])
}

/** عدّاد السلة — يبقى 0 قبل الـhydration حتى لا يختلف عن HTML الخادم. */
export function useFabricCartCount(): number {
  const hasHydrated = useFabricCartStore(state => state.hasHydrated)
  const lines = useFabricCartStore(state => state.lines)
  return hasHydrated ? lines.length : 0
}

/** عدّاد المفضلة — نفس الحماية من اختلاف SSR. */
export function useFabricFavoritesCount(): number {
  const hasHydrated = useFabricFavoritesStore(state => state.hasHydrated)
  const items = useFabricFavoritesStore(state => state.items)
  return hasHydrated ? items.length : 0
}

export interface FabricLookupState {
  byId: Map<string, Fabric>
  isLoading: boolean
  error: string | null
  /** جلبة ناجحة واحدة على الأقل اكتملت لهذه المجموعة من المعرّفات. */
  hasLoaded: boolean
  reload: () => void
}

/**
 * يجلب الأقمشة المطلوبة بمعرّفاتها. يستفيد أولاً مما حمّله متجر الأقمشة
 * (عند القدوم من صفحة المتجر) ثم يكمل الناقص بطلب واحد.
 */
export function useFabricsByIds(ids: string[]): FabricLookupState {
  const catalog = useFabricStore(state => state.fabrics)
  const [fetched, setFetched] = useState<Map<string, Fabric>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const requestId = useRef(0)

  const idsKey = useMemo(() => [...new Set(ids)].sort().join(','), [ids])

  const catalogById = useMemo(() => {
    const map = new Map<string, Fabric>()
    for (const fabric of catalog) map.set(fabric.id, fabric)
    return map
  }, [catalog])

  useEffect(() => {
    const wanted = idsKey ? idsKey.split(',') : []
    if (wanted.length === 0) {
      setFetched(new Map())
      setError(null)
      setIsLoading(false)
      setHasLoaded(true)
      return
    }

    let cancelled = false
    const currentRequest = ++requestId.current
    setIsLoading(true)
    setHasLoaded(false)
    setError(null)

    fabricService
      .getByIds(wanted)
      .then(({ data, error: fetchError }) => {
        if (cancelled || currentRequest !== requestId.current) return
        if (fetchError) {
          setError('تعذّر تحميل بيانات الأقمشة. تحققي من الاتصال ثم أعيدي المحاولة.')
          setIsLoading(false)
          return
        }
        const map = new Map<string, Fabric>()
        for (const raw of data ?? []) {
          const fabric = convertSupabaseFabric(raw)
          map.set(fabric.id, fabric)
        }
        setFetched(map)
        setHasLoaded(true)
        setIsLoading(false)
      })
      .catch(() => {
        if (cancelled || currentRequest !== requestId.current) return
        setError('تعذّر تحميل بيانات الأقمشة. تحققي من الاتصال ثم أعيدي المحاولة.')
        setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [idsKey, reloadToken])

  // نتيجة الجلب هي المرجع. بعد اكتمالها، غياب القماش عنها يعني أنه لم يعد
  // معروضاً (حُذف أو أُخفي أو حجبته سياسات RLS) — ولا يجوز سدّ الفراغ بنسخة
  // الكتالوج القديمة، وإلا بدا المنتج المحذوف متاحاً بكميته وسعره السابقين.
  // الكتالوج يُستعمل فقط كعرض مؤقت قبل وصول النتيجة.
  const byId = useMemo(() => {
    const map = new Map<string, Fabric>()
    for (const id of new Set(ids)) {
      const fabric = fetched.get(id) ?? (hasLoaded ? undefined : catalogById.get(id))
      if (fabric) map.set(id, fabric)
    }
    return map
  }, [ids, fetched, catalogById, hasLoaded])

  const reload = useCallback(() => setReloadToken(token => token + 1), [])

  return { byId, isLoading, error, hasLoaded, reload }
}

export interface ResolvedCartState {
  lines: ResolvedFabricCartLine[]
  totals: FabricCartTotals
  isLoading: boolean
  /** true قبل قراءة التخزين المحلي — لا تعرضي «السلة فارغة» في هذه اللحظة. */
  isPending: boolean
  error: string | null
  isStorageBlocked: boolean
  reload: () => void
}

export function useResolvedCart(): ResolvedCartState {
  const hasHydrated = useFabricCartStore(state => state.hasHydrated)
  const isStorageBlocked = useFabricCartStore(state => state.isStorageBlocked)
  const storedLines = useFabricCartStore(state => state.lines)

  const ids = useMemo(() => storedLines.map(line => line.fabricId), [storedLines])
  const { byId, isLoading, error, hasLoaded, reload } = useFabricsByIds(ids)

  const lines = useMemo(
    () =>
      storedLines.map(line =>
        resolveCartLine(line, byId.get(line.fabricId) ?? null, { isLookupPending: !hasLoaded })
      ),
    [storedLines, byId, hasLoaded]
  )

  const totals = useMemo(() => computeCartTotals(lines), [lines])

  return {
    lines,
    totals,
    isLoading,
    isPending: !hasHydrated,
    error,
    isStorageBlocked,
    reload,
  }
}

export interface ResolvedFavoritesEntry {
  fabricId: string
  addedAt: string
  fabric: Fabric | null
  /** بياناته الحيّة لم تصل بعد — لا تعرضيه كأنه محذوف. */
  isPending: boolean
  /** اللقطة المحفوظة — تُعرض حين يتعذّر جلب القماش الحيّ. */
  fallbackLabel: string
  fallbackImage: string | null
}

export interface ResolvedFavoritesState {
  entries: ResolvedFavoritesEntry[]
  isLoading: boolean
  isPending: boolean
  error: string | null
  isStorageBlocked: boolean
  reload: () => void
}

export function useResolvedFavorites(): ResolvedFavoritesState {
  const hasHydrated = useFabricFavoritesStore(state => state.hasHydrated)
  const isStorageBlocked = useFabricFavoritesStore(state => state.isStorageBlocked)
  const items = useFabricFavoritesStore(state => state.items)

  const ids = useMemo(() => items.map(item => item.fabricId), [items])
  const { byId, isLoading, error, hasLoaded, reload } = useFabricsByIds(ids)

  const entries = useMemo(
    () =>
      items.map(item => ({
        fabricId: item.fabricId,
        addedAt: item.addedAt,
        fabric: byId.get(item.fabricId) ?? null,
        isPending: !hasLoaded,
        fallbackLabel: item.snapshot.label,
        fallbackImage: item.snapshot.image,
      })),
    [items, byId, hasLoaded]
  )

  return {
    entries,
    isLoading,
    isPending: !hasHydrated,
    error,
    isStorageBlocked,
    reload,
  }
}
