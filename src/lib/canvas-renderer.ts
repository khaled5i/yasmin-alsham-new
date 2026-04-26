/**
 * Shared canvas drawing renderer utility
 * Replicates the exact rendering logic from InteractiveImageAnnotation's generateCompositeImage
 * Used by OrderModal and PrintOrderModal for consistent drawing display
 */

import type { DrawingPath, BrushType } from '@/components/InteractiveImageAnnotation'

// تحديد ما إذا كان اللون فاتحاً (لاختيار خلفية معاكسة)
function isLightHex(hex: string): boolean {
  if (!hex || hex[0] !== '#') return false
  const value = hex.length === 4
    ? hex.slice(1).split('').map(c => c + c).join('')
    : hex.slice(1)
  if (value.length !== 6) return false
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170
}

/**
 * Renders drawing paths on a canvas with proper eraser support,
 * brush type styles, and dynamic coordinate mapping.
 *
 * @param ctx - The 2D canvas rendering context
 * @param drawings - Array of DrawingPath objects to render
 * @param canvasWidth - The logical width of the canvas
 * @param canvasHeight - The logical height of the canvas
 * @param baseImage - Optional HTMLImageElement used to detect flattened export mode.
 * @param imageRect - Optional dimensions/offset of the base image within the canvas (for object-contain layout)
 */
