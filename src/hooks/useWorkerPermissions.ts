/**
 * Hook للتحقق من صلاحيات العامل
 * Worker Permissions Hook
 */

import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { supabase } from '@/lib/supabase'
import { getWorkerPermissions, getWorkerDashboardRoute } from '@/lib/worker-types'
import type { WorkerType } from '@/lib/services/worker-service'

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

export function useWorkerPermissions() {
  const { user } = useAuthStore()
  const [workerType, setWorkerType] = useState<WorkerType | null>(null)
  const [permissions, setPermissions] = useState<WorkerPermissions | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadWorkerPermissions() {
      if (!user || user.role !== 'worker') {
        setIsLoading(false)
        return
      }

      try {
        // جلب نوع العامل من قاعدة البيانات
        const { data, error } = await supabase
          .from('workers')
          .select('worker_type')
          .eq('user_id', user.id)
          .single()

        if (error) {
          console.error('Error loading worker type:', error)
          setIsLoading(false)
          return
        }

        const type = data?.worker_type || 'tailor'
        setWorkerType(type)
        setPermissions(getWorkerPermissions(type))
      } catch (error) {
        console.error('Error in useWorkerPermissions:', error)
      } finally {
        setIsLoading(false)
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

