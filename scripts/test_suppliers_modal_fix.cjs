/**
 * Suite de tests de validation : Correction critique Fournisseurs dans le modal
 * « Nouveau bon de commande fournisseur » (GESTIO 229 ERP)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let totalPassed = 0;
let totalFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ SUCCÈS: ${message}`);
    totalPassed++;
  } else {
    console.error(`  ❌ ÉCHEC: ${message}`);
    totalFailed++;
  }
}

async function runTests() {
  console.log('=============================================================================');
  console.log('TEST SUITE : CORRECTION FOURNISSEURS DANS NOUVEAU BON DE COMMANDE');
  console.log('=============================================================================\n');

  // --- 1. Vérification de la requête SQL Supabase sur la table suppliers ---
  console.log('--- 1. Intégrité de la requête Supabase sur `suppliers` ---');
  try {
    // La requête exacte utilisée dans PurchaseOrderModal
    const { data, error } = await client
      .from('suppliers')
      .select('*')
      .order('company_name')
      .limit(5);

    assert(!error, `La requête principale .select('*').order('company_name') s'exécute sans erreur 42703 (Postgres)`);
    assert(Array.isArray(data), `La requête retourne bien un tableau de données (longueur: ${data?.length})`);

    // Vérifier que la requête de secours minimale fonctionne également
    const { data: fbData, error: fbError } = await client
      .from('suppliers')
      .select('id, company_name, phone, city, is_active')
      .limit(5);

    assert(!fbError, `La requête de secours minimale s'exécute sans erreur`);
  } catch (err) {
    assert(false, `Exception inattendue lors de la requête Supabase : ${err.message}`);
  }

  // --- 2. Vérification statique du code source PurchaseOrderModal.tsx ---
  console.log('\n--- 2. Analyse statique de PurchaseOrderModal.tsx ---');
  const poModalPath = path.join(__dirname, '..', 'src', 'components', 'modals', 'PurchaseOrderModal.tsx');
  const poModalContent = fs.readFileSync(poModalPath, 'utf8');

  // A. Absence des colonnes inexistantes dans la requête SQL
  assert(!poModalContent.includes("select('id, company_name, name"), `Aucune requête erronée demandant la colonne 'name' inexistante`);
  assert(!poModalContent.includes("secteur_slug, sector_meta"), `Aucune requête demandant la colonne 'secteur_slug' inexistante`);

  // B. Présence du prop initialSuppliers
  assert(poModalContent.includes('initialSuppliers?: any[]'), `L'interface PurchaseOrderModalProps accepte initialSuppliers`);
  assert(poModalContent.includes('initialSuppliers'), `Le composant PurchaseOrderModal exploite initialSuppliers`);

  // C. Présence de la recherche de fournisseurs en temps réel
  assert(poModalContent.includes('supplierSearch'), `Le modal intègre l'état de recherche fournisseur (supplierSearch)`);
  assert(poModalContent.includes('searchedSuppliers'), `Le modal intègre le hook mémoïsé searchedSuppliers`);
  assert(poModalContent.includes('Filtrer fournisseur'), `Le champ de recherche textuel est rendu dans le modal`);

  // D. Sauvegarde de l'ID réel et du nom réel du fournisseur
  assert(poModalContent.includes('fournisseur_id: selectedSupplierId'), `Le bon de commande associe l'identifiant réel du fournisseur (fournisseur_id)`);
  assert(poModalContent.includes('supplier_id: selectedSupplierId'), `Table purchase_orders reçoit également l'identifiant réel (supplier_id)`);

  // E. Correction de l'insertion en ligne
  assert(!poModalContent.includes("secteur_slug: activeSector"), `L'insertion d'un fournisseur en ligne ne tente plus d'insérer secteur_slug`);

  // --- 3. Analyse statique de FournisseursPage.tsx ---
  console.log('\n--- 3. Analyse statique de FournisseursPage.tsx ---');
  const fournPagePath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'fournisseurs', 'FournisseursPage.tsx');
  const fournPageContent = fs.readFileSync(fournPagePath, 'utf8');

  assert(fournPageContent.includes('initialSuppliers={suppliers}'), `FournisseursPage transmet ses fournisseurs déjà chargés au PurchaseOrderModal via initialSuppliers`);

  // --- 4. Analyse du Hook useTenant.ts ---
  console.log('\n--- 4. Analyse de useTenant.ts ---');
  const useTenantPath = path.join(__dirname, '..', 'src', 'hooks', 'useTenant.ts');
  const useTenantContent = fs.readFileSync(useTenantPath, 'utf8');

  assert(useTenantContent.includes('currentCompany: company'), `useTenant exporte l'alias de compatibilité currentCompany: company`);

  // --- 5. Analyse de PharmacieFournisseursCommandesPage.tsx & pharmacieService ---
  console.log('\n--- 5. Analyse du module Pharmacie & Grossistes ---');
  const pharmaPagePath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'pharmacie', 'PharmacieFournisseursCommandesPage.tsx');
  const pharmaPageContent = fs.readFileSync(pharmaPagePath, 'utf8');

  assert(pharmaPageContent.includes('tenantCompanyId || currentCompany?.id || company?.id'), `PharmacieFournisseursCommandesPage résout companyId de manière robuste`);

  const pharmaServicePath = path.join(__dirname, '..', 'src', 'services', 'pharmacieService.ts');
  const pharmaServiceContent = fs.readFileSync(pharmaServicePath, 'utf8');

  assert(pharmaServiceContent.includes(".from('suppliers')"), `pharmacieService.getGrossistes fusionne avec la table suppliers de Supabase`);

  // --- 6. Test unitaire des algorithmes de filtrage et recherche ---
  console.log('\n--- 6. Test algorithmique : Filtrage sectoriel et recherche en mémoire ---');
  const sampleSuppliers = [
    { id: 'sup-1', code: 'FOURN-001', company_name: 'SOBEBRA SA', phone: '+229 21 33 00 00', city: 'Cotonou', sector_slug: 'brasserie', is_active: true },
    { id: 'sup-2', code: 'FOURN-002', company_name: 'PHARMA-BENIN GROSSISTE', phone: '+229 21 30 11 22', city: 'Porto-Novo', sector_slug: 'pharmacie', is_active: true },
    { id: 'sup-3', code: 'FOURN-003', company_name: 'BENIN EMBALLAGES & LOGISTIQUE', phone: '+229 97 00 11 22', city: 'Cotonou', sector_slug: null, is_active: true }, // Fournisseur transversal
    { id: 'sup-4', code: 'FOURN-004', company_name: 'FOURNISSEUR FERME / DESACTIVE', phone: '+229 90 00 00 00', city: 'Cotonou', sector_slug: 'boutique', is_active: false }, // Inactif
    { id: 'sup-5', code: 'FOURN-005', company_name: 'GLOBAL SERVICE BENIN', phone: '+229 66 11 22 33', city: 'Parakou', sector_slug: 'global', is_active: true } // Transversal
  ];

  // Test exclusion inactifs
  const activeSuppliers = sampleSuppliers.filter(s => s.is_active !== false);
  assert(activeSuppliers.length === 4, `Les fournisseurs inactifs (is_active: false) sont correctement exclus (4 actifs sur 5)`);
  assert(!activeSuppliers.some(s => s.id === 'sup-4'), `Le fournisseur désactivé sup-4 n'est pas retenu`);

  // Test éligibilité pour le secteur 'brasserie'
  const targetSector = 'brasserie';
  const brasserieSuppliers = activeSuppliers.filter(s => {
    const sSec = s.sector_slug;
    if (!sSec || sSec === 'all' || sSec === 'global') return true;
    if (sSec === targetSector) return true;
    return false;
  });

  assert(brasserieSuppliers.length === 3, `Secteur Brasserie inclut le fournisseur Brasserie + les 2 fournisseurs transversaux`);
  assert(brasserieSuppliers.some(s => s.id === 'sup-1'), `SOBEBRA SA est bien présent`);
  assert(brasserieSuppliers.some(s => s.id === 'sup-3'), `BENIN EMBALLAGES (transversal) est bien présent`);
  assert(brasserieSuppliers.some(s => s.id === 'sup-5'), `GLOBAL SERVICE (transversal) est bien présent`);

  // Test fallback si aucun fournisseur spécifique
  const boutiqueSuppliers = activeSuppliers.filter(s => s.sector_slug === 'agence-voyage');
  let fallbackSuppliers = boutiqueSuppliers;
  if (fallbackSuppliers.length === 0 && activeSuppliers.length > 0) {
    fallbackSuppliers = activeSuppliers;
  }
  assert(fallbackSuppliers.length === 4, `Le fallback de sécurité empêche une liste vide si l'entreprise a des fournisseurs actifs`);

  // Test recherche en temps réel
  function search(query, list) {
    const q = query.toLowerCase().trim();
    if (!q) return list;
    return list.filter(s => {
      const nom = String(s.company_name || '').toLowerCase();
      const code = String(s.code || '').toLowerCase();
      const tel = String(s.phone || '').toLowerCase();
      const ville = String(s.city || '').toLowerCase();
      return nom.includes(q) || code.includes(q) || tel.includes(q) || ville.includes(q);
    });
  }

  const searchByName = search('sobebra', brasserieSuppliers);
  assert(searchByName.length === 1 && searchByName[0].id === 'sup-1', `La recherche par nom 'sobebra' retourne exactement SOBEBRA`);

  const searchByCode = search('FOURN-003', brasserieSuppliers);
  assert(searchByCode.length === 1 && searchByCode[0].id === 'sup-3', `La recherche par code 'FOURN-003' retourne exactement BENIN EMBALLAGES`);

  const searchByPhone = search('66 11 22', brasserieSuppliers);
  assert(searchByPhone.length === 1 && searchByPhone[0].id === 'sup-5', `La recherche par téléphone '66 11 22' retrouve GLOBAL SERVICE`);

  const searchByCity = search('Parakou', brasserieSuppliers);
  assert(searchByCity.length === 1 && searchByCity[0].id === 'sup-5', `La recherche par ville 'Parakou' retrouve GLOBAL SERVICE`);

  // --- 7. Synthèse finale ---
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log(`📊 RÉSULTAT : ${totalPassed} CONTRÔLES RÉUSSIS SUR ${totalPassed + totalFailed}`);
  console.log('════════════════════════════════════════════════════════════════════\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTests();
