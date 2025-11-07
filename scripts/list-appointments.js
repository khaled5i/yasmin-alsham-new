/**
 * Script to list all appointments in Supabase
 * This helps verify appointments are being stored correctly
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

async function listAppointments() {
  try {
    console.log('📋 Fetching all appointments from Supabase...')
    console.log('📍 Supabase URL:', supabaseUrl)
    console.log('')

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .order('appointment_date', { ascending: false })
      .order('appointment_time', { ascending: false })

    if (error) {
      console.error('❌ Error fetching appointments:', error)
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      return
    }

    if (!data || data.length === 0) {
      console.log('📭 No appointments found in database')
      console.log('')
      console.log('💡 To create a test appointment, run:')
      console.log('   node scripts/create-test-appointment.js')
      return
    }

    console.log(`✅ Found ${data.length} appointment(s):\n`)

    data.forEach((apt, index) => {
      console.log(`${index + 1}. Appointment ID: ${apt.id}`)
      console.log(`   Customer: ${apt.customer_name}`)
      console.log(`   Phone: ${apt.customer_phone}`)
      console.log(`   Date: ${apt.appointment_date}`)
      console.log(`   Time: ${apt.appointment_time}`)
      console.log(`   Service: ${apt.service_type}`)
      console.log(`   Status: ${apt.status}`)
      if (apt.notes) {
        console.log(`   Notes: ${apt.notes}`)
      }
      console.log('')
    })

    console.log('📊 Summary:')
    const statusCounts = data.reduce((acc, apt) => {
      acc[apt.status] = (acc[apt.status] || 0) + 1
      return acc
    }, {})
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`   ${status}: ${count}`)
    })

  } catch (error) {
    console.error('❌ Exception:', error)
  }
}

listAppointments()

