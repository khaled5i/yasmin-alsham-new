'use client'

import React from 'react'
import { AlertCircle, CheckCircle, Settings } from 'lucide-react'
import { getSupabaseStatus } from '@/lib/supabase'

interface SupabaseStatusProps {
  showOnlyIfNotConfigured?: boolean
}

export default function SupabaseStatus({ showOnlyIfNotConfigured = false }: SupabaseStatusProps) {
  const status = getSupabaseStatus()
  
  // If configured and we only want to show when not configured, don't render
  if (status.configured && showOnlyIfNotConfigured) {
    return null
  }

  return (
    <div className={`
      fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-lg border
      ${status.configured 
        ? 'bg-green-50 border-green-200 text-green-800' 
        : 'bg-yellow-50 border-yellow-200 text-yellow-800'
      }
    `}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {status.configured ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-yellow-600" />
          )}
        </div>
        
        <div className="flex-1">
          <h3 className="font-medium text-sm mb-1">
            {status.configured ? 'Supabase Connected' : 'Supabase Configuration'}
          </h3>
          
          <p className="text-xs mb-2">
            {status.message}
          </p>
          
          {!status.configured && (
            <div className="text-xs space-y-1">
              <p className="font-medium">للإعداد الصحيح:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>اذهب إلى <a href="https://app.supabase.com/" target="_blank" rel="noopener noreferrer" className="underline">app.supabase.com</a></li>
                <li>أنشئ مشروع جديد أو اختر مشروع موجود</li>
                <li>اذهب إلى Project Settings → API</li>
                <li>انسخ Project URL و anon public key</li>
                <li>حدث ملف .env.local</li>
              </ol>
            </div>
          )}
        </div>
        
        <div className="flex-shrink-0">
          <Settings className="w-4 h-4 opacity-60" />
        </div>
      </div>
    </div>
  )
}

// Component for development mode only
export function SupabaseDevStatus() {
  // Only show in development
  if (process.env.NODE_ENV !== 'development') {
    return null
  }
  
  return <SupabaseStatus showOnlyIfNotConfigured={true} />
}
