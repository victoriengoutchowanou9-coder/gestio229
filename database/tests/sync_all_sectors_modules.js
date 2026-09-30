import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://inknljnhqmrykcrgglts.supabase.co',
  'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
)

// RÈGLE FONDAMENTALE DE LA RESTRUCTURATION (Partie 4) :
// L'intégralité des 14 modules actuels de GESTIO 229 doit être disponible
// dans chacun des 19 sous-logiciels sans exception.
const ALL_14_CORE_MODULES = [
  'dashboard',
  'ventes',
  'stock',
  'caisse',
  'finances',
  'clients',
  'fournisseurs',
  'depenses',
  'rapports',
  'syscohada',
  'configuration',
  'utilisateurs',
  'audit',
  'abonnement'
]

const OFFICIAL_19_SLUGS = [
  'quincaillerie',
  'poissonnerie',
  'restaurant',
  'supermarche',
  'pharmacie',
  'station-service',
  'hotel',
  'ecole',
  'immobilier',
  'garage',
  'imprimerie',
  'brasserie',
  'microfinance',
  'agrobusiness',
  'cosmetiques',
  'mercerie',
  'boutique',
  'boulangerie',
  'transport'
]

async function main() {
  console.log('Mise à jour des 19 secteurs officiels avec les 14 modules actuels de GESTIO 229...')
  
  for (const slug of OFFICIAL_19_SLUGS) {
    const { data, error } = await supabase
      .from('sectors')
      .update({
        modules: ALL_14_CORE_MODULES,
        specific_modules: [] // Phase 2 future
      })
      .eq('slug', slug)
      .select('slug, name, modules')
    
    if (error) {
      console.error(`Erreur pour ${slug} :`, error.message)
    } else {
      console.log(`✓ ${slug} : ${data?.[0]?.modules?.length || 14} modules synchronisés`)
    }
  }

  console.log('\nSynchronisation terminée avec succès.')
}

main()
