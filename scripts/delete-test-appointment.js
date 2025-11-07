/**
 * Script to delete a test appointment from Supabase
 * Usage: node scripts/delete-test-appointment.js <appointment-id>
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

async function deleteAppointment(appointmentId) {
  try {
    if (!appointmentId) {
      console.error('❌ Please provide an appointment ID')
      console.log('Usage: node scripts/delete-test-appointment.js <appointment-id>')
      console.log('')
      console.log('To see all appointments, run:')
      console.log('   node scripts/list-appointments.js')
      process.exit(1)
    }

    console.log('🗑️ Deleting appointment:', appointmentId)

    // First, get the appointment details
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .single()

    if (fetchError) {
      console.error('❌ Error fetching appointment:', fetchError.message)
      return
    }

    if (!appointment) {
      console.error('❌ Appointment not found')
      return
    }

    console.log('📋 Appointment details:')
    console.log('   Customer:', appointment.customer_name)
    console.log('   Date:', appointment.appointment_date)
    console.log('   Time:', appointment.appointment_time)
    console.log('')

    // Delete the appointment
    const { error: deleteError } = await supabase
      .from('appointments')
      .delete()
      .eq('id', appointmentId)

    if (deleteError) {
      console.error('❌ Error deleting appointment:', deleteError.message)
      return
    }

    console.log('✅ Appointment deleted successfully!')

  } catch (error) {
    console.error('❌ Exception:', error)
  }
}

const appointmentId = process.argv[2]
deleteAppointment(appointmentId)

