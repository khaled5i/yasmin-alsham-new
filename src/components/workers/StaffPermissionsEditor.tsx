'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Crown,
  Loader2,
  Lock,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { WorkerType } from '@/lib/services/worker-service'
import { getWorkerTypeName } from '@/lib/worker-types'
import {
  STAFF_PERMISSION_SECTIONS,
  STAFF_PERMISSIONS,
  getDefaultPermission,
  getDefaultPermissions,
  isStaffPermissionKey,
  normalizeStaffOverrides,
  resolveStaffPermissions,
  OWNER_ROLE_LABEL,
  type StaffPermissionKey,
  type StaffPermissionMap,
} from '@/lib/staff-permissions'

export interface StaffPermissionsTarget {
  userId: string
  fullName: string
  workerType: WorkerType
}

interface Props {
  target: StaffPermissionsTarget | null
  onClose: () => void
  onSaved?: (userId: string, overridesCount: number) => void
}

const GRANTABLE_KEYS = STAFF_PERMISSIONS.filter(p => !p.ownerOnly).map(p => p.key)

function explainRpcError(message: string | undefined): string {
  const text = message || ''
  if (/function .*(get_staff_permissions|set_staff_permissions).* does not exist|Could not find the function/i.test(text)) {
    return 'نظام الصلاحيات يحتاج تطبيق تحديث قاعدة البيانات (هجرة 20261123120000) قبل الاستعمال.'
  }
  if (/active_admin_required/i.test(text)) return 'هذه الشاشة للمدير الأكبر فقط.'
  if (/ONLY_WORKERS_HAVE_PERMISSIONS/.test(text)) return 'المدير الأكبر يملك كل الصلاحيات ولا تُقيَّد صلاحياته.'
  if (/UNKNOWN_PERMISSION/.test(text)) return 'صلاحية غير معروفة في قاعدة البيانات — يجب تحديث الهجرة لتطابق الكود.'
  return text || 'حدث خطأ غير متوقع'
}

