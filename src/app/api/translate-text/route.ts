import { NextRequest, NextResponse } from 'next/server'

const OPENROUTER_API_KEY = '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'

// تعريف أسماء اللغات
const languageNames: Record<string, string> = {
  'en': 'English',
  'ur': 'Urdu',
  'bn': 'Bengali',
  'ar': 'Arabic'
}

export async function POST(request: NextRequest) {
  try {
    const { text, targetLanguage } = await request.json()

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: 'Missing text or target language' },
        { status: 400 }
      )
    }

    const languageName = languageNames[targetLanguage] || targetLanguage

    // استخدام GPT-4 عبر OpenRouter للترجمة
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://yasmin-alsham.com',
        'X-Title': 'Yasmin Al-Sham'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following text to ${languageName}. Return ONLY the translated text, nothing else. No explanations, no additional formatting, just the pure translation.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenRouter API error:', errorData)
      return NextResponse.json(
        { error: 'Failed to translate text', details: errorData },
        { status: response.status }
      )
    }

    const data = await response.json()
    const translatedText = data.choices?.[0]?.message?.content?.trim() || ''

    if (!translatedText) {
      return NextResponse.json(
        { error: 'No translation returned' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      originalText: text,
      translatedText: translatedText,
      targetLanguage: targetLanguage,
      languageName: languageName
    })
  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json(
      { error: 'Failed to translate text', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

