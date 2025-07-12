'use client'

import { useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { handleNumericInputChange } from '@/utils/inputValidation'

interface NumericInputProps {
  value: string
  onChange: (value: string) => void
  type: 'measurement' | 'price' | 'phone' | 'orderNumber' | 'integer' | 'decimal'
  placeholder?: string
  className?: string
  disabled?: boolean
  required?: boolean
  label?: string
  id?: string
}

export default function NumericInput({
  value,
  onChange,
  type,
  placeholder,
  className = '',
  disabled = false,
  required = false,
  label,
  id
}: NumericInputProps) {
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value
    
    handleNumericInputChange(
      inputValue,
      type,
      onChange,
      setError
    )
  }

  const baseClassName = `w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-colors duration-200 ${
    error ? 'border-red-500 bg-red-50' : 'border-gray-300'
  } ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''} ${className}`

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 mr-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          className={baseClassName}
          disabled={disabled}
          required={required}
          inputMode={type === 'phone' ? 'tel' : 'numeric'}
          autoComplete={type === 'phone' ? 'tel' : 'off'}
        />
        
        {error && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
        )}
      </div>
      
      {error && (
        <p className="text-sm text-red-600 flex items-center space-x-1 space-x-reverse">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
