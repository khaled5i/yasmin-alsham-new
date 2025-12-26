/**
 * Script to apply the categories RLS fix and ready designs data migration
 * Run with: node apply-categories-fix.js
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
  console.log('🔄 Applying migration: 09-fix-categories-rls-and-add-ready-designs.sql')

  // Read the migration file
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', '09-fix-categories-rls-and-add-ready-designs.sql')
  const sql = fs.readFileSync(migrationPath, 'utf-8')

  console.log('📄 Migration will:')
  console.log('  1. Update RLS policies to include accountants')
  console.log('  2. Add default categories for ready_designs branch')
  console.log('  3. Add default categories for tailoring branch')
  console.log('\n⏳ Executing migration...\n')

  try {
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

    if (error) {
      // If exec_sql doesn't exist, we need to use the SQL editor approach
      console.log('⚠️  Direct SQL execution not available.')
      console.log('\n📝 Please apply the migration manually using one of these methods:\n')
      console.log('Method 1: Supabase Dashboard SQL Editor')
      console.log('1. Go to: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new')
      console.log('2. Copy and paste the SQL from:')
      console.log('   supabase/migrations/09-fix-categories-rls-and-add-ready-designs.sql')
      console.log('3. Click "Run" to execute the migration')
      console.log('\nMethod 2: Copy SQL directly')
      console.log('\n' + '='.repeat(80))
      console.log(sql)
      console.log('='.repeat(80) + '\n')

      return
    }

    console.log('✅ Migration applied successfully!')
    console.log('✅ RLS policies updated to include accountants')
    console.log('✅ Default categories added for ready_designs')
    console.log('✅ Default categories added for tailoring')
    console.log('\n🔄 Please restart your Next.js development server for changes to take effect.')

  } catch (err) {
    console.error('❌ Error applying migration:', err.message)
    console.log('\n📝 Please apply the migration manually using Supabase Dashboard SQL Editor')
    console.log('Copy SQL from: supabase/migrations/09-fix-categories-rls-and-add-ready-designs.sql')
  }
}

applyMigration()
