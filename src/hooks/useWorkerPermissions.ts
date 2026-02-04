/**
 * Hook للتحقق من صلاحيات العامل
 * Worker Permissions Hook with Caching
 * 
 * PERFORMANCE OPTIMIZATION:
 * - Admins skip all DB calls (fast-track)
 * - Worker type is cached in localStorage with 10-minute TTL
 * - Returns cached value immediately while refreshing in background
 */

import { useEffect, useState, useRef } from 'react'
import { useAuthStore } from '@/store/authStore'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { getWorkerPermissions, getWorkerDashboardRoute } from '@/lib/worker-types'
import type { WorkerType } from '@/lib/services/worker-service'

// Permission cache TTL: 10 minutes
const PERMISSION_TTL_MS = 10 * 60 * 1000
const CACHE_KEY = 'yasmin-worker-permissions-cache'

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

interface CachedPermissions {
  userId: string
  workerType: WorkerType
  permissions: WorkerPermissions
  cachedAt: number
}

// Helper to get cached permissions from localStorage
function getCachedPermissions(userId: string): CachedPermissions | null {
  if (typeof window === 'undefined') return null

  try {
    const cached = localStorage.getItem(CACHE_KEY)
    if (!cached) return null

    const parsed: CachedPermissions = JSON.parse(cached)

    // Validate cache belongs to current user and is not expired
    if (parsed.userId !== userId) {
      localStorage.removeItem(CACHE_KEY)
      return null
    }

    const now = Date.now()
    if ((now - parsed.cachedAt) > PERMISSION_TTL_MS) {
      console.log('⏰ Permission cache expired, will refresh')
      return null
    }

    return parsed
  } catch (error) {
    console.error('Error reading permission cache:', error)
    return null
  }
}

// Helper to save permissions to cache
function setCachedPermissions(userId: string, workerType: WorkerType, permissions: WorkerPermissions): void {
  if (typeof window === 'undefined') return

  try {
    const cache: CachedPermissions = {
      userId,
      workerType,
      permissions,
      cachedAt: Date.now()
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    console.log('💾 Permission cache saved')
  } catch (error) {
    console.error('Error saving permission cache:', error)
  }
}

export function useWorkerPermissions() {
  const { user } = useAuthStore()
  const [workerType, setWorkerType] = useState<WorkerType | null>(null)
  const [permissions, setPermissions] = useState<WorkerPermissions | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    async function loadWorkerPermissions() {
      // FAST-TRACK: Admins don't need any DB calls
      if (!user || user.role === 'admin') {
        console.log('⚡ Admin fast-track: skipping permission DB call')
        setIsLoading(false)
        return
      }

      // Only workers need permission checks
      if (user.role !== 'worker') {
        setIsLoading(false)
        return
      }

      // OPTIMIZATION: Check cache first
      const cached = getCachedPermissions(user.id)
      if (cached) {
        console.log('⚡ Using cached worker permissions:', cached.workerType)
        setWorkerType(cached.workerType)
        setPermissions(cached.permissions)
        setIsLoading(false)

        // Background refresh if cache is more than 5 minutes old
        if ((Date.now() - cached.cachedAt) > PERMISSION_TTL_MS / 2) {
          console.log('🔄 Background refresh of permissions...')
          refreshPermissionsInBackground(user.id)
        }
        return
      }

      // No cache, fetch from DB
      await fetchPermissions(user.id)
    }

    async function fetchPermissions(userId: string) {
      try {
        console.log('📡 Fetching worker type from database...')

        const { data, error } = await supabase
          .from('workers')
          .select('worker_type')
          .eq('user_id', userId)
          .single()

        if (error) {
          console.error('Error loading worker type:', error)
          setIsLoading(false)
          return
        }

        const type = (data?.worker_type || 'tailor') as WorkerType
        const perms = getWorkerPermissions(type)

        setWorkerType(type)
        setPermissions(perms)

        // Cache the result
        setCachedPermissions(userId, type, perms)
      } catch (error) {
        console.error('Error in useWorkerPermissions:', error)
      } finally {
        setIsLoading(false)
      }
    }

    async function refreshPermissionsInBackground(userId: string) {
      if (hasFetchedRef.current) return
      hasFetchedRef.current = true

      try {
        const { data, error } = await supabase
          .from('workers')
          .select('worker_type')
          .eq('user_id', userId)
          .single()

        if (!error && data) {
          const type = (data.worker_type || 'tailor') as WorkerType
          const perms = getWorkerPermissions(type)

          // Update state if type changed
          if (type !== workerType) {
            setWorkerType(type)
            setPermissions(perms)
          }

          // Update cache
          setCachedPermissions(userId, type, perms)
        }
      } catch (error) {
        console.error('Background permission refresh failed:', error)
      }
    }

    loadWorkerPermissions()
  }, [user])

  return {
    workerType,
    permissions,
    isLoading,
    isAdmin: user?.role === 'admin',
    isWorker: user?.role === 'worker',
    isClient: user?.role === 'client',
    canAccess: (permission: keyof WorkerPermissions) => {
      // Admin always has access to everything
      if (user?.role === 'admin') return true
      if (!permissions) return false
      return permissions[permission] as boolean
    },
    getDashboardRoute: () => {
      if (user?.role === 'admin') return '/dashboard'
      if (!workerType) return '/dashboard'
      return getWorkerDashboardRoute(workerType)
    }
  }
}
