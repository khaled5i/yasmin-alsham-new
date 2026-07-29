import {
  buildTailoringReceiptHtml,
  type TailoringReceiptPayload,
} from '@/lib/print-tailoring-receipt'

const STORAGE_KEY = 'yasmin-alsham:direct-printer:v2'
const PRINT_BRIDGE_ORIGIN = 'http://127.0.0.1:19281'
const PRINT_WIDTH_DOTS = 576
const PRINT_TIMEOUT_MS = 8_000
// يجب أن تكون مهلة المتصفح أطول من مهلة مهمة الجسر (20 ثانية) كي نستقبل
// نتيجة الجسر بدلاً من تصنيف انتهاء مهلة المتصفح خطأً كأن الجسر غير متاح.
const BRIDGE_TIMEOUT_MS = 30_000
const MAX_RECEIPT_HEIGHT_DOTS = 5_500
const BRIDGE_HEALTH_CACHE_MS = 60_000
const BRIDGE_HEALTH_RETRY_DELAYS_MS = [0, 200, 500] as const

export const DEFAULT_DIRECT_PRINTER_IP = '192.168.100.105'
export const PRINT_BRIDGE_APK_PATH = '/downloads/yasmin-print-bridge.apk'

export interface DirectPrinterConfig {
  enabled: boolean
  ipAddress: string
  model: 'TA POS TA-900UWB'
  lastTestedAt: string | null
}

export interface TailoringDirectPrintOptions {
  /**
   * يرسل نبضة ESC/POS إلى منفذ درج النقود في الطابعة.
   * يتحقق مسار الطباعة أيضاً من وجود مبلغ كاش فعلي في الإيصال قبل إرسالها.
   */
  openCashDrawer?: boolean
}

export type DirectPrinterErrorCode =
  | 'not-configured'
  | 'invalid-address'
  | 'unsupported-browser'
  | 'bridge-unavailable'
  | 'render-failed'
  | 'connection-failed'

export class DirectPrinterError extends Error {
  constructor(
    public readonly code: DirectPrinterErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'DirectPrinterError'
  }
}

const DEFAULT_CONFIG: DirectPrinterConfig = {
  enabled: false,
  ipAddress: DEFAULT_DIRECT_PRINTER_IP,
  model: 'TA POS TA-900UWB',
  lastTestedAt: null,
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function isPrivateIpv4(value: string): boolean {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false

  const octets = match.slice(1).map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) return false

  const [first, second] = octets
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

export function normalizePrinterIp(value: string): string {
  return value.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')
}

export function validatePrinterIp(value: string): string {
  const normalized = normalizePrinterIp(value)
  if (!isPrivateIpv4(normalized)) {
    throw new DirectPrinterError(
      'invalid-address',
      'أدخل عنوانًا محليًا صحيحًا للطابعة، مثل 192.168.100.105.'
    )
  }
  return normalized
}

export function getDirectPrinterConfig(): DirectPrinterConfig {
  if (!isBrowser()) return DEFAULT_CONFIG

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return DEFAULT_CONFIG

    const parsed = JSON.parse(stored) as Partial<DirectPrinterConfig>
    const ipAddress = validatePrinterIp(parsed.ipAddress || DEFAULT_DIRECT_PRINTER_IP)

    return {
      enabled: parsed.enabled === true,
      ipAddress,
      model: 'TA POS TA-900UWB',
      lastTestedAt: typeof parsed.lastTestedAt === 'string' ? parsed.lastTestedAt : null,
    }
  } catch {
    return DEFAULT_CONFIG
  }
}

export function saveDirectPrinterConfig(
  update: Partial<Pick<DirectPrinterConfig, 'enabled' | 'ipAddress' | 'lastTestedAt'>>
): DirectPrinterConfig {
  if (!isBrowser()) {
    throw new DirectPrinterError('unsupported-browser', 'إعداد الطابعة متاح من المتصفح فقط.')
  }

  const current = getDirectPrinterConfig()
  const next: DirectPrinterConfig = {
    ...current,
    ...update,
    ipAddress: validatePrinterIp(update.ipAddress ?? current.ipAddress),
    model: 'TA POS TA-900UWB',
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('direct-printer-config-changed', { detail: next }))
  return next
}

