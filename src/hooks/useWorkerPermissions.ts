/**
 * Hook للتحقق من صلاحيات الموظف
 * Staff permissions hook (shared cache)
 *
 * - المدير الأكبر (admin): كل الصلاحيات بلا أي استدعاء للقاعدة.
 * - العامل: يجلب نوعه وصلاحياته الفعلية من get_my_staff_permissions()
 *   (القاعدة هي مصدر الحقيقة)، ويحفظها في localStorage لعرض فوري،
 *   ثم يحدّثها في الخلفية. إن تعذّر الاستدعاء (مثلاً قبل تطبيق الهجرة)
 *   تُستعمل افتراضيات نوعه من الكود.
 * - كل نسخ الـhook تتشارك نفس الذاكرة والطلب الجاري، فلا تتكرر الاستدعاءات.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { getWorkerPermissions, getWorkerDashboardRoute } from '@/lib/worker-types'
import type { WorkerType } from '@/lib/services/worker-service'
import {
  allStaffPermissions,
  getDefaultPermissions,
  isStaffPermissionKey,
  STAFF_PERMISSION_KEYS,
  type StaffPermissionKey,
  type StaffPermissionMap,
} from '@/lib/staff-permissions'

const CACHE_KEY = 'yasmin-staff-permissions-cache-v2'
const LEGACY_CACHE_KEY = 'yasmin-worker-permissions-cache'
const CACHE_TTL_MS = 10 * 60 * 1000
const FRESH_MS = 60 * 1000

interface WorkerPermissions {
  canAccessOrders: boolean
  canAccessFabrics: boolean
  canAccessProducts: boolean
  canAccessAccounting: boolean
  canAccessWorkers: boolean
  canAccessAppointments: boolean
  canAccessSettings: boolean
  dashboardRoute: string
}

interface StaffSnapshot {
  userId: string
  workerType: WorkerType | null
  permissions: StaffPermissionMap
  fetchedAt: number
}

// ── ذاكرة مشتركة بين كل النسخ ───────────────────────────────────────────────
let memo: StaffSnapshot | null = null
let inflight: { userId: string; promise: Promise<StaffSnapshot | null> } | null = null
const listeners = new Set<(snap: StaffSnapshot) => void>()

function readStoredSnapshot(userId: string): StaffSnapshot | null {
  if (typeof window === 'undefined') return null
  try {
    window.localStorage.removeItem(LEGACY_CACHE_KEY)
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StaffSnapshot
    if (parsed.userId !== userId) return null
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null
    return { ...parsed, permissions: normalizeMap(parsed.permissions) }
  } catch {
    return null
  }
}

function storeSnapshot(snap: StaffSnapshot) {
  memo = snap
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(CACHE_KEY, JSON.stringify(snap)) } catch { /* ignore */ }
  }
  listeners.forEach(listener => {
    try { listener(snap) } catch { /* ignore */ }
  })
}

function normalizeMap(input: unknown): StaffPermissionMap {
  const map = allStaffPermissions(false)
  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (isStaffPermissionKey(key) && value === true) map[key] = true
    }
  }
  return map
}

async function fetchSnapshot(userId: string): Promise<StaffSnapshot | null> {
  if (inflight && inflight.userId === userId) return inflight.promise

  const promise = (async (): Promise<StaffSnapshot | null> => {
    try {
      const { data, error } = await supabase.rpc('get_my_staff_permissions')
      if (!error && data && typeof data === 'object') {
        const payload = data as { worker_type?: string | null; permissions?: unknown }
        const snap: StaffSnapshot = {
          userId,
          workerType: (payload.worker_type as WorkerType | null) ?? null,
          permissions: normalizeMap(payload.permissions),
          fetchedAt: Date.now(),
        }
        storeSnapshot(snap)
        return snap
      }
      if (error) console.warn('get_my_staff_permissions unavailable, using worker-type defaults:', error.message)

      // احتياط: نوع العامل وافتراضياته من الكود
      const { data: workerRow, error: workerError } = await supabase
        .from('workers')
        .select('worker_type')
        .eq('user_id', userId)
        .maybeSingle()
      if (workerError) {
        console.error('Error loading worker type:', workerError)
        return null
      }
      const type = ((workerRow?.worker_type as WorkerType | undefined) ?? 'tailor')
      const snap: StaffSnapshot = {
        userId,
        workerType: type,
        permissions: getDefaultPermissions(type),
        fetchedAt: Date.now(),
      }
      storeSnapshot(snap)
      return snap
    } catch (error) {
      console.error('Error loading staff permissions:', error)
      return null
    } finally {
      inflight = null
    }
  })()

  inflight = { userId, promise }
  return promise
}

