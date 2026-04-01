// ============================================================================
// خدمة مخزون الأقمشة
// ============================================================================

import { supabase } from '@/lib/supabase'

export type InventoryUnit = 'meter' | 'piece'
export type MovementType = 'in' | 'out'

export interface FabricInventoryItem {
  id: string
  name: string
  fabric_type: string | null
  unit: InventoryUnit
  current_quantity: number
  cost_per_unit: number | null
  supplier_id: string | null
  supplier_name: string | null
  notes: string | null
  created_at: string
  updated_at: string
  created_by: string | null
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
  name: string
  fabric_type?: string
  unit: InventoryUnit
  cost_per_unit?: number
  supplier_id?: string
  supplier_name?: string
  notes?: string
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
    .order('name', { ascending: true })

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

export async function createInventoryItem(
  input: CreateInventoryItemInput
): Promise<FabricInventoryItem> {
  const { data, error } = await supabase
    .from('fabric_inventory')
    .insert([{ ...input }])
    .select()
    .single()

  if (error) throw error
  return data
}

export async function addMovement(input: CreateMovementInput): Promise<FabricInventoryMovement> {
  const payload = {
    ...input,
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

// ---- تعديل ----

export async function updateInventoryItem(
  id: string,
  input: Partial<CreateInventoryItemInput>
): Promise<FabricInventoryItem> {
  const { data, error } = await supabase
    .from('fabric_inventory')
    .update({ ...input })
    .eq('id', id)
    .select()
    .single()

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
