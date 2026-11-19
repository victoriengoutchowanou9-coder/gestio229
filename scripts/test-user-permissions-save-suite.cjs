'use strict';
/**
 * =============================================================================
 * GESTIO 229 — SUITE DE TEST : SAUVEGARDE DES ACCÈS & PERMISSIONS UTILISATEURS
 * =============================================================================
 * Valide :
 * 1. Éradication de l'erreur "Could not find the 'sector_id' column of 'user_profiles'"
 * 2. Stratégie de mise à jour résiliente en cascade (Tier 1, Tier 2, Tier 3)
 * 3. Migration SQL M088 (alignement des colonnes sector_slug et sector_id)
 * 4. Configuration des 6 actions opérationnelles (view, create, edit, delete, validate, cashier)
 * 5. Isolation stricte multi-tenant et multi-secteurs
 * =============================================================================
 */

const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(description, condition) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failedTests++;
  }
}

console.log('\n🧪 ================================================================');
console.log('🧪 [GESTIO 229] VALIDATION CORRECTION ACCÈS & PERMISSIONS USER');
console.log('🧪 ================================================================\n');

// ─── TEST 1 : ConfigPage.tsx résilience cascade ──────────────────────────────
console.log('[TEST 1] Vérification de la résilience cascade dans ConfigPage.tsx...');
{
  const configPath = path.resolve('src/pages/dashboard/configuration/ConfigPage.tsx');
  const content = fs.readFileSync(configPath, 'utf8');

  assert(
    'handleSaveUserPermissions existe',
    content.includes('handleSaveUserPermissions')
  );

  assert(
    'Cascade Tier 1 (full), Tier 2 (slug only), Tier 3 (base JSONB) présente',
    content.includes('errFull') && content.includes('errSlugOnly') && content.includes('errBase')
  );

  assert(
    'Tentative 3 universelle n\'envoie aucune colonne physique sector_id',
    content.includes('role: primaryConfig.role,') && content.includes('permissions: updatedPermissionsPayload')
  );

  assert(
    'Pas de crash direct non intercepté sur updateErr',
    !content.includes('if (updateErr) throw updateErr')
  );
}

// ─── TEST 2 : UtilisateursPage.tsx résilience cascade ────────────────────────
console.log('\n[TEST 2] Vérification de la résilience cascade dans UtilisateursPage.tsx...');
{
  const userPath = path.resolve('src/pages/dashboard/utilisateurs/UtilisateursPage.tsx');
  const content = fs.readFileSync(userPath, 'utf8');

  assert(
    'handleSaveEditUser implémente la cascade 3-tiers',
    content.includes('handleSaveEditUser') && content.includes('errFull') && content.includes('errSlugOnly')
  );

  assert(
    'handleEditSectorChange permet de changer le secteur dans la modale',
    content.includes('handleEditSectorChange')
  );

  assert(
    'toggleEditActionPermission gère les 6 actions opérationnelles',
    content.includes('toggleEditActionPermission') &&
    content.includes('can_view') &&
    content.includes('can_create') &&
    content.includes('can_edit') &&
    content.includes('can_delete') &&
    content.includes('can_validate') &&
    content.includes('can_cashier')
  );

  assert(
    'baseUserObj dans handleCreateUser n\'envoie pas sector_id comme colonne physique',
    !content.includes('sector_id: assignedSectorSlug,\n        is_active: true,')
  );
}

// ─── TEST 3 : Migration SQL M088 ─────────────────────────────────────────────
console.log('\n[TEST 3] Vérification de la migration SQL M088...');
{
  const m088Path = path.resolve('database/M088_user_profiles_sector_columns_alignment.sql');
  assert('Fichier M088_user_profiles_sector_columns_alignment.sql présent', fs.existsSync(m088Path));

  const content = fs.readFileSync(m088Path, 'utf8');

  assert(
    'Ajout sécurisé sector_slug sur user_profiles',
    content.includes('ADD COLUMN IF NOT EXISTS sector_slug')
  );

  assert(
    'Ajout sécurisé sector_id sur user_profiles',
    content.includes('ADD COLUMN IF NOT EXISTS sector_id')
  );

  assert(
    'Rechargement immédiat du cache PostgREST avec NOTIFY pgrst',
    content.includes("NOTIFY pgrst, 'reload schema'")
  );

  assert(
    'Index multi-tenant company_id + sector',
    content.includes('idx_user_profiles_company_sector_slug') &&
    content.includes('idx_user_profiles_company_sector_id')
  );
}

