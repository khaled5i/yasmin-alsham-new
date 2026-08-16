'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import FeaturedFabricStore from './FeaturedFabricStore'
import HomeFooter from './HomeFooter'
import HomeHeader from './HomeHeader'
import {
  BusinessGateway,
  CinematicHero,
  FabricTransition,
  TailoringStory,
  type HomeSectionKey,
} from './HomeSections'
import styles from './home.module.css'

function getSectionFromHash(): HomeSectionKey | null {
  if (typeof window === 'undefined') return null

  const hash = window.location.hash.slice(1)
  if (hash === 'tailoring-work') return 'tailoring'
  if (hash === 'fabric-collection') return 'fabrics'
  return hash === 'tailoring' || hash === 'fabrics' ? hash : null
}

export default function HomeExperience() {
  const [activeSection, setActiveSection] = useState<HomeSectionKey | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrollBehaviorRef = useRef<ScrollBehavior>('smooth')

  const scrollToActivePanel = useCallback(() => {
    window.requestAnimationFrame(() => {
      const hash = window.location.hash.slice(1)
      const scrollTarget = hash === 'tailoring-work' || hash === 'fabric-collection'
        ? document.getElementById(hash)
        : panelRef.current

      scrollTarget?.scrollIntoView({
        behavior: scrollBehaviorRef.current,
        block: 'start',
      })
      panelRef.current?.focus({ preventScroll: true })
    })
  }, [])

  const selectSection = useCallback((section: HomeSectionKey) => {
    scrollBehaviorRef.current = 'smooth'

    if (window.location.hash !== `#${section}`) {
      window.history.pushState(null, '', `#${section}`)
    }

    if (activeSection === section) {
      scrollToActivePanel()
      return
    }

    setActiveSection(section)
  }, [activeSection, scrollToActivePanel])

  const selectHome = useCallback(() => {
    if (window.location.hash) {
      window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`)
    }

    setActiveSection(null)
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }, [])

  useEffect(() => {
    const sectionFromHash = getSectionFromHash()
    if (sectionFromHash) {
      scrollBehaviorRef.current = 'auto'
      setActiveSection(sectionFromHash)
    }

    const handleHistoryNavigation = () => {
      const sectionFromHistory = getSectionFromHash()
      scrollBehaviorRef.current = 'auto'
      setActiveSection(sectionFromHistory)

      if (!sectionFromHistory) {
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }))
      }
    }

    window.addEventListener('popstate', handleHistoryNavigation)
    return () => window.removeEventListener('popstate', handleHistoryNavigation)
  }, [])

  useEffect(() => {
    if (activeSection) scrollToActivePanel()
  }, [activeSection, scrollToActivePanel])

  return (
    <>
      <HomeHeader
        activeSection={activeSection}
        onSelectHome={selectHome}
        onSelectSection={selectSection}
      />
      <main>
        {activeSection ? (
          <div
            ref={panelRef}
            id={activeSection}
            className={styles.experiencePanel}
            tabIndex={-1}
            data-section={activeSection}
          >
            {activeSection === 'tailoring' ? (
              <TailoringStory onSelectSection={selectSection} />
            ) : (
              <>
                <FabricTransition />
                <div id="fabric-collection" className={styles.fabricCollectionAnchor}>
                  <FeaturedFabricStore />
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <CinematicHero onSelectSection={selectSection} />
            <BusinessGateway onSelectSection={selectSection} />
          </>
        )}
      </main>
      {activeSection ? null : <HomeFooter onSelectSection={selectSection} />}
    </>
  )
}
