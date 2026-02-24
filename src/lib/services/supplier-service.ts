import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

const SUPPLIERS_STORAGE_KEY = 'yasmin_alsham_suppliers'
const SUPPLIER_CODE_PREFIX = 'SUP'

export interface Supplier {
  id: string
  name: string
  contact_info?: string
  notes?: string
  created_at: string
}

export interface CreateSupplierInput {
  name: string
  contact_info?: string
  notes?: string
}

export interface UpdateSupplierInput {
  name?: string
  contact_info?: string
  notes?: string
}

type SupplierRow = Record<string, unknown>

function getStoredSuppliers(): Supplier[] {
  if (typeof window === 'undefined') return []
  const stored = localStorage.getItem(SUPPLIERS_STORAGE_KEY)
  return stored ? (JSON.parse(stored) as Supplier[]) : []
}

function saveSuppliersToStorage(suppliers: Supplier[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(suppliers))
}

function clearStoredSuppliers(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(SUPPLIERS_STORAGE_KEY)
}

function sortByCreatedAtDesc(suppliers: Supplier[]): Supplier[] {
  return [...suppliers].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
}

function generateSupplierCode(): string {
  const timestampPart = Date.now().toString(36).toUpperCase()
  const randomPart = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `${SUPPLIER_CODE_PREFIX}${timestampPart}${randomPart}`.slice(0, 20)
}

function toSupplier(row: SupplierRow): Supplier {
  const id = typeof row.id === 'string' ? row.id : uuidv4()
  const name = typeof row.name === 'string' ? row.name : ''
  const contactInfo =
    typeof row.contact_info === 'string'
      ? row.contact_info
      : typeof row.phone === 'string'
        ? row.phone
        : ''
  const notes = typeof row.notes === 'string' ? row.notes : ''
  const createdAt =
    typeof row.created_at === 'string' ? row.created_at : new Date().toISOString()

  return {
    id,
    name,
    contact_info: contactInfo || undefined,
    notes: notes || undefined,
    created_at: createdAt
  }
}

async function migrateLegacyLocalSuppliersToSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return

  const localSuppliers = getStoredSuppliers()
  if (localSuppliers.length === 0) return

  try {
    const { data: existingRows, error: existingError } = await supabase
      .from('suppliers')
      .select('name')
      .eq('is_active', true)

    if (existingError) {
      return
    }

    const existingNames = new Set(
      (existingRows || [])
        .map((row) => (typeof row.name === 'string' ? row.name.trim().toLowerCase() : ''))
        .filter(Boolean)
    )

    const rowsToInsert = localSuppliers
      .filter((supplier) => !existingNames.has(supplier.name.trim().toLowerCase()))
      .map((supplier) => ({
        supplier_code: generateSupplierCode(),
        name: supplier.name,
        contact_info: supplier.contact_info || null,
        notes: supplier.notes || null,
        created_at: supplier.created_at,
        is_active: true
      }))

    if (rowsToInsert.length === 0) {
      clearStoredSuppliers()
      return
    }

    const { error: insertError } = await supabase.from('suppliers').insert(rowsToInsert)
    if (!insertError) {
      clearStoredSuppliers()
      return
    }

    if (insertError.code === '42703' && insertError.message?.includes('contact_info')) {
      const fallbackRows = rowsToInsert.map((row) => ({
        supplier_code: row.supplier_code,
        name: row.name,
        phone: row.contact_info,
        notes: row.notes,
        created_at: row.created_at,
        is_active: row.is_active
      }))

      const { error: fallbackInsertError } = await supabase.from('suppliers').insert(fallbackRows)
      if (!fallbackInsertError) {
        clearStoredSuppliers()
      }
    }
  } catch (error) {
    console.warn('Warning migrating local suppliers to Supabase:', error)
  }
}

