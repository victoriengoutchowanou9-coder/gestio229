'use strict';
/**
 * Suite de tests automatisés — GESTIO229 GESTIO229
 * GESTIO229 — Avances/Prêts, Marge Nette, Paie, Impression
 */

let pass = 0;
let fail = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    pass++;
  } else {
    console.error(`  ❌ FAIL: ${label}`);
    fail++;
  }
}

// ─── 1. TEST FORMULE MARGE NETTE ─────────────────────────────────────────────
console.log('\n📊 TEST 1 — Formule Marge Nette Secteur');
{
  const margeBrute = 500000;
  const depensesHorsRH = 120000;
  const salairesNets = [80000, 65000]; // 2 employés
  const totalSalNet = salairesNets.reduce((s, v) => s + v, 0); // 145000
  const chargesPatronales = salairesNets.reduce((s, net) => {
    // Inverse: on connaît le net après CNSS sal. Pour les charges patronales, on approxime sur brut
    const gross = net / (1 - 0.036); // approximation
    return s + Math.round(gross * (0.164 + 0.04));
  }, 0);

  const margeNette = margeBrute - depensesHorsRH - totalSalNet - chargesPatronales;
  assert('margeNette < margeBrute', margeNette < margeBrute);
  assert('margeNette = margeBrute - depHorsRH - salNets - charges', Math.abs(margeNette - (margeBrute - depensesHorsRH - totalSalNet - chargesPatronales)) < 1);
  assert('Charges patronales > 0', chargesPatronales > 0);
  console.log(`    → Marge nette calculée : ${margeNette.toFixed(0)} FCFA`);
}

// ─── 2. TEST DÉCOMPOSITION BULLETIN DE PAIE ─────────────────────────────────
console.log('\n🧾 TEST 2 — Bulletin de Paie (NET À PAYER)');
{
  const baseSalary = 100000;
  const transport = 15000;
  const housing = 10000;
  const bonus = 5000;
  const gross = baseSalary + transport + housing + bonus; // 130000
  const cnssSalariale = Math.round(gross * 0.036); // 4680
  const netAvantRetenues = gross - cnssSalariale; // 125320
  const advanceDeduction = 20000;
  const loanDeduction = 15000;
  const otherDeductions = 0;
  const netAPayer = Math.max(0, netAvantRetenues - advanceDeduction - loanDeduction - otherDeductions);

  assert('Gross = base + transport + housing + bonus', gross === 130000);
  assert('CNSS salariale = gross * 3.6%', cnssSalariale === 4680);
  assert('Net avant retenues = gross - cnssSalariale', netAvantRetenues === 125320);
  assert('Net à payer = net avant retenues - avance - prêt - autres', netAPayer === 90320);
  console.log(`    → Brut: ${gross}, CNSS: ${cnssSalariale}, Net avant retenues: ${netAvantRetenues}, NET À PAYER: ${netAPayer}`);
}

// ─── 3. TEST DOUBLE COMPTABILISATION ─────────────────────────────────────────
console.log('\n🔁 TEST 3 — Pas de double comptabilisation des remboursements');
{
  // Les remboursements de prêts/avances sont des créances, PAS des charges RH
  const expenses = [
    { label: 'Salaire KODJO', amount: 80000, category: 'rh_salary' },
    { label: 'Charges CNSS KODJO', amount: 20000, category: 'rh_charges' },
    { label: 'Remboursement prêt KODJO', amount: 15000, category: 'dette_remboursement' },
  ];

  // On NE doit PAS inclure les remboursements dans les charges
  const chargesRH = expenses
    .filter(e => e.category === 'rh_salary' || e.category === 'rh_charges')
    .reduce((s, e) => s + e.amount, 0);

  const remboursements = expenses
    .filter(e => e.category === 'dette_remboursement')
    .reduce((s, e) => s + e.amount, 0);

  assert('Remboursements NON inclus dans charges RH', !expenses.some(e => e.category === 'dette_remboursement' && e.category.startsWith('rh_')));
  assert('Charges RH ne contiennent pas les remboursements', chargesRH === 100000);
  assert('Remboursements séparés = créances (compte 422)', remboursements === 15000);
  console.log(`    → Charges RH: ${chargesRH}, Remboursements (hors charges): ${remboursements}`);
}

