import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://inknljnhqmrykcrgglts.supabase.co',
  'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
)

async function main() {
  const { data, error } = await supabase.from('sectors').select('slug, name, modules, specific_modules')
  if (error) {
    console.error('Error fetching sectors:', error)
    return
  }
  console.log(`Nombre total de secteurs trouvés : ${data.length}`)
  data.forEach((s) => {
    console.log(`- ${s.slug.padEnd(20)} (${s.name}) : ${s.modules?.length || 0} modules communs`)
  })
}

main()
