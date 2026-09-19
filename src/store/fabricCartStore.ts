'use client'

/**
 * سلة متجر الأقمشة — نسخة الزائر (محلية في هذا المتصفح فقط).
 *
 * مستقلة تماماً عن `fabricStore` الذي تُصفَّر فلاتره عند تحديث الصفحة؛
 * السلة يجب أن تبقى. لا مزامنة بين الأجهزة ولا حسابات في هذه المرحلة.
 */

import { create } from 'zustand'
import {
  FABRIC_COMMERCE_SCHEMA_VERSION,
  MAX_CART_LINES,
  buildCartSnapshot,
  clampFabricQuantity,
  fabricCartStateSchema,
  getCartLineKey,
  getFabricPurchaseMode,
  getFabricQuantityBounds,
  getFabricUnitPrice,
  isFabricPubliclyVisible,
  type FabricCartLine,
  type FabricPurchaseMode,
} from '@/lib/fabric-commerce'
import {
  isLocalStorageWritable,
  readValidated,
  subscribeToStorageKey,
  writeValidated,
} from '@/lib/fabric-local-store'
import { roundFabricNumber } from '@/lib/fabric-number-format'
import type { Fabric } from '@/store/fabricStore'

export const FABRIC_CART_STORAGE_KEY = 'yasmin-fabric-cart-v1'

export type AddToCartResult =
  | { ok: true; merged: boolean; quantity: number }
  | { ok: false; reason: 'not-purchasable' | 'cart-full' | 'invalid-quantity' }

interface FabricCartState {
  lines: FabricCartLine[]
  /** يبقى false حتى تُقرأ القيمة المحفوظة، لتجنّب اختلاف SSR وعدّاد وهمي. */
  hasHydrated: boolean
  /** التخزين المحلي مرفوض (تصفح خاص مثلاً) ⇒ السلة تعمل لكنها لا تبقى. */
  isStorageBlocked: boolean

  hydrate: () => void
  addLine: (fabric: Fabric, quantity: number) => AddToCartResult
  setQuantity: (key: string, quantity: number, fabric: Fabric | null) => void
  removeLine: (key: string) => void
  clear: () => void
  hasFabric: (fabricId: string) => boolean
  getLineCount: () => number
}

function persist(lines: FabricCartLine[]): boolean {
  const result = writeValidated(FABRIC_CART_STORAGE_KEY, {
    schemaVersion: FABRIC_COMMERCE_SCHEMA_VERSION,
    lines,
  })
  return result === 'ok'
}

export const useFabricCartStore = create<FabricCartState>()((set, get) => ({
  lines: [],
  hasHydrated: false,
  isStorageBlocked: false,

  hydrate: () => {
    const stored = readValidated(FABRIC_CART_STORAGE_KEY, fabricCartStateSchema)
    set({
      lines: stored?.lines ?? [],
      hasHydrated: true,
      isStorageBlocked: !isLocalStorageWritable(),
    })
  },

  addLine: (fabric, quantity) => {
    if (!isFabricPubliclyVisible(fabric) || getFabricUnitPrice(fabric) == null) {
      return { ok: false, reason: 'not-purchasable' }
    }

    const bounds = getFabricQuantityBounds(fabric)
    const purchaseMode: FabricPurchaseMode = getFabricPurchaseMode(fabric)

    // للقماش طريقة بيع واحدة في كل لحظة (مشتقة من مخزونه)، فلا يظهر مرتين
    // في السلة. المطابقة بالمعرّف، وطريقة البيع تُحدَّث إن كان المخزون قلبها.
    const existing = get().lines.find(line => line.fabricId === fabric.id)

    // الدمج بالمعرّف لا بالاسم: إضافة نفس القماش تزيد كميته بدل سطر جديد.
    const requested = existing ? existing.quantity + quantity : quantity
    const clamped = clampFabricQuantity(requested, bounds)
    if (clamped == null) return { ok: false, reason: 'invalid-quantity' }

    if (!existing && get().lines.length >= MAX_CART_LINES) {
      return { ok: false, reason: 'cart-full' }
    }

    const snapshot = buildCartSnapshot(fabric)
    const lines = existing
      ? get().lines.map(line =>
          line.fabricId === fabric.id
            ? { ...line, purchaseMode, quantity: clamped, snapshot }
            : line
        )
      : [
          ...get().lines,
          {
            fabricId: fabric.id,
            purchaseMode,
            quantity: clamped,
            addedAt: new Date().toISOString(),
            snapshot,
          } satisfies FabricCartLine,
        ]

    set({ lines, isStorageBlocked: !persist(lines) })
    return { ok: true, merged: Boolean(existing), quantity: clamped }
  },

  setQuantity: (key, quantity, fabric) => {
    const bounds = fabric ? getFabricQuantityBounds(fabric) : null
    const next = bounds ? clampFabricQuantity(quantity, bounds) : roundFabricNumber(quantity)
    if (next == null || next <= 0) return

    // تأكيد الكمية يثبّت أيضاً وحدة البيع الحيّة: هذه هي اللحظة التي وافقت
    // فيها المستخدمة على الوحدة الجديدة بعد أن قلبها المخزون.
    const lines = get().lines.map(line =>
      getCartLineKey(line.fabricId, line.purchaseMode) === key
        ? {
            ...line,
            quantity: next,
            purchaseMode: fabric ? getFabricPurchaseMode(fabric) : line.purchaseMode,
          }
        : line
    )
    set({ lines, isStorageBlocked: !persist(lines) })
  },

  removeLine: key => {
    const lines = get().lines.filter(
      line => getCartLineKey(line.fabricId, line.purchaseMode) !== key
    )
    set({ lines, isStorageBlocked: !persist(lines) })
  },

  clear: () => {
    set({ lines: [], isStorageBlocked: !persist([]) })
  },

  hasFabric: fabricId => get().lines.some(line => line.fabricId === fabricId),

  getLineCount: () => get().lines.length,
}))

/** يُستدعى مرة واحدة من مزوّد المتجر: تحميل أولي + مزامنة التبويبات. */
export function initFabricCartSync(): () => void {
  const { hydrate } = useFabricCartStore.getState()
  hydrate()
  return subscribeToStorageKey(FABRIC_CART_STORAGE_KEY, () => {
    const stored = readValidated(FABRIC_CART_STORAGE_KEY, fabricCartStateSchema)
    useFabricCartStore.setState({ lines: stored?.lines ?? [] })
  })
}
