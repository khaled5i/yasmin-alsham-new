'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useShopStore } from '@/store/shopStore'
import Link from 'next/link'

export default function SearchBar() {
  const { products, filters, setFilters } = useShopStore()
  const [searchQuery, setSearchQuery] = useState(filters.searchQuery || '')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestions, setSuggestions] = useState<typeof products>([])
  const searchRef = useRef<HTMLDivElement>(null)

  // تحديث الاقتراحات عند تغيير البحث
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const query = searchQuery.toLowerCase()
      const filtered = products.filter(product => {
        const matchesName = product.name.toLowerCase().includes(query)
        const matchesDescription = product.description?.toLowerCase().includes(query)
        const matchesCategory = product.category?.toLowerCase().includes(query)
        return matchesName || matchesDescription || matchesCategory
      }).slice(0, 5) // أول 5 نتائج فقط
      
      setSuggestions(filtered)
      setShowSuggestions(filtered.length > 0)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [searchQuery, products])

  // إغلاق الاقتراحات عند النقر خارجها
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // تطبيق البحث
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setFilters({ searchQuery: query })
  }

  // مسح البحث
  const handleClear = () => {
    setSearchQuery('')
    setFilters({ searchQuery: '' })
    setShowSuggestions(false)
  }

  // تمييز النص المطابق
  const highlightMatch = (text: string, query: string) => {
    if (!query) return text
    
    const parts = text.split(new RegExp(`(${query})`, 'gi'))
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-pink-200 text-pink-900 font-semibold">
          {part}
        </mark>
      ) : (
        part
      )
    )
  }

  return (
    <div ref={searchRef} className="relative w-full" dir="rtl">
      {/* Search Input */}
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          onFocus={() => searchQuery && setShowSuggestions(true)}
          placeholder="ابحث عن فستان..."
          className="w-full px-4 py-3 pr-12 pl-12 border-2 border-pink-200 rounded-xl focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all duration-300 text-gray-800 placeholder-gray-400"
          aria-label="البحث عن المنتجات"
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          aria-expanded={showSuggestions && suggestions.length > 0}
          role="combobox"
        />
        
        {/* Search Icon */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-pink-600">
          <Search className="w-5 h-5" />
        </div>

        {/* Clear Button */}
        {searchQuery && (
          <button
            onClick={handleClear}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pink-600 transition-colors duration-200"
            aria-label="مسح البحث"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Autocomplete Suggestions */}
      <AnimatePresence>
        {showSuggestions && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 w-full bg-white border-2 border-pink-200 rounded-xl shadow-2xl overflow-hidden z-50"
            id="search-suggestions"
            role="listbox"
            aria-label="نتائج البحث المقترحة"
          >
            <div className="p-2">
              <div className="text-xs text-gray-500 px-3 py-2 font-medium" role="status" aria-live="polite">
                النتائج المقترحة ({suggestions.length})
              </div>
              
              {suggestions.map((product) => (
                <Link
                  key={product.id}
                  href={`/designs/${product.id}`}
                  onClick={() => {
                    setShowSuggestions(false)
                  }}
                  className="flex items-center gap-3 p-3 hover:bg-pink-50 rounded-lg transition-colors duration-200 group"
                >
                  {/* Product Image */}
                  <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-pink-100 to-purple-100 rounded-lg overflow-hidden">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                    />
                  </div>

                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-800 truncate">
                      {highlightMatch(product.name, searchQuery)}
                    </h4>
                    {product.category && (
                      <p className="text-xs text-gray-500 mt-1">
                        {product.category}
                      </p>
                    )}
                    <p className="text-sm font-bold text-pink-600 mt-1">
                      {product.price.toLocaleString('en')} ريال
                    </p>
                  </div>

                  {/* Arrow Icon */}
                  <div className="flex-shrink-0 text-pink-600 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>

            {/* View All Results */}
            {suggestions.length === 5 && (
              <div className="border-t border-pink-100 p-3 bg-pink-50">
                <button
                  onClick={() => {
                    setShowSuggestions(false)
                    // التمرير إلى النتائج
                    window.scrollTo({ top: 400, behavior: 'smooth' })
                  }}
                  className="w-full text-center text-sm font-medium text-pink-600 hover:text-pink-700 transition-colors duration-200"
                >
                  عرض جميع النتائج
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Results Message */}
      <AnimatePresence>
        {showSuggestions && searchQuery && suggestions.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="absolute top-full mt-2 w-full bg-white border-2 border-pink-200 rounded-xl shadow-2xl p-6 z-50"
          >
            <div className="text-center">
              <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Search className="w-8 h-8 text-pink-600" />
              </div>
              <h4 className="text-base font-semibold text-gray-800 mb-2">
                لا توجد نتائج
              </h4>
              <p className="text-sm text-gray-600">
                لم نجد أي منتجات تطابق بحثك "{searchQuery}"
              </p>
              <button
                onClick={handleClear}
                className="mt-4 px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors duration-200 text-sm font-medium"
              >
                مسح البحث
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

