/**
 * Yasmin Al-Sham - Design Comments Type Definitions
 * تعريفات أنواع تعليقات التصميم
 */

import { ImageAnnotation, DrawingPath } from '@/components/InteractiveImageAnnotation'

/**
 * واجهة التعليق المحفوظ على التصميم
 * Saved Design Comment Interface
 */
export interface SavedDesignComment {
  id: string
  timestamp: number
  annotations: ImageAnnotation[]
  drawings: DrawingPath[]
  image: string | null // base64 image or null for default
  title?: string // عنوان اختياري للتعليق
  view?: 'front' | 'back' // جهة التعليق (أمام/خلف)
}

/**
 * واجهة بيانات تعليقات التصميم الكاملة
 * Complete Design Comments Data Interface
 */
export interface DesignCommentsData {
  // التعليقات المحفوظة
  saved_comments: SavedDesignComment[]
  
  // التعليق الحالي (غير المحفوظ بعد)
  current_annotations?: ImageAnnotation[]
  current_drawings?: DrawingPath[]
  current_image?: string | null
}

/**
 * إنشاء معرف فريد للتعليق
 * Generate unique ID for comment
 */
export function generateCommentId(): string {
  return `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * إنشاء تعليق جديد فارغ
 * Create new empty comment
 */
export function createEmptyComment(image?: string | null): SavedDesignComment {
  return {
    id: generateCommentId(),
    timestamp: Date.now(),
    annotations: [],
    drawings: [],
    image: image || null,
    title: undefined
  }
}

/**
 * تحويل البيانات القديمة إلى البنية الجديدة
 * Convert legacy data to new structure
 */
export function migrateLegacyDesignComments(measurements: any): DesignCommentsData {
  // إذا كانت البيانات بالفعل بالبنية الجديدة
  if (measurements?.design_comments?.saved_comments) {
    return measurements.design_comments as DesignCommentsData
  }
  
  // تحويل البيانات القديمة
  const hasLegacyData = 
    (measurements?.image_annotations && measurements.image_annotations.length > 0) ||
    (measurements?.image_drawings && measurements.image_drawings.length > 0) ||
    measurements?.custom_design_image

  if (hasLegacyData) {
    // إنشاء تعليق واحد من البيانات القديمة
    const legacyComment: SavedDesignComment = {
      id: generateCommentId(),
      timestamp: Date.now(),
      annotations: measurements.image_annotations || [],
      drawings: measurements.image_drawings || [],
      image: measurements.custom_design_image || null,
      title: 'تعليق سابق'
    }
    
    return {
      saved_comments: [legacyComment],
      current_annotations: [],
      current_drawings: [],
      current_image: null
    }
  }
  
  // لا توجد بيانات
  return {
    saved_comments: [],
    current_annotations: [],
    current_drawings: [],
    current_image: null
  }
}
