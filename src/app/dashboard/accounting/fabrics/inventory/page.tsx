'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
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
  ChevronDown,
  ChevronUp,
  Package,
  Palette,
  Check,
  UserPlus
} from 'lucide-react'
import ProtectedWorkerRoute from '@/components/ProtectedWorkerRoute'
import {
  getInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  getMovements,
  addMovement,
  deleteMovement,
  getColors,
  createColor,
  deleteColor,
  type FabricInventoryItem,
  type FabricInventoryColor,
  type FabricInventoryMovement,
  type CreateInventoryItemInput,
  type InventoryUnit,
  type MovementType
} from '@/lib/services/fabric-inventory-service'
import { getSuppliers, createSupplier, type Supplier } from '@/lib/services/supplier-service'

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

// ─── مكون إدارة الألوان ─────────────────────────────────────────────────────
interface ColorManagerProps {
  colors: FabricInventoryColor[]
  onChange: (colors: FabricInventoryColor[]) => void
  isEditing?: boolean // عند التعديل نحفظ مباشرة
  itemId?: string
}

function ColorManager({ colors, onChange, isEditing, itemId }: ColorManagerProps) {
  const [colorName, setColorName] = useState('')
  const [colorHex, setColorHex] = useState('')
  const [saving, setSaving] = useState(false)

  const selectPreset = (preset: { name: string; hex: string }) => {
    setColorName(preset.name)
    setColorHex(preset.hex)
  }

  const addColor = async () => {
    if (!colorName.trim()) return
    // تحقق من عدم التكرار
    if (colors.some(c => c.color_name.toLowerCase() === colorName.trim().toLowerCase())) {
      alert('هذا اللون موجود مسبقاً')
      return
    }

    if (isEditing && itemId) {
      setSaving(true)
      try {
        const created = await createColor({
          inventory_item_id: itemId,
          color_name: colorName.trim(),
          color_hex: colorHex || undefined
        })
        onChange([...colors, created])
      } catch {
        alert('❌ خطأ في إضافة اللون')
      } finally {
        setSaving(false)
      }
    } else {
      // عند الإضافة الجديدة، نخزن مؤقتاً
      const temp: FabricInventoryColor = {
        id: `temp-${Date.now()}`,
        inventory_item_id: '',
        color_name: colorName.trim(),
        color_hex: colorHex || null,
        current_quantity: 0,
        notes: null,
        created_at: new Date().toISOString(),
        created_by: null
      }
      onChange([...colors, temp])
    }
    setColorName('')
    setColorHex('')
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
              {isEditing && c.current_quantity > 0 && (
                <span className="text-xs text-teal-600 font-medium">({c.current_quantity})</span>
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

      {/* ألوان سريعة */}
      <div className="grid grid-cols-8 gap-1.5">
        {PRESET_COLORS.map(p => (
          <button
            type="button"
            key={p.hex}
            onClick={() => selectPreset(p)}
            title={p.name}
            className={`w-8 h-8 rounded-lg border-2 transition-all ${
              colorHex === p.hex ? 'border-teal-500 scale-110' : 'border-transparent hover:border-gray-300'
            }`}
            style={{ backgroundColor: p.hex }}
          >
            {colorHex === p.hex && p.hex !== '#FFFFFF' && (
              <Check className="w-4 h-4 text-white mx-auto" />
            )}
          </button>
        ))}
      </div>

      {/* إدخال اللون */}
      <div className="flex gap-2">
        <input
          type="text"
          value={colorName}
          onChange={e => setColorName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addColor())}
          placeholder="اسم اللون..."
          className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 focus:border-transparent"
        />
        <input
          type="color"
          value={colorHex || '#000000'}
          onChange={e => setColorHex(e.target.value)}
          className="w-10 h-10 rounded-xl border border-gray-200 cursor-pointer p-0.5"
          title="اختر لون"
        />
        <button
          type="button"
          onClick={addColor}
          disabled={!colorName.trim() || saving}
          className="px-3 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-40 transition-colors text-sm font-medium"
        >
          {saving ? '...' : 'إضافة'}
        </button>
      </div>
    </div>
  )
}

// ─── نافذة إضافة/تعديل صنف ───────────────────────────────────────────────────
interface ItemModalProps {
  item: FabricInventoryItem | null
  suppliers: Supplier[]
  onClose: () => void
  onSave: (item: FabricInventoryItem) => void
  onSupplierCreated: (supplier: Supplier) => void
}

function ItemModal({ item, suppliers, onClose, onSave, onSupplierCreated }: ItemModalProps) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<CreateInventoryItemInput>({
    name: item?.name ?? '',
    fabric_type: item?.fabric_type ?? '',
    unit: item?.unit ?? 'meter',
    cost_per_unit: item?.cost_per_unit ?? undefined,
    supplier_id: item?.supplier_id ?? undefined,
    supplier_name: item?.supplier_name ?? undefined,
    notes: item?.notes ?? ''
  })
  const [initialQty, setInitialQty] = useState('')
  const [colors, setColors] = useState<FabricInventoryColor[]>(item?.colors ?? [])
  const [loadingColors, setLoadingColors] = useState(!!item)

  // حالة المورد
  const [supplierMode, setSupplierMode] = useState<'select' | 'new'>(
    item?.supplier_id ? 'select' : 'select'
  )
  const [newSupplierName, setNewSupplierName] = useState('')
  const [newSupplierPhone, setNewSupplierPhone] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)

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
    if (!form.name) return
    setSaving(true)
    try {
      const payload: CreateInventoryItemInput = {
        ...form,
        supplier_id: form.supplier_id || undefined,
        supplier_name: form.supplier_name || undefined,
        fabric_type: form.fabric_type || undefined,
        notes: form.notes || undefined
      }
      let result: FabricInventoryItem
      if (item) {
        result = await updateInventoryItem(item.id, payload)
        result = { ...result, colors }
      } else {
        result = await createInventoryItem(payload)
        // حفظ الألوان المؤقتة
        const savedColors: FabricInventoryColor[] = []
        for (const c of colors) {
          const sc = await createColor({
            inventory_item_id: result.id,
            color_name: c.color_name,
            color_hex: c.color_hex ?? undefined
          })
          savedColors.push(sc)
        }
        // إضافة الكمية الابتدائية إن وُجدت
        const qty = parseFloat(initialQty)
        if (qty > 0) {
          await addMovement({
            inventory_item_id: result.id,
            movement_type: 'in',
            quantity: qty,
            cost_per_unit: payload.cost_per_unit,
            description: 'رصيد ابتدائي',
            date: new Date().toISOString().split('T')[0]
          })
          result = { ...result, current_quantity: qty, colors: savedColors }
        } else {
          result = { ...result, colors: savedColors }
        }
      }
      onSave(result)
    } catch {
      alert('❌ حدث خطأ أثناء الحفظ')
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">اسم القماش *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="مثال: ساتان سادة"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">النوع</label>
            <input
              type="text"
              value={form.fabric_type ?? ''}
              onChange={e => setForm({ ...form, fabric_type: e.target.value })}
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              placeholder="مثال: شيفون، ساتان، قطن..."
            />
          </div>

          {/* قسم الألوان */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Palette className="w-4 h-4 text-teal-600" />
              الألوان المتاحة
              {colors.length > 0 && (
                <span className="bg-teal-100 text-teal-700 text-xs px-2 py-0.5 rounded-full font-bold">
                  {colors.length}
                </span>
              )}
            </label>
            {loadingColors ? (
              <div className="text-sm text-gray-400 py-2">جاري التحميل...</div>
            ) : (
              <ColorManager
                colors={colors}
                onChange={setColors}
                isEditing={!!item}
                itemId={item?.id}
              />
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              سعر الشراء للوحدة (ر.س) — اختياري
            </label>
            <input
              type="number"
              value={form.cost_per_unit ?? ''}
              onChange={e =>
                setForm({ ...form, cost_per_unit: e.target.value ? parseFloat(e.target.value) : undefined })
              }
              className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              min="0"
              step="0.01"
              placeholder="0.00"
            />
          </div>

          {!item && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                الكمية الابتدائية — اختياري
              </label>
              <input
                type="number"
                value={initialQty}
                onChange={e => setInitialQty(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                min="0"
                step="0.01"
                placeholder="0 — اتركه فارغاً إن لم يكن لديك رصيد حالي"
              />
              <p className="text-xs text-gray-400 mt-1">يُسجَّل كـ &quot;رصيد ابتدائي&quot; في حركات المخزون</p>
            </div>
          )}

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
    getColors(item.id)
      .then(setColors)
      .catch(() => {})
      .finally(() => setLoadingColors(false))
  }, [item.id])

  // الرصيد الحالي (إجمالي أو للون المحدد)
  const currentQty = selectedColorId
    ? (colors.find(c => c.id === selectedColorId)?.current_quantity ?? 0)
    : item.current_quantity

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const qty = parseFloat(quantity)
    if (!qty || qty <= 0) return

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
        cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : undefined,
        description: description || undefined,
        color_id: selectedColorId || undefined,
        date
      })
      onSave(result)
    } catch {
      alert('❌ حدث خطأ أثناء الحفظ')
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
                اللون (اختياري)
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedColorId('')}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                    !selectedColorId
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'border-gray-200 text-gray-600 hover:border-teal-400'
                  }`}
                >
                  كل الألوان
                </button>
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
                    <span className="text-xs opacity-75">({c.current_quantity})</span>
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
            disabled={saving}
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
    new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' })

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
                        {mv.movement_type === 'in' ? '+' : '-'}{mv.quantity} {unitLabel}
                        {mv.cost_per_unit ? <span className="text-gray-500 mr-2 text-xs">({mv.cost_per_unit} ر.س/{unitLabel})</span> : null}
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

// ─── بطاقة الصنف ─────────────────────────────────────────────────────────────
interface InventoryCardProps {
  item: FabricInventoryItem
  onEdit: () => void
  onDelete: () => void
  onAddIn: () => void
  onAddOut: () => void
  onHistory: () => void
}

function InventoryCard({ item, onEdit, onDelete, onAddIn, onAddOut, onHistory }: InventoryCardProps) {
  const [expanded, setExpanded] = useState(false)
  const unitLabel = item.unit === 'meter' ? 'متر' : 'قطعة'
  const totalValue = item.cost_per_unit != null ? item.current_quantity * item.cost_per_unit : null
  const colors = item.colors ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center shrink-0">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{item.name}</p>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                {item.fabric_type && (
                  <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                    {item.fabric_type}
                  </span>
                )}
                {colors.length > 0 && (
                  <span className="text-xs text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Palette className="w-3 h-3" />
                    {colors.length} {colors.length === 1 ? 'لون' : 'ألوان'}
                  </span>
                )}
              </div>
              {/* شريط ألوان مصغر */}
              {colors.length > 0 && (
                <div className="flex gap-1 mt-1.5">
                  {colors.map(c => (
                    <div
                      key={c.id}
                      title={`${c.color_name}: ${c.current_quantity} ${unitLabel}`}
                      className="w-4 h-4 rounded-full border border-gray-200 shrink-0 cursor-default"
                      style={{ backgroundColor: c.color_hex ?? '#e5e7eb' }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 mr-2">
            <div className="text-left">
              <p className="text-2xl font-bold text-gray-900">{item.current_quantity}</p>
              <p className="text-xs text-gray-400">{unitLabel}</p>
            </div>
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
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
                        <span className="text-xs font-bold text-gray-900 shrink-0">{c.current_quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {item.cost_per_unit != null && (
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-gray-500 text-xs mb-1">سعر الشراء</p>
                    <p className="font-bold text-gray-800">{item.cost_per_unit} ر.س/{unitLabel}</p>
                  </div>
                )}
                {totalValue != null && (
                  <div className="bg-teal-50 rounded-xl p-3">
                    <p className="text-teal-600 text-xs mb-1">إجمالي القيمة</p>
                    <p className="font-bold text-teal-700">{totalValue.toFixed(2)} ر.س</p>
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

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [itemsData, suppliersData] = await Promise.all([
        getInventoryItems(),
        getSuppliers('fabrics')
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
  }

  const handleSupplierCreated = (supplier: Supplier) => {
    setSuppliers(prev => [supplier, ...prev])
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

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الصنف؟ سيتم حذف جميع حركاته وألوانه أيضاً.')) return
    try {
      await deleteInventoryItem(id)
      setItems(prev => prev.filter(it => it.id !== id))
    } catch {
      alert('❌ خطأ في الحذف')
    }
  }

  const fabricTypes = Array.from(
    new Set(items.map(it => it.fabric_type).filter(Boolean) as string[])
  )

  const filtered = items.filter(it => {
    const q = searchQuery.toLowerCase()
    const matchSearch =
      !q ||
      it.name.toLowerCase().includes(q) ||
      (it.fabric_type?.toLowerCase().includes(q) ?? false) ||
      (it.supplier_name?.toLowerCase().includes(q) ?? false) ||
      (it.colors?.some(c => c.color_name.toLowerCase().includes(q)) ?? false)
    const matchType = !typeFilter || it.fabric_type === typeFilter
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
                ? new Intl.NumberFormat('ar-SA').format(totalValue) + ' ر.س'
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
                placeholder="بحث بالاسم أو النوع أو اللون أو المورد..."
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
            onClose={() => {
              setShowItemModal(false)
              setEditingItem(null)
            }}
            onSave={handleItemSaved}
            onSupplierCreated={handleSupplierCreated}
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
