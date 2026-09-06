'use client'

import { useEffect, useRef } from 'react'
import { PAYROLL_CHANGED_EVENT } from '@/lib/payroll-display'

/** Coalesced cross-page updates; never reset an active form while refreshing balances. */
export function usePayrollRefresh(refresh: () => void) {
  const latest = useRef(refresh)
  useEffect(() => {
    latest.current = refresh
  }, [refresh])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (document.visibilityState === 'hidden') return
      clearTimeout(timer)
      timer = setTimeout(() => latest.current(), 300)
    }
    const storage = (event: StorageEvent) => {
      if (event.key === PAYROLL_CHANGED_EVENT) schedule()
    }
    window.addEventListener(PAYROLL_CHANGED_EVENT, schedule)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', schedule)
    document.addEventListener('visibilitychange', schedule)
    const poll = setInterval(schedule, 60000)
    return () => {
      clearTimeout(timer)
      clearInterval(poll)
      window.removeEventListener(PAYROLL_CHANGED_EVENT, schedule)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', schedule)
      document.removeEventListener('visibilitychange', schedule)
    }
  }, [])
}
