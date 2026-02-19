import { v4 as uuidv4 } from 'uuid'

const SUPPLIERS_STORAGE_KEY = 'yasmin_alsham_suppliers'

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

// Helper to get suppliers from storage
const getStoredSuppliers = (): Supplier[] => {
    if (typeof window === 'undefined') return []
    const stored = localStorage.getItem(SUPPLIERS_STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
}

// Helper to save suppliers to storage
const saveSuppliersToStorage = (suppliers: Supplier[]) => {
    if (typeof window === 'undefined') return
    localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(suppliers))
}

export const getSuppliers = async (): Promise<Supplier[]> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500))
    return getStoredSuppliers().sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
}

export const createSupplier = async (input: CreateSupplierInput): Promise<Supplier> => {
    await new Promise(resolve => setTimeout(resolve, 500))

    const suppliers = getStoredSuppliers()

    const newSupplier: Supplier = {
        id: uuidv4(),
        ...input,
        created_at: new Date().toISOString()
    }

    suppliers.push(newSupplier)
    saveSuppliersToStorage(suppliers)

    return newSupplier
}

export const updateSupplier = async (id: string, input: UpdateSupplierInput): Promise<Supplier> => {
    await new Promise(resolve => setTimeout(resolve, 500))

    const suppliers = getStoredSuppliers()
    const index = suppliers.findIndex(s => s.id === id)

    if (index === -1) {
        throw new Error('Supplier not found')
    }

    suppliers[index] = {
        ...suppliers[index],
        ...input
    }

    saveSuppliersToStorage(suppliers)

    return suppliers[index]
}

export const deleteSupplier = async (id: string): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, 500))

    const suppliers = getStoredSuppliers()
    const filtered = suppliers.filter(s => s.id !== id)

    saveSuppliersToStorage(filtered)
}
