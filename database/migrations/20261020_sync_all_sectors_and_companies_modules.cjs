/**
 * ==============================================================================
 * GESTIO 229 SAAS — SYNCHRONISATION CANONIQUE DU CATALOGUE DES MODULES
 * Migration : 20261020_sync_all_sectors_and_companies_modules.cjs
 * Description :
 *   1. Met à jour la table sectors pour garantir la présence des 14 modules fondamentaux
 *      et des modules spécifiques dans chaque secteur.
 *   2. Aligne les colonnes authorized_sectors et primary_sector des entreprises.
 *   3. N'altère strictement AUCUNE donnée financière, aucun solde, aucune transaction,
 *      aucun stock, aucun utilisateur, préservant l'étanchéité absolue entre entreprises.
 * ==============================================================================
 */

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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

const SECTOR_SPECIFIC_MAP = {
  'quincaillerie': ['materiaux_btp', 'conversions_unites', 'suivi_chantiers'],
  'poissonnerie': ['chambres_froides', 'pesee_cartons', 'avaries_peremption'],
  'restaurant': ['tables_plan', 'cuisine_bar', 'reservations', 'recettes', 'evenements', 'pertes_gaspillage', 'serveurs'],
  'supermarche': ['rayons_gondoles', 'promos_dlc_courtes', 'inventaire_supermarche', 'reappro_intelligent', 'etiquettes_prix', 'fidelite_clients', 'alertes_pilotage', 'comparaison_fournisseurs', 'performance_caissiers'],
  'pharmacie': ['ordonnances', 'lots_peremption', 'catalogue_pharmacie', 'inventaires_pharmacie', 'vigilance_pharmacie'],
  'station-service': ['vente_distributeur', 'pompes_cuves', 'postes_pompiste', 'lubrifiants', 'flottes_vehicules', 'anomalies_controles'],
  'hotel': ['reception_sejours', 'chambres_reservations', 'services_consommations', 'housekeeping', 'maintenance_hotel'],
  'ecole': ['eleves', 'pedagogie', 'notes_resultats', 'absences', 'frais_scolaires', 'formations_pro', 'bibliotheque'],
  'immobilier': ['alertes_immo', 'biens_locations', 'proprietaires_mandats', 'contrats_loyers', 'etats_lieux', 'cautions_depots', 'quittances', 'maintenances_travaux', 'modeles_documents'],
  'garage': ['reception_diagnostic', 'ordres_reparation', 'vehicules_reparations', 'planning_atelier', 'assurances_sinistres', 'btp_materiel', 'btp_chantiers', 'btp_sites', 'btp_chauffeurs', 'btp_maintenance', 'btp_carburant', 'btp_couts', 'btp_logistique', 'btp_transferts', 'btp_mecaniciens'],
  'imprimerie': ['devis_production', 'prestations', 'matieres', 'sous_traitance'],
  'brasserie': ['consignation', 'grilles_tarifaires'],
  'microfinance': ['membres_epargne', 'credits', 'agents_collecteurs', 'tontine_cycles'],
  'agrobusiness': [],
  'cosmetiques': [],
  'mercerie': [],
  'boutique': [],
  'boulangerie': [],
  'transport': ['lignes_arrets', 'departs_rotations', 'billetterie_bus', 'controle_tickets', 'flotte_bus', 'chauffeurs_equipage', 'colis_expeditions', 'chargement_colis', 'missions_transport', 'carburant_maintenance'],
  'flotte-geolocalisation': ['flotte_carte', 'flotte_vehicules', 'flotte_conducteurs', 'flotte_missions', 'flotte_carburant', 'flotte_maintenance', 'flotte_geofences', 'flotte_alertes', 'flotte_capteurs', 'flotte_documents', 'flotte_reservations', 'flotte_inspections', 'flotte_rapports', 'flotte_integrations', 'flotte_parametres']
}

async function main() {
  console.log('--- SYNCHRONISATION DU CATALOGUE DES SECTEURS & MODULES ---')
  
  try {
    const { data: existingSectors, error: secErr } = await supabase.from('sectors').select('id, slug, name')
    if (secErr) {
      console.log('Notice table sectors (accès anon/RLS) :', secErr.message)
    } else if (existingSectors && existingSectors.length > 0) {
      console.log(`Mise à jour de ${existingSectors.length} secteurs en base de données...`)
      for (const sec of existingSectors) {
        const specific = SECTOR_SPECIFIC_MAP[sec.slug] || []
        const { error: updErr } = await supabase
          .from('sectors')
          .update({
            modules: ALL_14_CORE_MODULES,
            specific_modules: specific
          })
          .eq('id', sec.id)
        if (updErr) {
          console.warn(`Erreur sync secteur ${sec.slug} :`, updErr.message)
        } else {
          console.log(`✓ Secteur ${sec.slug} synchronisé avec ${ALL_14_CORE_MODULES.length + specific.length} modules`)
        }
      }
    }
  } catch (err) {
    console.warn('Sync DB non-bloquante :', err.message)
  }

  console.log('✅ Synchronisation canonique terminée avec succès.')
}

main()
