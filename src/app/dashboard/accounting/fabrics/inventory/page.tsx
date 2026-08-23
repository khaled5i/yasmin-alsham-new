'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Image from 'next/image'
import {
  Boxes,
  ArrowLeft,
  Search,
  Plus,
  X,
  Trash2,
  Pencil,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package,
  Palette,
  Check,
  Save,
  UserPlus,
  Hash,
  Image as ImageIcon
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import ImageUpload from '@/components/ImageUpload'
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getMovements,
  addMovement,
  deleteMovement,
  getColors,
  getFabricTypeCodes,
  createColor,
  deleteColor,
  setFabricSerialNumber,
  getFabricColorOptions,
  saveFabricColorOption,
  type FabricInventoryItem,
  type FabricInventoryColor,
  type FabricColorOption,
  type FabricInventoryMovement,
  type CreateInventoryItemInput,
  type InventoryUnit,
  type MovementType
} from '@/lib/services/fabric-inventory-service'
import type { FabricTypeCodeOption } from '@/lib/services/fabric-inventory-service'
import { getSuppliers, createSupplier, type Supplier } from '@/lib/services/supplier-service'
import { syncFabricProductToAlostaz } from '@/lib/services/alostaz-client'
import { useAuthStore } from '@/store/authStore'
import { formatFabricCodePreview, normalizeFabricTypeCode, suggestFabricTypeCode } from '@/lib/fabric-codes'
import {
  formatFabricCurrency,
  formatFabricNumber,
  roundFabricNumber,
} from '@/lib/fabric-number-format'

// ─── ألوان سريعة للاختيار ──────────────────────────────────────────────────
const PRESET_COLORS = [
  { name: 'أبيض', hex: '#FFFFFF' },
  { name: 'أسود', hex: '#1a1a1a' },
  { name: 'أحمر', hex: '#EF4444' },
  { name: 'وردي', hex: '#EC4899' },
  { name: 'برتقالي', hex: '#F97316' },
  { name: 'أصفر', hex: '#EAB308' },
  { name: 'أخضر', hex: '#22C55E' },
  { name: 'أزرق فاتح', hex: '#38BDF8' },
  { name: 'أزرق', hex: '#3B82F6' },
  { name: 'بنفسجي', hex: '#A855F7' },
  { name: 'بني', hex: '#92400E' },
  { name: 'رمادي', hex: '#6B7280' },
  { name: 'ذهبي', hex: '#D97706' },
  { name: 'فضي', hex: '#9CA3AF' },
  { name: 'زيتي', hex: '#4D7C0F' },
  { name: 'تركوازي', hex: '#0D9488' },
]

const LAST_PRIMARY_FABRIC_TYPE_STORAGE_KEY = 'fabric-inventory:last-primary-type:v1'

function getSequenceFromFabricCode(fabricCode?: string | null): string {
  const match = fabricCode?.match(/-(\d+)$/)
  return match ? String(Number(match[1])) : ''
}

function getFabricSerialErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : String((error as { message?: unknown } | null)?.message ?? '')

  if (message.includes('FABRIC_SERIAL_IN_USE')) {
    return 'هذا الرقم مستخدم حالياً لقماش أو لون آخر'
  }
  if (message.includes('FABRIC_SERIAL_REQUIRES_COLOR')) {
    return 'هذا القماش يحتوي على ألوان؛ عدّل رقم كل لون بشكل مستقل'
  }
  if (message.includes('FABRIC_SERIAL_FORBIDDEN')) {
    return 'ليست لديك صلاحية تعديل أرقام الأقمشة'
  }
  if (message.includes('FABRIC_SERIAL_INVALID')) {
    return 'يرجى إدخال رقم تسلسلي صحيح أكبر من صفر'
  }
  return 'تعذر حفظ الرقم أو إكمال العملية'
}

// ─── مكون إدارة الألوان ─────────────────────────────────────────────────────
interface ColorManagerProps {
  colors: FabricInventoryColor[]
  onChange: (colors: FabricInventoryColor[]) => void
  colorOptions: FabricColorOption[]
  draft: ColorDraft
  onDraftChange: (draft: ColorDraft) => void
  onColorOptionSaved: (option: FabricColorOption) => void
  isEditing?: boolean // عند التعديل نحفظ مباشرة
  itemId?: string
  unit: InventoryUnit
  costPerUnit?: number | null
  typeCode: string
}

interface ColorDraft {
  name: string
  hex: string
  quantity: string
  serialNumber: string
}

const EMPTY_COLOR_DRAFT: ColorDraft = {
  name: '',
  hex: '',
  quantity: '',
  serialNumber: '',
}

