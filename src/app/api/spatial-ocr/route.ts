import { NextRequest, NextResponse } from 'next/server'

/**
 * 🔍 Spatial OCR API - تحويل الكتابة اليدوية إلى نص مع تحديد المواقع
 * 
 * يستخدم Google Cloud Vision API لـ:
 * - اكتشاف النصوص المكتوبة بخط اليد بدقة عالية جداً
 * - دعم ممتاز للعربية والإنجليزية
 * - إرجاع النص مع إحداثيات دقيقة لكل كلمة
 * - تجاهل الرسومات والخطوط غير النصية تلقائياً
 * - دعم الجمل المائلة والجمل متعددة الأسطر
 */

interface WordWithMetadata {
    word: any
    centerX: number
    centerY: number
    width: number
    height: number
    left: number
    right: number
    top: number
    bottom: number
}

export async function POST(request: NextRequest) {
    try {
        const { imageData } = await request.json()

        if (!imageData) {
            return NextResponse.json(
                { error: 'No image data provided' },
                { status: 400 }
            )
        }

        const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY

        if (!apiKey) {
            return NextResponse.json(
                { error: 'Google Cloud Vision API key not configured' },
                { status: 500 }
            )
        }

        // إزالة البادئة من base64 إذا وجدت
        const base64Image = imageData.replace(/^data:image\/\w+;base64,/, '')

        // استدعاء Google Cloud Vision API
        const visionResponse = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requests: [
                        {
                            image: {
                                content: base64Image
                            },
                            features: [
                                {
                                    type: 'DOCUMENT_TEXT_DETECTION',
                                    maxResults: 50
                                }
                            ],
                            imageContext: {
                                languageHints: ['ar', 'en']
                            }
                        }
                    ]
                })
            }
        )

        if (!visionResponse.ok) {
            const errorText = await visionResponse.text()
            console.error('Google Vision API error:', errorText)
            return NextResponse.json(
                { error: 'Failed to process image with Google Vision', details: errorText },
                { status: visionResponse.status }
            )
        }

        const visionData = await visionResponse.json()
        const annotations = visionData.responses[0]

        if (!annotations || !annotations.textAnnotations || annotations.textAnnotations.length === 0) {
            return NextResponse.json({
                texts: [],
                success: true
            })
        }

        const words = annotations.textAnnotations.slice(1)
        const imageWidth = annotations.fullTextAnnotation?.pages?.[0]?.width || 1000
        const imageHeight = annotations.fullTextAnnotation?.pages?.[0]?.height || 1000

        // تجهيز بيانات الكلمات مع حدودها
        const wordsWithMetadata: WordWithMetadata[] = words.map((word: any) => {
            const vertices = word.boundingPoly.vertices
            const minX = Math.min(vertices[0].x, vertices[1].x, vertices[2].x, vertices[3].x)
            const maxX = Math.max(vertices[0].x, vertices[1].x, vertices[2].x, vertices[3].x)
            const minY = Math.min(vertices[0].y, vertices[1].y, vertices[2].y, vertices[3].y)
            const maxY = Math.max(vertices[0].y, vertices[1].y, vertices[2].y, vertices[3].y)

            return {
                word,
                centerX: (minX + maxX) / 2,
                centerY: (minY + maxY) / 2,
                width: maxX - minX,
                height: maxY - minY,
                left: minX,
                right: maxX,
                top: minY,
                bottom: maxY
            }
        })

        // تجميع الكلمات في أسطر أولاً (لتجنب دمج جمل قريبة في نفس السطر أو أسطر متجاورة)
        const sortedByY = [...wordsWithMetadata].sort((a, b) => a.centerY - b.centerY)
        const lines: Array<{
            words: WordWithMetadata[]
            centerY: number
            avgHeight: number
            top: number
            bottom: number
            sumX: number
            sumY: number
            sumXX: number
            sumXY: number
            slope: number
            intercept: number
        }> = []

        const updateLineStats = (line: typeof lines[number]) => {
            const count = line.words.length
            if (count === 0) return

            const varianceX = count * line.sumXX - line.sumX * line.sumX
            if (count > 1 && Math.abs(varianceX) > 0.0001) {
                line.slope = (count * line.sumXY - line.sumX * line.sumY) / varianceX
            } else {
                line.slope = 0
            }
            line.intercept = (line.sumY - line.slope * line.sumX) / count
        }

        const getLineDistance = (line: typeof lines[number], word: WordWithMetadata) => {
            if (line.words.length < 2) {
                return Math.abs(word.centerY - line.centerY)
            }
            const predictedY = line.slope * word.centerX + line.intercept
            return Math.abs(word.centerY - predictedY)
        }

        sortedByY.forEach(word => {
            let bestLine: typeof lines[number] | null = null
            let bestDistance = Number.POSITIVE_INFINITY

            for (const line of lines) {
                const overlap = Math.min(line.bottom, word.bottom) - Math.max(line.top, word.top)
                const minHeight = Math.min(line.bottom - line.top, word.height)
                const overlapRatio = minHeight > 0 ? overlap / minHeight : 0
                const distance = getLineDistance(line, word)
                const maxDistance = Math.max(line.avgHeight, word.height) * 0.75
                const relaxedDistance = Math.max(line.avgHeight, word.height) * 1.1

                if (distance <= maxDistance || (overlapRatio > 0.35 && distance <= relaxedDistance)) {
                    if (distance < bestDistance) {
                        bestDistance = distance
                        bestLine = line
                    }
                }
            }

            if (bestLine) {
                bestLine.words.push(word)
                const count = bestLine.words.length
                bestLine.centerY = (bestLine.centerY * (count - 1) + word.centerY) / count
                bestLine.avgHeight = (bestLine.avgHeight * (count - 1) + word.height) / count
                bestLine.top = Math.min(bestLine.top, word.top)
                bestLine.bottom = Math.max(bestLine.bottom, word.bottom)
                bestLine.sumX += word.centerX
                bestLine.sumY += word.centerY
                bestLine.sumXX += word.centerX * word.centerX
                bestLine.sumXY += word.centerX * word.centerY
                updateLineStats(bestLine)
            } else {
                const newLine = {
                    words: [word],
                    centerY: word.centerY,
                    avgHeight: word.height,
                    top: word.top,
                    bottom: word.bottom,
                    sumX: word.centerX,
                    sumY: word.centerY,
                    sumXX: word.centerX * word.centerX,
                    sumXY: word.centerX * word.centerY,
                    slope: 0,
                    intercept: word.centerY
                }
                updateLineStats(newLine)
                lines.push(newLine)
            }
        })

        // تحويل كل سطر إلى مجموعات نصية بناءً على المسافات الأفقية
        const textGroups: Array<{ text: string; x: number; y: number }> = []

        lines.forEach(line => {
            const lineIsArabic = line.words.some(w => /[\u0600-\u06FF]/.test(w.word.description))
            const angle = Math.atan(line.slope)
            const cosA = Math.cos(angle)
            const sinA = Math.sin(angle)

            const wordsWithProjection = line.words.map(word => {
                const projCenter = word.centerX * cosA + word.centerY * sinA
                const halfAlong = (Math.abs(cosA) * word.width + Math.abs(sinA) * word.height) / 2
                return {
                    word,
                    projCenter,
                    minProj: projCenter - halfAlong,
                    maxProj: projCenter + halfAlong,
                    alongLength: halfAlong * 2
                }
            })

            const sortedWords = wordsWithProjection.sort((a, b) =>
                lineIsArabic ? b.projCenter - a.projCenter : a.projCenter - b.projCenter
            )

            const segments: WordWithMetadata[][] = []
            let currentSegment: WordWithMetadata[] = []

            sortedWords.forEach((word, idx) => {
                if (idx === 0) {
                    currentSegment = [word.word]
                    return
                }

                const prevProjection = sortedWords[idx - 1]
                const gap = lineIsArabic
                    ? (prevProjection.minProj - word.maxProj)
                    : (word.minProj - prevProjection.maxProj)
                const avgAlong = (prevProjection.alongLength + word.alongLength) / 2
                const maxGap = Math.max(avgAlong * 0.9, line.avgHeight * 0.9)

                if (gap > maxGap) {
                    segments.push(currentSegment)
                    currentSegment = [word.word]
                } else {
                    currentSegment.push(word.word)
                }
            })

            if (currentSegment.length > 0) {
                segments.push(currentSegment)
            }

            segments.forEach(segmentWords => {
                const text = segmentWords.map(w => w.word.description).join(' ')
                const allX = segmentWords.map(w => w.centerX)
                const allY = segmentWords.map(w => w.centerY)
                const centerX = allX.reduce((a, b) => a + b, 0) / allX.length
                const centerY = allY.reduce((a, b) => a + b, 0) / allY.length
                const x = (centerX / imageWidth) * 100
                const y = (centerY / imageHeight) * 100

                textGroups.push({
                    text: text.trim(),
                    x: Math.min(Math.max(x, 0), 100),
                    y: Math.min(Math.max(y, 0), 100)
                })
            })
        })

        const filteredTexts = textGroups.filter(t => t.text.length > 0)

        return NextResponse.json({
            texts: filteredTexts,
            success: true,
            debug: {
                totalWords: words.length,
                totalClusters: textGroups.length,
                imageSize: { width: imageWidth, height: imageHeight }
            }
        })

    } catch (error) {
        console.error('Spatial OCR error:', error)

        if (error instanceof Error) {
            return NextResponse.json(
                {
                    error: 'Failed to process image',
                    message: error.message,
                    details: error.toString()
                },
                { status: 500 }
            )
        }

        return NextResponse.json(
            { error: 'Failed to process image', message: 'Unknown error' },
            { status: 500 }
        )
    }
}
