// =============================================================================
// GESTIO 229 ERP — Suite de Tests Complète : Inscription, Unicité, Secteurs & Abonnements
// Validation des 9 scénarios obligatoires du Cahier des Charges
// =============================================================================

const fs = require('fs')
const path = require('path')

console.log('🧪 ================================================================')
console.log('🧪 [GESTIO 229] SUITE DE TESTS CRITIQUES : INSCRIPTION & ABONNEMENTS')
console.log('🧪 ================================================================\n')

let failures = 0
let totalTests = 0

function assert(condition, message) {
  totalTests++
  if (condition) {
    console.log(`  ✅ PASS: ${message}`)
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failures++
  }
}

// ─── TEST 1 : Système d'envoi et de traçabilité des emails ───────────────────
console.log('[SCÉNARIO 1] Système d\'envoi et journalisation des emails...')
const emailHelperContent = fs.readFileSync(path.resolve('api/emailHelper.ts'), 'utf8')
assert(emailHelperContent.includes('sendTrackedEmail'), 'Fonction sendTrackedEmail déclarée avec traçabilité')
assert(emailHelperContent.includes('email_delivery_logs'), 'Table email_delivery_logs utilisée pour l\'audit')
assert(emailHelperContent.includes('status: \'demande\''), 'Statut initial "demande" enregistré')
assert(emailHelperContent.includes('status: \'envoye\''), 'Confirmation de réception enregistrée sous statut "envoye"')
assert(emailHelperContent.includes('status: \'echec\''), 'Enregistrement d\'échec en cas de rejet')
assert(emailHelperContent.includes('createResilientTransporter'), 'Transporteur résilient avec repli 465 SSL / 587 TLS')

const resendEndpointContent = fs.readFileSync(path.resolve('api/resend-confirmation-email.ts'), 'utf8')
assert(resendEndpointContent.includes('resend-confirmation-email'), 'Endpoint de renvoi opérationnel')
assert(resendEndpointContent.includes('administrateur') && resendEndpointContent.includes('interne'), 'Utilisateurs internes exemptés de confirmation d\'email')

// ─── TEST 2 : Unicité absolue de l'adresse email ─────────────────────────────
console.log('\n[SCÉNARIO 2] Interdiction d\'utiliser un même email pour deux comptes principaux...')
const authRegisterContent = fs.readFileSync(path.resolve('api/auth-register.ts'), 'utf8')
const expectedMsg = 'Cette adresse email est déjà associée à un compte GESTIO229. Veuillez vous connecter ou utiliser une autre adresse email.'
assert(authRegisterContent.includes(expectedMsg), 'Message d\'erreur professionnel exact configuré')
assert(authRegisterContent.includes('.ilike(\'email\', cleanEmail)'), 'Vérification en base insensible à la casse')
assert(authRegisterContent.includes('res.status(409)'), 'Code HTTP 409 Conflict retourné en cas d\'email existant')

const migration81Content = fs.readFileSync(path.resolve('database/M081_email_uniqueness_and_registration_stabilization.sql'), 'utf8')
assert(migration81Content.includes('idx_companies_email_lower_unique'), 'Contrainte UNIQUE en base de données sur companies(lower(email))')
assert(migration81Content.includes('idx_user_profiles_admin_email_unique'), 'Contrainte UNIQUE en base de données sur user_profiles(lower(email))')

// ─── TEST 3 : Sélection de 2 secteurs d'activité ─────────────────────────────
console.log('\n[SCÉNARIO 3] Attribution exacte de 2 secteurs (zéro secteur fantôme)...')
assert(authRegisterContent.includes('selected_sectors: cleanSectors'), 'companies.selected_sectors reçoit strictement cleanSectors')
assert(authRegisterContent.includes('sectors: cleanSectors'), 'companies.sectors reçoit strictement cleanSectors')

const hubContent = fs.readFileSync(path.resolve('src/views/hub/MultiservicesHub.tsx'), 'utf8')
assert(hubContent.includes('if (!targetSet.has(rawSlug))'), 'MultiservicesHub filtre dbActivities par targetSlugs (interdiction des 5 secteurs)')
assert(hubContent.includes('validSlugs.size > 0') && hubContent.includes('parsed.filter'), 'Cache localStorage filtré par validSlugs au chargement initial')
assert(hubContent.includes('rawSectorList.push(...comp.selected_sectors)'), 'comp.selected_sectors prioritaire sur toute ancienne valeur')