/** يُستدعى بعد أن يغيّر المدير صلاحيات نفسه أو عند تسجيل الخروج. */
export function invalidateStaffPermissionsCache() {
  memo = null
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(CACHE_KEY)
      window.localStorage.removeItem(LEGACY_CACHE_KEY)
    } catch { /* ignore */ }
  }
}

export function useWorkerPermissions() {
  const { user } = useAuthStore()
  const userId = user?.id ?? null
  const role = user?.role ?? null

  const initial = (): StaffSnapshot | null => {
    if (!userId || role !== 'worker') return null
    if (memo && memo.userId === userId) return memo
    return readStoredSnapshot(userId)
  }

  const [snapshot, setSnapshot] = useState<StaffSnapshot | null>(initial)
  // المستخدم الذي فشل جلب صلاحياته (حتى لا يبقى التحميل للأبد)
  const [failedFor, setFailedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || role !== 'worker') {
      setSnapshot(null)
      return
    }

    let active = true
    const listener = (snap: StaffSnapshot) => {
      if (active && snap.userId === userId) setSnapshot(snap)
    }
    listeners.add(listener)

    const cached = (memo && memo.userId === userId) ? memo : readStoredSnapshot(userId)
    if (cached) setSnapshot(cached)

    const needsRefresh = !cached || Date.now() - cached.fetchedAt > FRESH_MS
    if (needsRefresh) {
      void fetchSnapshot(userId).then(snap => {
        if (!active) return
        if (snap) setSnapshot(snap)
        else if (!cached) setFailedFor(userId)
      })
    }

    return () => {
      active = false
      listeners.delete(listener)
    }
  }, [userId, role])

  const isAdmin = role === 'admin'
  const isWorker = role === 'worker'
  const hasSnapshot = !!snapshot && snapshot.userId === userId
  // العامل في حالة تحميل حتى تصل صلاحياته (أو يفشل جلبها) — لا نافذة يُعاد فيها توجيهه خطأً.
  const isLoading = isWorker && !hasSnapshot && failedFor !== userId
  const workerType = isWorker && hasSnapshot ? (snapshot!.workerType ?? null) : null
  const isGeneralManager = isWorker && workerType === 'general_manager'

  const staffPermissions = useMemo<StaffPermissionMap>(() => {
    if (isAdmin) return allStaffPermissions(true)
    if (!isWorker || !hasSnapshot) return allStaffPermissions(false)
    return snapshot!.permissions
  }, [isAdmin, isWorker, hasSnapshot, snapshot])

  const legacyPermissions: WorkerPermissions | null = workerType ? getWorkerPermissions(workerType) : null

  /** هل يملك المستخدم الصلاحية؟ المدير الأكبر دائماً نعم. */
  const can = useCallback(
    (key: StaffPermissionKey) => isAdmin || staffPermissions[key] === true,
    [isAdmin, staffPermissions]
  )

  /** هل يملك أياً منها؟ */
  const canAny = useCallback(
    (keys: StaffPermissionKey[]) => isAdmin || keys.some(key => staffPermissions[key] === true),
    [isAdmin, staffPermissions]
  )

  /** عدد الصلاحيات الممنوحة (للعرض). */
  const grantedCount = useMemo(
    () => STAFF_PERMISSION_KEYS.filter(key => staffPermissions[key]).length,
    [staffPermissions]
  )

  return {
    workerType,
    permissions: legacyPermissions,
    staffPermissions,
    grantedCount,
    isLoading,
    isAdmin,
    /** المدير الأكبر — صاحب الصلاحيات كلها ومانحها. */
    isOwner: isAdmin,
    isGeneralManager,
    isWorker,
    isClient: role === 'client',
    can,
    canAny,
    canAccess: (permission: keyof WorkerPermissions) => {
      if (isAdmin) return true
      if (!legacyPermissions) return false
      return legacyPermissions[permission] as boolean
    },
    getDashboardRoute: () => {
      if (isAdmin) return '/dashboard'
      if (!workerType) return '/dashboard'
      return getWorkerDashboardRoute(workerType)
    },
  }
}