export function isDirectPrinterEnabled(): boolean {
  return getDirectPrinterConfig().enabled
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  let totalLength = 0
  for (const part of parts) totalLength += part.length

  const result = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    result.set(part, offset)
    offset += part.length
  }
  return result
}

function trimCanvasBottom(source: HTMLCanvasElement, bottomPadding = 36): HTMLCanvasElement {
  const context = source.getContext('2d', { willReadFrequently: true })
  if (!context) return source

  const { width, height } = source
  const image = context.getImageData(0, 0, width, height)
  let lastInkRow = -1

  for (let y = height - 1; y >= 0 && lastInkRow < 0; y -= 1) {
    const rowStart = y * width * 4
    for (let x = 0; x < width; x += 1) {
      const offset = rowStart + x * 4
      const alpha = image.data[offset + 3]
      const red = image.data[offset]
      const green = image.data[offset + 1]
      const blue = image.data[offset + 2]
      if (alpha > 16 && (red < 245 || green < 245 || blue < 245)) {
        lastInkRow = y
        break
      }
    }
  }

  if (lastInkRow < 0) return source
  const targetHeight = Math.min(height, lastInkRow + 1 + bottomPadding)
  if (targetHeight >= height) return source

  const trimmed = document.createElement('canvas')
  trimmed.width = width
  trimmed.height = targetHeight
  const trimmedContext = trimmed.getContext('2d')
  if (!trimmedContext) return source
  trimmedContext.fillStyle = '#ffffff'
  trimmedContext.fillRect(0, 0, width, targetHeight)
  trimmedContext.drawImage(source, 0, 0, width, targetHeight, 0, 0, width, targetHeight)
  return trimmed
}

async function renderReceiptCanvas(payload: TailoringReceiptPayload): Promise<HTMLCanvasElement> {
  if (!isBrowser()) {
    throw new DirectPrinterError('unsupported-browser', 'الطباعة المباشرة متاحة من المتصفح فقط.')
  }

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:80mm',
    'height:1200px',
    'border:0',
    'background:#fff',
    'pointer-events:none',
  ].join(';')

  try {
    const loaded = new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('انتهت مهلة تجهيز الإيصال.')),
        PRINT_TIMEOUT_MS
      )
      iframe.onload = () => {
        window.clearTimeout(timeout)
        resolve()
      }
      iframe.onerror = () => {
        window.clearTimeout(timeout)
        reject(new Error('تعذّر تجهيز إطار الإيصال.'))
      }
    })

    iframe.srcdoc = buildTailoringReceiptHtml(payload)
    document.body.appendChild(iframe)
    await loaded

    const frameDocument = iframe.contentDocument
    if (!frameDocument?.body) throw new Error('تعذّر الوصول إلى محتوى الإيصال.')

    if (frameDocument.fonts?.ready) await frameDocument.fonts.ready
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()))
    })

    const body = frameDocument.body
    const page = frameDocument.documentElement
    // Capture the complete 80mm page, not the centered 72mm body. Capturing
    // only the body scales away its safety margins and pushes RTL text into
    // the printer's non-printable right edge.
    const cssWidth = Math.max(1, Math.ceil(page.getBoundingClientRect().width))
    const cssHeight = Math.max(1, Math.ceil(Math.max(body.scrollHeight, page.scrollHeight)))
    iframe.style.height = `${cssHeight}px`

    const html2canvas = (await import('html2canvas')).default
    const rendered = await html2canvas(page, {
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: false,
      scale: PRINT_WIDTH_DOTS / cssWidth,
      width: cssWidth,
      height: cssHeight,
      windowWidth: Math.max(cssWidth, page.scrollWidth),
      windowHeight: cssHeight,
    })

    let canvas = rendered
    if (rendered.width !== PRINT_WIDTH_DOTS) {
      const resized = document.createElement('canvas')
      resized.width = PRINT_WIDTH_DOTS
      resized.height = Math.max(1, Math.round(rendered.height * (PRINT_WIDTH_DOTS / rendered.width)))
      const resizedContext = resized.getContext('2d')
      if (!resizedContext) throw new Error('تعذّر ضبط عرض الإيصال الحراري.')
      resizedContext.fillStyle = '#ffffff'
      resizedContext.fillRect(0, 0, resized.width, resized.height)
      resizedContext.imageSmoothingEnabled = true
      resizedContext.imageSmoothingQuality = 'high'
      resizedContext.drawImage(rendered, 0, 0, resized.width, resized.height)
      canvas = resized
    }

    canvas = trimCanvasBottom(canvas)
    if (canvas.height > MAX_RECEIPT_HEIGHT_DOTS) {
      throw new Error('الإيصال أطول من الحد الذي تدعمه الطباعة المباشرة.')
    }
    return canvas
  } catch (error) {
    if (error instanceof DirectPrinterError) throw error
    const detail = error instanceof Error && error.message
      ? ` السبب: ${error.message}`
      : ''
    throw new DirectPrinterError(
      'render-failed',
      `تعذّر تحويل الإيصال إلى صورة حرارية.${detail}`,
      { cause: error }
    )
  } finally {
    iframe.remove()
  }
}