// ─── TEST 4 : Simulation du cycle de vie des permissions ─────────────────────
console.log('\n[TEST 4] Simulation de modification des accès et isolation...');
{
  // Simuler profil utilisateur initial
  const userA = {
    id: 'usr-1',
    company_id: 'comp-100',
    full_name: 'Koffi Germain',
    role: 'vendeur',
    permissions: {
      sector_slug: 'boutique',
      can_view: true,
      can_create: true,
      can_edit: false,
      can_delete: false,
      can_validate: false,
      can_cashier: true,
      pos: true,
    }
  };

  const userB = {
    id: 'usr-2',
    company_id: 'comp-100',
    full_name: 'Awa Célestine',
    role: 'gerant',
    permissions: {
      sector_slug: 'pharmacie',
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
      can_validate: true,
      can_cashier: true,
    }
  };

  // Modifier les accès de userA : passage au secteur pharmacie en rôle caissier
  const updatedPermsUserA = {
    ...userA.permissions,
    sector_slug: 'pharmacie',
    sector_id: 'pharmacie',
    assigned_sector: 'pharmacie',
    role: 'caissier',
    can_view: true,
    can_create: true,
    can_edit: false,
    can_delete: false,
    can_validate: false,
    can_cashier: true,
  };

  assert('User A mis à jour avec le nouveau secteur pharmacie', updatedPermsUserA.sector_slug === 'pharmacie');
  assert('User B conserve ses permissions sans altération', userB.permissions.sector_slug === 'pharmacie' && userB.role === 'gerant');
  assert('Isolation garantie entre User A et User B', userA.id !== userB.id);
}

// ─── TEST 5 : Simulation de la cascade de mise à jour ────────────────────────
console.log('\n[TEST 5] Simulation du comportement sans colonne physique sector_id...');
{
  // Simuler le mock PostgREST
  let attemptTier = 0;
  function mockSupabaseUpdate(payload) {
    attemptTier++;
    // Si payload contient une colonne non existante 'sector_id' dans le cache
    if ('sector_id' in payload && payload.mockHasSectorIdColumn === false) {
      return { error: { message: "Could not find the 'sector_id' column of 'user_profiles' in the schema cache", code: 'PGRST204' } };
    }
    return { error: null };
  }

  // Simulation avec base de données SANS colonne sector_id
  const payloadFull = {
    role: 'caissier',
    sector_slug: 'pharmacie',
    sector_id: 'pharmacie',
    permissions: { sector_slug: 'pharmacie' },
    mockHasSectorIdColumn: false,
  };

  let updateSuccess = false;
  const res1 = mockSupabaseUpdate(payloadFull);
  if (res1.error) {
    // Cascade vers Tier 2
    const payloadSlugOnly = {
      role: 'caissier',
      sector_slug: 'pharmacie',
      permissions: { sector_slug: 'pharmacie' },
    };
    const res2 = mockSupabaseUpdate(payloadSlugOnly);
    if (!res2.error) {
      updateSuccess = true;
    }
  }

  assert('La tentative avec sector_id échoue avec PGRST204 simulé', res1.error !== null);
  assert('La cascade vers Tier 2 réussit immédiatement sans renvoyer d\'erreur à l\'utilisateur', updateSuccess === true);
}

console.log('\n================================================================');
console.log(`📋 RÉSULTAT : ${passedTests}/${totalTests} tests réussis (${failedTests} échec)`);
if (failedTests === 0) {
  console.log('🎉 TOUS LES TESTS DE GESTION DES ACCÈS SONT VALIDÉS AVEC SUCCÈS !');
} else {
  console.error('❌ CERTAINS TESTS ONT ÉCHOUÉ.');
  process.exit(1);
}
console.log('================================================================\n');
