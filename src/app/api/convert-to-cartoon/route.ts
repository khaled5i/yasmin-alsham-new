import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const IMAGE_MODEL = 'google/gemini-3.1-flash-image-preview'

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { completedImage } = body as { completedImage: string }

    if (!completedImage) {
      return NextResponse.json({ error: 'No completed image provided' }, { status: 400 })
    }

    // Read the reference illustration image from public folder
    const refImagePath = path.join(process.cwd(), 'public', 'Untitled design (32).png')
    let referenceImageBase64: string
    try {
      const refImageBuffer = fs.readFileSync(refImagePath)
      referenceImageBase64 = `data:image/png;base64,${refImageBuffer.toString('base64')}`
    } catch {
      return NextResponse.json({ error: 'Reference illustration image not found' }, { status: 500 })
    }

    // Prepare completed dress image URL
    const dressImageUrl = completedImage.startsWith('data:') || completedImage.startsWith('http')
      ? completedImage
      : `data:image/jpeg;base64,${completedImage}`

    const prompt = `You will receive two images:

Image 1: A hand-drawn fashion illustration of a model (cartoon / sketch style).
Image 2: A real photographed dress.

Task:
Place the exact dress from Image 2 onto the illustrated model in Image 1.

Strict requirements:

- Preserve the original illustration completely: do NOT change the model, pose, proportions, line style, colors, shading, or the background.
- Do NOT add text, objects, accessories, lighting effects, or any new design elements.
- The only modification allowed is replacing the model's clothing with the dress from Image 2.

Dress accuracy (extremely important):

- Replicate the dress with maximum visual accuracy.
- Maintain the exact silhouette, cut, structure, seams, folds, fabric behavior, layers, transparency, embroidery, decorations, and all small details.
- Preserve the exact neckline, sleeves, waistline, skirt shape, length, and proportions.
- Fabric texture and drape must be represented realistically while still drawn in the same illustration style as the model.
- The dress must fit naturally on the model's body with correct perspective and believable proportions.

Style constraints:

- The final result must look like the dress was originally drawn in the same hand-drawn illustration style as Image 1.
- Do not change the drawing technique, line quality, or artistic style of the model.
- Keep the background identical to the original illustration.

Goal:
Create a seamless fashion illustration where the photographed dress is accurately translated into the exact drawing style of the model illustration while preserving every design detail of the dress.`

    const contentParts: any[] = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: referenceImageBase64 } },
      { type: 'image_url', image_url: { url: dressImageUrl } }
    ]

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://yasmin-alsham.com',
        'X-Title': 'Yasmin Al-Sham Cartoon Converter'
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [{ role: 'user', content: contentParts }],
        max_tokens: 8192,
        modalities: ['text', 'image']
      })
    })

    const rawText = await response.text()

    if (!response.ok) {
      console.error('OpenRouter cartoon API error:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to convert image', details: rawText.slice(0, 500) }, { status: response.status })
    }

    let data: any
    try {
      data = JSON.parse(rawText)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON response from model' }, { status: 502 })
    }

    const choice = data.choices?.[0]
    const message = choice?.message
    let generatedImageUrl: string | null = null

    // Strategy 0: Gemini native format via OpenRouter
    if (!generatedImageUrl && Array.isArray(message?.parts)) {
      for (const part of message.parts) {
        if (part.inlineData?.data) {
          generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          break
        }
        if (part.fileData?.fileUri) {
          generatedImageUrl = part.fileData.fileUri
          break
        }
      }
    }

    // Strategy 1: content array of parts
    if (!generatedImageUrl && Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          generatedImageUrl = part.image_url.url
          break
        }
        if (part.type === 'image' && part.source?.data) {
          generatedImageUrl = `data:${part.source.media_type || 'image/png'};base64,${part.source.data}`
          break
        }
        if (part.inlineData?.data) {
          generatedImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          break
        }
      }
    }

    // Strategy 2: content is a string with embedded data URL
    if (!generatedImageUrl && typeof message?.content === 'string') {
      const dataUrlMatch = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
      if (dataUrlMatch) generatedImageUrl = dataUrlMatch[0]
    }

    // Strategy 3: search raw JSON for base64 image
    if (!generatedImageUrl) {
      const dataUrlMatch = rawText.match(/data:image\/[^\\";]+;base64,[A-Za-z0-9+/=]{100,}/)
      if (dataUrlMatch) generatedImageUrl = dataUrlMatch[0].replace(/\\"/g, '')
    }

    // Strategy 4: deep search in nested fields
    if (!generatedImageUrl) {
      const searchInObj = (obj: any, depth = 0): string | null => {
        if (depth > 8 || !obj || typeof obj !== 'object') return null
        for (const key of Object.keys(obj)) {
          const val = obj[key]
          if ((key === 'url' || key === 'data' || key === 'image') && typeof val === 'string' && val.length > 200) {
            if (val.startsWith('data:image/') || /^[A-Za-z0-9+/]{200,}={0,2}$/.test(val)) {
              return val.startsWith('data:image/') ? val : `data:image/png;base64,${val}`
            }
          }
          if (typeof val === 'object') {
            const found = searchInObj(val, depth + 1)
            if (found) return found
          }
        }
        return null
      }
      generatedImageUrl = searchInObj(data)
    }

    if (!generatedImageUrl) {
      const logStructure = (obj: any, depth = 0): any => {
        if (depth > 4 || !obj || typeof obj !== 'object') return typeof obj === 'string' ? `string(${obj.length})` : obj
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, logStructure(v, depth + 1)]))
      }
      console.error('No image in cartoon response. Structure:', JSON.stringify(logStructure(data)))
      return NextResponse.json({ error: 'No image returned by model', structure: logStructure(data) }, { status: 422 })
    }

    return NextResponse.json({ imageUrl: generatedImageUrl, success: true })

  } catch (error) {
    console.error('Convert to cartoon error:', error)
    return NextResponse.json(
      { error: 'Failed to convert image to cartoon', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