function ColorManager({
  colors,
  onChange,
  colorOptions,
  draft,
  onDraftChange,
  onColorOptionSaved,
  isEditing,
  itemId,
  unit,
  costPerUnit,
  typeCode,
}: ColorManagerProps) {
  const [editingSerialColorId, setEditingSerialColorId] = useState<string | null>(null)
  const [editingSerialNumber, setEditingSerialNumber] = useState('')
  const [serialSaving, setSerialSaving] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectableColorOptions = [...PRESET_COLORS.map(option => ({
    color_name: option.name,
    color_hex: option.hex,
  })), ...colorOptions].filter((option, index, allOptions) => (
    allOptions.findIndex(candidate => (
      candidate.color_name.trim().toLowerCase() === option.color_name.trim().toLowerCase()
    )) === index
  ))

  const selectPreset = (preset: { name: string; hex: string }) => {
    onDraftChange({ ...draft, name: preset.name, hex: preset.hex })
  }

  const addColor = async () => {
    if (!draft.name.trim()) return
    const rawQuantity = Number(draft.quantity)
    if (!draft.quantity.trim() || !Number.isFinite(rawQuantity) || rawQuantity <= 0) {
      alert(`كمية اللون بال${unit === 'meter' ? 'متر' : 'قطعة'} مطلوبة ويجب أن تكون أكبر من صفر`)
      return
    }
    const initialQuantity = roundFabricNumber(rawQuantity)
    if (initialQuantity <= 0) {
      alert('أقل كمية مسموحة هي 0.01')
      return
    }
    const rawSerialNumber = draft.serialNumber.trim() === '' ? null : Number(draft.serialNumber)
    if (
      isEditing &&
      rawSerialNumber != null &&
      (!Number.isInteger(rawSerialNumber) || rawSerialNumber <= 0)
    ) {
      alert('يرجى إدخال رقم تسلسلي صحيح أكبر من صفر')
      return
    }

    // تحقق من عدم التكرار
    if (colors.some(c => c.color_name.toLowerCase() === draft.name.trim().toLowerCase())) {
      alert('هذا اللون موجود مسبقاً')
      return
    }

    if (isEditing && itemId) {
      setSaving(true)
      try {
        const reusableOption: FabricColorOption = {
          color_name: draft.name.trim(),
          color_hex: draft.hex || null,
        }
        await saveFabricColorOption(reusableOption)
        const created = await createColor({
          inventory_item_id: itemId,
          color_name: reusableOption.color_name,
          color_hex: reusableOption.color_hex || undefined
        })
        let savedColor = created

        if (rawSerialNumber != null) {
          try {
            const fabricCode = await setFabricSerialNumber({
              inventoryItemId: itemId,
              inventoryColorId: created.id,
              sequenceNumber: rawSerialNumber,
            })
            savedColor = { ...created, fabric_code: fabricCode }
          } catch (serialError) {
            await deleteColor(created.id).catch(() => undefined)
            throw serialError
          }
        }

        if (initialQuantity > 0) {
          try {
            await addMovement({
              inventory_item_id: itemId,
              color_id: savedColor.id,
              movement_type: 'in',
              quantity: initialQuantity,
              cost_per_unit: costPerUnit ?? undefined,
              description: `رصيد اللون عند الإضافة - ${savedColor.color_name}`
            })
          } catch (movementError) {
            await deleteColor(savedColor.id).catch(() => undefined)
            throw movementError
          }
        }

        onChange([...colors, { ...savedColor, current_quantity: initialQuantity }])
        onColorOptionSaved(reusableOption)
        onDraftChange(EMPTY_COLOR_DRAFT)
      } catch (error) {
        alert(`❌ ${getFabricSerialErrorMessage(error)}`)
      } finally {
        setSaving(false)
      }
    } else {
      // عند الإضافة الجديدة، نخزن مؤقتاً
      setSaving(true)
      try {
        const reusableOption: FabricColorOption = {
          color_name: draft.name.trim(),
          color_hex: draft.hex || null,
        }
        await saveFabricColorOption(reusableOption)
        const temp: FabricInventoryColor = {
          id: `temp-${Date.now()}`,
          inventory_item_id: '',
          color_name: reusableOption.color_name,
          color_hex: reusableOption.color_hex,
          current_quantity: initialQuantity,
          notes: null,
          created_at: new Date().toISOString(),
          created_by: null,
          fabric_code: null
        }
        onChange([...colors, temp])
        onColorOptionSaved(reusableOption)
        onDraftChange(EMPTY_COLOR_DRAFT)
      } catch {
        alert('❌ تعذر حفظ اللون')
      } finally {
        setSaving(false)
      }
    }
  }

  const removeColor = async (id: string) => {
    if (isEditing && !id.startsWith('temp-')) {
      if (!confirm('هل تريد حذف هذا اللون؟ سيتم حذف حركاته أيضاً.')) return
      try {
        await deleteColor(id)
      } catch {
        alert('❌ خطأ في حذف اللون')
        return
      }
    }
    onChange(colors.filter(c => c.id !== id))
  }

  const startEditingSerial = (color: FabricInventoryColor) => {
    setEditingSerialColorId(color.id)
    setEditingSerialNumber(getSequenceFromFabricCode(color.fabric_code))
  }

  const saveColorSerial = async (color: FabricInventoryColor) => {
    if (!itemId) return
    const sequenceNumber = Number(editingSerialNumber)
    if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
      alert('يرجى إدخال رقم تسلسلي صحيح أكبر من صفر')
      return
    }

    setSerialSaving(true)
    try {
      const fabricCode = await setFabricSerialNumber({
        inventoryItemId: itemId,
        inventoryColorId: color.id,
        sequenceNumber,
      })
      onChange(colors.map(current => (
        current.id === color.id ? { ...current, fabric_code: fabricCode } : current
      )))
      setEditingSerialColorId(null)
      setEditingSerialNumber('')
    } catch (error) {
      alert(`❌ ${getFabricSerialErrorMessage(error)}`)
    } finally {
      setSerialSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* الألوان الحالية */}
      {colors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {colors.map(c => (
            <div
              key={c.id}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm"
            >
              {c.color_hex && (
                <span
                  className="w-4 h-4 rounded-full border border-gray-300 shrink-0"
                  style={{ backgroundColor: c.color_hex }}
                />
              )}
              <span className="text-gray-700">{c.color_name}</span>
              {c.current_quantity > 0 && (
                <span className="text-xs text-teal-600 font-medium">({formatFabricNumber(c.current_quantity)})</span>
              )}
              {isEditing && c.fabric_code && (
                <button
                  type="button"
                  onClick={() => startEditingSerial(c)}
                  dir="ltr"
                  className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-teal-700 transition-colors hover:bg-teal-100"
                  title="تعديل رقم اللون"
                >
                  {c.fabric_code}
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => removeColor(c.id)}
                className="text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {isEditing && editingSerialColorId && (() => {
        const color = colors.find(current => current.id === editingSerialColorId)
        if (!color) return null
        return (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-medium text-amber-900">
              تعديل رقم اللون: {color.color_name}
            </p>
            <div className="flex gap-2" dir="ltr">
              <span className="flex h-10 items-center rounded-xl border border-amber-200 bg-white px-3 font-mono text-sm font-bold text-amber-800">
                {typeCode || 'FB'}-
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={editingSerialNumber}
                onChange={event => setEditingSerialNumber(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-amber-200 px-3 py-2 font-mono text-sm focus:border-transparent focus:ring-2 focus:ring-amber-500"
                aria-label={`الرقم التسلسلي للون ${color.color_name}`}
              />
              <button
                type="button"
                onClick={() => saveColorSerial(color)}
                disabled={serialSaving}
                className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
              >
                {serialSaving ? '...' : 'حفظ'}
              </button>
              <button
                type="button"
                onClick={() => setEditingSerialColorId(null)}
                className="rounded-xl border border-amber-200 bg-white p-2 text-amber-700 hover:bg-amber-100"
                aria-label="إلغاء تعديل الرقم"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )
      })()}

      {/* ألوان سريعة */}
      <div className="grid grid-cols-8 gap-1.5">
        {PRESET_COLORS.map(p => (
          <button
            type="button"
            key={p.hex}
            onClick={() => selectPreset(p)}
            title={p.name}
            className={`w-8 h-8 rounded-lg border-2 transition-all ${
              draft.hex === p.hex ? 'border-teal-500 scale-110' : 'border-transparent hover:border-gray-300'
            }`}
            style={{ backgroundColor: p.hex }}
          >
            {draft.hex === p.hex && p.hex !== '#FFFFFF' && (
              <Check className="w-4 h-4 text-white mx-auto" />
            )}
          </button>
        ))}
      </div>

      {/* إدخال اللون */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={draft.name}
            list="fabric-color-options"
            onChange={event => {
              const name = event.target.value
              const selectedOption = selectableColorOptions.find(option => (
                option.color_name.trim().toLowerCase() === name.trim().toLowerCase()
              ))
              onDraftChange({
                ...draft,
                name,
                hex: selectedOption?.color_hex ?? draft.hex,
              })
            }}
            onKeyDown={e => e.key === 'Enter' && !isEditing && (e.preventDefault(), addColor())}
            placeholder="اسم اللون..."
            className="min-w-0 flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          <datalist id="fabric-color-options">
            {selectableColorOptions.map(option => (
              <option key={option.color_name} value={option.color_name} />
            ))}
          </datalist>
          <input
            type="color"
            value={draft.hex || '#000000'}
            onChange={event => onDraftChange({ ...draft, hex: event.target.value })}
            className="w-10 h-10 shrink-0 rounded-xl border border-gray-200 cursor-pointer p-0.5"
            title="اختر لون"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={draft.quantity}
            onChange={event => onDraftChange({ ...draft, quantity: event.target.value })}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addColor())}
            placeholder={unit === 'meter' ? 'الكمية بالمتر *' : 'الكمية بالقطعة *'}
            className="min-w-0 flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          />
          {isEditing && (
            <input
              type="number"
              min="1"
              step="1"
              value={draft.serialNumber}
              onChange={event => onDraftChange({ ...draft, serialNumber: event.target.value })}
              placeholder={`رقم اللون ${typeCode || 'FB'}- (اختياري)`}
              className="min-w-0 flex-1 px-3 py-2 border border-gray-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          )}
          <button
            type="button"
            onClick={addColor}
            disabled={!draft.name.trim() || !draft.quantity.trim() || saving}
            className={`${isEditing ? 'sm:col-span-2' : 'w-full'} px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors text-sm font-medium`}
          >
            {saving ? '...' : 'إضافة'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── نافذة إضافة/تعديل صنف ───────────────────────────────────────────────────
interface ItemModalProps {
  item: FabricInventoryItem | null
  suppliers: Supplier[]
  typeCodes: FabricTypeCodeOption[]
  classificationOptions: string[]
  colorOptions: FabricColorOption[]
  onClose: () => void
  onSave: (item: FabricInventoryItem) => void
  onSupplierCreated: (supplier: Supplier) => void
  onColorOptionSaved: (option: FabricColorOption) => void
}

function ItemModal({
  item,
  suppliers,
  typeCodes,
  classificationOptions,
  colorOptions,
  onClose,
  onSave,
  onSupplierCreated,
  onColorOptionSaved,
}: ItemModalProps) {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CreateInventoryItemInput>(() => {
    let rememberedFabricType = ''
    if (!item && typeof window !== 'undefined') {
      try {
        rememberedFabricType = window.localStorage
          .getItem(LAST_PRIMARY_FABRIC_TYPE_STORAGE_KEY)
          ?.trim() ?? ''
      } catch {
        rememberedFabricType = ''
      }
    }

    const initialFabricType = item?.fabric_type ?? rememberedFabricType
    const rememberedTypeCode = typeCodes.find(option => (
      option.fabric_type.trim().toLowerCase() === initialFabricType.trim().toLowerCase()
    ))?.type_code

    return {
      name: item?.name ?? '',
      fabric_type: initialFabricType,
      fabric_types: item?.fabric_types?.length
        ? item.fabric_types
        : initialFabricType
          ? [initialFabricType]
          : [],
      type_code: item
        ? item.type_code ?? ''
        : rememberedTypeCode ?? suggestFabricTypeCode(initialFabricType),
      unit: item?.unit ?? 'meter',
      cost_per_unit: item?.cost_per_unit ?? undefined,
      purchase_price_mode: item?.purchase_price_mode ?? undefined,
      purchase_total_price: item?.purchase_total_price ?? undefined,
      purchase_total_quantity: item?.purchase_total_quantity ?? undefined,
      sale_price_per_unit: item?.sale_price_per_unit ?? undefined,
      supplier_id: item?.supplier_id ?? undefined,
      supplier_name: item?.supplier_name ?? undefined,
      notes: item?.notes ?? '',
      images: item?.images ?? [],
      thumbnail_image: item?.thumbnail_image ?? undefined,
      has_color_variants: item?.has_color_variants ?? false,
    }
  })
  const [initialColorSerialNumbers, setInitialColorSerialNumbers] = useState<Record<string, string>>({})
  const [baseSerialNumber, setBaseSerialNumber] = useState(
    getSequenceFromFabricCode(item?.base_fabric_code)
  )
  const [colors, setColors] = useState<FabricInventoryColor[]>(item?.colors ?? [])
  const [colorDraft, setColorDraft] = useState<ColorDraft>(EMPTY_COLOR_DRAFT)
  const [loadingColors, setLoadingColors] = useState(!!item)
  const [purchasePriceMode, setPurchasePriceMode] = useState<'per_unit' | 'total'>(
    item?.purchase_price_mode === 'total' ? 'total' : 'per_unit'
  )
  const [additionalFabricTypeInput, setAdditionalFabricTypeInput] = useState('')

  // حالة المورد
  const [supplierMode, setSupplierMode] = useState<'select' | 'new'>(
    item?.supplier_id ? 'select' : 'select'
  )
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

  const selectedType = typeCodes.find(
    option => option.fabric_type.trim().toLowerCase() === form.fabric_type?.trim().toLowerCase()
  )
  const additionalFabricTypes = form.fabric_types?.filter(
    type => type.trim().toLowerCase() !== form.fabric_type?.trim().toLowerCase()
  ) ?? []
  const isPrimaryClassificationLocked = Boolean(
    item && (item.base_fabric_code || colors.some(color => color.fabric_code))
  )
  const nextSequence = (selectedType?.last_sequence ?? 0) + 1
  const codePreview = formatFabricCodePreview(form.type_code || suggestFabricTypeCode(form.fabric_type ?? ''), nextSequence)
  const normalizedTypeCode = normalizeFabricTypeCode(
    form.type_code || suggestFabricTypeCode(form.fabric_type ?? '') || 'FB'
  )
  const hasColorSerials = !item || colors.length > 0 || Boolean(item.has_color_variants)
  const requestedBaseSequence = baseSerialNumber.trim() === '' ? null : Number(baseSerialNumber)
  const requestedBaseCode = requestedBaseSequence != null && Number.isInteger(requestedBaseSequence)
    ? formatFabricCodePreview(normalizedTypeCode, requestedBaseSequence)
    : codePreview
  const totalPurchaseUnitCost =
    purchasePriceMode === 'total' &&
    form.purchase_total_price != null &&
    form.purchase_total_quantity != null &&
    form.purchase_total_quantity > 0
      ? roundFabricNumber(form.purchase_total_price / form.purchase_total_quantity)
      : null

  const handleFabricTypeChange = (fabricType: string) => {
    const existing = typeCodes.find(
      option => option.fabric_type.trim().toLowerCase() === fabricType.trim().toLowerCase()
    )
    setForm(previous => {
      const previousPrimary = previous.fabric_type?.trim().toLowerCase()
      const additionalTypes = previous.fabric_types?.filter(
        type => type.trim().toLowerCase() !== previousPrimary
      ) ?? []
      return {
        ...previous,
        fabric_type: fabricType,
        fabric_types: [fabricType, ...additionalTypes].filter(
          (type, index, allTypes) =>
            type.trim() &&
            allTypes.findIndex(candidate => candidate.trim().toLowerCase() === type.trim().toLowerCase()) === index
        ),
        type_code: existing?.type_code ?? suggestFabricTypeCode(fabricType)
      }
    })
  }

  const addAdditionalFabricType = () => {
    const fabricType = additionalFabricTypeInput.trim()
    if (!fabricType) return
    if (fabricType.toLowerCase() === form.fabric_type?.trim().toLowerCase()) {
      alert('هذا هو التصنيف الأساسي بالفعل')
      return
    }
    if (additionalFabricTypes.some(type => type.trim().toLowerCase() === fabricType.toLowerCase())) {
      alert('هذا التصنيف مضاف مسبقاً')
      return
    }
    setForm(previous => ({
      ...previous,
      fabric_types: [previous.fabric_type ?? '', ...additionalFabricTypes, fabricType]
        .filter(type => type.trim())
    }))
    setAdditionalFabricTypeInput('')
  }

  const removeAdditionalFabricType = (fabricType: string) => {
    setForm(previous => ({
      ...previous,
      fabric_types: (previous.fabric_types ?? []).filter(
        type => type.trim().toLowerCase() !== fabricType.trim().toLowerCase()
      )
    }))
  }

  useEffect(() => {
    if (item) {
      getColors(item.id)
        .then(setColors)
        .catch(() => {})
        .finally(() => setLoadingColors(false))
    }
  }, [item])

  // حفظ المورد الجديد
  const handleSaveNewSupplier = async () => {
    if (!newSupplierName.trim()) return
    setSavingSupplier(true)
    try {
      const created = await createSupplier({
        name: newSupplierName.trim(),
        contact_info: newSupplierPhone.trim() || undefined,
        branch: 'fabrics'
      })
      onSupplierCreated(created)
      setForm({ ...form, supplier_id: created.id, supplier_name: created.name })
      setSupplierMode('select')
      setNewSupplierName('')
      setNewSupplierPhone('')
    } catch {
      alert('❌ خطأ في حفظ المورد')
    } finally {
      setSavingSupplier(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.fabric_type?.trim()) {
      alert('يرجى اختيار نوع القماش أو إضافة نوع جديد')
      return
    }
    if (form.images.length === 0) {
      alert('صورة القماش مطلوبة')
      return
    }

    const pendingColorName = colorDraft.name.trim()
    const hasPendingColorInput = Boolean(
      pendingColorName ||
      colorDraft.hex.trim() ||
      colorDraft.quantity.trim() ||
      colorDraft.serialNumber.trim()
    )
    let pendingColor: FabricInventoryColor | null = null
    let colorsForSave = colors

    if (hasPendingColorInput) {
      if (!pendingColorName) {
        alert('اسم اللون مطلوب')
        return
      }
      const rawQuantity = Number(colorDraft.quantity)
      if (!colorDraft.quantity.trim() || !Number.isFinite(rawQuantity) || rawQuantity <= 0) {
        alert(`كمية اللون بال${form.unit === 'meter' ? 'متر' : 'قطعة'} مطلوبة ويجب أن تكون أكبر من صفر`)
        return
      }
      if (colors.some(color => color.color_name.trim().toLowerCase() === pendingColorName.toLowerCase())) {
        alert('هذا اللون موجود مسبقاً')
        return
      }
      if (item && colorDraft.serialNumber.trim()) {
        const sequenceNumber = Number(colorDraft.serialNumber)
        if (!Number.isInteger(sequenceNumber) || sequenceNumber <= 0) {
          alert('يرجى إدخال رقم تسلسلي صحيح أكبر من صفر')
          return
        }
      }

      pendingColor = {
        id: `temp-pending-${Date.now()}`,
        inventory_item_id: item?.id ?? '',
        color_name: pendingColorName,
        color_hex: colorDraft.hex || null,
        current_quantity: roundFabricNumber(rawQuantity),
        notes: null,
        created_at: new Date().toISOString(),
        created_by: null,
        fabric_code: null,
      }
      colorsForSave = [...colors, pendingColor]
    }

    if (colorsForSave.length === 0) {
      alert('يجب إضافة لون واحد على الأقل مع كميته قبل حفظ القماش')
      return
    }
    if (!item) {
      const colorWithoutQuantity = colorsForSave.find(color => (
        !Number.isFinite(color.current_quantity) || color.current_quantity <= 0
      ))
      if (colorWithoutQuantity) {
        alert(`كمية اللون ${colorWithoutQuantity.color_name} مطلوبة ويجب أن تكون أكبر من صفر`)
        return
      }
    }
    const hasColorSerialsForSave = !item || colorsForSave.length > 0 || Boolean(item.has_color_variants)
    if (
      !hasColorSerialsForSave &&
      requestedBaseSequence != null &&
      (!Number.isInteger(requestedBaseSequence) || requestedBaseSequence <= 0)
    ) {
      alert('يرجى إدخال رقم تسلسلي صحيح أكبر من صفر')
      return
    }
    if (!item) {
      const invalidColorSerial = colorsForSave.find(color => {
        const value = initialColorSerialNumbers[color.id]?.trim()
        if (!value) return false
        const sequenceNumber = Number(value)
        return !Number.isInteger(sequenceNumber) || sequenceNumber <= 0
      })
      if (invalidColorSerial) {
        alert(`رقم اللون ${invalidColorSerial.color_name} يجب أن يكون عدداً صحيحاً أكبر من صفر`)
        return
      }
    }

    let purchaseCostPerUnit: number | null = null
    if (purchasePriceMode === 'total') {
      const hasTotalPrice = form.purchase_total_price != null
      const hasTotalQuantity = form.purchase_total_quantity != null
      if (hasTotalPrice !== hasTotalQuantity) {
        alert('أدخل السعر الكلي والكمية معاً، أو اتركهما فارغين لإضافة السعر لاحقاً')
        return
      }
      if (hasTotalPrice && (form.purchase_total_quantity ?? 0) <= 0) {
        alert('عدد الأمتار أو القطع يجب أن يكون أكبر من صفر')
        return
      }
      if (hasTotalPrice && hasTotalQuantity) {
        purchaseCostPerUnit = roundFabricNumber(
          (form.purchase_total_price ?? 0) / (form.purchase_total_quantity ?? 1)
        )
      }
    } else if (form.cost_per_unit != null) {
      purchaseCostPerUnit = roundFabricNumber(form.cost_per_unit)
    }

    setSaving(true)
    let createdItemId: string | null = null
    let createdEditingColorId: string | null = null
    try {
      const payload: CreateInventoryItemInput = {
        ...form,
        cost_per_unit: purchaseCostPerUnit,
        purchase_price_mode: purchaseCostPerUnit == null ? null : purchasePriceMode,
        purchase_total_price:
          purchasePriceMode === 'total' && purchaseCostPerUnit != null
            ? roundFabricNumber(form.purchase_total_price ?? 0)
            : null,
        purchase_total_quantity:
          purchasePriceMode === 'total' && purchaseCostPerUnit != null
            ? roundFabricNumber(form.purchase_total_quantity ?? 0)
            : null,
        sale_price_per_unit:
          form.sale_price_per_unit == null
            ? null
            : roundFabricNumber(form.sale_price_per_unit),
        name: form.name || form.type_code || form.fabric_type,
        type_code: normalizeFabricTypeCode(form.type_code || suggestFabricTypeCode(form.fabric_type)),
        fabric_types: [form.fabric_type, ...additionalFabricTypes, additionalFabricTypeInput.trim()]
          .filter((type): type is string => Boolean(type?.trim()))
          .filter((type, index, allTypes) =>
            allTypes.findIndex(candidate => candidate.trim().toLowerCase() === type.trim().toLowerCase()) === index
          ),
        has_color_variants: colorsForSave.length > 0,
        supplier_id: form.supplier_id || undefined,
        supplier_name: form.supplier_name || undefined,
        fabric_type: form.fabric_type || undefined,
        notes: form.notes || undefined
      }
      let result: FabricInventoryItem
      let savedPendingColor: FabricInventoryColor | null = null

      if (pendingColor) {
        const reusableOption: FabricColorOption = {
          color_name: pendingColor.color_name,
          color_hex: pendingColor.color_hex,
        }
        await saveFabricColorOption(reusableOption)
        onColorOptionSaved(reusableOption)
      }

      if (item) {
        if (pendingColor) {
          let created = await createColor({
            inventory_item_id: item.id,
            color_name: pendingColor.color_name,
            color_hex: pendingColor.color_hex ?? undefined,
          })
          createdEditingColorId = created.id
          savedPendingColor = created
          try {
            if (colorDraft.serialNumber.trim()) {
              const fabricCode = await setFabricSerialNumber({
                inventoryItemId: item.id,
                inventoryColorId: created.id,
                sequenceNumber: Number(colorDraft.serialNumber),
              })
              created = { ...created, fabric_code: fabricCode }
              savedPendingColor = created
            }
            await addMovement({
              inventory_item_id: item.id,
              color_id: created.id,
              movement_type: 'in',
              quantity: pendingColor.current_quantity,
              cost_per_unit: payload.cost_per_unit ?? undefined,
              description: `رصيد اللون عند الإضافة - ${created.color_name}`,
            })
            savedPendingColor = {
              ...created,
              current_quantity: pendingColor.current_quantity,
            }
          } catch (colorError) {
            await deleteColor(created.id).catch(() => undefined)
            createdEditingColorId = null
            savedPendingColor = null
            throw colorError
          }
        }

        result = await updateInventoryItem(item.id, payload)
        if (!hasColorSerialsForSave && requestedBaseSequence != null) {
          const fabricCode = await setFabricSerialNumber({
            inventoryItemId: item.id,
            sequenceNumber: requestedBaseSequence,
          })
          result = { ...result, base_fabric_code: fabricCode }
        }
        result = {
          ...result,
          colors: savedPendingColor ? [...colors, savedPendingColor] : colors,
        }
      } else {
        result = await createInventoryItem(payload)
        createdItemId = result.id
        if (!hasColorSerialsForSave && requestedBaseSequence != null) {
          const fabricCode = await setFabricSerialNumber({
            inventoryItemId: result.id,
            sequenceNumber: requestedBaseSequence,
          })
          result = { ...result, base_fabric_code: fabricCode }
        }
        // حفظ الألوان المؤقتة
        const savedColors: FabricInventoryColor[] = []
        for (const color of colorsForSave) {
          let savedColor = await createColor({
            inventory_item_id: result.id,
            color_name: color.color_name,
            color_hex: color.color_hex ?? undefined
          })
          const colorSerial = initialColorSerialNumbers[color.id]?.trim()
          if (colorSerial) {
            const fabricCode = await setFabricSerialNumber({
              inventoryItemId: result.id,
              inventoryColorId: savedColor.id,
              sequenceNumber: Number(colorSerial),
            })
            savedColor = { ...savedColor, fabric_code: fabricCode }
          }

          const colorQuantity = roundFabricNumber(color.current_quantity)
          if (colorQuantity > 0) {
            await addMovement({
              inventory_item_id: result.id,
              color_id: savedColor.id,
              movement_type: 'in',
              quantity: colorQuantity,
              cost_per_unit: payload.cost_per_unit ?? undefined,
              description: `رصيد ابتدائي - ${savedColor.color_name}`,
              date: new Date().toISOString().split('T')[0]
            })
          }
          savedColors.push({
            ...savedColor,
            current_quantity: colorQuantity > 0 ? colorQuantity : 0,
          })
        }

        const totalInitialQuantity = savedColors.reduce(
          (sum, color) => sum + color.current_quantity,
          0
        )
        result = { ...result, current_quantity: totalInitialQuantity, colors: savedColors }
        // إضافة المنتج المقابل في نظام المحاسبة (الأستاذ — فرع بروكار الشرقية)
        // أفضل جهد: لا يوقف حفظ المخزون إن فشل، وللمدير فقط
        if (isAdmin) {
          syncFabricProductToAlostaz(result.id).catch(() => {})
        }
      }
      if (!item && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(
            LAST_PRIMARY_FABRIC_TYPE_STORAGE_KEY,
            form.fabric_type?.trim() ?? ''
          )
        } catch {
          // يبقى الحفظ ناجحاً حتى إذا كان التخزين المحلي غير متاح.
        }
      }
      onSave(result)
    } catch (error) {
      if (createdItemId) {
        await deleteInventoryItem(createdItemId).catch(() => undefined)
      }
      if (createdEditingColorId) {
        await deleteColor(createdEditingColorId).catch(() => undefined)
      }
      const message = String((error as { message?: unknown } | null)?.message ?? '')
      alert(message.includes('FABRIC_SERIAL')
        ? `❌ ${getFabricSerialErrorMessage(error)}`
        : '❌ حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {item ? 'تعديل الصنف' : 'إضافة صنف جديد'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-2xl border border-teal-100 bg-teal-50/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-teal-900 mb-2">
              <Hash className="w-4 h-4" /> رقم القماش
            </div>
            <div
              dir="ltr"
              className={`grid gap-2 ${hasColorSerials ? 'grid-cols-1' : 'grid-cols-2'}`}
            >
              <label className="min-w-0">
                <span dir="rtl" className="mb-1 block text-xs font-medium text-teal-800">
                  حروف التصنيف
                </span>
                <input
                  dir="ltr"
                  type="text"
                  value={form.type_code ?? ''}
                  onChange={event => setForm({
                    ...form,
                    type_code: normalizeFabricTypeCode(event.target.value)
                  })}
                  className="h-11 w-full rounded-xl border border-teal-200 bg-white px-3 font-mono text-base font-black uppercase text-teal-800 focus:border-transparent focus:ring-2 focus:ring-teal-500 disabled:bg-teal-100/70 disabled:text-teal-600"
                  placeholder="SAT"
                  maxLength={8}
                  required
                  disabled={Boolean(selectedType) || isPrimaryClassificationLocked}
                />
              </label>
              {!hasColorSerials && (
                <label className="min-w-0">
                  <span dir="rtl" className="mb-1 block text-xs font-medium text-teal-800">
                    الرقم التسلسلي
                  </span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={baseSerialNumber}
                    onChange={event => setBaseSerialNumber(event.target.value)}
                    placeholder={String(nextSequence)}
                    className="min-w-0 flex-1 rounded-xl border border-teal-200 bg-white px-3 py-2 font-mono text-lg font-black text-teal-800 focus:border-transparent focus:ring-2 focus:ring-teal-500"
                    aria-label="الرقم التسلسلي للقماش"
                  />
                </label>
              )}
            </div>
            {!hasColorSerials && (
                <div dir="ltr" className="mt-2 font-mono text-sm font-bold tracking-wider text-teal-700">
                  {baseSerialNumber.trim()
                    ? `سيُحفظ كـ ${requestedBaseCode}`
                    : `تلقائي: ${item?.base_fabric_code || codePreview}`}
                </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">التصنيف الأساسي *</label>
            <input
              type="text"
              value={form.fabric_type ?? ''}
              onChange={e => handleFabricTypeChange(e.target.value)}
              list="fabric-type-options"
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="اختر تصنيفاً سابقاً أو اكتب تصنيفاً جديداً"
              required
              disabled={isPrimaryClassificationLocked}
            />
            <datalist id="fabric-type-options">
              {classificationOptions.map(type => (
                <option key={type} value={type}>
                  {typeCodes.find(option => option.fabric_type === type)?.type_code}
                </option>
              ))}
            </datalist>
            {isPrimaryClassificationLocked && (
              <p className="text-xs text-gray-400 mt-1">لا يمكن تغييره بعد حجز أول رقم.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              التصنيفات الإضافية — اختياري
            </label>
            {additionalFabricTypes.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {additionalFabricTypes.map(type => (
                  <span
                    key={type}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
                  >
                    {type}
                    <button
                      type="button"
                      onClick={() => removeAdditionalFabricType(type)}
                      className="rounded-full p-0.5 text-amber-500 transition-colors hover:bg-amber-100 hover:text-red-600"
                      aria-label={`حذف تصنيف ${type}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={additionalFabricTypeInput}
                onChange={event => setAdditionalFabricTypeInput(event.target.value)}
                onKeyDown={event => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addAdditionalFabricType()
                  }
                }}
                list="additional-fabric-type-options"
                className="min-w-0 flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                placeholder="اختر تصنيفاً أو اكتب تصنيفاً جديداً"
              />
              <button
                type="button"
                onClick={addAdditionalFabricType}
                disabled={!additionalFabricTypeInput.trim()}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-amber-500 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
                إضافة
              </button>
            </div>
            <datalist id="additional-fabric-type-options">
              {classificationOptions
                .filter(type =>
                  type.trim().toLowerCase() !== form.fabric_type?.trim().toLowerCase() &&
                  !additionalFabricTypes.some(selected =>
                    selected.trim().toLowerCase() === type.trim().toLowerCase()
                  )
                )
                .map(type => <option key={type} value={type} />)}
            </datalist>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-teal-600" /> صورة القماش *
            </label>
            <ImageUpload
              images={form.images}
              onImagesChange={images => setForm(previous => ({ ...previous, images }))}
              onPrimaryThumbnailChange={thumbnail_image => setForm(previous => ({
                ...previous,
                thumbnail_image: thumbnail_image || undefined
              }))}
              maxImages={5}
              useSupabaseStorage
              acceptVideo={false}
            />
          </div>

          {/* قسم الألوان */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" />
              الألوان المتاحة {!item && '*'}
              {colors.length > 0 && (
                <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full font-bold">
                  {colors.length}
                </span>
              )}
            </label>
            {loadingColors ? (
              <div className="text-sm text-gray-400 py-2">جاري التحميل...</div>
            ) : (
              <>
                <ColorManager
                  colors={colors}
                  onChange={setColors}
                  colorOptions={colorOptions}
                  draft={colorDraft}
                  onDraftChange={setColorDraft}
                  onColorOptionSaved={onColorOptionSaved}
                  isEditing={!!item}
                  itemId={item?.id}
                  unit={form.unit}
                  costPerUnit={form.cost_per_unit}
                  typeCode={normalizedTypeCode}
                />
                {!item && colors.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {colors.map((color, index) => (
                      <div key={color.id} className="space-y-2 rounded-xl bg-gray-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="block truncate font-medium text-gray-700">{color.color_name}</span>
                            <span className="text-xs font-medium text-teal-700">
                              {formatFabricNumber(color.current_quantity)} {form.unit === 'meter' ? 'متر' : 'قطعة'}
                            </span>
                          </div>
                          <span dir="ltr" className="shrink-0 font-mono text-[10px] font-bold text-teal-700">
                            {initialColorSerialNumbers[color.id]?.trim()
                              ? formatFabricCodePreview(
                                  normalizedTypeCode,
                                  Number(initialColorSerialNumbers[color.id])
                                )
                              : formatFabricCodePreview(normalizedTypeCode, nextSequence + index)}
                          </span>
                        </div>
                        <label className="block space-y-1 text-xs text-gray-500">
                          <span>الرقم — اختياري</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={initialColorSerialNumbers[color.id] ?? ''}
                            onChange={event => setInitialColorSerialNumbers(previous => ({
                              ...previous,
                              [color.id]: event.target.value
                            }))}
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 font-mono text-sm"
                            placeholder={String(nextSequence + index)}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">وحدة القياس</label>
            <select
              value={form.unit}
              onChange={e => setForm({ ...form, unit: e.target.value as InventoryUnit })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
            >
              <option value="meter">متر</option>
              <option value="piece">قطعة</option>
            </select>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-4 space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700">سعر الشراء — اختياري</p>
              </div>
              <div className="grid grid-cols-2 rounded-xl border border-gray-200 bg-white p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setPurchasePriceMode('per_unit')}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    purchasePriceMode === 'per_unit'
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  سعر {form.unit === 'meter' ? 'المتر' : 'القطعة'}
                </button>
                <button
                  type="button"
                  onClick={() => setPurchasePriceMode('total')}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    purchasePriceMode === 'total'
                      ? 'bg-teal-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  السعر الكلي
                </button>
              </div>
            </div>

            {purchasePriceMode === 'per_unit' ? (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  سعر الشراء لكل {form.unit === 'meter' ? 'متر' : 'قطعة'} (ر.س)
                </label>
                <input
                  type="number"
                  value={form.cost_per_unit ?? ''}
                  onChange={event => setForm({
                    ...form,
                    cost_per_unit: event.target.value === '' ? null : parseFloat(event.target.value)
                  })}
                  className="w-full px-4 py-2 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                  placeholder="اتركه فارغاً لإضافته لاحقاً"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">السعر الكلي (ر.س)</label>
                    <input
                      type="number"
                      value={form.purchase_total_price ?? ''}
                      onChange={event => setForm({
                        ...form,
                        purchase_total_price: event.target.value === '' ? null : parseFloat(event.target.value)
                      })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      min="0"
                      step="0.01"
                      placeholder="مثال: 1200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      عدد {form.unit === 'meter' ? 'الأمتار' : 'القطع'}
                    </label>
                    <input
                      type="number"
                      value={form.purchase_total_quantity ?? ''}
                      onChange={event => setForm({
                        ...form,
                        purchase_total_quantity: event.target.value === '' ? null : parseFloat(event.target.value)
                      })}
                      className="w-full px-4 py-2 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      min="0.01"
                      step="0.01"
                      placeholder="مثال: 40"
                    />
                  </div>
                </div>
                {totalPurchaseUnitCost != null && (
                  <div className="flex items-center justify-between rounded-xl border border-teal-100 bg-teal-50 px-3 py-2 text-sm">
                    <span className="text-teal-700">سعر {form.unit === 'meter' ? 'المتر' : 'القطعة'} المحسوب</span>
                    <strong className="text-teal-900">
                      {formatFabricCurrency(totalPurchaseUnitCost)}
                    </strong>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              سعر البيع لكل {form.unit === 'meter' ? 'متر' : 'قطعة'} (ر.س) — اختياري
            </label>
            <input
              type="number"
              value={form.sale_price_per_unit ?? ''}
              onChange={event => setForm({
                ...form,
                sale_price_per_unit: event.target.value === '' ? null : parseFloat(event.target.value)
              })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              min="0"
              step="0.01"
              placeholder="اتركه فارغاً لإضافته لاحقاً"
            />
          </div>

          {/* ─── قسم المورد الذكي ─── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">المورد (اختياري)</label>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setSupplierMode('select')}
                  className={`px-3 py-1.5 transition-colors ${
                    supplierMode === 'select'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  اختيار
                </button>
                <button
                  type="button"
                  onClick={() => setSupplierMode('new')}
                  className={`px-3 py-1.5 flex items-center gap-1 transition-colors ${
                    supplierMode === 'new'
                      ? 'bg-teal-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  مورد جديد
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {supplierMode === 'select' ? (
                <motion.div
                  key="select"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                >
                  <select
                    value={form.supplier_id ?? ''}
                    onChange={e => {
                      const sup = suppliers.find(s => s.id === e.target.value)
                      setForm({ ...form, supplier_id: e.target.value || undefined, supplier_name: sup?.name })
                    }}
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-white"
                  >
                    <option value="">بدون مورد</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-xs text-gray-400 mt-1">لا يوجد موردون محفوظون — أضف مورداً جديداً من الزر أعلاه</p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="new"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-2"
                >
                  <input
                    type="text"
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                    placeholder="اسم المورد *"
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                  <input
                    type="text"
                    value={newSupplierPhone}
                    onChange={e => setNewSupplierPhone(e.target.value)}
                    placeholder="رقم الجوال أو معلومات التواصل (اختياري)"
                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleSaveNewSupplier}
                    disabled={!newSupplierName.trim() || savingSupplier}
                    className="w-full py-2 bg-teal-50 text-teal-700 border border-teal-200 rounded-xl hover:bg-teal-100 disabled:opacity-40 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    <UserPlus className="w-4 h-4" />
                    {savingSupplier ? 'جاري الحفظ...' : 'حفظ المورد وتحديده'}
                  </button>
                  {form.supplier_name && (
                    <p className="text-xs text-teal-600 font-medium">
                      ✓ تم تحديد المورد: {form.supplier_name}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملاحظات</label>
            <textarea
              value={form.notes ?? ''}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
              rows={2}
              placeholder="ملاحظات إضافية..."
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors disabled:opacity-50 font-medium"
          >
            {saving ? 'جاري الحفظ...' : item ? 'تحديث' : 'حفظ'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ─── نافذة إضافة حركة (دخول / خروج) ─────────────────────────────────────────
interface MovementModalProps {
  item: FabricInventoryItem
  type: MovementType
  onClose: () => void
  onSave: (movement: FabricInventoryMovement) => void
}

function MovementModal({ item, type, onClose, onSave }: MovementModalProps) {
  const [saving, setSaving] = useState(false)
  const [quantity, setQuantity] = useState('')
  const [costPerUnit, setCostPerUnit] = useState(item.cost_per_unit?.toString() ?? '')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [colors, setColors] = useState<FabricInventoryColor[]>([])
  const [selectedColorId, setSelectedColorId] = useState<string>('')
  const [loadingColors, setLoadingColors] = useState(true)

  const unitLabel = item.unit === 'meter' ? 'متر' : 'قطعة'
  const isIn = type === 'in'

  useEffect(() => {
    let isActive = true
    setLoadingColors(true)
    getColors(item.id)
      .then(loadedColors => {
        if (!isActive) return
        setColors(loadedColors)
        setSelectedColorId(loadedColors.length === 1 ? loadedColors[0].id : '')
      })
      .catch(() => {})
      .finally(() => {
        if (isActive) setLoadingColors(false)
      })

    return () => {
      isActive = false
    }
  }, [item.id])

  // الرصيد الحالي (إجمالي أو للون المحدد)
  const currentQty = selectedColorId
    ? (colors.find(c => c.id === selectedColorId)?.current_quantity ?? 0)
    : item.current_quantity

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = roundFabricNumber(parseFloat(quantity))
    if (!qty || qty <= 0) return

    if (loadingColors) return

    if (colors.length > 0 && !selectedColorId) {
      alert('❌ يجب تحديد لون القماش حتى تتم مزامنة الكمية مع متجر الأقمشة')
      return
    }

    if (!isIn && qty > currentQty) {
      alert(`❌ الكمية المطلوبة (${qty}) أكبر من الرصيد الحالي (${currentQty})`)
      return
    }

    setSaving(true)
    try {
      const result = await addMovement({
        inventory_item_id: item.id,
        movement_type: type,
        quantity: qty,
        cost_per_unit: costPerUnit ? roundFabricNumber(parseFloat(costPerUnit)) : undefined,
        description: description || undefined,
        color_id: selectedColorId || undefined,
        date
      })
      onSave(result)
    } catch (error) {
      const message = error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : ''
      alert(message.includes('تحديد لون القماش') ? `❌ ${message}` : '❌ حدث خطأ أثناء الحفظ')
    } finally {
      setSaving(false)
    }
  }

  const selectedColor = colors.find(c => c.id === selectedColorId)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${isIn ? 'bg-green-100' : 'bg-red-100'}`}>
              {isIn
                ? <ArrowDownCircle className="w-5 h-5 text-green-600" />
                : <ArrowUpCircle className="w-5 h-5 text-red-600" />
              }
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {isIn ? 'إدخال كمية' : 'إخراج كمية'}
              </h2>
              <p className="text-sm text-gray-500">{item.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className={`mb-4 p-3 rounded-xl text-sm ${isIn ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'}`}>
          الرصيد الحالي{selectedColor ? ` (${selectedColor.color_name})` : ' (إجمالي)'}:{' '}
          <span className="font-bold">{currentQty} {unitLabel}</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* اختيار اللون */}
          {!loadingColors && colors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                <Palette className="w-4 h-4 text-teal-600" />
                اللون *
              </label>
              <div className="flex flex-wrap gap-2">
                {colors.map(c => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setSelectedColorId(c.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-all ${
                      selectedColorId === c.id
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'border-gray-200 text-gray-600 hover:border-teal-400'
                    }`}
                  >
                    {c.color_hex && (
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/50 shrink-0"
                        style={{ backgroundColor: c.color_hex }}
                      />
                    )}
                    {c.color_name}
                    <span className="text-xs opacity-75">({formatFabricNumber(c.current_quantity)})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الكمية ({unitLabel}) *
            </label>
            <input
              type="number"
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              min="0.01"
              step="0.01"
              placeholder="0"
              required
              autoFocus
            />
          </div>

          {isIn && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                سعر الشراء للوحدة (ر.س) — اختياري
              </label>
              <input
                type="number"
                value={costPerUnit}
                onChange={e => setCostPerUnit(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">السبب / الوصف</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder={isIn ? 'شراء جديد، استلام بضاعة...' : 'استخدام في طلب، بيع...'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">التاريخ</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
            />
          </div>

          <button
            type="submit"
            disabled={saving || loadingColors || (colors.length > 0 && !selectedColorId)}
            className={`w-full py-3 text-white rounded-xl transition-colors disabled:opacity-50 font-medium ${
              isIn ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {saving ? 'جاري الحفظ...' : isIn ? 'إدخال' : 'إخراج'}
          </button>
        </form>
      </motion.div>
    </motion.div>
  )
}

// ─── نافذة سجل الحركات ────────────────────────────────────────────────────────
interface MovementsHistoryModalProps {
  item: FabricInventoryItem
  onClose: () => void
}

function MovementsHistoryModal({ item, onClose }: MovementsHistoryModalProps) {
  const [movements, setMovements] = useState<FabricInventoryMovement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getMovements(item.id)
      .then(setMovements)
      .catch(() => alert('❌ خطأ في تحميل السجل'))
      .finally(() => setLoading(false))
  }, [item.id])

  const handleDeleteMovement = async (id: string) => {
    if (!confirm('هل تريد حذف هذه الحركة؟ سيتم تعديل الرصيد تلقائياً.')) return
    try {
      await deleteMovement(id)
      setMovements(prev => prev.filter(m => m.id !== id))
    } catch {
      alert('❌ خطأ في الحذف')
    }
  }

  const unitLabel = item.unit === 'meter' ? 'م' : 'ق'
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString('ar-SA-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">سجل الحركات</h2>
            <p className="text-sm text-gray-500">{item.name}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center py-8 text-gray-400">جاري التحميل...</div>
          ) : movements.length === 0 ? (
            <div className="text-center py-8 text-gray-400">لا توجد حركات مسجلة</div>
          ) : (
            <div className="space-y-2">
              {movements.map(mv => (
                <div
                  key={mv.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-1.5 rounded-lg ${
                        mv.movement_type === 'in' ? 'bg-green-100' : 'bg-red-100'
                      }`}
                    >
                      {mv.movement_type === 'in'
                        ? <ArrowDownCircle className="w-4 h-4 text-green-600" />
                        : <ArrowUpCircle className="w-4 h-4 text-red-600" />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {mv.movement_type === 'in' ? '+' : '-'}{formatFabricNumber(mv.quantity)} {unitLabel}
                        {mv.cost_per_unit ? <span className="text-gray-500 mr-2 text-xs">({formatFabricNumber(mv.cost_per_unit)} ر.س/{unitLabel})</span> : null}
                      </p>
                      {mv.color_name && (
                        <p className="text-xs text-teal-600 font-medium">🎨 {mv.color_name}</p>
                      )}
                      {mv.description && (
                        <p className="text-xs text-gray-500">{mv.description}</p>
                      )}
                      <p className="text-xs text-gray-400">{formatDate(mv.date)}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteMovement(mv.id)}
                    className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── عارض صور القماش ──────────────────────────────────────────────────────────
interface FabricImagesModalProps {
  item: FabricInventoryItem
  onClose: () => void
}

function FabricImagesModal({ item, onClose }: FabricImagesModalProps) {
  const images = useMemo(
    () => Array.from(new Set((item.images ?? []).filter(Boolean))),
    [item.images]
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  const showPreviousImage = useCallback(() => {
    if (images.length < 2) return
    setActiveIndex(current => (current - 1 + images.length) % images.length)
  }, [images.length])

  const showNextImage = useCallback(() => {
    if (images.length < 2) return
    setActiveIndex(current => (current + 1) % images.length)
  }, [images.length])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') showPreviousImage()
      if (event.key === 'ArrowRight') showNextImage()
    }

    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, showNextImage, showPreviousImage])

  const activeImage = images[activeIndex]
  if (!activeImage) return null

  const itemLabel = item.base_fabric_code || item.colors?.[0]?.fabric_code || item.name || 'قماش'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/90 p-2 backdrop-blur-sm sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        onClick={event => event.stopPropagation()}
        className="flex h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-2xl sm:h-[min(88vh,780px)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fabric-images-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 text-white">
          <div className="min-w-0">
            <h2 id="fabric-images-title" className="font-bold">صور القماش</h2>
            <p dir="ltr" className="truncate text-left font-mono text-xs text-slate-400">
              {itemLabel}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200">
              {activeIndex + 1} / {images.length}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label="إغلاق صور القماش"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className="relative min-h-0 flex-1 bg-black"
          onTouchStart={event => {
            touchStartX.current = event.targetTouches[0]?.clientX ?? null
          }}
          onTouchEnd={event => {
            if (touchStartX.current == null) return
            const touchEndX = event.changedTouches[0]?.clientX
            if (touchEndX == null) return
            const distance = touchStartX.current - touchEndX
            if (Math.abs(distance) >= 50) {
              if (distance > 0) showNextImage()
              else showPreviousImage()
            }
            touchStartX.current = null
          }}
        >
          <motion.div
            key={activeImage}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0"
          >
            <Image
              src={activeImage}
              alt={`${item.fabric_type || 'قماش'} - صورة ${activeIndex + 1}`}
              fill
              priority
              sizes="(max-width: 640px) 100vw, 1024px"
              className="object-contain p-2 sm:p-6"
            />
          </motion.div>

          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={showNextImage}
                className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg transition-colors hover:bg-black/75 sm:left-5"
                aria-label="الصورة التالية"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={showPreviousImage}
                className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-lg transition-colors hover:bg-black/75 sm:right-5"
                aria-label="الصورة السابقة"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}
        </div>

        {images.length > 1 ? (
          <div className="border-t border-white/10 bg-slate-900/95 p-2.5">
            <div className="flex gap-2 overflow-x-auto" dir="rtl">
              {images.map((image, index) => (
                <button
                  key={image}
                  type="button"
                  onClick={() => setActiveIndex(index)}
                  className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    activeIndex === index
                      ? 'border-teal-400 opacity-100'
                      : 'border-transparent opacity-55 hover:opacity-100'
                  }`}
                  aria-label={`عرض الصورة ${index + 1}`}
                  aria-current={activeIndex === index ? 'true' : undefined}
                >
                  <Image
                    src={image}
                    alt=""
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </motion.div>
    </motion.div>
  )
}

// ─── بطاقة الصنف ─────────────────────────────────────────────────────────────
interface InventoryCardProps {
  item: FabricInventoryItem
  onEdit: () => void
  onDelete: () => void
  onAddIn: () => void
  onAddOut: () => void
  onHistory: () => void
  onOpenImages: () => void
  onSavePrices: (purchasePricePerUnit: number, salePricePerUnit: number) => Promise<void>
}

function InventoryCard({
  item,
  onEdit,
  onDelete,
  onAddIn,
  onAddOut,
  onHistory,
  onOpenImages,
  onSavePrices,
}: InventoryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [purchasePrice, setPurchasePrice] = useState(item.cost_per_unit?.toString() ?? '')
  const [salePrice, setSalePrice] = useState(item.sale_price_per_unit?.toString() ?? '')
  const [savingPrices, setSavingPrices] = useState(false)
  const unitLabel = item.unit === 'meter' ? 'متر' : 'قطعة'
  const priceUnitLabel = item.unit === 'meter' ? 'للمتر' : 'للقطعة'
  const totalValue = item.cost_per_unit != null ? item.current_quantity * item.cost_per_unit : null
  const colors = item.colors ?? []
  const hasMissingPrices = item.cost_per_unit == null || item.sale_price_per_unit == null

  const handleSavePrices = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!purchasePrice.trim() || !salePrice.trim()) {
      alert('يرجى إدخال سعر الشراء وسعر البيع')
      return
    }

    const purchasePricePerUnit = Number(purchasePrice)
    const salePricePerUnit = Number(salePrice)
    if (
      !Number.isFinite(purchasePricePerUnit) ||
      !Number.isFinite(salePricePerUnit) ||
      purchasePricePerUnit < 0 ||
      salePricePerUnit < 0
    ) {
      alert('يرجى إدخال أسعار صحيحة تساوي صفراً أو أكثر')
      return
    }

    setSavingPrices(true)
    try {
      await onSavePrices(
        roundFabricNumber(purchasePricePerUnit),
        roundFabricNumber(salePricePerUnit)
      )
    } catch {
      alert('❌ تعذر حفظ أسعار القماش')
    } finally {
      setSavingPrices(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {item.images?.[0] ? (
              <button
                type="button"
                onClick={onOpenImages}
                className="group relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gray-100 ring-offset-2 transition hover:ring-2 hover:ring-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                aria-label={`فتح صور ${item.fabric_type || 'القماش'}`}
              >
                <Image
                  src={item.thumbnail_image || item.images[0]}
                  alt={item.fabric_type || 'قماش'}
                  fill
                  sizes="48px"
                  className="object-cover transition-transform duration-200 group-hover:scale-105"
                />
                {item.images.length > 1 ? (
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white">
                    {item.images.length}
                  </span>
                ) : null}
              </button>
            ) : (
              <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shrink-0">
                <Boxes className="w-6 h-6 text-white" />
              </div>
            )}
            <div className="min-w-0">
              <p dir="ltr" className="font-mono font-bold text-gray-900 truncate text-right">
                {item.base_fabric_code || item.colors?.[0]?.fabric_code || item.name}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                {item.fabric_type && (
                  <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                    {item.fabric_type}
                  </span>
                )}
                {item.fabric_types
                  ?.filter(type => type.trim().toLowerCase() !== item.fabric_type?.trim().toLowerCase())
                  .map(type => (
                    <span key={type} className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      {type}
                    </span>
                  ))}
                {colors.length > 0 && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Palette className="w-3 h-3" />
                    {colors.length} {colors.length === 1 ? 'لون' : 'ألوان'}
                  </span>
                )}
                {(!item.fabric_type || !item.images?.length) && (
                  <span className="text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    يحتاج نوعاً وصورة للربط
                  </span>
                )}
              </div>
              {/* شريط ألوان مصغر */}
              {colors.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {colors.map(c => (
                    <div
                      key={c.id}
                      title={`${c.color_name}: ${formatFabricNumber(c.current_quantity)} ${unitLabel}`}
                      className="w-4 h-4 rounded-full border border-gray-200 shrink-0 cursor-default"
                      style={{ backgroundColor: c.color_hex ?? '#e5e7eb' }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 mr-2">
            <div className="text-center">
              <p className="text-2xl font-bold text-gray-900">{formatFabricNumber(item.current_quantity)}</p>
              <p className="text-xs text-gray-400">{unitLabel}</p>
            </div>
            <div aria-hidden="true" className="h-9 w-px bg-gray-200" />
            <div className="min-w-[72px] text-center">
              <p dir="ltr" className="whitespace-nowrap text-base font-bold text-teal-700">
                {item.sale_price_per_unit != null
                  ? `${formatFabricNumber(item.sale_price_per_unit)} ر.س`
                  : '—'}
              </p>
              <p className="text-[11px] text-gray-400">سعر البيع / {unitLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(v => !v)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label={expanded ? 'إخفاء تفاصيل القماش' : 'عرض تفاصيل القماش'}
              aria-expanded={expanded}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* أزرار الحركة */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onAddIn}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors text-sm font-medium"
          >
            <ArrowDownCircle className="w-4 h-4" />
            إدخال
          </button>
          <button
            onClick={onAddOut}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition-colors text-sm font-medium"
          >
            <ArrowUpCircle className="w-4 h-4" />
            إخراج
          </button>
          <button
            onClick={onHistory}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-gray-50 text-gray-600 rounded-xl hover:bg-gray-100 transition-colors text-sm font-medium"
          >
            <History className="w-4 h-4" />
            السجل
          </button>
        </div>

        {hasMissingPrices ? (
          <form
            onSubmit={handleSavePrices}
            className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <div>
                <label
                  htmlFor={`purchase-price-${item.id}`}
                  className="block text-xs font-medium text-amber-900"
                >
                  سعر الشراء {priceUnitLabel}
                </label>
                <div className="relative mt-1">
                  <input
                    id={`purchase-price-${item.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={purchasePrice}
                    onChange={event => setPurchasePrice(event.target.value)}
                    disabled={savingPrices}
                    placeholder="0.00"
                    dir="ltr"
                    className="w-full rounded-lg border border-amber-200 bg-white py-2 pl-12 pr-3 text-left text-sm text-gray-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    ر.س
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`sale-price-${item.id}`}
                  className="block text-xs font-medium text-amber-900"
                >
                  سعر البيع {priceUnitLabel}
                </label>
                <div className="relative mt-1">
                  <input
                    id={`sale-price-${item.id}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={salePrice}
                    onChange={event => setSalePrice(event.target.value)}
                    disabled={savingPrices}
                    placeholder="0.00"
                    dir="ltr"
                    className="w-full rounded-lg border border-amber-200 bg-white py-2 pl-12 pr-3 text-left text-sm text-gray-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    ر.س
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPrices}
                className="flex h-[42px] items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {savingPrices ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </form>
        ) : null}
      </div>

      {/* التفاصيل الموسعة */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 border-t border-gray-100">
              {/* تفاصيل الألوان */}
              {colors.length > 0 && (
                <div className="mt-3 mb-3">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <Palette className="w-3.5 h-3.5" /> الألوان وكمياتها
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {colors.map(c => (
                      <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
                        <span
                          className="w-4 h-4 rounded-full border border-gray-200 shrink-0"
                          style={{ backgroundColor: c.color_hex ?? '#e5e7eb' }}
                        />
                        <span className="text-xs text-gray-700 truncate flex-1">{c.color_name}</span>
                        {c.fabric_code && (
                          <span dir="ltr" className="text-[10px] font-mono text-teal-700 shrink-0">{c.fabric_code}</span>
                        )}
                        <span className="text-xs font-bold text-gray-900 shrink-0">{formatFabricNumber(c.current_quantity)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {item.cost_per_unit != null && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs mb-1">سعر الشراء</p>
                    <p className="font-bold text-gray-800">{formatFabricNumber(item.cost_per_unit)} ر.س/{unitLabel}</p>
                  </div>
                )}
                {totalValue != null && (
                  <div className="bg-teal-50 rounded-xl p-3">
                    <p className="text-teal-600 text-xs mb-1">إجمالي القيمة</p>
                    <p className="font-bold text-teal-700">{formatFabricCurrency(totalValue)}</p>
                  </div>
                )}
                {item.supplier_name && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs mb-1">المورد</p>
                    <p className="font-bold text-gray-800">{item.supplier_name}</p>
                  </div>
                )}
                {item.notes && (
                  <div className="bg-gray-50 rounded-xl p-3 col-span-2">
                    <p className="text-gray-500 text-xs mb-1">ملاحظات</p>
                    <p className="text-gray-800">{item.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-colors text-sm"
                >
                  <Pencil className="w-4 h-4" />
                  تعديل
                </button>
                <button
                  onClick={onDelete}
                  className="flex items-center gap-1.5 px-3 py-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors text-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  حذف
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── الصفحة الرئيسية ──────────────────────────────────────────────────────────
function FabricsInventoryContent() {
  const [items, setItems] = useState<FabricInventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [typeCodes, setTypeCodes] = useState<FabricTypeCodeOption[]>([])
  const [colorOptions, setColorOptions] = useState<FabricColorOption[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')

  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState<FabricInventoryItem | null>(null)
  const [movementTarget, setMovementTarget] = useState<{
    item: FabricInventoryItem
    type: MovementType
  } | null>(null)
  const [historyTarget, setHistoryTarget] = useState<FabricInventoryItem | null>(null)
  const [galleryTarget, setGalleryTarget] = useState<FabricInventoryItem | null>(null)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [itemsData, suppliersData, typeCodeData, colorOptionData] = await Promise.all([
        getInventoryItems(),
        getSuppliers('fabrics'),
        getFabricTypeCodes().catch(() => []),
        getFabricColorOptions().catch(() => []),
      ])
      // تحميل الألوان لكل صنف
      const itemsWithColors = await Promise.all(
        itemsData.map(async (it) => {
          const colors = await getColors(it.id).catch(() => [])
          return { ...it, colors }
        })
      )
      setItems(itemsWithColors)
      setSuppliers(suppliersData)
      setTypeCodes(typeCodeData)
      setColorOptions(colorOptionData)
    } catch {
      alert('❌ خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  const handleItemSaved = (saved: FabricInventoryItem) => {
    if (editingItem) {
      setItems(prev => prev.map(it => it.id === saved.id ? saved : it))
    } else {
      setItems(prev => [saved, ...prev])
    }
    setShowItemModal(false)
    setEditingItem(null)
    getFabricTypeCodes().then(setTypeCodes).catch(() => {})
  }

  const handleSupplierCreated = (supplier: Supplier) => {
    setSuppliers(prev => [supplier, ...prev])
  }

  const handleColorOptionSaved = (option: FabricColorOption) => {
    setColorOptions(previous => {
      const normalizedName = option.color_name.trim().toLowerCase()
      if (previous.some(current => current.color_name.trim().toLowerCase() === normalizedName)) {
        return previous
      }
      return [...previous, option].sort((first, second) => (
        first.color_name.localeCompare(second.color_name, 'ar')
      ))
    })
  }

  const handleMovementSaved = (movement: FabricInventoryMovement) => {
    setItems(prev =>
      prev.map(it => {
        if (it.id !== movement.inventory_item_id) return it
        const delta = movement.movement_type === 'in' ? movement.quantity : -movement.quantity
        // تحديث كمية اللون إن وُجد
        const updatedColors = it.colors?.map(c => {
          if (c.id !== movement.color_id) return c
          return { ...c, current_quantity: c.current_quantity + delta }
        })
        return { ...it, current_quantity: it.current_quantity + delta, colors: updatedColors }
      })
    )
    setMovementTarget(null)
  }

  const handlePricesSaved = async (
    itemId: string,
    purchasePricePerUnit: number,
    salePricePerUnit: number
  ) => {
    const saved = await updateInventoryItem(itemId, {
      cost_per_unit: purchasePricePerUnit,
      purchase_price_mode: 'per_unit',
      purchase_total_price: null,
      purchase_total_quantity: null,
      sale_price_per_unit: salePricePerUnit,
    })

    if (saved.cost_per_unit == null || saved.sale_price_per_unit == null) {
      throw new Error('FABRIC_PRICES_NOT_SAVED')
    }

    setItems(previous => previous.map(current => (
      current.id === itemId
        ? { ...saved, colors: current.colors }
        : current
    )))
  }

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الصنف؟ سيتم حذف جميع حركاته وألوانه أيضاً.')) return
    try {
      await deleteInventoryItem(id)
      setItems(prev => prev.filter(it => it.id !== id))
    } catch {
      alert('❌ خطأ في الحذف')
    }
  }

  const fabricTypes = Array.from(new Set([
    ...typeCodes.map(option => option.fabric_type),
    ...items.flatMap(item =>
      item.fabric_types?.length
        ? item.fabric_types
        : item.fabric_type
          ? [item.fabric_type]
          : []
    )
  ]))

  const filtered = items.filter(it => {
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      it.name.toLowerCase().includes(q) ||
      (it.base_fabric_code?.toLowerCase().includes(q) ?? false) ||
      (it.fabric_types?.some(type => type.toLowerCase().includes(q)) ??
        (it.fabric_type?.toLowerCase().includes(q) ?? false)) ||
      (it.supplier_name?.toLowerCase().includes(q) ?? false) ||
      (it.colors?.some(c =>
        c.color_name.toLowerCase().includes(q) || c.fabric_code?.toLowerCase().includes(q)
      ) ?? false)
    const matchType = !typeFilter ||
      (it.fabric_types?.length ? it.fabric_types.includes(typeFilter) : it.fabric_type === typeFilter)
    return matchSearch && matchType
  })

  const totalItems = filtered.length
  const totalValue = filtered.reduce((sum, it) => {
    if (it.cost_per_unit != null) return sum + it.current_quantity * it.cost_per_unit
    return sum
  }, 0)

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir="rtl">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-4 mb-6">
            <Link href="/dashboard/accounting/fabrics" className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
              <ArrowLeft className="w-6 h-6 rotate-180" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl shadow-lg">
                <Boxes className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">المخزون</h1>
                <p className="text-gray-500">إدارة مخزون الأقمشة والألوان</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* إحصائيات */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-4 mb-6"
        >
          <div className="bg-gradient-to-br from-teal-500 to-teal-600 rounded-2xl p-5 text-white">
            <p className="text-teal-100 mb-1 text-sm">عدد الأصناف</p>
            <p className="text-4xl font-bold">{totalItems}</p>
          </div>
          <div className="bg-gradient-to-br from-slate-700 to-slate-800 rounded-2xl p-5 text-white">
            <p className="text-slate-300 mb-1 text-sm">إجمالي قيمة المخزون</p>
            <p className="text-2xl font-bold">
              {totalValue > 0
                ? formatFabricCurrency(totalValue)
                : '—'}
            </p>
          </div>
        </motion.div>

        {/* شريط الفلاتر */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 mb-6"
        >
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="بحث برقم القماش أو النوع أو اللون أو المورد..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pr-10 pl-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {fabricTypes.length > 0 && (
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 bg-white min-w-[160px]"
              >
                <option value="">كل الأنواع</option>
                {fabricTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}

            <button
              onClick={() => {
                setEditingItem(null)
                setShowItemModal(true)
              }}
              className="px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-colors flex items-center gap-2 font-medium"
            >
              <Plus className="w-5 h-5" />
              <span>إضافة صنف</span>
            </button>
          </div>
        </motion.div>

        {/* القائمة */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          {loading ? (
            <div className="text-center py-16 text-gray-400">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 text-lg font-medium">لا توجد أصناف في المخزون</p>
              <p className="text-gray-400 text-sm mt-1">أضف أول صنف بالضغط على زر &quot;إضافة صنف&quot;</p>
            </div>
          ) : (
            filtered.map(item => (
              <InventoryCard
                key={item.id}
                item={item}
                onEdit={() => {
                  setEditingItem(item)
                  setShowItemModal(true)
                }}
                onDelete={() => handleDelete(item.id)}
                onAddIn={() => setMovementTarget({ item, type: 'in' })}
                onAddOut={() => setMovementTarget({ item, type: 'out' })}
                onHistory={() => setHistoryTarget(item)}
                onOpenImages={() => setGalleryTarget(item)}
                onSavePrices={(purchasePricePerUnit, salePricePerUnit) => (
                  handlePricesSaved(item.id, purchasePricePerUnit, salePricePerUnit)
                )}
              />
            ))
          )}
        </motion.div>
      </div>

      {/* نوافذ */}
      <AnimatePresence>
        {showItemModal && (
          <ItemModal
            item={editingItem}
            suppliers={suppliers}
            typeCodes={typeCodes}
            classificationOptions={fabricTypes}
            colorOptions={colorOptions}
            onClose={() => {
              setShowItemModal(false)
              setEditingItem(null)
            }}
            onSave={handleItemSaved}
            onSupplierCreated={handleSupplierCreated}
            onColorOptionSaved={handleColorOptionSaved}
          />
        )}
        {movementTarget && (
          <MovementModal
            item={movementTarget.item}
            type={movementTarget.type}
            onClose={() => setMovementTarget(null)}
            onSave={handleMovementSaved}
          />
        )}
        {historyTarget && (
          <MovementsHistoryModal
            item={historyTarget}
            onClose={() => setHistoryTarget(null)}
          />
        )}
        {galleryTarget && (
          <FabricImagesModal
            key={galleryTarget.id}
            item={galleryTarget}
            onClose={() => setGalleryTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FabricsInventoryPage() {
  return (
    <ProtectedWorkerRoute requiredPermission="canAccessAccounting" allowAdmin={true}>
      <FabricsInventoryContent />
    </ProtectedWorkerRoute>
  )
}