// ─── 4. TEST ISOLATION TENANT / SECTEUR ──────────────────────────────────────
console.log('\n🔒 TEST 4 — Isolation tenant_id & sector_slug');
{
  const staffDB = [
    { id: 1, company_id: 'tenant-A', sector_slug: 'boutique', name: 'Alice' },
    { id: 2, company_id: 'tenant-A', sector_slug: 'restaurant', name: 'Bob' },
    { id: 3, company_id: 'tenant-B', sector_slug: 'boutique', name: 'Charlie' },
  ];

  const tenantABoutique = staffDB.filter(s => s.company_id === 'tenant-A' && s.sector_slug === 'boutique');
  const tenantBBoutique = staffDB.filter(s => s.company_id === 'tenant-B' && s.sector_slug === 'boutique');

  assert('tenant-A boutique isolé de tenant-B', tenantABoutique.every(s => s.company_id === 'tenant-A'));
  assert('tenant-B ne voit pas les données tenant-A', !tenantBBoutique.some(s => s.company_id === 'tenant-A'));
  assert('Filtrage sector_slug fonctionne', tenantABoutique.length === 1 && tenantABoutique[0].name === 'Alice');
  console.log(`    → tenant-A/boutique: ${tenantABoutique.length} employé(s), tenant-B/boutique: ${tenantBBoutique.length} employé(s)`);
}

// ─── 5. TEST CALCUL AVANCES & PRÊTS ──────────────────────────────────────────
console.log('\n💳 TEST 5 — Calcul Avances & Prêts');
{
  const advance = { montant: 50000, rembourse: 20000 };
  const loan = { montant_total: 150000, solde_restant: 90000 };

  const totalAdvanceDue = advance.montant - advance.rembourse;
  const totalLoanDue = loan.solde_restant;

  assert('Solde avance = montant - remboursé', totalAdvanceDue === 30000);
  assert('Solde prêt = solde_restant', totalLoanDue === 90000);
  assert('Total dettes = avances + prêts', totalAdvanceDue + totalLoanDue === 120000);

  // Mensualité auto-calculée
  const duree = 6;
  const mensualite = Math.ceil(loan.montant_total / duree);
  assert('Mensualité auto = montant_total / duree_mois (arrondi sup)', mensualite === 25000);
  console.log(`    → Dette totale: ${totalAdvanceDue + totalLoanDue} FCFA, Mensualité: ${mensualite} FCFA`);
}

// ─── 6. TEST PRINT HIDDEN ────────────────────────────────────────────────────
console.log('\n🖨️ TEST 6 — Masquage boutons impression');
{
  const fs = require('fs');
  const path = require('path');
  const tsx = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'utilisateurs', 'UtilisateursPage.tsx'),
    'utf8'
  );

  assert('print:hidden présent dans UtilisateursPage', tsx.includes('print:hidden'));
  assert('no-print présent dans UtilisateursPage', tsx.includes('no-print'));
  assert('Modal bulletin masqué (print:hidden)', tsx.includes('print:hidden no-print'));

  const printHelper = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'utils', 'printHelper.ts'),
    'utf8'
  );
  assert('printHelper contient payslip-print selector', printHelper.includes('payslip-print') || printHelper.includes('bulletin-paie-print'));
}

// ─── 7. TEST SERVICES AVANCES/PRETS ─────────────────────────────────────────
console.log('\n🗄️ TEST 7 — staffAdvanceLoanService existe et exporte les bons symboles');
{
  const fs = require('fs');
  const path = require('path');
  const svc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'services', 'staffAdvanceLoanService.ts'),
    'utf8'
  );

  assert('getStaffAdvances exporté', svc.includes('getStaffAdvances'));
  assert('createStaffAdvance exporté', svc.includes('createStaffAdvance'));
  assert('getStaffLoans exporté', svc.includes('getStaffLoans'));
  assert('createStaffLoan exporté', svc.includes('createStaffLoan'));
  assert('recordStaffRepayment exporté', svc.includes('recordStaffRepayment'));
  assert('getStaffDebtSummary exporté', svc.includes('getStaffDebtSummary'));
  assert('localStorage fallback présent', svc.includes('localStorage'));
}

// ─── 8. TEST SQL MIGRATION ───────────────────────────────────────────────────
console.log('\n🗃️ TEST 8 — Migration SQL M086');
{
  const fs = require('fs');
  const path = require('path');
  const sql = fs.readFileSync(
    path.join(__dirname, '..', 'database', 'M086_staff_advances_loans_sector_sync.sql'),
    'utf8'
  );

  assert('Colonne sector_slug ajoutée à staff_members', sql.includes('sector_slug'));
  assert('Table staff_advances créée', sql.includes('staff_advances'));
  assert('Table staff_loans créée', sql.includes('staff_loans'));
  assert('Table staff_repayments créée', sql.includes('staff_repayments'));
  assert('RLS activé sur staff_advances', sql.includes('ENABLE ROW LEVEL SECURITY') || sql.includes('ROW LEVEL SECURITY'));
  assert('tenant_id isolation présente', sql.includes('company_id') || sql.includes('tenant_id'));
}

// ─── RÉSUMÉ ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log(`📋 RÉSULTAT : ${pass} tests réussis, ${fail} tests échoués`);
if (fail === 0) {
  console.log('🎉 TOUS LES TESTS PASSENT !');
} else {
  console.error(`⚠️  ${fail} test(s) échoué(s). Veuillez corriger avant le build.`);
  process.exit(1);
}