export function renderDrawingsOnCanvas(
  ctx: CanvasRenderingContext2D,
  drawings: DrawingPath[],
  canvasWidth: number,
  canvasHeight: number,
  baseImage?: HTMLImageElement | null,
  imageRect?: { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number }
) {
  // Kept for API compatibility with existing call sites.
  void imageRect
  const ownerDocument = (ctx.canvas as HTMLCanvasElement).ownerDocument

  const drawPathGeometryOnContext = (
    targetCtx: CanvasRenderingContext2D,
    path: DrawingPath
  ) => {
    const firstPoint = path.points[0]
    targetCtx.moveTo((firstPoint.x / 100) * canvasWidth, (firstPoint.y / 100) * canvasHeight)
    for (let i = 1; i < path.points.length; i++) {
      const point = path.points[i]
      targetCtx.lineTo((point.x / 100) * canvasWidth, (point.y / 100) * canvasHeight)
    }
  }

  const applyBrushStyle = (
    targetCtx: CanvasRenderingContext2D,
    pathBrushType: BrushType,
    pathColor: string,
    pathIsEraser: boolean = false,
    baseWidth: number = targetCtx.lineWidth
  ) => {
    targetCtx.setLineDash([])
    targetCtx.lineDashOffset = 0
    targetCtx.shadowBlur = 0
    targetCtx.shadowColor = 'transparent'
    targetCtx.globalAlpha = 1
    targetCtx.strokeStyle = pathColor
    targetCtx.lineWidth = baseWidth
    targetCtx.lineCap = 'round'
    targetCtx.lineJoin = 'round'

    if (pathIsEraser) {
      targetCtx.setLineDash([])
      return
    }

    switch (pathBrushType) {
      case 'dashed':
        targetCtx.setLineDash([14, 10])
        break
      case 'dotted':
        targetCtx.lineCap = 'round'
        targetCtx.setLineDash([1, Math.max(6, baseWidth * 2.2)])
        break
      case 'soft':
        targetCtx.shadowBlur = 8
        targetCtx.shadowColor = pathColor
        break
      case 'pencil':
        targetCtx.globalAlpha = 0.85
        break
      case 'highlighter':
        targetCtx.globalAlpha = 0.35
        targetCtx.lineCap = 'square'
        break
      default:
        break
    }
  }

  const drawStyledPath = (targetCtx: CanvasRenderingContext2D, path: DrawingPath) => {
    if (path.points.length < 2) return

    const brushType: BrushType = path.brushType || 'normal'
    const isPatternBrush = brushType === 'dashed' || brushType === 'dotted'
    const isHighlighterBrush = brushType === 'highlighter'
    const usesUniformWidth = isPatternBrush || isHighlighterBrush
    const widthMultiplier = isHighlighterBrush ? 2.6 : brushType === 'pencil' ? 0.5 : 1
    const baseWidth = path.strokeWidth

    applyBrushStyle(targetCtx, brushType, path.color, false, baseWidth)

    if (usesUniformWidth) {
      targetCtx.beginPath()
      targetCtx.lineWidth = Math.max(1, baseWidth * widthMultiplier)
      targetCtx.lineCap = isHighlighterBrush ? 'square' : 'round'
      const firstPoint = path.points[0]
      targetCtx.moveTo((firstPoint.x / 100) * canvasWidth, (firstPoint.y / 100) * canvasHeight)
      for (let i = 1; i < path.points.length; i++) {
        const point = path.points[i]
        targetCtx.lineTo((point.x / 100) * canvasWidth, (point.y / 100) * canvasHeight)
      }
      targetCtx.stroke()
      return
    }

    // Match editor behavior: variable-width segments driven by pointer pressure.
    for (let i = 1; i < path.points.length; i++) {
      const p1 = path.points[i - 1]
      const p2 = path.points[i]
      const px1 = (p1.x / 100) * canvasWidth
      const py1 = (p1.y / 100) * canvasHeight
      const px2 = (p2.x / 100) * canvasWidth
      const py2 = (p2.y / 100) * canvasHeight
      const p1Pressure = p1.pressure || 0.5
      const p2Pressure = p2.pressure || 0.5
      const avgPressure = (p1Pressure + p2Pressure) / 2
      const width = Math.max(1, baseWidth * (0.5 + avgPressure) * widthMultiplier)

      targetCtx.beginPath()
      targetCtx.lineWidth = width
      targetCtx.lineCap = 'round'
      targetCtx.moveTo(px1, py1)
      targetCtx.lineTo(px2, py2)
      targetCtx.stroke()

      if (width > 2) {
        targetCtx.beginPath()
        targetCtx.arc(px2, py2, width / 2, 0, Math.PI * 2)
        targetCtx.fillStyle = path.color
        targetCtx.fill()
      }
    }
  }

  // Preserve drawing order so erasing/rerawing is rendered exactly as recorded.
  const orderedDrawings = drawings
    .map((path, index) => ({ path, index }))
    .sort((a, b) => {
      const aTime = typeof a.path.timestamp === 'number' ? a.path.timestamp : Number.MAX_SAFE_INTEGER
      const bTime = typeof b.path.timestamp === 'number' ? b.path.timestamp : Number.MAX_SAFE_INTEGER
      if (aTime !== bTime) return aTime - bTime
      return a.index - b.index
    })
    .map(item => item.path)

  const drawEraserPath = (targetCtx: CanvasRenderingContext2D, path: DrawingPath) => {
    targetCtx.beginPath()
    targetCtx.globalCompositeOperation = 'destination-out'
    targetCtx.lineWidth = path.strokeWidth
    targetCtx.lineCap = 'round'
    targetCtx.lineJoin = 'round'
    drawPathGeometryOnContext(targetCtx, path)
    targetCtx.stroke()
  }

  const hasEraser = orderedDrawings.some(path => path.isEraser)

  // For flattened exports (base image + drawings on same canvas), render drawings on a transparent
  // overlay first, then composite once. This matches editor behavior and avoids eraser edge halos.
  if (baseImage && hasEraser && ownerDocument) {
    const overlayCanvas = ownerDocument.createElement('canvas')
    overlayCanvas.width = canvasWidth
    overlayCanvas.height = canvasHeight
    const overlayCtx = overlayCanvas.getContext('2d')

    if (overlayCtx) {
      for (const path of orderedDrawings) {
        if (path.points.length < 2) continue

        overlayCtx.save()
        if (path.isEraser) {
          drawEraserPath(overlayCtx, path)
        } else {
          drawStyledPath(overlayCtx, path)
        }
        overlayCtx.restore()
      }

      ctx.save()
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(overlayCanvas, 0, 0)
      ctx.restore()
      return
    }
  }

  for (const path of orderedDrawings) {
    if (path.points.length < 2) continue

    if (path.isEraser) {
      ctx.save()
      drawEraserPath(ctx, path)
      ctx.restore()
      continue
    }

    ctx.save()
    drawStyledPath(ctx, path)
    ctx.restore()
  }
}

