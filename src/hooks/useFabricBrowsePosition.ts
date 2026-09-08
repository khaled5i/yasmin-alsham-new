'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type FabricBrowsePosition,
  finishFabricBrowseReturn,
  readFabricBrowsePosition,
  saveFabricBrowsePosition,
} from '@/lib/fabric-browse-position'

export const FABRICS_PER_PAGE = 12

export function useFabricBrowsePosition(queryKey: string, fabrics: { id: string }[], isLoading: boolean) {
  const [page, setPage] = useState(1)
  const [isSingleColumn, setIsSingleColumn] = useState(false)
  const [currentImageIndexes, setCurrentImageIndexes] = useState<Record<string, number>>({})
  const [isReady, setIsReady] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [restoredCount, setRestoredCount] = useState(0)
  const pendingPosition = useRef<FabricBrowsePosition | null>(null)
  const initialQuery = useRef(queryKey)
  const previousQuery = useRef(queryKey)

  useEffect(() => {
    const position = readFabricBrowsePosition(initialQuery.current)
    pendingPosition.current = position
    if (position) {
      setPage(position.page)
      setIsSingleColumn(position.isSingleColumn)
      setCurrentImageIndexes(position.imageIndexes)
      setRestoredCount(position.page * FABRICS_PER_PAGE)
      setIsRestoring(true)
    } else {
      try { setIsSingleColumn(localStorage.getItem('yasmin-fabrics-view-mode') === 'single') } catch { /* Optional preference. */ }
    }
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (previousQuery.current === queryKey) return
    previousQuery.current = queryKey
    pendingPosition.current = null
    finishFabricBrowseReturn()
    setIsRestoring(false)
    setRestoredCount(0)
    setPage(1)
  }, [queryKey])

  useEffect(() => {
    const position = pendingPosition.current
    if (!isReady || !position || isLoading) return

    // Refreshes can change sorting; render enough cards to include the same fabric.
    const index = fabrics.findIndex(fabric => fabric.id === position.fabricId)
    const requiredPage = Math.floor(index / FABRICS_PER_PAGE) + 1
    if (requiredPage > page) {
      setPage(requiredPage)
      setRestoredCount(requiredPage * FABRICS_PER_PAGE)
      return
    }

    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const card = document.getElementById(`fabric-card-${position.fabricId}`)
        const top = card
          ? window.scrollY + card.getBoundingClientRect().top - position.offset
          : position.scrollY
        // Override the site's smooth scrolling and run after Next.js route scrolling.
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
        // The site's return link creates a new visit; preserve that history entry too.
        saveFabricBrowsePosition({ ...position, page })
        pendingPosition.current = null
        finishFabricBrowseReturn()
        setIsRestoring(false)
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [fabrics, isLoading, isReady, page])

  const rememberFabric = useCallback((fabricId: string) => {
    const card = document.getElementById(`fabric-card-${fabricId}`)
    saveFabricBrowsePosition({
      version: 1,
      queryKey,
      page,
      fabricId,
      offset: card?.getBoundingClientRect().top ?? 0,
      scrollY: window.scrollY,
      isSingleColumn,
      imageIndexes: currentImageIndexes,
    })
  }, [queryKey, page, isSingleColumn, currentImageIndexes])

  return {
    page, setPage, isSingleColumn, setIsSingleColumn,
    currentImageIndexes, setCurrentImageIndexes,
    isReady, isRestoring, restoredCount, rememberFabric,
  }
}
