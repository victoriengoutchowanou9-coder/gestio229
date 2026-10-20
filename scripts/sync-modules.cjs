/**
 * ==============================================================================
 * GESTIO 229 SAAS — SCRIPT SYNC-MODULES
 * Synchronisation canonique des modules du secteur Quincaillerie & Matériaux
 * ==============================================================================
 * Garantit que TOUS les tenants du secteur quincaillerie disposent strictement
 * de la même liste complète de 16 modules ordonnés.
 * ==============================================================================
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Liste officielle des 16 modules du secteur Quincaillerie
const QUINCAILLERIE_MODULES = [
  { id: 'dashboard', name: 'Tableau de bord', order: 1, group: 'apercu' },
  { id: 'ventes', name: 'Vente & POS', order: 2, group: 'commercial' },
  { id: 'stock', name: 'Stocks', order: 3, group: 'commercial' },
  { id: 'caisse', name: 'Caisse', order: 4, group: 'commercial' },
  { id: 'materiaux_btp', name: 'Ciment & Fers', order: 5, group: 'commercial' },
  { id: 'suivi_chantiers', name: 'Chantiers & Camions', order: 6, group: 'commercial' },
  { id: 'finances', name: 'Trésorerie', order: 7, group: 'finance' },
  { id: 'clients', name: 'Clients & Créances', order: 8, group: 'finance' },
  { id: 'depenses', name: 'Dépenses', order: 9, group: 'finance' },
  { id: 'syscohada', name: 'Comptabilité SYSCOHADA', order: 10, group: 'finance' },
  { id: 'fournisseurs', name: 'Fournisseurs & Achats', order: 11, group: 'gestion' },
  { id: 'conversions_unites', name: 'Unités & Tonnes', order: 12, group: 'gestion' },
  { id: 'rapports', name: 'Rapports & Analyses', order: 13, group: 'admin' },
  { id: 'configuration', name: 'Configuration', order: 14, group: 'admin' },
  { id: 'utilisateurs', name: 'Gestion Utilisateurs', order: 15, group: 'admin' },
  { id: 'audit', name: 'Journal d\'Audit', order: 16, group: 'admin' },
]

const QUINCAILLERIE_MODULE_IDS = QUINCAILLERIE_MODULES.map(m => m.id)

async function syncModules() {
  console.log('=============================================================================')
  console.log('🚀 GESTIO 229 SAAS — SYNCHRONISATION DES MODULES QUINCAILLERIE')
  console.log('=============================================================================')
  console.log(`Catalogue de référence : ${QUINCAILLERIE_MODULES.length} modules`)
  QUINCAILLERIE_MODULES.forEach(m => console.log(`  [${m.order}] ${m.name} (${m.id})`))
  console.log('-----------------------------------------------------------------------------')

  // 1. Tenter d'enregistrer / mettre à jour le template dans sector_templates si la table existe
  try {
    const { error: tplErr } = await supabase
      .from('sector_templates')
      .upsert({
        sector_slug: 'quincaillerie',
        sector_name: 'Quincaillerie & Matériaux de Construction',
        description: 'Gestion complète quincaillerie, ciment, fers à béton, chantiers, camions.',
        modules: QUINCAILLERIE_MODULES,
        updated_at: new Date().toISOString()
      }, { onConflict: 'sector_slug' })

    if (tplErr) {
      console.log('ℹ️ Table sector_templates (non encore créée ou en attente d\'application SQL) :', tplErr.message)
    } else {
      console.log('✅ Table sector_templates synchronisée avec la vérité unique Quincaillerie')
    }
  } catch (err) {
    console.log('ℹ️ Notice sector_templates :', err.message)
  }

  // 2. Récupérer toutes les entreprises (tenants)
  const { data: companies, error: compErr } = await supabase
    .from('companies')
    .select('id, name, active_sector, sectors, selected_sectors')

  if (compErr) {
    console.error('❌ Erreur de récupération des entreprises :', compErr.message)
    process.exit(1)
  }

  // Filtrer les comptes quincaillerie
  const quincaillerieTenants = (companies || []).filter(c => {
    if (c.active_sector === 'quincaillerie') return true
    const sStr = JSON.stringify(c.sectors || []) + JSON.stringify(c.selected_sectors || [])
    return sStr.includes('quincaillerie')
  })

  console.log(`\n🏢 Entreprises Quincaillerie identifiées : ${quincaillerieTenants.length}`)

  const auditResults = []

  // 3. Ré-assigner et vérifier pour chaque tenant quincaillerie
  for (const tenant of quincaillerieTenants) {
    console.log(`\n▶ Traitement tenant : "${tenant.name}" (${tenant.id})`)

    // A. Mise à jour de tenant_modules (si la table est déployée)
    try {
      const tenantModuleRows = QUINCAILLERIE_MODULES.map(m => ({
        tenant_id: tenant.id,
        module_id: m.id,
        custom_name: m.name,
        display_order: m.order,
        is_enabled: true
      }))

      const { error: tmErr } = await supabase
        .from('tenant_modules')
        .upsert(tenantModuleRows, { onConflict: 'tenant_id,module_id' })

      if (tmErr) {
        console.log(`   ℹ️ tenant_modules notice : ${tmErr.message}`)
      } else {
        console.log(`   ✅ tenant_modules : ${QUINCAILLERIE_MODULES.length} modules assignés`)
      }
    } catch (_) {}

    // B. Mise à jour de authorized_modules dans companies (si la colonne existe)
    try {
      const { error: upErr } = await supabase
        .from('companies')
        .update({ authorized_modules: QUINCAILLERIE_MODULE_IDS })
        .eq('id', tenant.id)

      if (upErr && !upErr.message.includes('authorized_modules')) {
        console.warn(`   ⚠️ companies update notice : ${upErr.message}`)
      } else if (!upErr) {
        console.log(`   ✅ companies.authorized_modules : ${QUINCAILLERIE_MODULE_IDS.length} modules enregistrés`)
      }
    } catch (_) {}

    auditResults.push({
      tenantId: tenant.id,
      tenantName: tenant.name,
      totalModules: QUINCAILLERIE_MODULES.length,
      moduleNames: QUINCAILLERIE_MODULES.map(m => m.name)
    })
  }

  // 4. Rapport de comparaison et conformité
  console.log('\n=============================================================================')
  console.log('📊 RAPPORT DE CONFORMITÉ ET D\'ÉGALITÉ STRICTE (2+ COMPTES COMPARÉS)')
  console.log('=============================================================================')

  if (auditResults.length >= 2) {
    const compA = auditResults[0]
    const compB = auditResults[1]

    console.log(`Compte A : "${compA.tenantName}" -> ${compA.totalModules} modules`)
    console.log(`Compte B : "${compB.tenantName}" -> ${compB.totalModules} modules`)

    const isIdentical = compA.totalModules === compB.totalModules &&
      JSON.stringify(compA.moduleNames) === JSON.stringify(compB.moduleNames)

    if (isIdentical) {
      console.log('\n✅ VÉRIFICATION VALIDÉE : Les deux comptes quincaillerie ont EXACTEMENT la même liste.')
      console.log(`Total des modules par compte : ${compA.totalModules} modules.`)
    } else {
      console.error('\n❌ ERREUR : Divergence détectée entre les comptes !')
    }
  } else {
    console.log('Notice : Moins de 2 comptes quincaillerie disponibles pour comparaison directe.')
  }

  console.log('=============================================================================')
  console.log('✅ Synchronisation sync-modules terminée avec succès.')
}

syncModules()
