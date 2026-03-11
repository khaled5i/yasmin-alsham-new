import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const IMAGE_MODEL = 'google/gemini-3.1-flash-image-preview'

function buildImagePrompt(params: {
  enhancedPrompt: string
  frontDesignImage?: string | null
  backDesignImage?: string | null
  fabricImages: string[]
  secondaryFabrics?: string[]
  fabricInfo: { fabric: string; fabricType: string | null }
  fabricLocationDescriptions?: { label: string; locations: string[] }[]
  additionalNotes?: string | null
}): { text: string; contentParts: any[] } {
  const { enhancedPrompt, frontDesignImage, backDesignImage, fabricImages, secondaryFabrics, fabricInfo, fabricLocationDescriptions, additionalNotes } = params

  const fabricTextParts = [
    fabricInfo.fabric ? `Fabric type: ${fabricInfo.fabric}` : '',
    fabricInfo.fabricType === 'internal' ? 'Fabric source: internal (from workshop)' : fabricInfo.fabricType === 'external' ? 'Fabric source: external (from client)' : ''
  ].filter(Boolean)

  const fabricText = fabricTextParts.join(', ')

  const customFabricInstruction = fabricText
    ? `\n• The primary fabric is: ${fabricText}. Render it with appropriate texture and drape.`
    : ''

  const secondaryFabricsInstruction = (secondaryFabrics && secondaryFabrics.length > 0)
    ? `\n• Secondary fabrics used in the dress: ${secondaryFabrics.join(', ')}. Render each with its distinct texture.`
    : ''

  const locationInstruction = (fabricLocationDescriptions && fabricLocationDescriptions.length > 0)
    ? `\n• Fabric placement on the dress:\n${fabricLocationDescriptions.map(f => `  - ${f.label}: ${f.locations.join(', ')}`).join('\n')}`
    : ''

  const notesInstruction = additionalNotes
    ? `\n• Additional client instructions: ${additionalNotes}`
    : ''

  const referenceImagePromptSection = (frontDesignImage || backDesignImage)
    ? `\n• Reference design images are attached below — apply faithfully to both front and back views.`
    : ''

  const designSpecsSection = fabricText ? `\nFabric Specifications: ${fabricText}` : ''

  const fullPrompt = `REFERENCE DESIGN INSTRUCTION (MANDATORY — HIGHEST PRIORITY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The client has provided design reference images and fabric images attached below.

• Apply each design faithfully to both the front and back views wherever the relevant area is visible.
• The primary fabric image(s) define the FABRIC, while the reference design images define specific area designs only.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Dress Design Image Generation

Generate a high-quality, fully coherent fashion design image of a dress based on the following enhanced client description:
${designSpecsSection}
${enhancedPrompt}
${customFabricInstruction}${secondaryFabricsInstruction}${locationInstruction}${notesInstruction}
${referenceImagePromptSection}

Dress Rendering Requirements

• The dress must appear as a complete, continuous garment with no deformation or missing parts.
• Maintain clean, symmetrical construction with a realistic silhouette.
• Ensure all fabric edges are intact, smooth, and not cut off.
• Couture-level fashion design with high detail.
• Realistic textile rendering including natural folds, fabric texture, fabric flow, and proper reflections.
• Accurate color reproduction.
• The dress must fit the mannequin naturally and consistently.

Dual-View Presentation (Front & Back) — Critical Requirement

═══════════════════════════════════════════════════════════════════

Image Layout

• Create one single image containing two separate mannequins placed side by side.
• Right side: Front view of the dress (facing the viewer).
• Left side: Back view of the dress (showing the back to the viewer).
• Both mannequins must have identical pose and height.
• Leave appropriate spacing between the two views.

Mannequin Requirements (For Both Views)

• White fabric torso mannequin.
• No arms.
• Identical proportions and pose for both mannequins.
• Headless mannequin.
• Full-length view showing the entire dress from neckline to hem.

Visual Consistency

• The same fabric pattern, color, and texture must appear in both views.
• Identical embellishment placement as described (front and back).
• Matching lighting and shadows on both mannequins.
• Same scale and proportions for both views.

Important — Both Views Are Required

• Do not show only the front view — both front and back views must be displayed.

• The back view (left side) must clearly show:
Back neckline
Closure details
Back embellishments
Train or hem as seen from behind

• The front view (right side) must clearly show:
Front neckline
Bodice details
Front embellishments

Logo Placement

No logo or text should appear in the image.

Background & Environment

• Minimal luxury fashion studio.
• White background.
• Clean, soft shadows under both mannequins.
• Consistent neutral lighting.
• No extra props or clutter.

Rendering Specifications

• 2K photorealistic output.
• Centered composition showing both mannequins (left: back view — right: front view).
• Clean composition with sharp edges and editorial-quality presentation.
• Image size: 1080 × 1350 px (Instagram post).

Hard Rules (Must Be Followed)

• Do not crop the dress.
• Do not generate torn, incomplete, fragmented, or unrealistic fabric.
• Do not distort proportions.
• The dress must always be smooth, clean, symmetrical, and fully constructed.
• The garment must look wearable and professionally tailored.
• Both front and back views MUST appear in the same image.

Expected Output

Two full-body mannequins side by side
(Left: back view — Right: front view)
wearing the same complete dress.`

  const contentParts: any[] = [{ type: 'text', text: fullPrompt }]

  // Add fabric images first (they define the fabric)
  if (fabricImages && fabricImages.length > 0) {
    for (const fabricImg of fabricImages) {
      const imageUrl = fabricImg.startsWith('data:') || fabricImg.startsWith('http')
        ? fabricImg
        : `data:image/jpeg;base64,${fabricImg}`
      contentParts.push({ type: 'image_url', image_url: { url: imageUrl } })
    }
  }

  // Add front design image
  if (frontDesignImage) {
    const src = frontDesignImage.startsWith('data:') ? frontDesignImage : `data:image/jpeg;base64,${frontDesignImage}`
    contentParts.push({ type: 'image_url', image_url: { url: src } })
  }

  // Add back design image
  if (backDesignImage) {
    const src = backDesignImage.startsWith('data:') ? backDesignImage : `data:image/jpeg;base64,${backDesignImage}`
    contentParts.push({ type: 'image_url', image_url: { url: src } })
  }

  return { text: fullPrompt, contentParts }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { enhancedPrompt, frontDesignImage, backDesignImage, fabricImages, secondaryFabrics, fabricInfo, fabricLocationDescriptions, additionalNotes } = body as {
      enhancedPrompt: string
      frontDesignImage?: string | null
      backDesignImage?: string | null
      fabricImages: string[]
      secondaryFabrics?: string[]
      fabricInfo: { fabric: string; fabricType: string | null }
      fabricLocationDescriptions?: { label: string; locations: string[] }[]
      additionalNotes?: string | null
    }

    const { text, contentParts } = buildImagePrompt({
      enhancedPrompt,
      frontDesignImage,
      backDesignImage,
      fabricImages,
      secondaryFabrics,
      fabricInfo,
      fabricLocationDescriptions,
      additionalNotes
    })

    console.log('\n================ FINAL AI PROMPT ================')
    console.log(text)
    console.log('=================================================\n')

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://yasmin-alsham.com',
        'X-Title': 'Yasmin Al-Sham Design Generator'
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
      console.error('OpenRouter image API error:', rawText.slice(0, 500))
      return NextResponse.json({ error: 'Failed to generate design image', details: rawText.slice(0, 500) }, { status: response.status })
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
    let generatedImageUrl: string | null = null

    // Strategy 0: check message.parts (Gemini native format sometimes exposed via OpenRouter)
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

    // Strategy 1: content is an array of parts (standard OpenAI multimodal format)
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

    // Strategy 3: search the entire raw JSON for a base64 image data URL
    if (!generatedImageUrl) {
      const dataUrlMatch = rawText.match(/data:image\/[^\\";]+;base64,[A-Za-z0-9+/=]{100,}/)
      if (dataUrlMatch) generatedImageUrl = dataUrlMatch[0].replace(/\\"/g, '')
    }

    // Strategy 4: look for base64 image data in nested fields (OpenRouter sometimes wraps differently)
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
      // Log structure for debugging (keys only to avoid huge logs)
      const logStructure = (obj: any, depth = 0): any => {
        if (depth > 4 || !obj || typeof obj !== 'object') return typeof obj === 'string' ? `string(${obj.length})` : obj
        return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, logStructure(v, depth + 1)]))
      }
      console.error('No image in response. Structure:', JSON.stringify(logStructure(data)))
      return NextResponse.json({
        error: 'No image returned by model',
        structure: logStructure(data)
      }, { status: 422 })
    }

    return NextResponse.json({ imageUrl: generatedImageUrl, success: true })

  } catch (error) {
    console.error('Generate design image error:', error)
    return NextResponse.json(
      { error: 'Failed to generate design image', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
