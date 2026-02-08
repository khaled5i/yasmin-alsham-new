'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

interface UseFormPersistenceOptions<T> {
  key: string
  initialData: T
  debounceMs?: number
  // دالة للتحقق من أن البيانات ليست فارغة
  isDataEmpty?: (data: T) => boolean
  // حقول يتم استبعادها من الحفظ (للحقول الكبيرة مثل الصور)
  excludeFields?: (keyof T)[]
}

interface UseFormPersistenceReturn<T> {
  data: T
  setData: (data: T | ((prev: T) => T)) => void
  clearSavedData: () => void
  hasRestoredData: boolean
  resetToInitial: () => void
}

export function useFormPersistence<T>({
  key,
  initialData,
  debounceMs = 1000,
  isDataEmpty,
  excludeFields = []
}: UseFormPersistenceOptions<T>): UseFormPersistenceReturn<T> {
  const [data, setDataState] = useState<T>(initialData)
  const [hasRestoredData, setHasRestoredData] = useState(false)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isInitializedRef = useRef(false)

  // استرجاع البيانات من localStorage عند التحميل
  useEffect(() => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    try {
      const savedData = localStorage.getItem(key)
      if (savedData) {
        const parsed = JSON.parse(savedData) as Partial<T>
        // دمج البيانات المسترجعة مع initialData لضمان وجود جميع الحقول
        // هذا مهم للحقول المستبعدة من الحفظ (مثل images)
        const mergedData = { ...initialData, ...parsed } as T

        // التحقق من أن البيانات ليست فارغة
        const isEmpty = isDataEmpty ? isDataEmpty(mergedData) : false
        if (!isEmpty) {
          setDataState(mergedData)
          setHasRestoredData(true)
          console.log(`📂 Restored form data from localStorage: ${key}`)
        }
      }
    } catch (error) {
      console.error('Error restoring form data:', error)
      localStorage.removeItem(key)
    }
  }, [key, isDataEmpty, initialData])

  // حفظ البيانات في localStorage مع debounce
  const saveToLocalStorage = useCallback((newData: T) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        // التحقق من أن البيانات ليست فارغة قبل الحفظ
        const isEmpty = isDataEmpty ? isDataEmpty(newData) : false
        if (isEmpty) {
          localStorage.removeItem(key)
          console.log(`🗑️ Removed empty form data from localStorage: ${key}`)
        } else {
          // تصفية الحقول المستبعدة قبل الحفظ
          let dataToSave = newData
          if (excludeFields.length > 0) {
            dataToSave = { ...newData }
            excludeFields.forEach(field => {
              delete (dataToSave as any)[field]
            })
          }

          const jsonString = JSON.stringify(dataToSave)
          const sizeKB = Math.round(jsonString.length / 1024)

          localStorage.setItem(key, jsonString)
          console.log(`💾 Auto-saved form data to localStorage: ${key} (${sizeKB}KB)`)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'QuotaExceededError') {
          console.error('❌ localStorage quota exceeded. Consider excluding more fields.')
        } else {
          console.error('Error saving form data:', error)
        }
      }
    }, debounceMs) as any
  }, [key, debounceMs, isDataEmpty, excludeFields])

  // تحديث البيانات مع الحفظ التلقائي
  const setData = useCallback((newDataOrUpdater: T | ((prev: T) => T)) => {
    setDataState(prev => {
      const newData = typeof newDataOrUpdater === 'function'
        ? (newDataOrUpdater as (prev: T) => T)(prev)
        : newDataOrUpdater
      saveToLocalStorage(newData)
      return newData
    })
  }, [saveToLocalStorage])

  // مسح البيانات المحفوظة
  const clearSavedData = useCallback(() => {
    try {
      localStorage.removeItem(key)
      console.log(`🗑️ Cleared saved form data: ${key}`)
    } catch (error) {
      console.error('Error clearing form data:', error)
    }
  }, [key])

  // إعادة تعيين البيانات إلى القيم الأولية
  const resetToInitial = useCallback(() => {
    setDataState(initialData)
    clearSavedData()
    setHasRestoredData(false)
  }, [initialData, clearSavedData])

  // تنظيف عند إلغاء التحميل
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return {
    data,
    setData,
    clearSavedData,
    hasRestoredData,
    resetToInitial
  }
}

export default useFormPersistence

