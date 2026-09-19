'use client'

/**
 * مفضلة متجر الأقمشة — نسخة الزائر (محلية في هذا المتصفح فقط).
 * مستقلة عن السلة: إضافة قماش للمفضلة لا تعني نية شراء ولا تحجز مخزوناً.
 */

import { create } from 'zustand'
import {
  FABRIC_COMMERCE_SCHEMA_VERSION,
  MAX_FAVORITE_ITEMS,
  buildCartSnapshot,
  fabricFavoritesStateSchema,
  type FabricFavoriteItem,
} from '@/lib/fabric-commerce'
import {
  isLocalStorageWritable,
  readValidated,
  subscribeToStorageKey,
  writeValidated,
} from '@/lib/fabric-local-store'
import type { Fabric } from '@/store/fabricStore'

export const FABRIC_FAVORITES_STORAGE_KEY = 'yasmin-fabric-favorites-v1'

interface FabricFavoritesState {
  items: FabricFavoriteItem[]
  hasHydrated: boolean
  isStorageBlocked: boolean

  hydrate: () => void
  /** يُرجع true إذا صار مفضلاً، وfalse إذا أُزيل. */
  toggle: (fabric: Fabric) => boolean
  /** إضافة بلا تبديل: الموجود يبقى. يُرجع true إن كانت إضافة جديدة. */
  add: (fabric: Fabric) => boolean
  remove: (fabricId: string) => void
  clear: () => void
  isFavorite: (fabricId: string) => boolean
  getCount: () => number
}

function persist(items: FabricFavoriteItem[]): boolean {
  const result = writeValidated(FABRIC_FAVORITES_STORAGE_KEY, {
    schemaVersion: FABRIC_COMMERCE_SCHEMA_VERSION,
    items,
  })
  return result === 'ok'
}

export const useFabricFavoritesStore = create<FabricFavoritesState>()((set, get) => ({
  items: [],
  hasHydrated: false,
  isStorageBlocked: false,

  hydrate: () => {
    const stored = readValidated(FABRIC_FAVORITES_STORAGE_KEY, fabricFavoritesStateSchema)
    set({
      items: stored?.items ?? [],
      hasHydrated: true,
      isStorageBlocked: !isLocalStorageWritable(),
    })
  },

  toggle: fabric => {
    if (get().items.some(item => item.fabricId === fabric.id)) {
      get().remove(fabric.id)
      return false
    }
    return get().add(fabric)
  },

  add: fabric => {
    if (get().items.some(item => item.fabricId === fabric.id)) return false

    // السقف يحمي التخزين المحلي؛ الأقدم يخرج ليدخل الأحدث.
    const kept = get().items.slice(-(MAX_FAVORITE_ITEMS - 1))
    const items: FabricFavoriteItem[] = [
      ...kept,
      { fabricId: fabric.id, addedAt: new Date().toISOString(), snapshot: buildCartSnapshot(fabric) },
    ]
    set({ items, isStorageBlocked: !persist(items) })
    return true
  },

  remove: fabricId => {
    const items = get().items.filter(item => item.fabricId !== fabricId)
    set({ items, isStorageBlocked: !persist(items) })
  },

  clear: () => {
    set({ items: [], isStorageBlocked: !persist([]) })
  },

  isFavorite: fabricId => get().items.some(item => item.fabricId === fabricId),

  getCount: () => get().items.length,
}))

/** يُستدعى مرة واحدة من مزوّد المتجر: تحميل أولي + مزامنة التبويبات. */
export function initFabricFavoritesSync(): () => void {
  const { hydrate } = useFabricFavoritesStore.getState()
  hydrate()
  return subscribeToStorageKey(FABRIC_FAVORITES_STORAGE_KEY, () => {
    const stored = readValidated(FABRIC_FAVORITES_STORAGE_KEY, fabricFavoritesStateSchema)
    useFabricFavoritesStore.setState({ items: stored?.items ?? [] })
  })
}
