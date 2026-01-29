import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: تحميل الترجمات المحفوظة لعامل معين في طلب معين
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // الحصول على المعاملات من URL
    const searchParams = request.nextUrl.searchParams
    const orderId = searchParams.get('orderId')
    const workerId = searchParams.get('workerId')

    if (!orderId || !workerId) {
      return NextResponse.json({ error: 'Missing orderId or workerId' }, { status: 400 })
    }

    // جلب الترجمات من قاعدة البيانات
    const { data: translations, error } = await supabase
      .from('worker_translations')
      .select('*')
      .eq('order_id', orderId)
      .eq('worker_id', workerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching translations:', error)
      return NextResponse.json({ error: 'Failed to fetch translations' }, { status: 500 })
    }

    return NextResponse.json(translations || [])

  } catch (error) {
    console.error('Error in GET /api/worker-translations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: حفظ ترجمة جديدة أو تحديث ترجمة موجودة
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // الحصول على البيانات من الطلب
    const body = await request.json()
    const { orderId, workerId, voiceNoteId, originalText, translatedText, targetLanguage } = body

    if (!orderId || !workerId || !voiceNoteId || !translatedText || !targetLanguage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // التحقق من وجود ترجمة سابقة لنفس الملاحظة
    const { data: existingTranslation } = await supabase
      .from('worker_translations')
      .select('id')
      .eq('order_id', orderId)
      .eq('worker_id', workerId)
      .eq('voice_note_id', voiceNoteId)
      .single()

    if (existingTranslation) {
      // تحديث الترجمة الموجودة
      const { error: updateError } = await supabase
        .from('worker_translations')
        .update({
          original_text: originalText,
          translated_text: translatedText,
          target_language: targetLanguage,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTranslation.id)

      if (updateError) {
        console.error('Error updating translation:', updateError)
        return NextResponse.json({ error: 'Failed to update translation' }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'updated' })
    } else {
      // إنشاء ترجمة جديدة
      const { error: insertError } = await supabase
        .from('worker_translations')
        .insert({
          order_id: orderId,
          worker_id: workerId,
          voice_note_id: voiceNoteId,
          original_text: originalText,
          translated_text: translatedText,
          target_language: targetLanguage
        })

      if (insertError) {
        console.error('Error inserting translation:', insertError)
        return NextResponse.json({ error: 'Failed to save translation' }, { status: 500 })
      }

      return NextResponse.json({ success: true, action: 'created' })
    }

  } catch (error) {
    console.error('Error in POST /api/worker-translations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE: حذف ترجمة معينة
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // الحصول على المعاملات من URL
    const searchParams = request.nextUrl.searchParams
    const orderId = searchParams.get('orderId')
    const workerId = searchParams.get('workerId')
    const voiceNoteId = searchParams.get('voiceNoteId')

    if (!orderId || !workerId || !voiceNoteId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // حذف الترجمة
    const { error } = await supabase
      .from('worker_translations')
      .delete()
      .eq('order_id', orderId)
      .eq('worker_id', workerId)
      .eq('voice_note_id', voiceNoteId)

    if (error) {
      console.error('Error deleting translation:', error)
      return NextResponse.json({ error: 'Failed to delete translation' }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error in DELETE /api/worker-translations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

