/**
 * Shared canvas drawing renderer utility
 * Replicates the exact rendering logic from InteractiveImageAnnotation's generateCompositeImage
 * Used by OrderModal and PrintOrderModal for consistent drawing display
 */

import type { DrawingPath, BrushType } from '@/components/InteractiveImageAnnotation'

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