const BOX_WIDTH_PERCENT = 25
const BOX_HEIGHT_PERCENT = 12
const SAFE_MARGIN = 2

/**
 * Generates a composite image (base64 JPEG) from raw annotation data.
 * Replicates InteractiveImageAnnotation.generateCompositeImage but works outside React.
 *
 * @param annotations - Array of annotations with position + text data
 * @param drawings - Array of drawing paths
 * @param baseImageSrc - URL or base64 of the base image
 * @param getText - Returns the text to display for each annotation (return undefined to skip)
 * @param containerWidth - Width of the virtual container (default 400)
 * @param containerHeight - Height of the virtual container (default 533, aspect 3:4)
 */
export async function generateAnnotationCompositeImage(
  annotations: Array<{
    id: string; x: number; y: number; boxX?: number; boxY?: number;
    transcription?: string; isHidden?: boolean; isRecording?: boolean;
    textScale?: number; textColor?: string; textBackground?: boolean; timestamp: number
  }>,
  drawings: DrawingPath[],
  baseImageSrc: string,
  getText: (annotation: { id: string; transcription?: string; isHidden?: boolean; isRecording?: boolean; [key: string]: any }) => string | undefined,
  containerWidth = 800,
  containerHeight = 1067
): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = containerWidth
    canvas.height = containerHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, containerWidth, containerHeight)

    const baseImage = await loadImage(baseImageSrc)
    const { offsetX, offsetY, drawWidth, drawHeight } = calculateObjectContainDimensions(
      baseImage.width, baseImage.height, containerWidth, containerHeight
    )
    ctx.drawImage(baseImage, offsetX, offsetY, drawWidth, drawHeight)

    renderDrawingsOnCanvas(ctx, drawings, containerWidth, containerHeight, baseImage, { offsetX, offsetY, drawWidth, drawHeight })

    const scale = containerWidth / 400
    // الماركر يُرسم بحجم ثابت (غير مضروب بالـ scale) ليطابق سلوك
    // InteractiveImageAnnotation.generateCompositeImage الذي يستخدم markerRadius=10
    // و lineWidth=2 و font=10px مهما كان عرض الـ container.
    const markerRadius = 10
    annotations.forEach((annotation, index) => {
      const markerX = (annotation.x / 100) * containerWidth
      const markerY = (annotation.y / 100) * containerHeight
      const text = getText(annotation)
      const hasText = !!text && !annotation.isRecording

      ctx.save()
      ctx.beginPath()
      ctx.arc(markerX, markerY, markerRadius, 0, Math.PI * 2)
      ctx.fillStyle = annotation.isHidden ? '#9ca3af' : '#ec4899'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      if (hasText) {
        ctx.fillStyle = '#ffffff'
        ctx.font = 'bold 10px Cairo, Arial, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText((index + 1).toString(), markerX, markerY)
      }
      ctx.restore()
    })

    const TEXT_OFFSET = 2
    const getBoxPos = (mx: number, my: number, pos: string) => {
      switch (pos) {
        case 'bottom': return { x: mx, y: my + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        case 'top': return { x: mx, y: my - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        case 'right': return { x: mx + TEXT_OFFSET, y: my, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        case 'left': return { x: mx - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: my, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        case 'bottom-right': return { x: mx + TEXT_OFFSET, y: my + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        case 'bottom-left': return { x: mx - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: my + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        case 'top-right': return { x: mx + TEXT_OFFSET, y: my - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        case 'top-left': return { x: mx - BOX_WIDTH_PERCENT - TEXT_OFFSET, y: my - BOX_HEIGHT_PERCENT - TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
        default: return { x: mx, y: my + TEXT_OFFSET, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT }
      }
    }
    const boxesOverlap = (b1: { x: number; y: number; width: number; height: number }, b2: { x: number; y: number; width: number; height: number }) =>
      !(b1.x + b1.width + SAFE_MARGIN < b2.x || b2.x + b2.width + SAFE_MARGIN < b1.x ||
        b1.y + b1.height + SAFE_MARGIN < b2.y || b2.y + b2.height + SAFE_MARGIN < b1.y)
    const boxInBounds = (b: { x: number; y: number; width: number; height: number }) =>
      b.x >= 0 && b.y >= 0 && b.x + b.width <= 100 && b.y + b.height <= 100

    const positionOrder = ['bottom', 'top', 'right', 'left', 'bottom-right', 'bottom-left', 'top-right', 'top-left']
    const textPositions = new Map<string, { x: number; y: number }>()
    const placedBoxes: { x: number; y: number; width: number; height: number }[] = []

    const sortedAnnotations = [...annotations]
      .filter(a => getText(a) && !a.isRecording)
      .sort((a, b) => a.timestamp - b.timestamp)

    sortedAnnotations.forEach((annotation) => {
      const markerX = annotation.x
      const markerY = annotation.y
      if (annotation.boxX !== undefined && annotation.boxY !== undefined) {
        textPositions.set(annotation.id, { x: annotation.boxX, y: annotation.boxY })
        placedBoxes.push({ x: annotation.boxX, y: annotation.boxY, width: BOX_WIDTH_PERCENT, height: BOX_HEIGHT_PERCENT })
        return
      }
      let best = getBoxPos(markerX, markerY, 'bottom')
      for (const pos of positionOrder) {
        const candidate = getBoxPos(markerX, markerY, pos)
        if (!boxInBounds(candidate)) continue
        if (!placedBoxes.some(pb => boxesOverlap(candidate, pb))) { best = candidate; break }
      }
      placedBoxes.push(best)
      textPositions.set(annotation.id, { x: best.x, y: best.y })
    })

    annotations
      .filter(a => getText(a) && !a.isRecording && !a.isHidden)
      .forEach((annotation, _i) => {
        const annotationIndex = annotations.findIndex(a => a.id === annotation.id) + 1
        const textPos = textPositions.get(annotation.id)
        if (!textPos) return
        const textScale = (annotation as any).textScale ?? 1
        const displayTextForScale = getText(annotation) || ''
        // الديفاناغاري (الهندية) يُرسم أكبر بصرياً من العربي/اللاتيني عند نفس font-size
        // بسبب فقدان دعم Cairo للديفاناغاري ووجود الـ shirorekha. نعوّض بتصغير الخط.
        const isDevanagari = /[ऀ-ॿ]/.test(displayTextForScale)
        const scriptScale = isDevanagari ? 0.82 : 1
        const fontSize = Math.round(14 * textScale * scale * scriptScale)
        const textX = (textPos.x / 100) * containerWidth
        const textY = (textPos.y / 100) * containerHeight
        const displayText = getText(annotation)
        if (!displayText) return
        const textColor = (annotation as any).textColor || '#000000'

        ctx.save()
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        // leading-snug = 1.375
        const lineHeight = Math.round(fontSize * 1.375)

        // قياس عرض الرقم (bold) + gap-1 (4px مضروب بالـ scale)
        const numberText = `${annotationIndex}.`
        ctx.font = `bold ${fontSize}px Cairo, Arial, sans-serif`
        const numberWidth = ctx.measureText(numberText).width
        const gap = Math.round(4 * scale)
        const textOffsetX = numberWidth + gap

        // تقسيم النص بدون الرقم - max-w-[200px] مضروب بالـ scale
        // مطابق لعرض HTML: التقسيم عند <end> أو \n أولاً، ثم لف الكلمات داخل كل مقطع
        const maxTextWidth = Math.round(200 * scale)
        ctx.font = `${fontSize}px Cairo, Arial, sans-serif`
        const segments = displayText.split(/<end>|\n/gi).map(s => s.trim()).filter(Boolean)
        const lines: string[] = []
        for (const segment of segments) {
          const words = segment.split(/\s+/).filter(Boolean)
          let currentLine = ''
          for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word
            if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
              lines.push(currentLine)
              currentLine = word
            } else {
              currentLine = testLine
            }
          }
          if (currentLine) lines.push(currentLine)
        }

        const hasBackground = !!(annotation as any).textBackground
        if (hasBackground && lines.length > 0) {
          ctx.font = `${fontSize}px Cairo, Arial, sans-serif`
          let maxLineWidth = 0
          lines.forEach((line, lineIndex) => {
            const lineWidth = (lineIndex === 0 ? textOffsetX : 0) + ctx.measureText(line).width
            if (lineWidth > maxLineWidth) maxLineWidth = lineWidth
          })
          // px-1.5 = 6px، py-0.5 = 2px مضروب بالـ scale
          const padX = Math.round(6 * scale)
          const padY = Math.round(2 * scale)
          const bgWidth = maxLineWidth + padX * 2
          const bgHeight = lineHeight * lines.length + padY * 2
          const radius = Math.min(Math.round(4 * scale), bgHeight / 2)
          const bgX = textX - padX
          const bgY = textY - padY

          ctx.save()
          ctx.fillStyle = isLightHex(textColor) ? '#000000' : '#ffffff'
          ctx.beginPath()
          ctx.moveTo(bgX + radius, bgY)
          ctx.lineTo(bgX + bgWidth - radius, bgY)
          ctx.quadraticCurveTo(bgX + bgWidth, bgY, bgX + bgWidth, bgY + radius)
          ctx.lineTo(bgX + bgWidth, bgY + bgHeight - radius)
          ctx.quadraticCurveTo(bgX + bgWidth, bgY + bgHeight, bgX + bgWidth - radius, bgY + bgHeight)
          ctx.lineTo(bgX + radius, bgY + bgHeight)
          ctx.quadraticCurveTo(bgX, bgY + bgHeight, bgX, bgY + bgHeight - radius)
          ctx.lineTo(bgX, bgY + radius)
          ctx.quadraticCurveTo(bgX, bgY, bgX + radius, bgY)
          ctx.closePath()
          ctx.fill()
          ctx.restore()
        }

        lines.forEach((line, lineIndex) => {
          const lineY = textY + lineIndex * lineHeight
          if (!hasBackground) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
            for (let dx = -1; dx <= 1; dx++) {
              for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue
                if (lineIndex === 0) {
                  ctx.font = `bold ${fontSize}px Cairo, Arial, sans-serif`
                  ctx.fillText(numberText, textX + dx, lineY + dy)
                  ctx.font = `${fontSize}px Cairo, Arial, sans-serif`
                }
                ctx.fillText(line, textX + textOffsetX + dx, lineY + dy)
              }
            }
          }
          ctx.fillStyle = textColor
          if (lineIndex === 0) {
            ctx.font = `bold ${fontSize}px Cairo, Arial, sans-serif`
            ctx.fillText(numberText, textX, lineY)
            ctx.font = `${fontSize}px Cairo, Arial, sans-serif`
          }
          ctx.fillText(line, textX + textOffsetX, lineY)
        })
        ctx.restore()
      })

    return new Promise<string | null>((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(null); return }
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        },
        'image/jpeg',
        0.92
      )
    })
  } catch {
    return null
  }
}

/**
 * Loads an image from a URL and returns the HTMLImageElement.
 * Sets crossOrigin to 'anonymous' for canvas operations.
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`))
    img.src = src
  })
}

/**
 * Calculates the object-contain dimensions for an image within a container.
 * Returns the draw dimensions and offsets needed to center the image.
 */
export function calculateObjectContainDimensions(
  imgWidth: number,
  imgHeight: number,
  containerWidth: number,
  containerHeight: number
): { offsetX: number; offsetY: number; drawWidth: number; drawHeight: number } {
  const imgAspect = imgWidth / imgHeight
  const containerAspect = containerWidth / containerHeight

  let drawWidth: number, drawHeight: number, offsetX: number, offsetY: number

  if (imgAspect > containerAspect) {
    drawWidth = containerWidth
    drawHeight = containerWidth / imgAspect
    offsetX = 0
    offsetY = (containerHeight - drawHeight) / 2
  } else {
    drawHeight = containerHeight
    drawWidth = containerHeight * imgAspect
    offsetX = (containerWidth - drawWidth) / 2
    offsetY = 0
  }

  return { offsetX, offsetY, drawWidth, drawHeight }
}
