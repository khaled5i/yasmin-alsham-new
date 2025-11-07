/**
 * Script to create a test appointment in Supabase
 * This will help verify that booked time slots show with red border
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Read .env.local file manually
const envPath = path.join(__dirname, '..', '.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')

// Parse environment variables
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.+)$/)
  if (match) {
    envVars[match[1].trim()] = match[2].trim()
  }
})

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase credentials not found in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function createTestAppointment() {
  try {
    console.log('🔧 Creating test appointment...')
    console.log('📍 Supabase URL:', supabaseUrl)

    // Get tomorrow's date
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const appointmentDate = tomorrow.toISOString().split('T')[0]

    // Create test appointment at 5:30 PM (17:30)
    const testAppointment = {
      customer_name: 'اختبار - موعد محجوز',
      customer_phone: '0999999999',
      customer_email: 'test@example.com',
      appointment_date: appointmentDate,
      appointment_time: '17:30',
      service_type: 'consultation',
      status: 'pending',
      notes: 'هذا موعد اختبار لعرض الإطار الأحمر'
    }

    console.log('📅 Test appointment data:', testAppointment)

    const { data, error } = await supabase
      .from('appointments')
      .insert(testAppointment)
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating test appointment:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      return
    }

    console.log('✅ Test appointment created successfully!')
    console.log('📋 Appointment details:')
    console.log('   ID:', data.id)
    console.log('   Date:', data.appointment_date)
    console.log('   Time:', data.appointment_time)
    console.log('   Customer:', data.customer_name)
    console.log('')
    console.log('🎯 Now open http://localhost:3001/book-appointment')
    console.log(`📅 Select date: ${appointmentDate}`)
    console.log('⏰ Time slot 5:30 (17:30) should appear with RED BORDER')
    console.log('')
    console.log('To delete this test appointment, run:')
    console.log(`   node scripts/delete-test-appointment.js ${data.id}`)

  } catch (error) {
    console.error('❌ Exception:', error)
  }
}

createTestAppointment()

