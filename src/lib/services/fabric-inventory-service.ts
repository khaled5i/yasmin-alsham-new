// ============================================================================
// خدمة مخزون الأقمشة
// ============================================================================

import { supabase } from '@/lib/supabase'
import { roundFabricNumber } from '@/lib/fabric-number-format'

export type InventoryUnit = 'meter' | 'piece'
export type MovementType = 'in' | 'out'

export interface FabricInventoryItem {
  id: string
  name: string
  fabric_type: string | null
  fabric_types: string[]
  unit: InventoryUnit
  current_quantity: number
  cost_per_unit: number | null
  purchase_price_mode: 'per_unit' | 'total' | null
  purchase_total_price: number | null
  purchase_total_quantity: number | null
  sale_price_per_unit: number | null
  supplier_id: string | null
  supplier_name: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  images?: string[]
  thumbnail_image: string | null
  type_code: string | null
  base_fabric_code: string | null
  has_color_variants: boolean
  // ألوان محملة بشكل منفصل
  colors?: FabricInventoryColor[]
}

export interface FabricInventoryColor {
  id: string
  inventory_item_id: string
  color_name: string
  color_hex: string | null
  current_quantity: number
  notes: string | null
  created_at: string
  created_by: string | null
  fabric_code: string | null
}

export interface FabricColorOption {
  color_name: string
  color_hex: string | null
}

export interface FabricInventoryMovement {
  id: string
  inventory_item_id: string
  movement_type: MovementType
  quantity: number
  cost_per_unit: number | null
  description: string | null
  purchase_expense_id: string | null
  color_id: string | null
  date: string
  created_at: string
  created_by: string | null
  // اسم اللون للعرض
  color_name?: string | null
}

export interface CreateInventoryItemInput {
  name?: string
  fabric_type?: string
  fabric_types?: string[]
  type_code?: string
  unit: InventoryUnit
  cost_per_unit?: number | null
  purchase_price_mode?: 'per_unit' | 'total' | null
  purchase_total_price?: number | null
  purchase_total_quantity?: number | null
  sale_price_per_unit?: number | null
  supplier_id?: string
  supplier_name?: string
  notes?: string
  images: string[]
  thumbnail_image?: string
  has_color_variants?: boolean
}

export interface CreateColorInput {
  inventory_item_id: string
  color_name: string
  color_hex?: string
  notes?: string
}

export interface CreateMovementInput {
  inventory_item_id: string
  movement_type: MovementType
  quantity: number
  cost_per_unit?: number
  description?: string
  purchase_expense_id?: string
  color_id?: string
  date?: string
}

// ---- قراءة ----

