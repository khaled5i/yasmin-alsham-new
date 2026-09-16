// ============================================================================
// خدمة المصروفات الشخصية (قسم التفصيل)
// ============================================================================

import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export type PersonalExpensePaymentMethod = 'cash' | 'network'

export interface PersonalExpense {
  id: string
  amount: number
  payment_method: PersonalExpensePaymentMethod
  description: string | null
  date: string
  created_at: string
}

export interface PersonalExpenseInput {
  amount: number
  payment_method: PersonalExpensePaymentMethod
  description?: string | null
  date: string
}

function normalizeInput(input: PersonalExpenseInput) {
  const description = input.description?.trim()
  return {
    amount: Number(input.amount),
    payment_method: input.payment_method,
    description: description ? description : null,
    date: input.date
  }
}

function normalizeRow(row: PersonalExpense): PersonalExpense {
  return { ...row, amount: Number(row.amount) }
}

export async function getPersonalExpenses(): Promise<PersonalExpense[]> {
  if (!isSupabaseConfigured()) return []

  const { data, error } = await supabase
    .from('personal_expenses')
    .select('id, amount, payment_method, description, date, created_at')
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map(normalizeRow)
}

export async function createPersonalExpense(input: PersonalExpenseInput): Promise<PersonalExpense> {
  const { data, error } = await supabase
    .from('personal_expenses')
    .insert(normalizeInput(input))
    .select('id, amount, payment_method, description, date, created_at')
    .single()

  if (error) throw error
  return normalizeRow(data)
}

export async function updatePersonalExpense(id: string, input: PersonalExpenseInput): Promise<void> {
  const { error } = await supabase
    .from('personal_expenses')
    .update({ ...normalizeInput(input), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw error
}

export async function deletePersonalExpense(id: string): Promise<void> {
  const { error } = await supabase.from('personal_expenses').delete().eq('id', id)
  if (error) throw error
}
