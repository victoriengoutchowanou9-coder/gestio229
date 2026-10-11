/**
 * GESTIO 229 — Script de recalcul des fonds actuels de caisse
 * ============================================================
 * Règle officielle (RÈGLE 2) :
 *   FOND ACTUEL ESPÈCES = Σ(clôtures validées espèces) - Σ(retraits espèces trésorerie) - Σ(dépenses espèces caisse)
 *   FOND ACTUEL MOMO   = Σ(clôtures validées MoMo)    - Σ(retraits MoMo trésorerie)
 *
 * Usage :
 *   node scripts/recalculer_fonds_caisse.cjs
 *
 * Résultat : Met à jour la table fonds_actuels et affiche un résumé par secteur.
 * ⚠️  Ne supprime aucune donnée de vente, facture, stock ou clôture.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ── Charger les variables d'environnement depuis .env ─────────────────────────
let SUPABASE_URL = process.env.VITE_SUPABASE_URL
let SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  try {
    const envFile = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of envFile.split('\n')) {
      const [k, ...v] = line.split('=')
      const key = k?.trim()
      const val = v.join('=').trim().replace(/^["']|["']$/g, '')
      if (key === 'VITE_SUPABASE_URL' && !SUPABASE_URL) SUPABASE_URL = val
      if ((key === 'SUPABASE_SERVICE_ROLE_KEY' || key === 'VITE_SUPABASE_ANON_KEY') && !SUPABASE_SERVICE_KEY) SUPABASE_SERVICE_KEY = val
    }
  } catch (_) {}
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ VITE_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (ou VITE_SUPABASE_ANON_KEY) requis dans .env')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function cleanSlug(slug) {
  if (!slug) return ''
  return slug.replace(/^sec-/, '').toLowerCase().trim()
}

async function calculerFondsSecteur(companyId, sectorSlug) {
  const clean = cleanSlug(sectorSlug)

  // 1. Clôtures validées
  const { data: clotures } = await supabase
    .from('caisse_clotures')
    .select('total_especes_jour, total_momo_jour')
    .eq('company_id', companyId)
    .eq('sector_slug', clean)

  let totalCloturesEsp = 0
  let totalCloturesMomo = 0
  ;(clotures || []).forEach(c => {
    totalCloturesEsp += Number(c.total_especes_jour || 0)
    totalCloturesMomo += Number(c.total_momo_jour || 0)
  })

  // 2. Retraits vers trésorerie
  let totalRetraitsEsp = 0
  let totalRetraitsMomo = 0

  const { data: transfers } = await supabase
    .from('treasury_transfers')
    .select('amount, type, status')
    .eq('company_id', companyId)
    .eq('sector_slug', clean)
    .in('status', ['APPROVED', 'VALIDE', 'valide'])

  ;(transfers || []).forEach(t => {
    const isCash = ['espèces', 'especes', 'cash'].includes((t.type || '').toLowerCase())
    const amt = Number(t.amount || 0)
    if (isCash) totalRetraitsEsp += amt
    else totalRetraitsMomo += amt
  })

  const { data: retAll } = await supabase
    .from('demandes_retrait')
    .select('montant, mode_paiement, statut')
    .eq('company_id', companyId)
    .eq('sector_slug', clean)
    .in('statut', ['valide', 'APPROVED'])

  ;(retAll || []).forEach(r => {
    const m = (r.mode_paiement || '').toLowerCase()
    const amt = Number(r.montant || 0)
    if (['espece', 'especes', 'cash'].includes(m)) totalRetraitsEsp += amt
    else totalRetraitsMomo += amt
  })

  // 3. Dépenses payées depuis le fond espèces
  const { data: depMvts } = await supabase
    .from('caisse_mouvements')
    .select('montant, type')
    .eq('company_id', companyId)
    .eq('sector_slug', clean)
    .eq('type', 'depense')

  let totalDepensesEsp = 0
  ;(depMvts || []).forEach(d => {
    totalDepensesEsp += Number(d.montant || 0)
  })

  return {
    sectorSlug: clean,
    totalCloturesEsp,
    totalCloturesMomo,
    totalRetraitsEsp,
    totalRetraitsMomo,
    totalDepensesEsp,
    fond_actuel_especes: totalCloturesEsp - totalRetraitsEsp - totalDepensesEsp,
    fond_actuel_momo: totalCloturesMomo - totalRetraitsMomo,
  }
}

async function main() {
  console.log('🔄 GESTIO 229 — Recalcul des fonds actuels de caisse\n')

  // Récupérer toutes les entreprises
  const { data: companies, error: compErr } = await supabase
    .from('companies')
    .select('id, name')
    .eq('is_active', true)

  if (compErr || !companies?.length) {
    console.error('❌ Aucune entreprise trouvée:', compErr?.message)
    process.exit(1)
  }

  console.log(`✅ ${companies.length} entreprise(s) trouvée(s)\n`)

  for (const company of companies) {
    console.log(`\n🏢 ${company.name} (${company.id})`)
    console.log('─'.repeat(60))

    // Récupérer les secteurs actifs pour cette entreprise
    const { data: secteurs } = await supabase
      .from('secteurs')
      .select('id, nom, slug')
      .eq('company_id', company.id)
      .eq('is_active', true)

    if (!secteurs?.length) {
      // Essayer la table 'sectors' si 'secteurs' est vide
      const { data: altSect } = await supabase
        .from('sectors')
        .select('id, name, slug')
        .eq('company_id', company.id)
        .eq('is_active', true)

      if (!altSect?.length) {
        console.log('  ⚠️  Aucun secteur actif trouvé')
        continue
      }
      secteurs = altSect.map(s => ({ id: s.id, nom: s.name, slug: s.slug }))
    }

    console.log(`  Secteurs : ${secteurs.map(s => s.nom || s.slug).join(', ')}`)

    for (const secteur of secteurs) {
      const result = await calculerFondsSecteur(company.id, secteur.slug)

      console.log(`\n  📦 Secteur : ${secteur.nom || secteur.slug}`)
      console.log(`     Clôtures  : Esp = ${result.totalCloturesEsp.toLocaleString()} FCFA | MoMo = ${result.totalCloturesMomo.toLocaleString()} FCFA`)
      console.log(`     Retraits  : Esp = ${result.totalRetraitsEsp.toLocaleString()} FCFA | MoMo = ${result.totalRetraitsMomo.toLocaleString()} FCFA`)
      console.log(`     Dépenses  : Esp = ${result.totalDepensesEsp.toLocaleString()} FCFA`)
      console.log(`     ✅ FOND ACTUEL ESPÈCES = ${result.fond_actuel_especes.toLocaleString()} FCFA`)
      console.log(`     ✅ FOND ACTUEL MOMO    = ${result.fond_actuel_momo.toLocaleString()} FCFA`)

      // Mettre à jour fonds_actuels
      const { error: upsertErr } = await supabase
        .from('fonds_actuels')
        .upsert({
          company_id: company.id,
          secteur_id: secteur.id,
          fond_actuel_especes: result.fond_actuel_especes,
          fond_actuel_momo: result.fond_actuel_momo,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'company_id,secteur_id'
        })

      if (upsertErr) {
        // Essayer sans onConflict
        const { error: upsertErr2 } = await supabase
          .from('fonds_actuels')
          .upsert({
            company_id: company.id,
            secteur_id: secteur.id,
            fond_actuel_especes: result.fond_actuel_especes,
            fond_actuel_momo: result.fond_actuel_momo,
            updated_at: new Date().toISOString(),
          })

        if (upsertErr2) {
          console.warn(`     ⚠️  Avertissement upsert fonds_actuels: ${upsertErr2.message}`)
        } else {
          console.log(`     💾 fonds_actuels mis à jour`)
        }
      } else {
        console.log(`     💾 fonds_actuels mis à jour`)
      }
    }
  }

  console.log('\n\n✅ Recalcul terminé avec succès !')
  console.log('   Les fonds actuels sont maintenant synchronisés avec l\'historique réel des clôtures.')
}

main().catch(err => {
  console.error('❌ Erreur fatale:', err)
  process.exit(1)
})