function canvasToEscPosRaster(canvas: HTMLCanvasElement): Uint8Array {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    throw new DirectPrinterError('render-failed', 'تعذّر قراءة صورة الإيصال.')
  }

  const width = PRINT_WIDTH_DOTS
  const height = canvas.height
  const bytesPerRow = Math.ceil(width / 8)
  const raster = new Uint8Array(bytesPerRow * height)
  const pixels = context.getImageData(0, 0, width, height).data

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * bytesPerRow
    const pixelRowOffset = y * width * 4
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = pixelRowOffset + x * 4
      const alpha = pixels[pixelOffset + 3] / 255
      const red = pixels[pixelOffset]
      const green = pixels[pixelOffset + 1]
      const blue = pixels[pixelOffset + 2]
      const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) * alpha + 255 * (1 - alpha)
      if (luminance < 205) {
        raster[rowOffset + Math.floor(x / 8)] |= 0x80 >> (x % 8)
      }
    }
  }

  const header = new Uint8Array([
    0x1d,
    0x76,
    0x30,
    0x00,
    bytesPerRow & 0xff,
    (bytesPerRow >> 8) & 0xff,
    height & 0xff,
    (height >> 8) & 0xff,
  ])

  return concatBytes(header, raster)
}

function buildPrintJob(
  canvas: HTMLCanvasElement,
  options: TailoringDirectPrintOptions = {}
): Uint8Array {
  const initializeAndAlign = new Uint8Array([0x1b, 0x40, 0x1b, 0x61, 0x00])
  // ESC p m t1 t2 — نبضة على pin 2: تشغيل 50ms ثم انتظار 500ms.
  const cashDrawerKick = options.openCashDrawer
    ? new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa])
    : new Uint8Array()
  const raster = canvasToEscPosRaster(canvas)
  const feedAndCut = new Uint8Array([0x1b, 0x64, 0x04, 0x1d, 0x56, 0x00])
  return concatBytes(initializeAndAlign, cashDrawerKick, raster, feedAndCut)
}

interface PrintBridgeHealth {
  ok: boolean
  service: string
  version: string
  printerIp: string
  printerPort: number
}

let cachedBridgeHealth: { value: PrintBridgeHealth; expiresAt: number } | null = null

async function getLoopbackPermissionState(): Promise<PermissionState | null> {
  if (!isBrowser() || !window.navigator.permissions?.query) return null

  for (const name of ['loopback-network', 'local-network-access'] as const) {
    try {
      const status = await window.navigator.permissions.query(
        { name } as unknown as PermissionDescriptor
      )
      return status.state
    } catch {
      // Older Chrome versions do not expose these permission names.
    }
  }

  return null
}

