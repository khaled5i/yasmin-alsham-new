'use client'

import { useEffect } from 'react'
import { initializeStorage } from '@/lib/storage-manager'

export default function StorageInitializer() {
  useEffect(() => {
    // تهيئة localStorage عند تحميل التطبيق
    initializeStorage()
  }, [])

  // هذا المكون لا يعرض أي شيء
  return null
}

