/**
 * Script to apply the quantity_meters migration
 * Run with: node apply-migration.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applyMigration() {
  console.log('🔄 Applying migration: add_quantity_meters_to_income.sql')

  // Read the migration file
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', 'add_quantity_meters_to_income.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  console.log('📄 Migration SQL:')
  console.log(sql)
  console.log('\n⏳ Executing migration...\n')

  try {
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

    if (error) {
      // If exec_sql doesn't exist, we need to use the SQL editor approach
      console.log('⚠️  Direct SQL execution not available.')
      console.log('\n📝 Please apply the migration manually using one of these methods:\n')
      console.log('Method 1: Supabase Dashboard SQL Editor')
      console.log('1. Go to: https://supabase.com/dashboard/project/qbbijtyrikhybgszzbjz/sql/new')
      console.log('2. Copy and paste the following SQL:')
      console.log('\n' + '='.repeat(80))
      console.log(sql)
      console.log('='.repeat(80) + '\n')
      console.log('3. Click "Run" to execute the migration')
      console.log('\nMethod 2: Use psql command line')
      console.log(`psql "${supabaseUrl.replace('https://', 'postgresql://postgres:[YOUR-PASSWORD]@')
        .replace('.supabase.co', '.supabase.co:5432/postgres')}" -f supabase/migrations/add_quantity_meters_to_income.sql`)

      return
    }

    console.log('✅ Migration applied successfully!')
    console.log('✅ Column "quantity_meters" has been added to the income table')
    console.log('\n🔄 Please restart your Next.js development server for changes to take effect.')

  } catch (err) {
    console.error('❌ Error applying migration:', err.message)
    console.log('\n📝 Please apply the migration manually using Supabase Dashboard SQL Editor:')
    console.log('1. Go to: https://supabase.com/dashboard/project/qbbijtyrikhybgszzbjz/sql/new')
    console.log('2. Copy and paste the SQL from: supabase/migrations/add_quantity_meters_to_income.sql')
    console.log('3. Click "Run"')
  }
}

applyMigration()