async function fetchPrintBridgeHealth(): Promise<PrintBridgeHealth> {
  if (!isBrowser() || typeof window.fetch !== 'function') {
    throw new DirectPrinterError(
      'unsupported-browser',
      'هذا المتصفح لا يدعم الاتصال بجسر الطباعة.'
    )
  }

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), PRINT_TIMEOUT_MS)
  // The bridge is bound to 127.0.0.1, so Chrome 145+ requires the
  // loopback-network permission (separate from the LAN permission).
  const request: RequestInit & { targetAddressSpace?: 'loopback' } = {
    method: 'GET',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    signal: controller.signal,
    targetAddressSpace: 'loopback',
  }

  try {
    const response = await window.fetch(`${PRINT_BRIDGE_ORIGIN}/health`, request)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const health = await response.json() as PrintBridgeHealth
    if (!health.ok || health.service !== 'yasmin-print-bridge') {
      throw new Error('Unexpected print bridge response')
    }
    console.info('[direct-printer] bridge ready', {
      version: health.version,
      printerIp: health.printerIp,
      printerPort: health.printerPort,
    })
    return health
  } catch (error) {
    if (error instanceof DirectPrinterError) throw error
    const permissionState = await getLoopbackPermissionState()
    throw new DirectPrinterError(
      'bridge-unavailable',
      permissionState === 'denied'
        ? 'Chrome يمنع الوصول إلى جسر الطباعة. افتح إعدادات هذا الموقع، واسمح بالوصول إلى أجهزة الشبكة المحلية، ثم أعد المحاولة.'
        : 'جسر الطباعة غير متاح. افتح تطبيق «جسر طباعة ياسمين الشام» وشغّل الخدمة، ثم اسمح لـ Chrome بالوصول إلى أجهزة الشبكة المحلية.',
      { cause: error }
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

function waitForBridgeRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs))
}

