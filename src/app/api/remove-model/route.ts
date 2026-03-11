import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const IMAGE_MODEL = 'google/gemini-3.1-flash-image-preview'

const REMOVE_MODEL_PROMPT = `You are a professional fashion photography editor specializing in product photography transformation.

TASK: Transform this fashion photograph by replacing the human fashion model with an elegant, sophisticated mannequin while preserving EVERY detail of the dress and environment.

CRITICAL REQUIREMENTS - MUST FOLLOW EXACTLY:

1. DRESS PRESERVATION (HIGHEST PRIORITY):
   - DO NOT alter ANY aspect of the dress design, structure, or details
   - Preserve exact fabric texture, color, sheen, and draping
   - Maintain all embellishments, embroidery, beading, lace, or decorative elements in their exact positions
   - Keep the exact silhouette, neckline, sleeves, waist, and hemline
   - Preserve any pleats, gathers, ruffles, or structural elements exactly as they appear
   - The dress should look identical to the original in every way

2. MANNEQUIN REQUIREMENTS:
   - Replace the human model with a high-end, elegant fashion mannequin
   - The mannequin should be neutral-toned (white, cream, or soft gray)
   - Use a realistic, photographic mannequin style - NOT cartoon or illustration
   - The mannequin should naturally support the dress in the same pose
   - No facial features - use a smooth, featureless head
   - Elegant, natural hand and arm positions if visible

3. BACKGROUND & ENVIRONMENT PRESERVATION:
   - Keep the EXACT same background, lighting, and setting
   - Preserve all shadows, reflections, and lighting conditions
   - Do not add, remove, or modify any background elements
   - Maintain the same perspective and camera angle

4. IMAGE QUALITY REQUIREMENTS:
   - Output must be photorealistic - indistinguishable from a real photograph
   - Maintain the original image resolution and quality
   - No visible artifacts, distortions, or AI-generated imperfections
   - Natural, professional lighting on the mannequin matching the scene
   - Seamless integration between mannequin and dress

5. WHAT TO AVOID:
   - Any changes to the dress design or details
   - Cartoon or illustrated style
   - Visible editing artifacts or unnatural elements
   - Changes to the environment or background
   - Unrealistic proportions or poses

Generate a single, high-quality photorealistic image with the mannequin replacement.`

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { imageBase64 } = body as { imageBase64: string }

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
    }

    // Ensure proper data URL format
    const imageUrl = imageBase64.startsWith('data:')
      ? imageBase64
      : `data:image/jpeg;base64,${imageBase64}`

    const contentParts: any[] = [
      { type: 'text', text: REMOVE_MODEL_PROMPT },
      { type: 'image_url', image_url: { url: imageUrl } }
    ]

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://yasmin-alsham.com',
        'X-Title': 'Yasmin Al-Sham Model Remover'
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        messages: [
          {
            role: 'user',
            content: contentParts
          }
        ],
        max_tokens: 8192,
        modalities: ['text', 'image']
      })
    })

    const rawText = await response.text()

    if (!response.ok) {
      console.error('OpenRouter remove-model API error:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to process image', details: rawText.slice(0, 500) }, { status: response.status })
    }

    let data: any
    try {
      data = JSON.parse(rawText)
    } catch {
      console.error('Failed to parse response as JSON:', rawText.slice(0, 300))
      return NextResponse.json({ error: 'Invalid JSON response from model' }, { status: 502 })
    }

    const choice = data.choices?.[0]
    const message = choice?.message
    let resultImageUrl: string | null = null

    // Strategy 0: check message.parts (Gemini native format)
    if (!resultImageUrl && Array.isArray(message?.parts)) {
      for (const part of message.parts) {
        if (part.inlineData?.data) {
          resultImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          break
        }
        if (part.fileData?.fileUri) {
          resultImageUrl = part.fileData.fileUri
          break
        }
      }
    }

    // Strategy 1: content is an array of parts (standard OpenAI multimodal format)
    if (!resultImageUrl && Array.isArray(message?.content)) {
      for (const part of message.content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          resultImageUrl = part.image_url.url
          break
        }
        if (part.type === 'image' && part.source?.data) {
          resultImageUrl = `data:${part.source.media_type || 'image/png'};base64,${part.source.data}`
          break
        }
        if (part.inlineData?.data) {
          resultImageUrl = `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`
          break
        }
      }
    }

    // Strategy 2: content is a string with embedded data URL
    if (!resultImageUrl && typeof message?.content === 'string') {
      const dataUrlMatch = message.content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
      if (dataUrlMatch) resultImageUrl = dataUrlMatch[0]
    }

    // Strategy 3: search entire raw JSON for a base64 image
    if (!resultImageUrl) {
      const dataUrlMatch = rawText.match(/data:image\/[^\\";]+;base64,[A-Za-z0-9+/=]{100,}/)
      if (dataUrlMatch) resultImageUrl = dataUrlMatch[0].replace(/\\"/g, '')
    }

    // Strategy 4: search nested fields
    if (!resultImageUrl) {
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
      resultImageUrl = searchInObj(data)
    }

    if (!resultImageUrl) {
      const logStructure = (obj: any, depth = 0): any => {
        if (depth > 4 || !obj || typeof obj !== 'object') return typeof obj === 'string' ? `string(${obj.length})` : obj
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, logStructure(v, depth + 1)]))
      }
      console.error('No image in remove-model response. Structure:', JSON.stringify(logStructure(data)))
      return NextResponse.json({ error: 'No image returned by model', structure: logStructure(data) }, { status: 422 })
    }

    return NextResponse.json({ imageUrl: resultImageUrl, success: true })

  } catch (error) {
    console.error('Remove model error:', error)
    return NextResponse.json(
      { error: 'Failed to process image', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
