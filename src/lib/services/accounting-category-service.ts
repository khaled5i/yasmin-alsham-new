/**
 * Accounting Category Service
 * خدمة إدارة الفئات المحاسبية
 */

import { supabase } from '../supabase'
import type { BranchType } from '@/types/simple-accounting'

// ============================================================================
// Types
// ============================================================================

export type CategoryType = 'income' | 'purchase' | 'fixed_expense' | 'salary'

export interface AccountingCategory {
  id: string
  category_type: CategoryType
  branch: BranchType
  category_id: string
  label_ar: string
  label_en?: string | null
  description?: string | null
  display_order: number
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
  created_by?: string | null
}

export interface CreateCategoryInput {
  category_type: CategoryType
  branch: BranchType
  category_id: string
  label_ar: string
  label_en?: string
  description?: string
  display_order?: number
}

export interface UpdateCategoryInput {
  label_ar?: string
  label_en?: string
  description?: string
  display_order?: number
  is_active?: boolean
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * جلب جميع الفئات لفرع ونوع معين
 */
export async function getCategories(
  branch: BranchType,
  categoryType: CategoryType
): Promise<AccountingCategory[]> {
  try {
    const { data, error } = await supabase
      .from('accounting_categories')
      .select('*')
      .eq('branch', branch)
      .eq('category_type', categoryType)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching categories:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('Error in getCategories:', error)
    return []
  }
}

/**
 * جلب جميع الفئات لفرع معين (جميع الأنواع)
 */
export async function getAllCategoriesForBranch(
  branch: BranchType
): Promise<Record<CategoryType, AccountingCategory[]>> {
  try {
    const { data, error } = await supabase
      .from('accounting_categories')
      .select('*')
      .eq('branch', branch)
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching all categories:', error)
      return {
        income: [],
        purchase: [],
        fixed_expense: [],
        salary: []
      }
    }

    // تجميع الفئات حسب النوع
    const grouped: Record<CategoryType, AccountingCategory[]> = {
      income: [],
      purchase: [],
      fixed_expense: [],
      salary: []
    }

    data?.forEach(category => {
      grouped[category.category_type].push(category)
    })

    return grouped
  } catch (error) {
    console.error('Error in getAllCategoriesForBranch:', error)
    return {
      income: [],
      purchase: [],
      fixed_expense: [],
      salary: []
    }
  }
}

/**
 * إضافة فئة جديدة
 */
export async function createCategory(
  input: CreateCategoryInput
): Promise<{ success: boolean; data?: AccountingCategory; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('accounting_categories')
      .insert({
        ...input,
        is_default: false,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating category:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Error in createCategory:', error)
    return { success: false, error: error.message }
  }
}

/**
 * تحديث فئة موجودة
 */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput
): Promise<{ success: boolean; data?: AccountingCategory; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('accounting_categories')
      .update(input)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating category:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error: any) {
    console.error('Error in updateCategory:', error)
    return { success: false, error: error.message }
  }
}

/**
 * حذف فئة
 */
export async function deleteCategory(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('accounting_categories')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting category:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error in deleteCategory:', error)
    return { success: false, error: error.message }
  }
}

/**
 * تحويل الفئات إلى تنسيق القائمة المنسدلة
 */
export function categoriesToOptions(categories: AccountingCategory[]): Array<{ id: string; label: string }> {
  return categories.map(cat => ({
    id: cat.category_id,
    label: cat.label_ar
  }))
}

/**
 * الحصول على اسم الفئة من معرفها
 */
export function getCategoryLabel(categories: AccountingCategory[], categoryId: string): string {
  const category = categories.find(cat => cat.category_id === categoryId)
  return category?.label_ar || categoryId
}

