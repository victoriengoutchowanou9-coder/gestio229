// =============================================================================
// GESTIO 229 SaaS — Service Central des Abonnements : Global + Par Secteur
// Logique Métier Finale :
// 1. Abonnement Global (Obligatoire) : 30j d'essai à l'inscription
// 2. Abonnements Secteurs : Rattachés au global pour les secteurs initiaux
// 3. Ajout tardif d'un secteur : 30j d'essai individuel indépendant
// 4. Fin d'essai individuel : Rejoint automatiquement l'abonnement global
// 5. Vérification d'accès : checkSecteurAccess()
// =============================================================================

import { supabase } from '../lib/supabase';
import { ALL_SECTORS_CATALOG, SectorDefinition } from '../core/modules/moduleRegistry';
import { canonicalSectorSlug } from '../lib/sectorClient';

export type StatutGlobal = 'essai' | 'actif' | 'expire';
export type StatutSpecifique = 'essai_individuel' | 'rattache_global' | 'expire';

export interface AbonnementGlobal {
  id?: string;
  entreprise_id: string;
  date_debut_global: string;
  date_fin_global: string;
  statut_global: StatutGlobal;
  plan_code?: string;
  montant_mensuel_fcfa?: number;
}

export interface AbonnementSecteur {
  id?: string;
  entreprise_id: string;
  secteur_code: string;
  date_debut_specifique?: string | null;
  date_fin_specifique?: string | null;
  statut_specifique: StatutSpecifique;
  is_premiere_activation: boolean;
  rattache_au_global: boolean;
}

export interface SecteurAccessCheck {
  allowed: boolean;
  isEnLigne: boolean;
  isPremiereActivation: boolean;
  isTrialIndividuel: boolean;
  isRattacheGlobal: boolean;
  status: 'essai_individuel' | 'rattache_global' | 'non_active' | 'expire';
  badgeLabel: string;
  badgeColor: 'green' | 'blue' | 'gray' | 'red';
  daysRemaining: number;
  globalDaysRemaining: number;
  globalStatut: StatutGlobal;
  needsActivationModal: boolean;
  sectorSub?: AbonnementSecteur | null;
  globalSub?: AbonnementGlobal | null;
}

// ─── Normalisation des codes secteurs ────────────────────────────────────────
export function getCanonicalSectorCode(rawSlugOrCode: string): string {
  if (!rawSlugOrCode) return 'BOUTIQUE';
  const clean = String(rawSlugOrCode).replace(/^sec-/, '').toLowerCase().trim();
  const canon = canonicalSectorSlug(clean);

  if (canon === 'transport' || clean.includes('transport')) return 'TRANSPORT_LOGISTIQUE';
  if (canon === 'flotte-geolocalisation' || clean.includes('flotte') || clean.includes('gps')) return 'FLOTTE_GEOLOCALISATION';
  if (canon === 'station-service' || clean.includes('station')) return 'STATION_SERVICE';
  if (canon === 'restaurant' || clean.includes('restaurant') || clean.includes('bar') || clean.includes('maquis')) return 'RESTAURANT';
  if (canon === 'brasserie' || clean.includes('brasserie')) return 'BRASSERIE';
  if (canon === 'quincaillerie') return 'QUINCAILLERIE';
  if (canon === 'poissonnerie') return 'POISSONNERIE';
  if (canon === 'supermarche') return 'SUPERMARCHE';
  if (canon === 'pharmacie') return 'PHARMACIE';
  if (canon === 'hotel') return 'HOTEL';
  if (canon === 'ecole') return 'ECOLE';
  if (canon === 'immobilier') return 'IMMOBILIER';
  if (canon === 'garage') return 'GARAGE';
  if (canon === 'imprimerie') return 'IMPRIMERIE';
  if (canon === 'microfinance') return 'MICROFINANCE';
  if (canon === 'agrobusiness') return 'AGROBUSINESS';
  if (canon === 'cosmetiques') return 'COSMETIQUES';
  if (canon === 'mercerie') return 'MERCERIE';
  if (canon === 'boulangerie') return 'BOULANGERIE';
  if (canon === 'boutique') return 'BOUTIQUE';

  return clean.toUpperCase().replace(/-/g, '_');
}

