// =============================================================================
// GESTIO 229 SaaS — Service Gestion Multisite d'Exploitation
// =============================================================================
// Architecture Multi-Tenant Stricte (company_id)
// Gère le cycle de vie des sites d'exploitation et le rattachement des secteurs.
// Respecte l'intégrité historique des ventes et dépenses des secteurs.
// =============================================================================

import { supabase } from '../lib/supabase';

export interface CompanySite {
  id: string;
  company_id: string;
  name: string;
  city: string;
  address?: string;
  manager?: string;
  phone?: string;
  is_main?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SiteFinancials {
  siteId: string;
  // Métriques du Jour
  dayRevenue: number;
  dayGrossMargin: number;
  dayExpenses: number;
  dayNetMargin: number;
  // Métriques du Mois
  monthRevenue: number;
  monthGrossMargin: number;
  monthExpenses: number;
  monthNetMargin: number;
  // Métriques Annuelles
  yearRevenue: number;
  yearGrossMargin: number;
  yearExpenses: number;
  yearNetMargin: number;
  // Métriques Période Sélectionnée (Niveau 2)
  periodRevenue: number;
  periodGrossMargin: number;
  periodExpenses: number;
  periodNetMargin: number;
  // Créances clients en attente
  creances: number;
  // Taux de rentabilité (%)
  profitabilityRate: number;
  // Nombre de secteurs rattachés
  sectorsCount: number;
  // Classement
  isBestSite?: boolean;
  isMostProfitable?: boolean;
  isDeficit?: boolean;
  isInactive?: boolean;
}

const STORAGE_PREFIX = 'gestio229_sites_';

/**
 * Récupère la clé de stockage local pour une entreprise
 */
function getStorageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`;
}

/**
 * Génère un identifiant unique robuste pour un nouveau site
 */
export function generateSiteId(companyId: string, name: string): string {
  const cleanName = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '-')
    .slice(0, 15);
  const rand = Math.random().toString(36).substring(2, 7);
  return `site-${companyId.slice(0, 8)}-${cleanName}-${rand}`;
}

/**
 * Charge tous les sites d'exploitation pour une entreprise.
 * Si aucun site n'existe encore, crée automatiquement un site principal
 * basé sur la ville de l'entreprise et y rattache les activités existantes.
 */
export async function loadCompanySites(
  companyId: string,
  companyCity?: string,
  existingActivities?: any[]
): Promise<CompanySite[]> {
  if (!companyId) return [];

  const storageKey = getStorageKey(companyId);
  let localSites: CompanySite[] = [];

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      localSites = JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[MultisiteService] Erreur lecture localStorage sites:', err);
  }

  // Vérifier également si des sites distincts sont définis dans les activités Supabase
  const sitesMap = new Map<string, CompanySite>();

  localSites.forEach((s) => {
    if (s.id && s.company_id === companyId) {
      sitesMap.set(s.id, s);
    }
  });

  // Extraire les sites mentionnés dans les settings des activités
  if (Array.isArray(existingActivities) && existingActivities.length > 0) {
    existingActivities.forEach((act) => {
      const settings = act.settings || {};
      const sId = settings.site_id;
      const sName = settings.site_name;
      const sCity = settings.site_city || act.location || act.pos_location || companyCity || 'Bénin';

      if (sId && !sitesMap.has(sId)) {
        sitesMap.set(sId, {
          id: sId,
          company_id: companyId,
          name: sName || `Site ${sCity}`,
          city: sCity,
          manager: act.manager || act.manager_name || '',
          is_main: sitesMap.size === 0,
          created_at: act.created_at || new Date().toISOString(),
        });
      }
    });
  }

  let finalSites = Array.from(sitesMap.values());

  // Si aucun site n'est trouvé, initialiser un site principal par défaut
  if (finalSites.length === 0) {
    const defaultCity = companyCity && companyCity.trim() ? companyCity.trim() : 'Cotonou';
    const defaultSite: CompanySite = {
      id: generateSiteId(companyId, `principal-${defaultCity}`),
      company_id: companyId,
      name: `Site Principal — ${defaultCity}`,
      city: defaultCity,
      address: `Siège d'exploitation (${defaultCity})`,
      manager: 'Direction Générale',
      is_main: true,
      created_at: new Date().toISOString(),
    };
    finalSites = [defaultSite];
    try {
      localStorage.setItem(storageKey, JSON.stringify(finalSites));
    } catch (_) {}
  }

  // S'assurer qu'au moins un site est principal
  if (!finalSites.some((s) => s.is_main) && finalSites.length > 0) {
    finalSites[0].is_main = true;
  }

  return finalSites;
}