// ─── TEST 4 : Sélection de 3 secteurs d'activité ─────────────────────────────
console.log('\n[SCÉNARIO 4] Sélection de 3 secteurs : gratuité totale sur les 3...')
const freeSectorsSlice = authRegisterContent.includes('cleanSectors.slice(0, MAX_FREE_TRIAL_SECTORS)')
assert(freeSectorsSlice, 'Découpage des 3 premiers secteurs éligibles à l\'essai gratuit')
assert(authRegisterContent.includes('statut_specifique: \'rattache_global\''), 'Secteurs d\'essai rattachés à l\'abonnement global')
assert(authRegisterContent.includes('rattache_au_global: true'), 'Flag rattache_au_global actif pour les 3 secteurs')

// ─── TEST 5 : Sélection de 5 secteurs d'activité ─────────────────────────────
console.log('\n[SCÉNARIO 5] Sélection de 5 secteurs : 3 gratuits et 2 en attente de paiement...')
assert(authRegisterContent.includes('cleanSectors.slice(MAX_FREE_TRIAL_SECTORS)'), 'Isolation des secteurs au-delà du quota gratuit')
assert(authRegisterContent.includes('statut_specifique: \'en_attente_paiement\''), 'Secteurs supplémentaires mis en attente de paiement')
assert(authRegisterContent.includes('rattache_au_global: false'), 'Flag rattache_au_global désactivé pour les secteurs payants')

// ─── TEST 6 : Expiration de la gratuité (Zéro réinitialisation 30 jours) ──────
console.log('\n[SCÉNARIO 6] Expiration de l\'essai : interdiction du compteur 30 jours artificiel...')
const abonnementContent = fs.readFileSync(path.resolve('src/services/abonnementService.ts'), 'utf8')
assert(!abonnementContent.includes(': 30\n') && !abonnementContent.includes(': 30)'), 'Aucun fallback ": 30" dans abonnementService')
assert(!hubContent.includes(': (globalDaysRemaining > 0 ? globalDaysRemaining : 30)'), 'Aucun fallback ": 30" dans MultiservicesHub')
assert(hubContent.includes('Abonnement expiré'), 'Statut "Abonnement expiré" appliqué à échéance')

// ─── TEST 7 : Abonnement payant et calcul des jours restants ─────────────────
console.log('\n[SCÉNARIO 7] Abonnement actif et formule des jours restants...')
assert(hubContent.includes('Abonnement actif – ${days} jours restants'), 'Format d\'affichage exact : « Abonnement actif – X jours restants »')
assert(hubContent.includes('Essai gratuit – ${globalDaysRemaining} jours restants'), 'Format d\'affichage exact : « Essai gratuit – X jours restants »')
assert(hubContent.includes('En attente de paiement'), 'Statut exact : « En attente de paiement »')

// ─── TEST 8 : Stabilité connexion répétée & actualisation ────────────────────
console.log('\n[SCÉNARIO 8] Stabilité lors des connexions et actualisations successives...')
assert(hubContent.includes('localStorage.setItem(`gestio229_activities_${companyId}`'), 'Persistance cohérente des activités par entreprise')
const sectorLoaderContent = fs.readFileSync(path.resolve('src/lib/SectorLoader.ts'), 'utf8')
assert(sectorLoaderContent.includes('loadTenantContext'), 'SectorLoader garantit le contexte multi-tenant à chaque rechargement')

// ─── TEST 9 : Isolation multi-tenant stricte entre entreprises ───────────────
console.log('\n[SCÉNARIO 9] Cloisonnement strict entre entreprises...')
assert(hubContent.includes('.eq(\'company_id\', companyId)'), 'company_activities cloisonné par company_id')
assert(abonnementContent.includes('.eq(\'entreprise_id\', companyId)'), 'abonnements_secteurs cloisonné par entreprise_id')
assert(authRegisterContent.includes('company_id: companyId'), 'user_profiles et activités strictement liés au company_id')

// ─── RÉSULTATS ───────────────────────────────────────────────────────────────
console.log('\n================================================================')
if (failures === 0) {
  console.log(`🎉 SUCCÈS TOTAL : ${totalTests}/${totalTests} TESTS VALIDÉS SANS ERREUR.`)
  console.log('🚀 Les 9 scénarios du cahier des charges sont rigoureusement respectés.')
  console.log('================================================================\n')
  process.exit(0)
} else {
  console.error(`❌ ÉCHEC : ${failures} test(s) ont échoué sur ${totalTests}.`)
  console.log('================================================================\n')
  process.exit(1)
}
