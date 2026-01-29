import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// تعريف أسماء اللغات
const languageNames: Record<string, string> = {
  'en': 'English',
  'ur': 'Urdu',
  'bn': 'Bengali',
  'ar': 'Arabic'
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    const { text, targetLanguage } = await request.json()

    if (!text || !targetLanguage) {
      return NextResponse.json(
        { error: 'Missing text or target language' },
        { status: 400 }
      )
    }

    const languageName = languageNames[targetLanguage] || targetLanguage

    // استخدام OpenAI مباشرة للترجمة
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
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

    const translatedText = response.choices?.[0]?.message?.content?.trim() || ''

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

