export interface FabricBrowsePosition {
  version: 1
  queryKey: string
  page: number
  fabricId: string
  offset: number
  scrollY: number
  isSingleColumn: boolean
  imageIndexes: Record<string, number>
}

const POSITION_KEY = 'yasmin-fabric-browse-v1'
const RETURN_KEY = 'yasmin-fabric-return-v1'
let lastPosition: FabricBrowsePosition | null = null
let pendingReturn: FabricBrowsePosition | null = null

function isPosition(value: unknown): value is FabricBrowsePosition {
  if (!value || typeof value !== 'object') return false
  const position = value as FabricBrowsePosition
  return position.version === 1
    && typeof position.queryKey === 'string'
    && Number.isSafeInteger(position.page) && position.page > 0
    && typeof position.fabricId === 'string'
    && Number.isFinite(position.offset)
    && Number.isFinite(position.scrollY) && position.scrollY >= 0
    && typeof position.isSingleColumn === 'boolean'
    && !!position.imageIndexes && typeof position.imageIndexes === 'object'
    && Object.values(position.imageIndexes).every(index => Number.isSafeInteger(index) && index >= 0)
}

function readSession(key: string): FabricBrowsePosition | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) || 'null')
    return isPosition(value) ? value : null
  } catch {
    return null
  }
}

function writeSession(key: string, position: FabricBrowsePosition) {
  try {
    sessionStorage.setItem(key, JSON.stringify(position))
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
}

export function saveFabricBrowsePosition(position: FabricBrowsePosition) {
  lastPosition = position
  writeSession(POSITION_KEY, position)
  // Keep Next.js's own history fields, and associate device Back with this visit.
  window.history.replaceState({ ...window.history.state, [POSITION_KEY]: position }, '')
}

export function requestFabricBrowseReturn(fabricId: string) {
  const position = lastPosition || readSession(POSITION_KEY)
  pendingReturn = position?.fabricId === fabricId ? position : null
  try { sessionStorage.removeItem(RETURN_KEY) } catch { /* Storage may be disabled. */ }
  if (pendingReturn) writeSession(RETURN_KEY, pendingReturn)
}

export function readFabricBrowsePosition(queryKey: string): FabricBrowsePosition | null {
  const historyPosition: unknown = window.history.state?.[POSITION_KEY]
  const position = isPosition(historyPosition)
    ? historyPosition
    : pendingReturn || readSession(RETURN_KEY)
  return position?.queryKey === queryKey ? position : null
}

export function finishFabricBrowseReturn() {
  pendingReturn = null
  try { sessionStorage.removeItem(RETURN_KEY) } catch { /* Storage may be disabled. */ }
}
