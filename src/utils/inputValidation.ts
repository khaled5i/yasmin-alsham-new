/**
 * دوال التحقق من صحة الإدخال للحقول الرقمية
 */

// التحقق من أن النص يحتوي على أرقام فقط
export const isNumericOnly = (value: string): boolean => {
  return /^\d*\.?\d*$/.test(value)
}

// التحقق من أن النص يحتوي على أرقام صحيحة فقط (بدون فواصل عشرية)
export const isIntegerOnly = (value: string): boolean => {
  return /^\d*$/.test(value)
}

// التحقق من صحة رقم الهاتف (أرقام فقط مع إمكانية وجود + في البداية)
export const isValidPhoneNumber = (value: string): boolean => {
  return /^(\+)?\d*$/.test(value)
}

// تنظيف الإدخال من الأحرف غير الرقمية
export const cleanNumericInput = (value: string): string => {
  return value.replace(/[^\d.]/g, '')
}

// تنظيف الإدخال من الأحرف غير الرقمية (أرقام صحيحة فقط)
export const cleanIntegerInput = (value: string): string => {
  return value.replace(/[^\d]/g, '')
}

// تنظيف رقم الهاتف
export const cleanPhoneInput = (value: string): string => {
  // السماح بـ + في البداية فقط
  if (value.startsWith('+')) {
    return '+' + value.slice(1).replace(/[^\d]/g, '')
  }
  return value.replace(/[^\d]/g, '')
}

// التحقق من صحة المقاس (رقم موجب)
export const isValidMeasurement = (value: string): boolean => {
  const num = parseFloat(value)
  return !isNaN(num) && num > 0
}

// التحقق من صحة السعر (رقم موجب)
export const isValidPrice = (value: string): boolean => {
  const num = parseFloat(value)
  return !isNaN(num) && num > 0
}

// رسائل الخطأ
export const getValidationErrorMessage = (fieldType: string, language: 'ar' | 'en' = 'ar'): string => {
  const messages = {
    ar: {
      measurement: 'يرجى إدخال رقم صحيح للمقاس',
      price: 'يرجى إدخال سعر صحيح',
      phone: 'يرجى إدخال رقم هاتف صحيح',
      orderNumber: 'يرجى إدخال رقم طلب صحيح',
      numeric: 'يرجى إدخال أرقام فقط',
      positive: 'يرجى إدخال رقم أكبر من الصفر'
    },
    en: {
      measurement: 'Please enter a valid measurement',
      price: 'Please enter a valid price',
      phone: 'Please enter a valid phone number',
      orderNumber: 'Please enter a valid order number',
      numeric: 'Please enter numbers only',
      positive: 'Please enter a number greater than zero'
    }
  }
  
  return (messages[language] as any)[fieldType] || messages[language].numeric
}

// دالة للتعامل مع تغيير الإدخال في الحقول الرقمية
export const handleNumericInputChange = (
  value: string,
  fieldType: 'measurement' | 'price' | 'phone' | 'orderNumber' | 'integer' | 'decimal',
  onChange: (value: string) => void,
  onError?: (error: string | null) => void
) => {
  let cleanedValue = value
  let isValid = true
  let errorMessage: string | null = null

  switch (fieldType) {
    case 'measurement':
      cleanedValue = cleanNumericInput(value)
      isValid = isValidMeasurement(cleanedValue) || cleanedValue === ''
      if (!isValid && cleanedValue !== '') {
        errorMessage = getValidationErrorMessage('measurement')
      }
      break

    case 'price':
      cleanedValue = cleanNumericInput(value)
      isValid = isValidPrice(cleanedValue) || cleanedValue === ''
      if (!isValid && cleanedValue !== '') {
        errorMessage = getValidationErrorMessage('price')
      }
      break

    case 'phone':
      cleanedValue = cleanPhoneInput(value)
      isValid = isValidPhoneNumber(cleanedValue)
      if (!isValid) {
        errorMessage = getValidationErrorMessage('phone')
      }
      break

    case 'orderNumber':
      cleanedValue = cleanIntegerInput(value)
      isValid = isIntegerOnly(cleanedValue)
      if (!isValid) {
        errorMessage = getValidationErrorMessage('orderNumber')
      }
      break

    case 'integer':
      cleanedValue = cleanIntegerInput(value)
      isValid = isIntegerOnly(cleanedValue)
      if (!isValid) {
        errorMessage = getValidationErrorMessage('numeric')
      }
      break

    case 'decimal':
      cleanedValue = cleanNumericInput(value)
      isValid = isNumericOnly(cleanedValue)
      if (!isValid) {
        errorMessage = getValidationErrorMessage('numeric')
      }
      break
  }

  onChange(cleanedValue)
  if (onError) {
    onError(errorMessage)
  }
}