/**
 * Compare un code stocké en base avec un slug/code interrogé
 */
export function matchesSectorCode(storedCode: string, querySlugOrCode: string): boolean {
  if (!storedCode || !querySlugOrCode) return false;
  const c1 = getCanonicalSectorCode(storedCode);
  const c2 = getCanonicalSectorCode(querySlugOrCode);
  if (c1 === c2) return true;

  const raw1 = String(storedCode).replace(/^sec-/, '').toLowerCase().replace(/_/g, '-');
  const raw2 = String(querySlugOrCode).replace(/^sec-/, '').toLowerCase().replace(/_/g, '-');
  if (raw1 === raw2) return true;

  if (canonicalSectorSlug(raw1) === canonicalSectorSlug(raw2)) return true;
  return false;
}

/**
 * Calcul du nombre de jours restants (J-X)
 */
export function calcDaysRemaining(targetDate: string | Date | null | undefined): number {
  if (!targetDate) return 0;
  const d = new Date(targetDate);
  if (isNaN(d.getTime())) return 0;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

// ─── Cache local résilient ──────────────────────────────────────────────────
const cacheGlobalByCompany = new Map<string, { data: AbonnementGlobal; ts: number }>();
const cacheSecteursByCompany = new Map<string, { data: AbonnementSecteur[]; ts: number }>();
const CACHE_TTL_MS = 15000; // 15 secondes

/**
 * Récupère ou initialise l'abonnement global de l'entreprise
 */
export async function getAbonnementGlobal(
  companyId: string,
  companyFallback?: any
): Promise<AbonnementGlobal> {
  const cached = cacheGlobalByCompany.get(companyId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase
      .from('abonnements_global')
      .select('*')
      .eq('entreprise_id', companyId)
      .maybeSingle();

    if (!error && data) {
      const result: AbonnementGlobal = {
        id: data.id,
        entreprise_id: data.entreprise_id,
        date_debut_global: data.date_debut_global,
        date_fin_global: data.date_fin_global,
        statut_global: data.statut_global as StatutGlobal,
        plan_code: data.plan_code,
        montant_mensuel_fcfa: data.montant_mensuel_fcfa,
      };
      cacheGlobalByCompany.set(companyId, { data: result, ts: Date.now() });
      return result;
    }
  } catch (err) {
    console.warn('[AbonnementService] Erreur fetch abonnements_global:', err);
  }

  // Fallback calculé à partir de la date de création de l'entreprise
  const created = companyFallback?.created_at ? new Date(companyFallback.created_at) : new Date();
  const fin = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
  const now = new Date();
  const isExp = now.getTime() > fin.getTime();
  const statut: StatutGlobal = companyFallback?.subscription_status === 'active'
    ? 'actif'
    : (isExp ? 'expire' : 'essai');

  const fallback: AbonnementGlobal = {
    entreprise_id: companyId,
    date_debut_global: created.toISOString(),
    date_fin_global: fin.toISOString(),
    statut_global: statut,
    plan_code: companyFallback?.subscription_plan || 'entreprise',
    montant_mensuel_fcfa: 10000,
  };

  // Tenter une insertion en tâche de fond pour pérenniser
  supabase
    .from('abonnements_global')
    .insert({
      entreprise_id: companyId,
      date_debut_global: fallback.date_debut_global,
      date_fin_global: fallback.date_fin_global,
      statut_global: fallback.statut_global,
      plan_code: fallback.plan_code,
    })
    .then(() => {})
    .catch(() => {});

  cacheGlobalByCompany.set(companyId, { data: fallback, ts: Date.now() });
  return fallback;
}

/**
 * Récupère la liste des abonnements sectoriels de l'entreprise
 */
export async function getAbonnementsSecteurs(
  companyId: string,
  companyFallback?: any
): Promise<AbonnementSecteur[]> {
  const cached = cacheSecteursByCompany.get(companyId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase
      .from('abonnements_secteurs')
      .select('*')
      .eq('entreprise_id', companyId);

    if (!error && Array.isArray(data)) {
      const list: AbonnementSecteur[] = data.map((d: any) => ({
        id: d.id,
        entreprise_id: d.entreprise_id,
        secteur_code: d.secteur_code,
        date_debut_specifique: d.date_debut_specifique,
        date_fin_specifique: d.date_fin_specifique,
        statut_specifique: d.statut_specifique as StatutSpecifique,
        is_premiere_activation: Boolean(d.is_premiere_activation),
        rattache_au_global: Boolean(d.rattache_au_global),
      }));

      // Vérification immédiate : si un essai individuel est expiré, on bascule vers rattaché au global !
      const now = new Date();
      const expiredSubs = list.filter(
        (s) =>
          s.statut_specifique === 'essai_individuel' &&
          s.date_fin_specifique &&
          new Date(s.date_fin_specifique).getTime() < now.getTime()
      );

      if (expiredSubs.length > 0) {
        for (const exp of expiredSubs) {
          exp.statut_specifique = 'rattache_global';
          exp.rattache_au_global = true;
          exp.date_debut_specifique = null;

          supabase
            .from('abonnements_secteurs')
            .update({
              statut_specifique: 'rattache_global',
              rattache_au_global: true,
              date_debut_specifique: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', exp.id)
            .then(() => {})
            .catch(() => {});
        }
      }

      cacheSecteursByCompany.set(companyId, { data: list, ts: Date.now() });
      return list;
    }
  } catch (err) {
    console.warn('[AbonnementService] Erreur fetch abonnements_secteurs:', err);
  }

  // Fallback si la table est vide : construire à partir de selected_sectors de l'entreprise
  const rawList: string[] = [];
  if (Array.isArray(companyFallback?.selected_sectors)) rawList.push(...companyFallback.selected_sectors);
  if (Array.isArray(companyFallback?.sectors)) rawList.push(...companyFallback.sectors);
  if (companyFallback?.active_sector) rawList.push(companyFallback.active_sector);

  const fallbackList: AbonnementSecteur[] = Array.from(new Set(rawList.filter(Boolean))).map((sec) => ({
    entreprise_id: companyId,
    secteur_code: getCanonicalSectorCode(sec),
    date_debut_specifique: companyFallback?.created_at || new Date().toISOString(),
    date_fin_specifique: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
    statut_specifique: 'rattache_global',
    is_premiere_activation: true,
    rattache_au_global: true,
  }));

  cacheSecteursByCompany.set(companyId, { data: fallbackList, ts: Date.now() });
  return fallbackList;
}

/**
 * RÈGLE 5 : VÉRIFICATION D'ACCÈS checkSecteurAccess()
 * - Si abonnements_secteurs.rattache_au_global = false ET now() <= date_fin_specifique => ACCES OK (essai individuel)
 * - Si rattache_au_global = true => vérifie abonnements_global.date_fin_global
 * - Si pas de ligne du tout => propose modale activation essai
 */
export async function checkSecteurAccess(
  companyId: string,
  sectorSlugOrCode: string,
  companyFallback?: any
): Promise<SecteurAccessCheck> {
  const globalSub = await getAbonnementGlobal(companyId, companyFallback);
  const secteurs = await getAbonnementsSecteurs(companyId, companyFallback);

  const globalDaysRemaining = calcDaysRemaining(globalSub.date_fin_global);
  const now = new Date();

  // Trouver la ligne du secteur
  const sectorSub = secteurs.find((s) => matchesSectorCode(s.secteur_code, sectorSlugOrCode));

  // 1. CAS : PAS DE LIGNE DU TOUT => Propose modale d'activation d'essai 30j
  if (!sectorSub) {
    return {
      allowed: false,
      isEnLigne: false,
      isPremiereActivation: true,
      isTrialIndividuel: false,
      isRattacheGlobal: false,
      status: 'non_active',
      badgeLabel: 'Essai 30j disponible',
      badgeColor: 'blue',
      daysRemaining: 30,
      globalDaysRemaining,
      globalStatut: globalSub.statut_global,
      needsActivationModal: true,
      sectorSub: null,
      globalSub,
    };
  }

  // 2. CAS : ESSAI INDIVIDUEL EN COURS (rattache_au_global = false)
  if (!sectorSub.rattache_au_global && sectorSub.date_fin_specifique) {
    const finSpecifique = new Date(sectorSub.date_fin_specifique);
    if (now.getTime() <= finSpecifique.getTime()) {
      const daysRemaining = calcDaysRemaining(sectorSub.date_fin_specifique);
      return {
        allowed: true,
        isEnLigne: true,
        isPremiereActivation: sectorSub.is_premiere_activation,
        isTrialIndividuel: true,
        isRattacheGlobal: false,
        status: 'essai_individuel',
        badgeLabel: `Essai individuel J-${daysRemaining}`,
        badgeColor: 'green',
        daysRemaining,
        globalDaysRemaining,
        globalStatut: globalSub.statut_global,
        needsActivationModal: false,
        sectorSub,
        globalSub,
      };
    } else {
      // Fin des 30 jours : Bascule automatique en rattaché au global !
      sectorSub.statut_specifique = 'rattache_global';
      sectorSub.rattache_au_global = true;
      sectorSub.date_debut_specifique = null;

      supabase
        .from('abonnements_secteurs')
        .update({
          statut_specifique: 'rattache_global',
          rattache_au_global: true,
          date_debut_specifique: null,
          updated_at: new Date().toISOString(),
        })
        .eq('entreprise_id', companyId)
        .eq('secteur_code', sectorSub.secteur_code)
        .then(() => {})
        .catch(() => {});
    }
  }

  // 3. CAS : RATTACHÉ AU GLOBAL (rattache_au_global = true)
  const isGlobalActive =
    globalSub.statut_global === 'actif' ||
    (globalSub.statut_global === 'essai' && now.getTime() <= new Date(globalSub.date_fin_global).getTime()) ||
    globalDaysRemaining > 0;

  if (isGlobalActive) {
    const label =
      globalSub.statut_global === 'essai'
        ? `Inclus dans global J-${globalDaysRemaining}`
        : 'Inclus dans global';

    return {
      allowed: true,
      isEnLigne: true,
      isPremiereActivation: sectorSub.is_premiere_activation,
      isTrialIndividuel: false,
      isRattacheGlobal: true,
      status: 'rattache_global',
      badgeLabel: label,
      badgeColor: 'blue',
      daysRemaining: globalDaysRemaining,
      globalDaysRemaining,
      globalStatut: globalSub.statut_global,
      needsActivationModal: false,
      sectorSub,
      globalSub,
    };
  }

  // 4. CAS : GLOBAL EXPIRÉ
  return {
    allowed: false,
    isEnLigne: true,
    isPremiereActivation: sectorSub.is_premiere_activation,
    isTrialIndividuel: false,
    isRattacheGlobal: true,
    status: 'expire',
    badgeLabel: 'Abonnement expiré',
    badgeColor: 'red',
    daysRemaining: 0,
    globalDaysRemaining: 0,
    globalStatut: 'expire',
    needsActivationModal: false,
    sectorSub,
    globalSub,
  };
}

/**
 * RÈGLE 3 : AJOUT TARDIF D'UN NOUVEAU SECTEUR
 * Au clic Activer :
 * INSERT INTO abonnements_secteurs:
 * - secteur_code = TRANSPORT_LOGISTIQUE
 * - is_premiere_activation = true
 * - statut_specifique = essai_individuel
 * - date_debut_specifique = now()
 * - date_fin_specifique = now() + 30j
 * - rattache_au_global = false
 */
export async function activerEssaiIndividuelSecteur(
  companyId: string,
  sectorSlugOrCode: string,
  sectorName?: string
): Promise<{ success: boolean; error?: string; entry?: AbonnementSecteur }> {
  const code = getCanonicalSectorCode(sectorSlugOrCode);
  const now = new Date();
  const dateDebut = now.toISOString();
  const dateFin = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const newRow: AbonnementSecteur = {
    entreprise_id: companyId,
    secteur_code: code,
    date_debut_specifique: dateDebut,
    date_fin_specifique: dateFin,
    statut_specifique: 'essai_individuel',
    is_premiere_activation: true,
    rattache_au_global: false,
  };

  try {
    const { data, error } = await supabase
      .from('abonnements_secteurs')
      .upsert(
        {
          entreprise_id: companyId,
          secteur_code: code,
          date_debut_specifique: dateDebut,
          date_fin_specifique: dateFin,
          statut_specifique: 'essai_individuel',
          is_premiere_activation: true,
          rattache_au_global: false,
          updated_at: dateDebut,
        },
        { onConflict: 'entreprise_id,secteur_code' }
      )
      .select()
      .single();

    if (error) {
      console.warn('[AbonnementService] Erreur insertion abonnements_secteurs:', error.message);
    }

    // Invalider le cache pour forcer un rechargement frais
    cacheSecteursByCompany.delete(companyId);

    // Mettre à jour les selected_sectors de l'entreprise
    try {
      const cleanSlug = canonicalSectorSlug(sectorSlugOrCode);
      const { data: comp } = await supabase
        .from('companies')
        .select('selected_sectors, sectors')
        .eq('id', companyId)
        .maybeSingle();

      const existing: string[] = Array.isArray(comp?.selected_sectors) ? comp.selected_sectors : [];
      if (!existing.includes(cleanSlug)) {
        const updated = [...existing, cleanSlug];
        await supabase
          .from('companies')
          .update({
            selected_sectors: updated,
            sectors: updated,
            updated_at: dateDebut,
          })
          .eq('id', companyId);
      }
    } catch (e) {
      console.warn('[AbonnementService] Erreur update selected_sectors:', e);
    }

    // Créer également une entrée dans company_activities si non présente pour l'afficher sur le HUB
    try {
      const cleanSlug = canonicalSectorSlug(sectorSlugOrCode);
      const meta = ALL_SECTORS_CATALOG.find((s) => s.slug === cleanSlug);
      const actLabel = sectorName || meta?.name || meta?.label || cleanSlug;

      await supabase
        .from('company_activities')
        .insert({
          company_id: companyId,
          sector_slug: cleanSlug,
          sector_code: code,
          activity_name: actLabel.toUpperCase(),
          pos_location: 'Bénin',
          manager_name: '',
          status: 'ACTIVE',
          is_active: true,
          color: meta?.color || '#10b981',
        })
        .catch(() => {});
    } catch (e) {}

    return {
      success: true,
      entry: data ? { ...newRow, id: data.id } : newRow,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Erreur lors de l'activation de l'essai",
    };
  }
}

/**
 * RÈGLE 1 & 2 : INITIALISATION LORS DE L'INSCRIPTION
 * Crée 1 ligne globale (30 jours) et rattache les secteurs sélectionnés au global.
 */
export async function initialiserAbonnementInscription(
  companyId: string,
  selectedSectors: string[],
  planCode: string = 'entreprise'
): Promise<void> {
  const now = new Date();
  const dateDebut = now.toISOString();
  const dateFin = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Créer la ligne d'abonnement global
  try {
    await supabase.from('abonnements_global').upsert(
      {
        entreprise_id: companyId,
        date_debut_global: dateDebut,
        date_fin_global: dateFin,
        statut_global: 'essai',
        plan_code: planCode,
        updated_at: dateDebut,
      },
      { onConflict: 'entreprise_id' }
    );
  } catch (e) {
    console.warn('[AbonnementService] Erreur init abonnements_global:', e);
  }

  // 2. Rattaché au global pour chaque secteur sélectionné
  const rows = selectedSectors.map((sec) => ({
    entreprise_id: companyId,
    secteur_code: getCanonicalSectorCode(sec),
    date_debut_specifique: dateDebut,
    date_fin_specifique: dateFin,
    statut_specifique: 'rattache_global',
    is_premiere_activation: true,
    rattache_au_global: true,
    updated_at: dateDebut,
  }));

  if (rows.length > 0) {
    try {
      await supabase.from('abonnements_secteurs').upsert(rows, {
        onConflict: 'entreprise_id,secteur_code',
      });
    } catch (e) {
      console.warn('[AbonnementService] Erreur init abonnements_secteurs:', e);
    }
  }

  // Invalider le cache
  cacheGlobalByCompany.delete(companyId);
  cacheSecteursByCompany.delete(companyId);
}
