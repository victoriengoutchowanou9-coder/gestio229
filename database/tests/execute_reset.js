import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function executeReset() {
  console.log('=============================================================================');
  console.log('GESTIO 229 — EXÉCUTION DE LA RÉINITIALISATION GÉNÉRALE DES COMPTES');
  console.log('=============================================================================\n');

  // Ordre strict de suppression descendante
  const cleanupSteps = [
    { table: 'sales_order_items', desc: 'Lignes de commandes / factures' },
    { table: 'sales_orders', desc: 'Commandes / Factures de vente' },
    { table: 'stock_movements', desc: 'Mouvements de stock' },
    { table: 'products', desc: 'Catalogue articles et produits' },
    { table: 'product_categories', desc: 'Catégories de produits' },
    { table: 'stock_locations', desc: 'Emplacements de stock et magasins' },
    { table: 'cash_sessions', desc: 'Sessions de caisse' },
    { table: 'cash_registers', desc: 'Caisses enregistreuses' },
    { table: 'customers', desc: 'Clients et créances' },
    { table: 'purchase_orders', desc: 'Bons de commande fournisseurs' },
    { table: 'suppliers', desc: 'Fournisseurs' },
    { table: 'expenses', desc: 'Dépenses' },
    { table: 'treasury_accounts', desc: 'Comptes de trésorerie' },
    { table: 'audit_logs', desc: 'Journaux d\'audit' },
    { table: 'user_profiles', desc: 'Profils utilisateurs' },
    { table: 'companies', desc: 'Entreprises clientes' }
  ];

  for (const step of cleanupSteps) {
    try {
      // Supprimer tous les enregistrements de la table
      // Pour PostgREST, delete().neq('id', '00000000-0000-0000-0000-000000000000') supprime tout
      const { data, error, count } = await supabase
        .from(step.table)
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (error) {
        console.log(`⚠️ [${step.table}] Note / Erreur: ${error.message} (${error.code})`);
      } else {
        console.log(`✅ [${step.table}] Supprimé avec succès (${step.desc}) - Lignes purgées: ${count !== null ? count : 'toutes'}`);
      }
    } catch (e) {
      console.log(`❌ [${step.table}] Exception: ${e.message}`);
    }
  }

  // Vérification de la vacuité complète
  console.log('\n--- VÉRIFICATION FINALE DE L\'ÉTAT DES TABLES ---');
  for (const step of cleanupSteps) {
    const { count, error } = await supabase.from(step.table).select('id', { count: 'exact', head: true });
    console.log(`${step.table}: ${count !== null ? count : (error ? error.message : 0)} enregistrements restants`);
  }

  // Vérification que le référentiel des secteurs est bien intact
  const { count: sectorsCount } = await supabase.from('sectors').select('id', { count: 'exact', head: true });
  console.log(`\n🛡️ [sectors] RÉFÉRENTIEL DES SECTEURS PRÉSERVÉ : ${sectorsCount} secteurs disponibles.`);
}

executeReset();