export default function StaffPermissionsEditor({ target, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState(false)
  const [savedMap, setSavedMap] = useState<StaffPermissionMap | null>(null)
  const [draft, setDraft] = useState<StaffPermissionMap | null>(null)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})

  const workerType = target?.workerType ?? null
  const defaults = useMemo(() => getDefaultPermissions(workerType), [workerType])

  useEffect(() => {
    if (!target) return
    let active = true
    setLoading(true)
    setError(null)
    setSavedNotice(false)
    setDraft(null)
    setSavedMap(null)

    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_staff_permissions', { p_user_id: target.userId })
      if (!active) return
      if (rpcError || !data) {
        setError(explainRpcError(rpcError?.message))
        // نعرض الافتراضي حتى يرى المدير ما سيحصل عليه العامل
        const fallback = getDefaultPermissions(target.workerType)
        setSavedMap(fallback)
        setDraft(fallback)
        setLoading(false)
        return
      }
      const payload = data as { overrides?: Record<string, unknown>; worker_type?: WorkerType }
      const overrides: Partial<Record<StaffPermissionKey, boolean>> = {}
      for (const [key, value] of Object.entries(payload.overrides || {})) {
        if (isStaffPermissionKey(key) && typeof value === 'boolean') overrides[key] = value
      }
      const effective = resolveStaffPermissions(target.workerType, overrides)
      setSavedMap(effective)
      setDraft(effective)
      // افتح الأقسام التي فيها صلاحية مفعّلة
      const open: Record<string, boolean> = {}
      for (const section of STAFF_PERMISSION_SECTIONS) {
        open[section.id] = section.permissions.some(p => effective[p.key])
      }
      setOpenSections(open)
      setLoading(false)
    })()

    return () => { active = false }
  }, [target])

  const changedKeys = useMemo(() => {
    if (!draft || !savedMap) return [] as StaffPermissionKey[]
    return GRANTABLE_KEYS.filter(key => draft[key] !== savedMap[key])
  }, [draft, savedMap])

  const customizedKeys = useMemo(() => {
    if (!draft) return new Set<StaffPermissionKey>()
    return new Set(GRANTABLE_KEYS.filter(key => draft[key] !== defaults[key]))
  }, [draft, defaults])

  const grantedCount = draft ? GRANTABLE_KEYS.filter(k => draft[k]).length : 0

  if (!target) return null

  const setKey = (key: StaffPermissionKey, value: boolean) => {
    setSavedNotice(false)
    setDraft(prev => (prev ? { ...prev, [key]: value } : prev))
  }

  const setMany = (keys: StaffPermissionKey[], value: boolean) => {
    setSavedNotice(false)
    setDraft(prev => {
      if (!prev) return prev
      const next = { ...prev }
      for (const key of keys) next[key] = value
      return next
    })
  }

  const resetToDefaults = () => {
    setSavedNotice(false)
    setDraft(getDefaultPermissions(workerType))
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    setError(null)
    const overrides = normalizeStaffOverrides(workerType, draft)
    const { error: rpcError } = await supabase.rpc('set_staff_permissions', {
      p_user_id: target.userId,
      p_overrides: overrides,
    })
    setSaving(false)
    if (rpcError) {
      setError(explainRpcError(rpcError.message))
      return
    }
    setSavedMap(draft)
    setSavedNotice(true)
    onSaved?.(target.userId, Object.keys(overrides).length)
  }

  const handleClose = () => {
    if (changedKeys.length > 0 && !window.confirm('لديك تغييرات غير محفوظة. هل تريد الإغلاق بدون حفظ؟')) return
    onClose()
  }

  return (
    <AnimatePresence>
      <motion.div
        key="staff-permissions"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4"
        dir="rtl"
      >
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />

        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="relative flex h-[92vh] sm:h-auto sm:max-h-[90vh] w-full sm:max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl bg-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-label={`صلاحيات ${target.fullName}`}
        >
          {/* الرأس */}
          <div className="border-b border-gray-100 px-5 pt-5 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-pink-600 text-sm font-semibold mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>الصلاحيات</span>
                </div>
                <h2 className="text-xl font-bold text-gray-900 truncate">{target.fullName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {getWorkerTypeName(target.workerType)}
                  {draft && <span className="mx-1.5 text-gray-300">•</span>}
                  {draft && <span>{grantedCount} من {GRANTABLE_KEYS.length} مفعّلة</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {draft && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMany(GRANTABLE_KEYS, true)}
                  className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                >
                  تشغيل الكل
                </button>
                <button
                  type="button"
                  onClick={() => setMany(GRANTABLE_KEYS, false)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  إطفاء الكل
                </button>
                <button
                  type="button"
                  onClick={resetToDefaults}
                  className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100"
                  title="الصلاحيات الافتراضية لنوع العامل"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  افتراضي «{getWorkerTypeName(target.workerType)}»
                </button>
              </div>
            )}
          </div>

          {/* المحتوى */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/60">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {loading || !draft ? (
              <div className="flex items-center justify-center py-16 text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin ml-2" />
                جاري تحميل الصلاحيات...
              </div>
            ) : (
              STAFF_PERMISSION_SECTIONS.map(section => {
                const grantable = section.permissions.filter(p => !p.ownerOnly)
                const onCount = grantable.filter(p => draft[p.key]).length
                const allOn = grantable.length > 0 && onCount === grantable.length
                const isOpen = openSections[section.id] ?? false

                return (
                  <div key={section.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setOpenSections(prev => ({ ...prev, [section.id]: !isOpen }))}
                        className="flex flex-1 min-w-0 items-center gap-2 text-right"
                        aria-expanded={isOpen}
                      >
                        <ChevronDown className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{section.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${onCount > 0 ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-500'}`}>
                              {onCount}/{grantable.length}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">{section.description}</p>
                        </div>
                      </button>
                      {grantable.length > 0 && (
                        <Switch
                          checked={allOn}
                          partial={onCount > 0 && !allOn}
                          onChange={value => setMany(grantable.map(p => p.key), value)}
                          label={`كل صلاحيات ${section.title}`}
                        />
                      )}
                    </div>

                    {isOpen && (
                      <ul className="border-t border-gray-100 divide-y divide-gray-100">
                        {section.permissions.map(permission => {
                          if (permission.ownerOnly) {
                            return (
                              <li key={permission.key} className="flex items-center gap-3 px-4 py-3 bg-gray-50/70">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-500">{permission.label}</p>
                                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                    <Crown className="w-3 h-3" />
                                    للمدير الأكبر فقط
                                  </p>
                                </div>
                                <Lock className="w-4 h-4 text-gray-400 flex-shrink-0" aria-label="مقفل" />
                              </li>
                            )
                          }
                          const checked = draft[permission.key]
                          const customized = customizedKeys.has(permission.key)
                          const defaultValue = getDefaultPermission(workerType, permission.key)
                          return (
                            <li key={permission.key} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className={`text-sm font-medium ${checked ? 'text-gray-900' : 'text-gray-600'}`}>{permission.label}</p>
                                  {customized && (
                                    <span
                                      className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700"
                                      title={`الافتراضي لنوع العامل: ${defaultValue ? 'مفعّل' : 'مطفأ'}`}
                                    >
                                      مخصّص
                                    </span>
                                  )}
                                </div>
                                {permission.description && (
                                  <p className="text-xs text-gray-500 mt-0.5">{permission.description}</p>
                                )}
                              </div>
                              <Switch
                                checked={checked}
                                onChange={value => setKey(permission.key, value)}
                                label={permission.label}
                              />
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })
            )}

            <p className="px-1 pb-2 text-xs leading-5 text-gray-500">
              <Crown className="inline w-3 h-3 ml-1 text-amber-500" />
              {OWNER_ROLE_LABEL} يملك كل الصلاحيات دائماً، وهو وحده من يدير العمال ويمنح الصلاحيات.
              التغييرات تصل للعامل خلال دقيقة أو عند فتح الصفحة من جديد.
            </p>
          </div>

          {/* الحفظ */}
          <div className="border-t border-gray-100 bg-white px-4 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !draft || changedKeys.length === 0}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-pink-600 px-5 py-3 font-semibold text-white transition-colors hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {saving ? 'جاري الحفظ...' : changedKeys.length > 0 ? `حفظ (${changedKeys.length} تغيير)` : 'لا توجد تغييرات'}
            </button>
            {savedNotice && changedKeys.length === 0 && (
              <span className="text-sm font-medium text-emerald-600 flex items-center gap-1">
                <Check className="w-4 h-4" /> تم الحفظ
              </span>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function Switch({
  checked,
  partial = false,
  onChange,
  label,
}: {
  checked: boolean
  partial?: boolean
  onChange: (value: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={partial ? 'mixed' : checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pink-400 focus-visible:ring-offset-2 ${
        checked ? 'bg-pink-600' : partial ? 'bg-pink-300' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? '-translate-x-6' : partial ? '-translate-x-3.5' : '-translate-x-1'
        }`}
      />
    </button>
  )
}
