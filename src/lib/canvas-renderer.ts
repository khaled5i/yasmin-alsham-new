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
  // Step 1: Draw all non-eraser paths with proper brush styles
  for (const path of drawings) {
    if (path.points.length < 2 || path.isEraser) continue

    ctx.save()
    ctx.beginPath()
    ctx.strokeStyle = path.color
    ctx.lineWidth = path.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Reset styles
    ctx.setLineDash([])
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1

    // Apply brush type styling
    const brushType: BrushType = path.brushType || 'normal'
    switch (brushType) {
      case 'dashed':
        ctx.setLineDash([12, 6])
        break
      case 'dotted':
        ctx.setLineDash([3, 6])
        break
      case 'soft':
        ctx.shadowBlur = 8
        ctx.shadowColor = path.color
        break
      case 'pencil':
        ctx.globalAlpha = 0.85
        ctx.lineWidth = Math.max(1, path.strokeWidth * 0.5)
        break
      case 'highlighter':
        ctx.globalAlpha = 0.4
        ctx.lineWidth = path.strokeWidth * 2.5
        ctx.lineCap = 'square'
        break
    }

    const firstPoint = path.points[0]
    ctx.moveTo((firstPoint.x / 100) * canvasWidth, (firstPoint.y / 100) * canvasHeight)
    for (let i = 1; i < path.points.length; i++) {
      const point = path.points[i]
      ctx.lineTo((point.x / 100) * canvasWidth, (point.y / 100) * canvasHeight)
    }
    ctx.stroke()
    ctx.restore()
  }

  // Step 2: Apply erasers - clip eraser path and redraw base image within clip region
  if (baseImage) {
    const ox = imageRect?.offsetX ?? 0
    const oy = imageRect?.offsetY ?? 0
    const dw = imageRect?.drawWidth ?? canvasWidth
    const dh = imageRect?.drawHeight ?? canvasHeight

    for (const path of drawings) {
      if (path.points.length < 2 || !path.isEraser) continue

      ctx.save()
      ctx.beginPath()
      ctx.lineWidth = path.strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      const firstPoint = path.points[0]
      ctx.moveTo((firstPoint.x / 100) * canvasWidth, (firstPoint.y / 100) * canvasHeight)
      for (let i = 1; i < path.points.length; i++) {
        const point = path.points[i]
        ctx.lineTo((point.x / 100) * canvasWidth, (point.y / 100) * canvasHeight)
      }

      // Use the eraser path as a clip region and redraw the base image within it
      ctx.clip()
      ctx.drawImage(baseImage, ox, oy, dw, dh)
      ctx.restore()
    }
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