export async function getSuppliers(): Promise<Supplier[]> {
  if (!isSupabaseConfigured()) {
    return sortByCreatedAtDesc(getStoredSuppliers())
  }

  await migrateLegacyLocalSuppliersToSupabase()

  try {
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (error) {
      // Table missing in environments where migration was not applied yet.
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('suppliers table does not exist. Falling back to local storage.')
        return sortByCreatedAtDesc(getStoredSuppliers())
      }

      console.error('Error loading suppliers:', error)
      return sortByCreatedAtDesc(getStoredSuppliers())
    }

    return (data || []).map((row) => toSupplier(row as SupplierRow))
  } catch (error) {
    console.error('Error loading suppliers:', error)
    return sortByCreatedAtDesc(getStoredSuppliers())
  }
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const trimmedName = input.name.trim()
  if (!trimmedName) {
    throw new Error('Supplier name is required')
  }

  if (!isSupabaseConfigured()) {
    const suppliers = getStoredSuppliers()
    const newSupplier: Supplier = {
      id: uuidv4(),
      name: trimmedName,
      contact_info: input.contact_info?.trim() || undefined,
      notes: input.notes?.trim() || undefined,
      created_at: new Date().toISOString()
    }

    suppliers.push(newSupplier)
    saveSuppliersToStorage(suppliers)
    return newSupplier
  }

  const payload = {
    supplier_code: generateSupplierCode(),
    name: trimmedName,
    contact_info: input.contact_info?.trim() || null,
    notes: input.notes?.trim() || null,
    is_active: true
  }

  const { data, error } = await supabase
    .from('suppliers')
    .insert(payload)
    .select('*')
    .single()

  if (error) {
    // Backward-compatibility for schemas without contact_info.
    if (error.code === '42703' && error.message?.includes('contact_info')) {
      const fallbackPayload = {
        supplier_code: payload.supplier_code,
        name: payload.name,
        phone: payload.contact_info,
        notes: payload.notes,
        is_active: true
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('suppliers')
        .insert(fallbackPayload)
        .select('*')
        .single()

      if (fallbackError) {
        throw new Error(fallbackError.message)
      }

      return toSupplier((fallbackData || {}) as SupplierRow)
    }

    throw new Error(error.message)
  }

  return toSupplier((data || {}) as SupplierRow)
}

export async function updateSupplier(id: string, input: UpdateSupplierInput): Promise<Supplier> {
  const payload: Record<string, string | null> = {}

  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.contact_info !== undefined) payload.contact_info = input.contact_info.trim() || null
  if (input.notes !== undefined) payload.notes = input.notes.trim() || null

  if (!isSupabaseConfigured()) {
    const suppliers = getStoredSuppliers()
    const index = suppliers.findIndex((supplier) => supplier.id === id)

    if (index === -1) {
      throw new Error('Supplier not found')
    }

    suppliers[index] = {
      ...suppliers[index],
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.contact_info !== undefined ? { contact_info: input.contact_info.trim() || undefined } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || undefined } : {})
    }

    saveSuppliersToStorage(suppliers)
    return suppliers[index]
  }

  const { data, error } = await supabase
    .from('suppliers')
    .update(payload)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    // Backward-compatibility for schemas without contact_info.
    if (error.code === '42703' && error.message?.includes('contact_info')) {
      const fallbackPayload: Record<string, string | null> = { ...payload }
      if (Object.prototype.hasOwnProperty.call(fallbackPayload, 'contact_info')) {
        fallbackPayload.phone = fallbackPayload.contact_info
        delete fallbackPayload.contact_info
      }

      const { data: fallbackData, error: fallbackError } = await supabase
        .from('suppliers')
        .update(fallbackPayload)
        .eq('id', id)
        .select('*')
        .single()

      if (fallbackError) {
        throw new Error(fallbackError.message)
      }

      return toSupplier((fallbackData || {}) as SupplierRow)
    }

    throw new Error(error.message)
  }

  return toSupplier((data || {}) as SupplierRow)
}

export async function deleteSupplier(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    const suppliers = getStoredSuppliers()
    saveSuppliersToStorage(suppliers.filter((supplier) => supplier.id !== id))
    return
  }

  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}
