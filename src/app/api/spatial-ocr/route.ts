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
    clusterId: number | null
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

        // خوارزمية ذكية لتجميع الكلمات في جمل (تدعم الجمل المائلة ومتعددة الأسطر)
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
                clusterId: null
            }
        })

        // دالة لحساب المسافة الإقليدية بين كلمتين
        const distance = (w1: WordWithMetadata, w2: WordWithMetadata) => {
            const dx = w1.centerX - w2.centerX
            const dy = w1.centerY - w2.centerY
            return Math.sqrt(dx * dx + dy * dy)
        }

        // دالة للتحقق من أن كلمتين يجب أن تكونا في نفس الجملة
        const shouldBeInSameCluster = (w1: WordWithMetadata, w2: WordWithMetadata) => {
            const dist = distance(w1, w2)
            const avgWidth = (w1.width + w2.width) / 2
            const avgHeight = (w1.height + w2.height) / 2

            const dx = Math.abs(w1.centerX - w2.centerX)
            const dy = Math.abs(w1.centerY - w2.centerY)

            // شروط التجميع الذكية:
            // 1. المسافة الكلية أقل من 3 أضعاف متوسط العرض
            // 2. المسافة الرأسية أقل من 1.8 ضعف متوسط الارتفاع (للسماح بالميل والأسطر المتعددة)
            const maxDistance = avgWidth * 3
            const maxVerticalDistance = avgHeight * 1.8

            return dist < maxDistance && dy < maxVerticalDistance
        }

        // خوارزمية DBSCAN مبسطة للتجميع
        let currentClusterId = 0

        wordsWithMetadata.forEach((word) => {
            if (word.clusterId !== null) return

            word.clusterId = currentClusterId
            const cluster = [word]

            let i = 0
            while (i < cluster.length) {
                const currentWord = cluster[i]

                wordsWithMetadata.forEach(otherWord => {
                    if (otherWord.clusterId === null && shouldBeInSameCluster(currentWord, otherWord)) {
                        otherWord.clusterId = currentClusterId
                        cluster.push(otherWord)
                    }
                })

                i++
            }

            currentClusterId++
        })

        // تجميع الكلمات حسب cluster ID
        const clusters: Map<number, WordWithMetadata[]> = new Map()
        wordsWithMetadata.forEach(word => {
            if (word.clusterId !== null) {
                if (!clusters.has(word.clusterId)) {
                    clusters.set(word.clusterId, [])
                }
                clusters.get(word.clusterId)!.push(word)
            }
        })

        // تحويل كل cluster إلى نص مع إحداثيات
        const textGroups: Array<{
            text: string
            x: number
            y: number
        }> = []

        clusters.forEach(clusterWords => {
            const isArabic = /[\u0600-\u06FF]/.test(clusterWords[0].word.description)

            // ترتيب الكلمات: حسب Y أولاً (للأسطر المتعددة)، ثم حسب X
            const sortedWords = clusterWords.sort((a, b) => {
                const avgHeight = (a.height + b.height) / 2
                // إذا كانت في نفس السطر تقريباً
                if (Math.abs(a.centerY - b.centerY) < avgHeight * 0.5) {
                    return isArabic ? b.centerX - a.centerX : a.centerX - b.centerX
                } else {
                    return a.centerY - b.centerY
                }
            })

            const text = sortedWords.map(w => w.word.description).join(' ')

            // حساب المركز الكلي
            const allX = sortedWords.map(w => w.centerX)
            const allY = sortedWords.map(w => w.centerY)
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

        const filteredTexts = textGroups.filter(t => t.text.length > 0)

        return NextResponse.json({
            texts: filteredTexts,
            success: true,
            debug: {
                totalWords: words.length,
                totalClusters: clusters.size,
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