/**
 * Sauvegarde ou met à jour un site d'exploitation
 */
export async function saveCompanySite(
  companyId: string,
  siteData: Partial<CompanySite> & { name: string; city: string }
): Promise<CompanySite> {
  if (!companyId) throw new Error("Identifiant d'entreprise requis");

  const storageKey = getStorageKey(companyId);
  let currentSites: CompanySite[] = [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) currentSites = JSON.parse(raw);
  } catch (_) {}

  const now = new Date().toISOString();
  let updatedSite: CompanySite;

  if (siteData.id) {
    // Mise à jour d'un site existant
    const idx = currentSites.findIndex((s) => s.id === siteData.id);
    if (idx >= 0) {
      updatedSite = {
        ...currentSites[idx],
        ...siteData,
        company_id: companyId,
        updated_at: now,
      };
      currentSites[idx] = updatedSite;
    } else {
      updatedSite = {
        id: siteData.id,
        company_id: companyId,
        name: siteData.name.trim(),
        city: siteData.city.trim(),
        address: siteData.address?.trim() || '',
        manager: siteData.manager?.trim() || '',
        phone: siteData.phone?.trim() || '',
        is_main: siteData.is_main || false,
        created_at: now,
        updated_at: now,
      };
      currentSites.push(updatedSite);
    }
  } else {
    // Création d'un nouveau site
    const isFirst = currentSites.length === 0;
    updatedSite = {
      id: generateSiteId(companyId, siteData.name),
      company_id: companyId,
      name: siteData.name.trim(),
      city: siteData.city.trim(),
      address: siteData.address?.trim() || '',
      manager: siteData.manager?.trim() || '',
      phone: siteData.phone?.trim() || '',
      is_main: isFirst ? true : (siteData.is_main || false),
      created_at: now,
      updated_at: now,
    };
    currentSites.push(updatedSite);
  }

  // Si ce site devient principal, rétrograder les autres
  if (updatedSite.is_main) {
    currentSites = currentSites.map((s) => ({
      ...s,
      is_main: s.id === updatedSite.id,
    }));
  }

  localStorage.setItem(storageKey, JSON.stringify(currentSites));
  return updatedSite;
}

/**
 * Supprime un site d'exploitation si et seulement si aucun secteur ne lui est rattaché.
 */
export async function deleteCompanySite(
  companyId: string,
  siteId: string,
  activities: any[]
): Promise<{ success: boolean; error?: string }> {
  // Vérification de sécurité absolue : aucun secteur rattaché
  const attached = activities.filter((act) => {
    const sId = act.settings?.site_id || act.site_id;
    return sId === siteId;
  });

  if (attached.length > 0) {
    return {
      success: false,
      error: `Ce site compte encore ${attached.length} secteur(s) rattaché(s). Veuillez d'abord déplacer ou supprimer ces secteurs.`,
    };
  }

  const storageKey = getStorageKey(companyId);
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      let currentSites: CompanySite[] = JSON.parse(raw);
      currentSites = currentSites.filter((s) => s.id !== siteId);
      // S'il reste des sites et aucun n'est principal, désigner le premier
      if (currentSites.length > 0 && !currentSites.some((s) => s.is_main)) {
        currentSites[0].is_main = true;
      }
      localStorage.setItem(storageKey, JSON.stringify(currentSites));
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }

  return { success: true };
}

/**
 * Déplace un secteur vers un autre site d'exploitation.
 * Met à jour les settings de l'activité dans Supabase et synchronise l'emplacement.
 * Conserve 100% des données historiques de vente et de dépenses !
 */
export async function moveSectorToSite(
  companyId: string,
  activityId: string,
  targetSite: CompanySite
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Lire l'activité existante pour préserver ses autres configurations
    const { data: act, error: readErr } = await supabase
      .from('company_activities')
      .select('id, settings, pos_location')
      .eq('id', activityId)
      .eq('company_id', companyId)
      .maybeSingle();

    if (readErr) {
      console.warn('[MultisiteService] Erreur lecture avant déplacement:', readErr.message);
    }

    const currentSettings = act?.settings || {};
    const updatedSettings = {
      ...currentSettings,
      site_id: targetSite.id,
      site_name: targetSite.name,
      site_city: targetSite.city,
      site_moved_at: new Date().toISOString(),
    };

    // 2. Mettre à jour l'enregistrement dans company_activities
    const { error: updateErr } = await supabase
      .from('company_activities')
      .update({
        settings: updatedSettings,
        pos_location: targetSite.city || targetSite.name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', activityId)
      .eq('company_id', companyId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Erreur inattendue lors du déplacement' };
  }
}
