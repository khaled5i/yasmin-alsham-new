/**
 * useAppResume — React hook for re-fetching data after the app resumes
 * from background (mobile home screen, tab switch, etc.).
 *
 * On mobile (Capacitor / Chrome), when the user goes to the home screen
 * and comes back, the Supabase access token may have been refreshed.
 * Components that fetched data with the OLD token need to re-fetch
 * to ensure the data reflects the current session's permissions.
 *
 * Usage:
 *   useAppResume(() => {
 *     // Re-fetch your data here
 *     refetchOrders()
 *   })
 */

import { useEffect, useRef } from 'react'
import { onAppResume } from '@/lib/supabase'

/**
 * Calls `callback` each time the app resumes from background.
 * The callback is only called if the component is still mounted.
 * Automatically unsubscribes on unmount.
 */
export function useAppResume(callback: () => void): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const unsubscribe = onAppResume(() => {
      callbackRef.current()
    })
    return unsubscribe
  }, [])
}
