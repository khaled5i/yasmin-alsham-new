import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const PROMPT_MODEL = 'openai/gpt-5-mini'

const SYSTEM_PROMPT = `Images of the design created by the user, fabric photos, and information about the type of fabric used have been attached.

Your task is to create a detailed, professional couture-level dress description based only on the front design image, the back design image, and the fabric image.

Important Rules:

Describe the dress only.

Do not describe the background, environment, room, mannequin, lighting, camera angle, or logo. These elements are handled separately.

You may improve the description to make it clearer and more professional, but you must not invent new features that are not drawn in the design image or written on the design image.

In some cases, the design image may contain written instructions or notes. You must take these modifications into account.

All enhancements must reflect the fabric style, the design itself, and any design notes.

The goal is to transform the client's design into a cohesive luxury description suitable for insertion into an AI image-generation prompt.

The output must be one polished paragraph describing only the dress and must include:

Silhouette

Proportions and design balance

Fabrics

Materials

Neckline

Back design (shape, closure type, and embellishments on the back)

Sleeves

Skirt shape

Embellishments and embroidery (front and back placement)

Transparency details

Colors

Movement and textile behavior

Overall aesthetic style

Very Important — Back Design:

⚠️ The back design must be perfectly consistent with the front design. The gown must read as one fully integrated and harmonious piece.
Avoid creating any back design that appears disconnected, contradictory, or visually inconsistent with the front.

You must describe the back of the dress in detail, including:

Back neckline shape

Closure type

Any embellishments or decorative elements on the back

How the back design complements the front design

Do NOT mention:

User inputs

Any technical or contextual information outside the dress itself

Write in the tone of a world-class fashion designer describing a luxury couture gown.

Now transform all the information above into one refined, elegant paragraph that describes only the dress design with expert-level precision and a coherent structure.`

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    const body = await request.json()
    const { frontDesignImage, backDesignImage, fabricImages, secondaryFabrics, fabricInfo, fabricLocationDescriptions, additionalNotes } = body as {
      frontDesignImage?: string | null
      backDesignImage?: string | null
      fabricImages: string[]
      secondaryFabrics?: string[]
      fabricInfo: { fabric: string; fabricType: string | null }
      fabricLocationDescriptions?: { label: string; locations: string[] }[]
      additionalNotes?: string | null
    }

    // Build message content with images
    const contentParts: any[] = []

    // Add fabric info as text
    const fabricTextLines = [
      fabricInfo.fabric ? `نوع القماش: ${fabricInfo.fabric}` : '',
      fabricInfo.fabricType === 'internal' ? 'مصدر القماش: داخلي (من المشغل)' : fabricInfo.fabricType === 'external' ? 'مصدر القماش: خارجي (من العميل)' : ''
    ].filter(Boolean)

    if (secondaryFabrics && secondaryFabrics.length > 0) {
      fabricTextLines.push(`أقمشة ثانوية مستخدمة: ${secondaryFabrics.join('، ')}`)
    }

    if (fabricLocationDescriptions && fabricLocationDescriptions.length > 0) {
      const locLines = fabricLocationDescriptions.map(f => `${f.label} → ${f.locations.join('، ')}`).join('\n')
      fabricTextLines.push(`توزيع الأقمشة على الجسم:\n${locLines}`)
    }

    if (additionalNotes) {
      fabricTextLines.push(`ملاحظات إضافية من العميل: ${additionalNotes}`)
    }

    const fabricText = fabricTextLines.join('\n')

    if (fabricText) {
      contentParts.push({ type: 'text', text: fabricText })
    }

    // Add front design image
    if (frontDesignImage) {
      contentParts.push({ type: 'text', text: 'Front design image:' })
      const frontSrc = frontDesignImage.startsWith('data:') ? frontDesignImage : `data:image/jpeg;base64,${frontDesignImage}`
      const [mediaType, base64Data] = frontSrc.startsWith('data:')
        ? [frontSrc.split(';')[0].replace('data:', ''), frontSrc.split(',')[1]]
        : ['image/jpeg', frontDesignImage]
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:${mediaType};base64,${base64Data}` }
      })
    }

    // Add back design image
    if (backDesignImage) {
      contentParts.push({ type: 'text', text: 'Back design image:' })
      const backSrc = backDesignImage.startsWith('data:') ? backDesignImage : `data:image/jpeg;base64,${backDesignImage}`
      const [mediaType, base64Data] = backSrc.startsWith('data:')
        ? [backSrc.split(';')[0].replace('data:', ''), backSrc.split(',')[1]]
        : ['image/jpeg', backDesignImage]
      contentParts.push({
        type: 'image_url',
        image_url: { url: `data:${mediaType};base64,${base64Data}` }
      })
    }

    // Add fabric images
    if (fabricImages && fabricImages.length > 0) {
      contentParts.push({ type: 'text', text: `Fabric image(s) (${fabricImages.length} provided):` })
      for (const fabricImg of fabricImages) {
        // fabricImg could be a URL or base64
        const imageUrl = fabricImg.startsWith('data:') || fabricImg.startsWith('http')
          ? fabricImg
          : `data:image/jpeg;base64,${fabricImg}`
        contentParts.push({
          type: 'image_url',
          image_url: { url: imageUrl }
        })
      }
    }

    if (contentParts.length === 0) {
      return NextResponse.json({ error: 'No images provided' }, { status: 400 })
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://yasmin-alsham.com',
        'X-Title': 'Yasmin Al-Sham Design Generator'
      },
      body: JSON.stringify({
        model: PROMPT_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: contentParts }
        ],
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('OpenRouter prompt API error:', errorText)
      return NextResponse.json({ error: 'Failed to generate design prompt', details: errorText }, { status: response.status })
    }

    const data = await response.json()
    const enhancedPrompt = data.choices?.[0]?.message?.content || ''

    return NextResponse.json({ prompt: enhancedPrompt, success: true })

  } catch (error) {
    console.error('Generate design prompt error:', error)
    return NextResponse.json(
      { error: 'Failed to generate design prompt', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