async function ensurePrintBridgeHealth(force = false): Promise<PrintBridgeHealth> {
  if (!force && cachedBridgeHealth && cachedBridgeHealth.expiresAt > Date.now()) {
    return cachedBridgeHealth.value
  }

  let lastError: unknown
  for (const delayMs of BRIDGE_HEALTH_RETRY_DELAYS_MS) {
    if (delayMs > 0) await waitForBridgeRetry(delayMs)
    try {
      const health = await fetchPrintBridgeHealth()
      cachedBridgeHealth = {
        value: health,
        expiresAt: Date.now() + BRIDGE_HEALTH_CACHE_MS,
      }
      return health
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

async function postEscPosBytes(ipAddress: string, bytes: Uint8Array): Promise<void> {
  if (!isBrowser() || typeof window.fetch !== 'function') {
    throw new DirectPrinterError(
      'unsupported-browser',
      'هذا المتصفح لا يدعم الاتصال بجسر الطباعة.'
    )
  }
  if (!window.isSecureContext) {
    throw new DirectPrinterError(
      'unsupported-browser',
      'يجب فتح الموقع عبر HTTPS حتى يسمح Chrome بالوصول إلى جسر الطباعة.'
    )
  }

  const ip = validatePrinterIp(ipAddress)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS)
  const body = new Uint8Array(bytes).buffer
  const request: RequestInit & { targetAddressSpace?: 'loopback' } = {
    method: 'POST',
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Printer-IP': ip,
    },
    body,
    signal: controller.signal,
    targetAddressSpace: 'loopback',
  }

  try {
    console.info('[direct-printer] sending print job to Android bridge', {
      printerIp: ip,
      bytes: bytes.byteLength,
    })
    const response = await window.fetch(`${PRINT_BRIDGE_ORIGIN}/print`, request)
    if (!response.ok) {
      const result = await response.json().catch(() => null) as { error?: string } | null
      if (response.status === 502 || result?.error === 'printer_unreachable') {
        throw new DirectPrinterError(
          'connection-failed',
          `جسر الطباعة يعمل، لكن تعذّر الوصول إلى الطابعة ${ip}:9100.`
        )
      }
      throw new Error(`Print bridge returned HTTP ${response.status}`)
    }
    console.info('[direct-printer] Android bridge accepted print job', {
      printerIp: ip,
      bytes: bytes.byteLength,
    })
  } catch (error) {
    if (error instanceof DirectPrinterError) throw error
    console.error('[direct-printer] Android bridge request failed', error)
    const timedOut = error instanceof DOMException && error.name === 'AbortError'
    throw new DirectPrinterError(
      'bridge-unavailable',
      timedOut
        ? 'انتهت مهلة جسر الطباعة. افتح تطبيق الجسر وتأكد أن خدمته تعمل.'
        : 'تعذّر الوصول إلى جسر الطباعة. افتح تطبيق الجسر وشغّل الخدمة ثم اسمح لـChrome بالوصول المحلي.',
      { cause: error }
    )
  } finally {
    window.clearTimeout(timeout)
  }
}

async function postCanvasPrintJob(
  ipAddress: string,
  canvas: HTMLCanvasElement,
  options: TailoringDirectPrintOptions = {}
): Promise<void> {
  const bytes = buildPrintJob(canvas, options)
  console.info('[direct-printer] sending receipt raster', {
    bytes: bytes.byteLength,
    height: canvas.height,
  })
  await postEscPosBytes(ipAddress, bytes)
}

/** يبدأ فحص الجسر فور حدث المستخدم ويحفظ نجاحه لفترة قصيرة لمسار التسليم. */
export async function prepareDirectPrinterConnection(): Promise<void> {
  if (!isBrowser()) return
  const config = getDirectPrinterConfig()
  if (!config.enabled) return
  await ensurePrintBridgeHealth()
}

export async function testDirectPrinter(ipAddress: string): Promise<DirectPrinterConfig> {
  const ip = validatePrinterIp(ipAddress)
  if (!isBrowser()) {
    throw new DirectPrinterError('unsupported-browser', 'اختبار الطابعة متاح من المتصفح فقط.')
  }

  await ensurePrintBridgeHealth(true)
  if (document.fonts?.ready) await document.fonts.ready
  const testCanvas = await renderReceiptCanvas({
    order_id: 'printer-test',
    order_number: 'TEST',
    invoice_code: 'PRINTER-TEST',
    invoice_code_source: 'local',
    customer_name: 'اختبار الطابعة',
    item_description: 'اختبار طباعة إيصال التفصيل',
    total: 115,
    paid_amount: 115,
    cash_amount: 115,
    network_amount: 0,
    delivered_at: new Date().toISOString(),
  })
  await postCanvasPrintJob(ip, testCanvas, { openCashDrawer: true })

  return saveDirectPrinterConfig({
    enabled: true,
    ipAddress: ip,
    lastTestedAt: new Date().toISOString(),
  })
}

export async function printTailoringReceiptDirect(
  payload: TailoringReceiptPayload,
  options: TailoringDirectPrintOptions = {}
): Promise<void> {
  const config = getDirectPrinterConfig()
  if (!config.enabled) {
    throw new DirectPrinterError(
      'not-configured',
      'الطباعة المباشرة غير مفعّلة على هذا الجهاز.'
    )
  }

  await ensurePrintBridgeHealth()
  const canvas = await renderReceiptCanvas(payload)
  const openCashDrawer =
    options.openCashDrawer === true &&
    Math.max(0, Number(payload.cash_amount) || 0) >= 0.005
  await postCanvasPrintJob(config.ipAddress, canvas, { openCashDrawer })
}

/**
 * يرسل نبضة فتح الدرج فقط من دون طباعة إيصال أو تغذية ورق.
 * يُستخدم بعد نجاح حفظ عملية سحب الصندوق.
 */
export async function openCashDrawerDirect(): Promise<void> {
  const config = getDirectPrinterConfig()
  if (!config.enabled) {
    throw new DirectPrinterError(
      'not-configured',
      'الطباعة المباشرة غير مفعّلة على هذا الجهاز.'
    )
  }

  await ensurePrintBridgeHealth()
  const initializeAndKick = new Uint8Array([
    0x1b, 0x40,
    0x1b, 0x70, 0x00, 0x19, 0xfa,
  ])
  await postEscPosBytes(config.ipAddress, initializeAndKick)
}
