'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
  const restoredScrollY = useRef<number | null>(null)
  const initialQuery = useRef(queryKey)
  const previousQuery = useRef(queryKey)

  // Layout effects so the list's first painted frame is already at the card, not at the top.
  useLayoutEffect(() => {
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
    restoredScrollY.current = null
    finishFabricBrowseReturn()
    setIsRestoring(false)
    setRestoredCount(0)
    setPage(1)
  }, [queryKey])

  useLayoutEffect(() => {
    const position = pendingPosition.current
    if (!isReady || !position) return

    // The list kept in memory usually holds the card already, so restore from it
    // instead of showing the top of the list until the store's refresh arrives.
    const index = fabrics.findIndex(fabric => fabric.id === position.fabricId)
    if (index === -1 && (isLoading || fabrics.length === 0)) return

    // Refreshes can change sorting; render enough cards to include the same fabric.
    const requiredPage = Math.floor(index / FABRICS_PER_PAGE) + 1
    if (requiredPage > page) {
      setPage(requiredPage)
      setRestoredCount(requiredPage * FABRICS_PER_PAGE)
      return
    }

    // Re-anchor when the refreshed list lands, unless the visitor has scrolled since.
    if (restoredScrollY.current === null || Math.abs(window.scrollY - restoredScrollY.current) < 2) {
      const card = document.getElementById(`fabric-card-${position.fabricId}`)
      const top = card
        ? window.scrollY + card.getBoundingClientRect().top - position.offset
        : position.scrollY
      // Override the site's smooth scrolling.
      window.scrollTo({ top: Math.max(0, top), behavior: 'instant' })
      restoredScrollY.current = window.scrollY
    }
    if (isLoading) return

    // The site's return link creates a new visit; preserve that history entry too.
    saveFabricBrowsePosition({ ...position, page })
    pendingPosition.current = null
    restoredScrollY.current = null
    finishFabricBrowseReturn()
    setIsRestoring(false)
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