export async function getInventoryItems(): Promise<FabricInventoryItem[]> {
  const { data, error } = await supabase
    .from('fabric_inventory')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function getInventoryItemById(id: string): Promise<FabricInventoryItem | null> {
  const { data, error } = await supabase
    .from('fabric_inventory')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data
}

export async function getMovements(itemId: string): Promise<FabricInventoryMovement[]> {
  const { data, error } = await supabase
    .from('fabric_inventory_movements')
    .select('*, fabric_inventory_colors(color_name)')
    .eq('inventory_item_id', itemId)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error

  // تسوية البيانات
  return (data ?? []).map((mv) => ({
    ...mv,
    color_name: (mv.fabric_inventory_colors as { color_name: string } | null)?.color_name ?? null,
    fabric_inventory_colors: undefined
  })) as FabricInventoryMovement[]
}

// ---- ألوان المخزون ----

export async function getFabricColorOptions(): Promise<FabricColorOption[]> {
  const { data, error } = await supabase
    .from('fabric_color_options')
    .select('color_name, color_hex')
    .order('color_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function saveFabricColorOption(input: FabricColorOption): Promise<void> {
  const colorName = input.color_name.trim()
  if (!colorName) return

  const { error } = await supabase
    .from('fabric_color_options')
    .upsert([{
      color_name: colorName,
      color_hex: input.color_hex || null,
    }], {
      onConflict: 'normalized_name',
      ignoreDuplicates: true,
    })

  if (error) throw error
}

export async function getColors(itemId: string): Promise<FabricInventoryColor[]> {
  const { data, error } = await supabase
    .from('fabric_inventory_colors')
    .select('*')
    .eq('inventory_item_id', itemId)
    .order('color_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function createColor(input: CreateColorInput): Promise<FabricInventoryColor> {
  const { data, error } = await supabase
    .from('fabric_inventory_colors')
    .insert([input])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateColor(
  id: string,
  input: Partial<Omit<CreateColorInput, 'inventory_item_id'>>
): Promise<FabricInventoryColor> {
  const { data, error } = await supabase
    .from('fabric_inventory_colors')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteColor(id: string): Promise<void> {
  const { error } = await supabase.from('fabric_inventory_colors').delete().eq('id', id)
  if (error) throw error
}

// ---- إنشاء ----

// هل الخطأ ناتج عن عمود sale_price_per_unit غير موجود بعد (لم تُطبَّق الهجرة 66)؟
function isMissingSalePriceColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    (error.message?.includes('sale_price_per_unit') ?? false)
  )
}

export async function createInventoryItem(
  input: CreateInventoryItemInput
): Promise<FabricInventoryItem> {
  const normalizedInput = {
    ...input,
    cost_per_unit:
      input.cost_per_unit == null ? input.cost_per_unit : roundFabricNumber(input.cost_per_unit),
    purchase_total_price:
      input.purchase_total_price == null
        ? input.purchase_total_price
        : roundFabricNumber(input.purchase_total_price),
    purchase_total_quantity:
      input.purchase_total_quantity == null
        ? input.purchase_total_quantity
        : roundFabricNumber(input.purchase_total_quantity),
    sale_price_per_unit:
      input.sale_price_per_unit == null
        ? input.sale_price_per_unit
        : roundFabricNumber(input.sale_price_per_unit),
  }
  let { data, error } = await supabase
    .from('fabric_inventory')
    .insert([normalizedInput])
    .select()
    .single()

  // توافق تدريجي: إذا لم يُطبَّق عمود sale_price_per_unit بعد، أعد المحاولة بدونه
  if (error && isMissingSalePriceColumn(error)) {
    console.warn('⚠️ fabric_inventory.sale_price_per_unit column missing. Please run migrations/66-fabric-inventory-sale-price.sql')
    const withoutSale = { ...normalizedInput }
    delete withoutSale.sale_price_per_unit
    ;({ data, error } = await supabase
      .from('fabric_inventory')
      .insert([{ ...withoutSale }])
      .select()
      .single())
  }

  if (error) throw error
  return data
}

export interface FabricTypeCodeOption {
  id: string
  fabric_type: string
  type_code: string
  last_sequence: number
}

export async function getFabricTypeCodes(): Promise<FabricTypeCodeOption[]> {
  const { data, error } = await supabase
    .rpc('get_fabric_type_codes_with_actual_sequence')

  if (error) throw error
  return data ?? []
}

export async function addMovement(input: CreateMovementInput): Promise<FabricInventoryMovement> {
  const payload = {
    ...input,
    quantity: roundFabricNumber(input.quantity),
    cost_per_unit:
      input.cost_per_unit == null ? undefined : roundFabricNumber(input.cost_per_unit),
    date: input.date ?? new Date().toISOString().split('T')[0]
  }

  const { data, error } = await supabase
    .from('fabric_inventory_movements')
    .insert([payload])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function setFabricSerialNumber(input: {
  inventoryItemId: string
  sequenceNumber: number
  inventoryColorId?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('set_fabric_serial_number', {
    p_inventory_item_id: input.inventoryItemId,
    p_sequence_number: input.sequenceNumber,
    p_inventory_color_id: input.inventoryColorId ?? null,
  })

  if (error) throw error
  return data as string
}

// ---- تعديل ----

export async function updateInventoryItem(
  id: string,
  input: Partial<CreateInventoryItemInput>
): Promise<FabricInventoryItem> {
  const normalizedInput = {
    ...input,
    cost_per_unit:
      input.cost_per_unit == null ? input.cost_per_unit : roundFabricNumber(input.cost_per_unit),
    purchase_total_price:
      input.purchase_total_price == null
        ? input.purchase_total_price
        : roundFabricNumber(input.purchase_total_price),
    purchase_total_quantity:
      input.purchase_total_quantity == null
        ? input.purchase_total_quantity
        : roundFabricNumber(input.purchase_total_quantity),
    sale_price_per_unit:
      input.sale_price_per_unit == null
        ? input.sale_price_per_unit
        : roundFabricNumber(input.sale_price_per_unit),
  }
  let { data, error } = await supabase
    .from('fabric_inventory')
    .update(normalizedInput)
    .eq('id', id)
    .select()
    .single()

  // توافق تدريجي: إذا لم يُطبَّق عمود sale_price_per_unit بعد، أعد المحاولة بدونه
  if (error && isMissingSalePriceColumn(error)) {
    console.warn('⚠️ fabric_inventory.sale_price_per_unit column missing. Please run migrations/66-fabric-inventory-sale-price.sql')
    const withoutSale = { ...normalizedInput }
    delete withoutSale.sale_price_per_unit
    ;({ data, error } = await supabase
      .from('fabric_inventory')
      .update({ ...withoutSale })
      .eq('id', id)
      .select()
      .single())
  }

  if (error) throw error
  return data
}

// ---- حذف ----

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('fabric_inventory').delete().eq('id', id)
  if (error) throw error
}

export async function deleteMovement(id: string): Promise<void> {
  const { error } = await supabase.from('fabric_inventory_movements').delete().eq('id', id)
  if (error) throw error
}
