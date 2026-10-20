'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import styles from './home.module.css'

/**
 * زر «عرض المزيد» لـ«تسوقي حسب الخامة». ملف عميل مستقل لأن ShopByFabric مكوّن خادم
 * (نفس سبب ArrivalLink مع Turbopack). البلاطات كلها في الصفحة من الخادم، والزر يُظهر
 * المخفية منها فقط.
 */
export default function ShopByFabricExpander({ hiddenCount, children }: {
  hiddenCount: number
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={expanded ? undefined : styles.shopFabricCollapsed}>
      {children}
      {hiddenCount > 0 && !expanded && (
        <div className={styles.shopFabricMore}>
          <button type="button" onClick={() => setExpanded(true)}>
            عرض المزيد
            <ChevronDown aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  )
}
