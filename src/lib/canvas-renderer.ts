/**
 * Shared canvas drawing renderer utility
 * Replicates the exact rendering logic from InteractiveImageAnnotation's generateCompositeImage
 * Used by OrderModal and PrintOrderModal for consistent drawing display
 */

import type { DrawingPath, BrushType } from '@/components/InteractiveImageAnnotation'

/**
 * Renders drawing paths on a canvas with proper eraser support (clip + base image redraw),
 * brush type styles, and dynamic coordinate mapping.
 *
 * @param ctx - The 2D canvas rendering context
 * @param drawings - Array of DrawingPath objects to render
 * @param canvasWidth - The logical width of the canvas
 * @param canvasHeight - The logical height of the canvas
 * @param baseImage - Optional HTMLImageElement for eraser clip+redraw. Required if drawings contain erasers.
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

  const drawPathGeometry = (path: DrawingPath) => {
    drawPathGeometryOnContext(ctx, path)
  }

  const applyBrushStyle = (
    pathBrushType: BrushType,
    pathColor: string,
    pathIsEraser: boolean = false,
    baseWidth: number = ctx.lineWidth
  ) => {
    ctx.setLineDash([])
    ctx.lineDashOffset = 0
    ctx.shadowBlur = 0
    ctx.shadowColor = 'transparent'
    ctx.globalAlpha = 1
    ctx.strokeStyle = pathColor
    ctx.lineWidth = baseWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (pathIsEraser) {
      ctx.setLineDash([])
      return
    }

    switch (pathBrushType) {
      case 'dashed':
        ctx.setLineDash([14, 10])
        break
      case 'dotted':
        ctx.lineCap = 'round'
        ctx.setLineDash([1, Math.max(6, baseWidth * 2.2)])
        break
      case 'soft':
        ctx.shadowBlur = 8
        ctx.shadowColor = pathColor
        break
      case 'pencil':
        ctx.globalAlpha = 0.85
        break
      case 'highlighter':
        ctx.globalAlpha = 0.35
        ctx.lineCap = 'square'
        break
      default:
        break
    }
  }

  const drawStyledPath = (path: DrawingPath) => {
    if (path.points.length < 2) return

    const brushType: BrushType = path.brushType || 'normal'
    const isPatternBrush = brushType === 'dashed' || brushType === 'dotted'
    const isHighlighterBrush = brushType === 'highlighter'
    const usesUniformWidth = isPatternBrush || isHighlighterBrush
    const widthMultiplier = isHighlighterBrush ? 2.6 : brushType === 'pencil' ? 0.5 : 1
    const baseWidth = path.strokeWidth

    applyBrushStyle(brushType, path.color, false, baseWidth)

    if (usesUniformWidth) {
      ctx.beginPath()
      ctx.lineWidth = Math.max(1, baseWidth * widthMultiplier)
      ctx.lineCap = isHighlighterBrush ? 'square' : 'round'
      const firstPoint = path.points[0]
      ctx.moveTo((firstPoint.x / 100) * canvasWidth, (firstPoint.y / 100) * canvasHeight)
      for (let i = 1; i < path.points.length; i++) {
        const point = path.points[i]
        ctx.lineTo((point.x / 100) * canvasWidth, (point.y / 100) * canvasHeight)
      }
      ctx.stroke()
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

      ctx.beginPath()
      ctx.lineWidth = width
      ctx.lineCap = 'round'
      ctx.moveTo(px1, py1)
      ctx.lineTo(px2, py2)
      ctx.stroke()

      if (width > 2) {
        ctx.beginPath()
        ctx.arc(px2, py2, width / 2, 0, Math.PI * 2)
        ctx.fillStyle = path.color
        ctx.fill()
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

  const ox = imageRect?.offsetX ?? 0
  const oy = imageRect?.offsetY ?? 0
  const dw = imageRect?.drawWidth ?? canvasWidth
  const dh = imageRect?.drawHeight ?? canvasHeight

  const eraseWithBaseImage = (path: DrawingPath) => {
    const ownerDocument = (ctx.canvas as HTMLCanvasElement).ownerDocument
    if (!ownerDocument) {
      ctx.save()
      ctx.beginPath()
      ctx.globalCompositeOperation = 'destination-out'
      ctx.lineWidth = path.strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      drawPathGeometry(path)
      ctx.stroke()
      ctx.restore()
      return
    }

    const maskCanvas = ownerDocument.createElement('canvas')
    maskCanvas.width = canvasWidth
    maskCanvas.height = canvasHeight
    const maskCtx = maskCanvas.getContext('2d')
    if (!maskCtx) return

    maskCtx.beginPath()
    maskCtx.strokeStyle = '#000000'
    maskCtx.lineWidth = path.strokeWidth
    maskCtx.lineCap = 'round'
    maskCtx.lineJoin = 'round'
    drawPathGeometryOnContext(maskCtx, path)
    maskCtx.stroke()

    // Remove existing content in mask area (image + drawings).
    ctx.save()
    ctx.globalCompositeOperation = 'destination-out'
    ctx.drawImage(maskCanvas, 0, 0)
    ctx.restore()

    // Restore only base image pixels in the erased region.
    const restoreCanvas = ownerDocument.createElement('canvas')
    restoreCanvas.width = canvasWidth
    restoreCanvas.height = canvasHeight
    const restoreCtx = restoreCanvas.getContext('2d')
    if (!restoreCtx) return

    restoreCtx.drawImage(baseImage as HTMLImageElement, ox, oy, dw, dh)
    restoreCtx.globalCompositeOperation = 'destination-in'
    restoreCtx.drawImage(maskCanvas, 0, 0)

    ctx.save()
    ctx.globalCompositeOperation = 'source-over'
    ctx.drawImage(restoreCanvas, 0, 0)
    ctx.restore()
  }

  for (const path of orderedDrawings) {
    if (path.points.length < 2) continue

    if (path.isEraser) {
      if (baseImage) {
        // Match eraser width exactly by using a stroked mask, then restore base image only.
        eraseWithBaseImage(path)
      } else {
        // Fallback when no base image exists.
        ctx.save()
        ctx.beginPath()
        ctx.globalCompositeOperation = 'destination-out'
        ctx.lineWidth = path.strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        drawPathGeometry(path)
        ctx.stroke()
        ctx.restore()
      }
      continue
    }

    ctx.save()
    drawStyledPath(path)
    ctx.restore()
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
