'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, ShoppingBag, Trash2, Plus, Minus, MessageCircle } from 'lucide-react'
import { useShopStore, formatPrice, generateWhatsAppMessage } from '@/store/shopStore'

export default function CartPage() {
  const { cart, removeFromCart, updateCartItemQuantity, getCartTotal, clearCart } = useShopStore()
  const [isOrdering, setIsOrdering] = useState(false)

  const handleQuantityChange = (productId: string, newQuantity: number) => {
    if (newQuantity < 1) {
      removeFromCart(productId)
    } else {
      updateCartItemQuantity(productId, newQuantity)
    }
  }

  const handleWhatsAppOrder = () => {
    if (cart.length === 0) return
    
    setIsOrdering(true)
    const message = generateWhatsAppMessage(cart)
    const phoneNumber = '+966598862609' // رقم واتساب ياسمين الشام
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`
    
    window.open(whatsappUrl, '_blank')
    
    setTimeout(() => {
      setIsOrdering(false)
    }, 2000)
  }

  const total = getCartTotal()

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 pt-4 lg:pt-6">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 lg:py-8">
        {/* التنقل */}
        <div className="flex justify-start items-start mt-0 mb-2" dir="rtl">
          <Link
            href="/"
            className="inline-flex items-center space-x-2 space-x-reverse text-pink-600 hover:text-pink-700 transition-colors duration-300"
            style={{marginTop: 0}}
          >
            <ArrowRight className="w-4 h-4 lg:w-5 lg:h-5" />
            <span className="text-sm lg:text-base">العودة للصفحة الرئيسية</span>
          </Link>
        </div>

        {/* العنوان */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800 mb-4">
            <span className="bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
              سلة المشتريات
            </span>
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            راجعي طلبك قبل إرساله عبر واتساب
          </p>
        </motion.div>

        {/* المحتوى */}
        {cart.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="text-center py-16"
          >
            <ShoppingBag className="w-24 h-24 text-gray-300 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-gray-600 mb-4">
              السلة فارغة
            </h3>
            <p className="text-gray-500 mb-8">
              ابدئي بإضافة الفساتين التي تريدين شراءها
            </p>
            <Link
              href="/designs"
              className="inline-flex items-center space-x-2 space-x-reverse bg-gradient-to-r from-pink-500 to-purple-600 text-white px-8 py-3 rounded-full hover:shadow-lg transition-all duration-300"
            >
              <span>تصفح الفساتين</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {/* عناصر السلة */}
            <div className="space-y-4 mb-8">
              {cart.map((item, index) => (
                <motion.div
                  key={`${item.id}-${item.selectedSize}-${item.selectedColor}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.1 }}
                  className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 border border-pink-100 shadow-lg"
                >
                  <div className="flex items-center gap-4">
                    {/* صورة المنتج */}
                    <div className="w-20 h-24 rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* تفاصيل المنتج */}
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-800 mb-1">
                        {item.name}
                      </h3>
                      
                      <div className="text-sm text-gray-600 mb-2">
                        {item.selectedSize && (
                          <span className="mr-4">المقاس: {item.selectedSize}</span>
                        )}
                        {item.selectedColor && (
                          <span>اللون: {item.selectedColor}</span>
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-lg font-bold text-pink-600">
                          {formatPrice(item.price)}
                        </span>

                        {/* أدوات التحكم في الكمية */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleQuantityChange(item.id, item.quantity - 1)}
                            className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-300"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          
                          <span className="w-8 text-center font-medium">
                            {item.quantity}
                          </span>
                          
                          <button
                            onClick={() => handleQuantityChange(item.id, item.quantity + 1)}
                            className="p-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors duration-300"
                          >
                            <Plus className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors duration-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* ملخص الطلب */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 border border-pink-100 shadow-lg"
            >
              <h3 className="text-xl font-bold text-gray-800 mb-4">
                ملخص الطلب
              </h3>
              
              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-gray-600">
                  <span>عدد القطع:</span>
                  <span>{cart.reduce((sum, item) => sum + item.quantity, 0)}</span>
                </div>
                <div className="flex justify-between text-xl font-bold text-pink-600 pt-2 border-t border-pink-100">
                  <span>الإجمالي:</span>
                  <span>{formatPrice(total)}</span>
                </div>
              </div>

              {/* أزرار الإجراءات */}
              <div className="flex gap-4">
                <button
                  onClick={handleWhatsAppOrder}
                  disabled={isOrdering}
                  className="flex-1 flex items-center justify-center space-x-2 space-x-reverse bg-gradient-to-r from-green-500 to-green-600 text-white py-3 px-6 rounded-full hover:shadow-lg transition-all duration-300 disabled:opacity-50"
                >
                  <MessageCircle className="w-5 h-5" />
                  <span className="font-medium">
                    {isOrdering ? 'جاري الإرسال...' : 'طلب عبر واتساب'}
                  </span>
                </button>
                
                <button
                  onClick={clearCart}
                  className="px-6 py-3 border border-red-300 text-red-600 rounded-full hover:bg-red-50 transition-colors duration-300"
                >
                  إفراغ السلة
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  )
}
