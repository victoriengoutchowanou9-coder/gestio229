// =============================================================================
// GESTIO 229 — SUITE DE TESTS : GESTION DES ENTREPRISES SUPER ADMIN
// Scénarios 1 à 7 exigés dans la spécification
// =============================================================================

import assert from 'node:assert/strict';
import * as crypto from 'crypto';

console.log('======================================================================');
console.log('  GESTIO 229 — TESTS DE VALIDATION GESTION DES ENTREPRISES SUPER ADMIN');
console.log('======================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// ─── Logique extraite de authStore.ts & SectorLoader.ts ──────────────────────
function checkCompanyAccess(company) {
  if (!company) return { allowed: true };
  if (company.subscription_status === 'deleted') {
    return {
      allowed: false,
      error: `L'accès à l'entreprise « ${company.name} » a été désactivé ou supprimé par l'administrateur de la plateforme GESTIO229. Vos données restent conservées en toute sécurité. Veuillez contacter le support.`
    };
  }
  if (company.subscription_status === 'suspended' || company.is_active === false) {
    const motif = company.suspension_reason ? ` (Motif : ${company.suspension_reason})` : '';
    return {
      allowed: false,
      error: `L'accès à l'entreprise « ${company.name} » est actuellement suspendu par le Super Administrateur${motif}. Veuillez contacter l'administrateur de la plateforme pour régulariser votre compte.`
    };
  }
  return { allowed: true };
}

function resolveRoute(company, sectors = [], user = null) {
  if (!company) return { type: 'MULTISERVICES', redirectTo: '/hub' };
  if (
    company.subscription_status === 'suspended' ||
    company.subscription_status === 'deleted' ||
    company.subscription_status === 'expired' ||
    company.is_active === false
  ) {
    return { type: 'SUSPENDED', redirectTo: '/suspended' };
  }
  if (!user || user.role === 'administrateur' || user.role === 'super_admin') {
    return { type: 'MULTISERVICES', redirectTo: '/hub' };
  }
  return { type: 'DIRECT', redirectTo: `/app/${sectors[0] || 'boutique'}` };
}

// ─── Simulation Backend api/admin-subscription.ts ────────────────────────────
const ADMIN_SECRET = 'gestio229_admin_secret_change_in_production';

function generateAdminToken(username = 'Super Admin') {
  const payload = {
    sub: 'super_admin',
    username,
    iat: Date.now(),
    exp: Date.now() + 3600000,
    role: 'super_admin_universel',
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(payloadB64).digest('base64url');
  return `${payloadB64}.${sig}`;
}

function verifyAdminToken(token) {
  try {
    if (!token) return { valid: false };
    const parts = token.split('.');
    if (parts.length !== 2) return { valid: false };
    const [payloadB64, sig] = parts;
    const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(payloadB64).digest('base64url');
    if (sig !== expected) return { valid: false };
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (payload.exp < Date.now()) return { valid: false };
    if (payload.role !== 'super_admin_universel') return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

// ─── Base de Données Simulée Multi-Tenant ────────────────────────────────────
let mockDatabase = {
  companies: [
    {
      id: 'comp-alpha-111',
      name: 'Alpha SARL',
      subscription_status: 'active',
      is_active: true,
      created_at: '2026-09-01T00:00:00.000Z',
      suspension_reason: null,
    },
    {
      id: 'comp-beta-222',
      name: 'Beta Commerce',
      subscription_status: 'active',
      is_active: true,
      created_at: '2026-09-15T00:00:00.000Z',
      suspension_reason: null,
    }
  ],
  sales_orders: [
    { id: 'sale-1', company_id: 'comp-alpha-111', total_amount: 50000 },
    { id: 'sale-2', company_id: 'comp-alpha-111', total_amount: 120000 },
    { id: 'sale-3', company_id: 'comp-beta-222', total_amount: 30000 },
  ],
  products: [
    { id: 'prod-1', company_id: 'comp-alpha-111', name: 'Produit A' },
    { id: 'prod-2', company_id: 'comp-beta-222', name: 'Produit B' },
  ],
  audit_logs: []
};

function executeAdminAction(token, action, companyId, params = {}) {
  const auth = verifyAdminToken(token);
  if (!auth.valid) {
    return { status: 401, body: { success: false, error: 'Non autorisé' } };
  }

  const comp = mockDatabase.companies.find((c) => c.id === companyId);
  if (!comp) {
    return { status: 404, body: { success: false, error: 'Entreprise introuvable' } };
  }

  const prevStatus = comp.subscription_status;

  if (action === 'block' || action === 'suspend') {
    const reason = params.reason || 'Blocage par Super Admin';
    comp.subscription_status = 'suspended';
    comp.is_active = false;
    comp.suspended_at = new Date().toISOString();
    comp.suspension_reason = reason;

    mockDatabase.audit_logs.push({
      action: 'BLOCAGE_ACCES',
      company_id: comp.id,
      company_name: comp.name,
      result: 'success',
      details: { reason, previous_status: prevStatus, new_status: 'suspended' },
      created_at: new Date().toISOString(),
    });

    return { status: 200, body: { success: true, message: `Accès bloqué pour ${comp.name}` } };
  }

  if (action === 'unblock') {
    const reason = params.reason || 'Rétablissement accès';
    comp.subscription_status = 'active';
    comp.is_active = true;
    comp.suspended_at = null;
    comp.suspension_reason = null;

    mockDatabase.audit_logs.push({
      action: 'DEBLOCAGE_ACCES',
      company_id: comp.id,
      company_name: comp.name,
      result: 'success',
      details: { reason, previous_status: prevStatus, new_status: 'active' },
      created_at: new Date().toISOString(),
    });

    return { status: 200, body: { success: true, message: `Accès rétabli pour ${comp.name}` } };
  }

  if (action === 'delete_soft') {
    if (!params.reason || !params.reason.trim()) {
      return { status: 400, body: { success: false, error: 'Motif obligatoire' } };
    }
    const reason = params.reason.trim();
    comp.subscription_status = 'deleted';
    comp.is_active = false;
    comp.suspended_at = new Date().toISOString();
    comp.suspension_reason = `[SUPPRIMÉ] ${reason}`;

    mockDatabase.audit_logs.push({
      action: 'SUPPRESSION_LOGIQUE',
      company_id: comp.id,
      company_name: comp.name,
      result: 'success',
      details: { reason, previous_status: prevStatus, new_status: 'deleted', data_preserved: true },
      created_at: new Date().toISOString(),
    });

    return { status: 200, body: { success: true, message: `Suppression logique de ${comp.name}` } };
  }

  if (action === 'restore') {
    const reason = params.reason || 'Restauration';
    comp.subscription_status = 'active';
    comp.is_active = true;
    comp.suspended_at = null;
    comp.suspension_reason = null;

    mockDatabase.audit_logs.push({
      action: 'RESTAURATION_ENTREPRISE',
      company_id: comp.id,
      company_name: comp.name,
      result: 'success',
      details: { reason, previous_status: prevStatus, new_status: 'active' },
      created_at: new Date().toISOString(),
    });

    return { status: 200, body: { success: true, message: `Restauration de ${comp.name}` } };
  }

  return { status: 400, body: { success: false, error: 'Action non reconnue' } };
}

// =============================================================================
// EXÉCUTION DES 7 SCÉNARIOS
// =============================================================================

// SCÉNARIO 1 : Le Super Admin bloque une entreprise => ses utilisateurs perdent l'accès
runTest('Scénario 1 : Le Super Admin bloque Alpha SARL => l\'accès est immédiatement refusé', () => {
  const adminToken = generateAdminToken();
  const res = executeAdminAction(adminToken, 'block', 'comp-alpha-111', { reason: 'Défaut de paiement' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const compAlpha = mockDatabase.companies.find((c) => c.id === 'comp-alpha-111');
  assert.equal(compAlpha.subscription_status, 'suspended');
  assert.equal(compAlpha.is_active, false);

  // Vérification de sécurité lors du login ou chargement
  const access = checkCompanyAccess(compAlpha);
  assert.equal(access.allowed, false);
  assert.match(access.error, /actuellement suspendu/);
  assert.match(access.error, /Défaut de paiement/);

  // Redirection forcée vers /suspended
  const route = resolveRoute(compAlpha);
  assert.equal(route.redirectTo, '/suspended');
});

// SCÉNARIO 2 : Les autres entreprises continuent à travailler normalement
runTest('Scénario 2 : Beta Commerce continue de fonctionner sans aucun impact', () => {
  const compBeta = mockDatabase.companies.find((c) => c.id === 'comp-beta-222');
  assert.equal(compBeta.subscription_status, 'active');
  assert.equal(compBeta.is_active, true);

  const access = checkCompanyAccess(compBeta);
  assert.equal(access.allowed, true);

  const route = resolveRoute(compBeta);
  assert.equal(route.redirectTo, '/hub');

  // Ses données sont intactes
  const betaSales = mockDatabase.sales_orders.filter((s) => s.company_id === 'comp-beta-222');
  assert.equal(betaSales.length, 1);
  assert.equal(betaSales[0].total_amount, 30000);
});

// SCÉNARIO 3 : Le Super Admin débloque l'entreprise => l'accès est rétabli
runTest('Scénario 3 : Le Super Admin débloque Alpha SARL => l\'accès est rétabli avec succès', () => {
  const adminToken = generateAdminToken();
  const res = executeAdminAction(adminToken, 'unblock', 'comp-alpha-111', { reason: 'Paiement reçu' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const compAlpha = mockDatabase.companies.find((c) => c.id === 'comp-alpha-111');
  assert.equal(compAlpha.subscription_status, 'active');
  assert.equal(compAlpha.is_active, true);
  assert.equal(compAlpha.suspension_reason, null);

  const access = checkCompanyAccess(compAlpha);
  assert.equal(access.allowed, true);

  const route = resolveRoute(compAlpha);
  assert.equal(route.redirectTo, '/hub');
});

// SCÉNARIO 4 : Une entreprise supprimée logiquement ne peut plus accéder à son espace
runTest('Scénario 4 : Suppression logique d\'Alpha SARL => accès bloqué et statut deleted', () => {
  const adminToken = generateAdminToken();
  const res = executeAdminAction(adminToken, 'delete_soft', 'comp-alpha-111', { reason: 'Demande de désinscription client' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const compAlpha = mockDatabase.companies.find((c) => c.id === 'comp-alpha-111');
  assert.equal(compAlpha.subscription_status, 'deleted');
  assert.equal(compAlpha.is_active, false);

  const access = checkCompanyAccess(compAlpha);
  assert.equal(access.allowed, false);
  assert.match(access.error, /désactivé ou supprimé/);

  const route = resolveRoute(compAlpha);
  assert.equal(route.redirectTo, '/suspended');
});

// SCÉNARIO 5 : Données conservées et restauration contrôlée possible
runTest('Scénario 5 : Données préservées à 100% et restauration contrôlée réussie', () => {
  // Vérification que les ventes et produits d'Alpha SARL sont toujours en base
  const alphaSales = mockDatabase.sales_orders.filter((s) => s.company_id === 'comp-alpha-111');
  assert.equal(alphaSales.length, 2, 'Les 2 ventes d\'Alpha doivent être préservées');
  assert.equal(alphaSales[0].total_amount + alphaSales[1].total_amount, 170000);

  const alphaProducts = mockDatabase.products.filter((p) => p.company_id === 'comp-alpha-111');
  assert.equal(alphaProducts.length, 1);

  // Restauration contrôlée par le Super Admin
  const adminToken = generateAdminToken();
  const res = executeAdminAction(adminToken, 'restore', 'comp-alpha-111', { reason: 'Réouverture à la demande du gérant' });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);

  const compAlpha = mockDatabase.companies.find((c) => c.id === 'comp-alpha-111');
  assert.equal(compAlpha.subscription_status, 'active');
  assert.equal(compAlpha.is_active, true);

  const access = checkCompanyAccess(compAlpha);
  assert.equal(access.allowed, true);
});

// SCÉNARIO 6 : Un administrateur ordinaire ne peut ni bloquer ni supprimer d'autres entreprises
runTest('Scénario 6 : Un token non-super-admin ou utilisateur ordinaire est rejeté (401)', () => {
  const invalidToken = 'fake-or-ordinary-user-token';
  const res1 = executeAdminAction(invalidToken, 'block', 'comp-beta-222', { reason: 'Tentative illégale' });
  assert.equal(res1.status, 401);
  assert.equal(res1.body.success, false);

  const res2 = executeAdminAction(null, 'delete_soft', 'comp-beta-222', { reason: 'Sans auth' });
  assert.equal(res2.status, 401);

  // Tentative avec token frauduleux (signature falsifiée)
  const fakeToken = generateAdminToken('Hacker') + 'tampered';
  const res3 = executeAdminAction(fakeToken, 'block', 'comp-beta-222', { reason: 'Hacking' });
  assert.equal(res3.status, 401);

  // Vérifier que Beta Commerce est restée active et intacte
  const compBeta = mockDatabase.companies.find((c) => c.id === 'comp-beta-222');
  assert.equal(compBeta.subscription_status, 'active');
});

// SCÉNARIO 7 : Toutes les opérations sont inscrites dans le journal d'audit
runTest('Scénario 7 : Le journal d\'audit enregistre chaque opération avec entreprise, motif et résultat', () => {
  assert.ok(mockDatabase.audit_logs.length >= 4, 'Toutes les actions doivent être enregistrées');

  const blockLog = mockDatabase.audit_logs.find((l) => l.action === 'BLOCAGE_ACCES');
  assert.ok(blockLog);
  assert.equal(blockLog.company_name, 'Alpha SARL');
  assert.equal(blockLog.result, 'success');
  assert.equal(blockLog.details.reason, 'Défaut de paiement');

  const unblockLog = mockDatabase.audit_logs.find((l) => l.action === 'DEBLOCAGE_ACCES');
  assert.ok(unblockLog);
  assert.equal(unblockLog.result, 'success');

  const softDelLog = mockDatabase.audit_logs.find((l) => l.action === 'SUPPRESSION_LOGIQUE');
  assert.ok(softDelLog);
  assert.equal(softDelLog.details.data_preserved, true);

  const restoreLog = mockDatabase.audit_logs.find((l) => l.action === 'RESTAURATION_ENTREPRISE');
  assert.ok(restoreLog);
  assert.equal(restoreLog.result, 'success');
});

console.log(`\n======================================================================`);
console.log(`  RÉSULTAT GLOBAL : ${passedTests}/${totalTests} TESTS PASSÉS AVEC SUCCÈS !`);
console.log(`======================================================================\n`);
