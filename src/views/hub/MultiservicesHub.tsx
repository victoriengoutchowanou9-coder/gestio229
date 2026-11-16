import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  DollarSign,
  PieChart,
  ShieldCheck,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  X,
  Settings,
  CreditCard,
  FlaskConical,
  RotateCcw,
  Building2,
  CheckCircle,
  ChevronDown,
  Calendar,
  MapPin,
  ExternalLink,
  Archive,
  AlertTriangle,
  RotateCcw as RestoreIcon,
  LogOut,
  Sun,
  Moon,
  Fuel,
  Droplets,
  Layers,
  AlertCircle,
} from 'lucide-react';
import { ALL_SECTORS_CATALOG, SectorDefinition } from '../../core/modules/moduleRegistry';
import { ClearSectorModal } from '../../components/hub/ClearSectorModal';
import { supabase } from '../../lib/supabase';
import { fetchHubFinancialMetrics, HubFinancialTotals, StationSectorFinancials, SectorMetrics, computeSiteFinancials, fetchCustomPeriodMetrics } from '../../services/hubFinancialService';
import {
  CompanySite,
  SiteFinancials,
  loadCompanySites,
  saveCompanySite,
  deleteCompanySite,
  moveSectorToSite,
} from '../../services/multisiteService';
import { SiteCard } from '../../components/hub/SiteCard';
import { SiteDetailView, PeriodFilterType } from '../../components/hub/SiteDetailView';
import { SiteModal } from '../../components/hub/SiteModal';
import { MoveSectorModal } from '../../components/hub/MoveSectorModal';
import { AttachSectorModal } from '../../components/hub/AttachSectorModal';
import { HubGlobalCharts } from '../../components/hub/HubGlobalCharts';
import { useUIStore } from '../../store/uiStore';
import { formatNumber, formatFCFA } from '../../utils/formatters';
import {
  getAbonnementGlobal,
  getAbonnementsSecteurs,
  calcDaysRemaining,
  matchesSectorCode,
  ajouterSecteurAuCompte,
  AbonnementGlobal,
  AbonnementSecteur,
  canonicalSectorSlug,
  canonicalSectorsSlug,
} from '../../services/abonnementService';
import { ActiverSecteurModal } from '../../components/subscription/ActiverSecteurModal';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & ÉTATS (PARTIE 9 — POLITIQUE DE CONSERVATION DES DONNÉES)
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityStatus = 'ACTIVE' | 'SUSPENDUE' | 'ARCHIVEE';

export interface ActivityEntry {
  id: string;
  sectorSlug: string;          // Référence au catalogue des 15 secteurs
  sectorLabel: string;         // Libellé du secteur (ex: Poissonnerie & Surgelés)
  sectorIcon: string;          // Emoji / icône du secteur (ex: 🐟)
  sectorColor: string;         // Couleur HEX du secteur
  name: string;                // PARTIE 6 : Nom de l'établissement (ex: POISSONNERIE DIEU FERA)
  location: string;            // PARTIE 6 : Lieu (ex: Calavi)
  manager: string;             // Responsable du point de vente
  status: ActivityStatus;      // PARTIE 9 : ACTIVE | SUSPENDUE | ARCHIVEE
  isConfigured: boolean;
  settings?: any;              // Paramètres étendus (site_id, etc.)
  site_id?: string;            // Site d'exploitation rattaché
  // PARTIE 3 : Métriques du Jour (F CFA)
  dayRevenue?: number;         // CA DU JOUR
  dayRevenueHT?: number;
  dayCogsHT?: number;          // COÛT D'ACHAT DU JOUR
  dayGrossMargin?: number;     // MARGE BRUTE DU JOUR
  dayExpenses?: number;        // DÉPENSES DU JOUR
  dayNetMargin?: number;       // MARGE NETTE DU JOUR (Marge brute - Dépenses)
  // PARTIE 4 : Métriques du Mois (F CFA) - Affichées sur chaque carte du HUB (Cumul Cotonou)
  revenue: number;             // CA MENSUEL DE LA CARTE
  monthRevenue: number;        // CA DU MOIS
  monthRevenueHT?: number;
  monthCogsHT?: number;        // COÛT D'ACHAT DU MOIS
  monthGrossMargin?: number;   // MARGE BRUTE DU MOIS
  expenses: number;            // DÉPENSES DU MOIS
  monthExpenses: number;       // DÉPENSES DU MOIS
  netMargin: number;           // MARGE NETTE DU MOIS
  monthNetMargin: number;      // MARGE NETTE DU MOIS
  archivedAt?: string;         // Date d'archivage (si statut = ARCHIVEE)
  /** Indicateurs financiers Station-Service (6 KPI Hub) */
  stationFinancials?: StationSectorFinancials;
}

export interface MultiservicesHubProps {
  companyId?: string;
  companyName?: string;
  companyIfu?: string;
  companyRegime?: string;
  company?: any;
  userRole?: string;
  userAssignedActivityId?: string;
  onSelectSector?: (sectorSlug: string, activityId: string, activityName?: string, location?: string) => void;
  onOpenOnboarding?: (sectorSlug: string) => void;
  onLogout?: () => void;
  onOpenSubscription?: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES & FORMULAIRE PAR DÉFAUT
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  sectorSlug: '',
  name: '',
  location: '',
  manager: '',
  status: 'ACTIVE' as ActivityStatus,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) => formatNumber(n);

const generateId = () => `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const getSectorMeta = (slug: string): SectorDefinition | undefined => {
  if (!slug) return undefined;
  const clean = String(slug).replace(/^sec-/, '').toLowerCase().trim();
  return (
    ALL_SECTORS_CATALOG.find((s) => s.slug.toLowerCase() === clean) ||
    ALL_SECTORS_CATALOG.find((s) => s.slug.toLowerCase() === String(slug).toLowerCase().trim())
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export const MultiservicesHub: React.FC<MultiservicesHubProps> = ({
  companyId = '',
  companyName = '',
  companyIfu = '',
  companyRegime = 'Réel Normal',
  company,
  userRole = 'administrateur',
  userAssignedActivityId = '',
  onSelectSector,
  onOpenOnboarding,
  onLogout,
  onOpenSubscription,
}) => {
  const normalizedRole = String(userRole || '').toLowerCase().trim();
  const isAdmin = !userRole || ['administrateur', 'admin', 'super_admin', 'owner', 'propriétaire', 'proprietaire', 'gerant', 'directeur'].includes(normalizedRole);
  const { darkMode, toggleDarkMode } = useUIStore();
  const navigate = useNavigate();

  // ── State ──────────────────────────────────────────────────────────────────
  const [activities, setActivities] = useState<ActivityEntry[]>(() => {
    const rawTarget = Array.isArray(company?.selected_sectors) && company.selected_sectors.length > 0
      ? company.selected_sectors
      : Array.isArray(company?.sectors) && company.sectors.length > 0
      ? company.sectors
      : company?.active_sector ? [company.active_sector] : [];
    const validSlugs = new Set(rawTarget.map((s: string) => String(s).replace(/^sec-/, '').toLowerCase().trim()).filter(Boolean));

    if (companyId) {
      try {
        const cached = localStorage.getItem(`gestio229_activities_${companyId}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const filtered = validSlugs.size > 0
              ? parsed.filter((p: any) => validSlugs.has((p.sectorSlug || '').replace(/^sec-/, '').toLowerCase().trim()))
              : parsed;
            // Réinitialiser les métriques financières à 0 pour forcer le recalcul depuis Supabase
            if (filtered.length > 0) return filtered.map((entry: any) => ({
              ...entry,
              revenue: 0, grossMargin: 0, expenses: 0, netMargin: 0,
              monthRevenue: 0, monthRevenueHT: 0, monthCogsHT: 0, monthGrossMargin: 0,
              monthExpenses: 0, monthNetMargin: 0,
              dayRevenue: 0, dayRevenueHT: 0, dayCogsHT: 0, dayGrossMargin: 0,
              dayExpenses: 0, dayNetMargin: 0,
            }));
          }
        }
      } catch (_) {}
    }
    if (company) {
      const raw = Array.isArray(company.selected_sectors) && company.selected_sectors.length > 0
        ? company.selected_sectors
        : Array.isArray(company.sectors) && company.sectors.length > 0
        ? company.sectors
        : company.active_sector ? [company.active_sector] : [];
      const slugs = Array.from(new Set(raw.map((s: string) => String(s).replace(/^sec-/, '').toLowerCase().trim()).filter(Boolean)));
      if (slugs.length > 0) {
        return slugs.map((slug: string) => {
          const meta = getSectorMeta(slug);
          const actName = `${companyName || company.name || 'Mon Établissement'} — ${meta?.label || slug}`.toUpperCase();
          return {
            id: `act-${(companyId || 'comp').slice(0, 8)}-${slug}`,
            sectorSlug: slug,
            sectorLabel: meta?.label || actName,
            sectorIcon: meta?.emoji ?? '🏢',
            sectorColor: meta?.color ?? '#059669',
            name: actName,
            location: company.city || 'Bénin',
            manager: company.responsible_name || '',
            status: 'ACTIVE' as ActivityStatus,
            isConfigured: true,
            revenue: 0,
            grossMargin: 0,
            expenses: 0,
            netMargin: 0,
            monthRevenue: 0,
            monthGrossMargin: 0,
            monthExpenses: 0,
            monthNetMargin: 0,
          };
        });
      }
    }
    return [];
  });

  // Source de vérité isolée des métriques par secteur — on ne lit plus le cache localStorage
  // car il peut contenir des données du mois précédent. On attend le fetch Supabase.
  const [sectorMetricsMap, setSectorMetricsMap] = useState<Record<string, SectorMetrics>>(() => {
    // Invalider le cache stale au montage
    if (companyId) {
      try { localStorage.removeItem(`gestio229_metrics_${companyId}`); } catch (_) {}
    }
    return {};
  });
  const sectorMetricsRef = useRef<Record<string, SectorMetrics>>(sectorMetricsMap);
  useEffect(() => {
    sectorMetricsRef.current = sectorMetricsMap;
  }, [sectorMetricsMap]);

  const activitiesRef = useRef<ActivityEntry[]>(activities);
  useEffect(() => {
    activitiesRef.current = activities;
  }, [activities]);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState<ActivityEntry | null>(null);
  const [showCompanySettingsModal, setShowCompanySettingsModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Double confirmation suppression
  const [deleteStep1, setDeleteStep1] = useState<ActivityEntry | null>(null);
  const [deleteStep2, setDeleteStep2] = useState<ActivityEntry | null>(null);
  // Vider les données d'un secteur (remise à zéro propre)
  const [clearSectorTarget, setClearSectorTarget] = useState<ActivityEntry | null>(null);

  // Formulaire add/edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  // Totaux financiers réels consolidés
  const [hubTotals, setHubTotals] = useState<HubFinancialTotals | null>(null);

  // ── Multisite Management (Niveaux 1, 2, 3) ──────────────────────────────
  const [sites, setSites] = useState<CompanySite[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [showSiteModal, setShowSiteModal] = useState(false);
  const [siteToEdit, setSiteToEdit] = useState<CompanySite | null>(null);
  const [showMoveSectorModal, setShowMoveSectorModal] = useState(false);
  const [sectorToMove, setSectorToMove] = useState<ActivityEntry | null>(null);
  const [showAttachSectorModal, setShowAttachSectorModal] = useState(false);
  const [targetSiteForAttach, setTargetSiteForAttach] = useState<CompanySite | null>(null);

  // Recherche & filtres Niveau 1
  const [siteSearchQuery, setSiteSearchQuery] = useState('');
  const [siteFilterMode, setSiteFilterMode] = useState<'ALL' | 'PROFITABLE' | 'DEFICIT'>('ALL');

  // Période Niveau 2
  const [sitePeriodFilter, setSitePeriodFilter] = useState<PeriodFilterType>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [customPeriodStats, setCustomPeriodStats] = useState<Record<string, any>>({});

  const loadSites = useCallback(async (currentActs?: ActivityEntry[]) => {
    if (!companyId) return;
    const actsToUse = currentActs || activitiesRef.current;
    const loaded = await loadCompanySites(companyId, company?.city, actsToUse);
    setSites((prev) => {
      if (
        prev.length === loaded.length &&
        prev.every((p, i) => p.id === loaded[i]?.id && p.updated_at === loaded[i]?.updated_at && p.name === loaded[i]?.name)
      ) {
        return prev;
      }
      return loaded;
    });
  }, [companyId, company?.city]);

  const siteFinancialsMap = useMemo(() => {
    const map: Record<string, SiteFinancials> = {};
    sites.forEach((site) => {
      const siteActs = activities.filter((act) => {
        const sId = act.settings?.site_id || act.site_id;
        if (sId) return sId === site.id;
        return site.is_main;
      });
      map[site.id] = computeSiteFinancials(site, siteActs, sectorMetricsMap, customPeriodStats);
    });

    let bestSiteId = '';
    let maxRevenue = -1;
    let mostProfitableSiteId = '';
    let maxRate = -1;

    sites.forEach((site) => {
      const fin = map[site.id];
      if (fin) {
        if (fin.monthRevenue > maxRevenue && fin.monthRevenue > 0) {
          maxRevenue = fin.monthRevenue;
          bestSiteId = site.id;
        }
        if (fin.profitabilityRate > maxRate && fin.monthRevenue > 0) {
          maxRate = fin.profitabilityRate;
          mostProfitableSiteId = site.id;
        }
      }
    });

    if (bestSiteId && map[bestSiteId]) {
      map[bestSiteId].isBestSite = true;
    }
    if (mostProfitableSiteId && map[mostProfitableSiteId]) {
      map[mostProfitableSiteId].isMostProfitable = true;
    }

    return map;
  }, [sites, activities, sectorMetricsMap, customPeriodStats]);

  const filteredSites = useMemo(() => {
    return sites.filter((site) => {
      const fin = siteFinancialsMap[site.id];
      const matchSearch =
        !siteSearchQuery.trim() ||
        site.name.toLowerCase().includes(siteSearchQuery.toLowerCase()) ||
        site.city.toLowerCase().includes(siteSearchQuery.toLowerCase());

      if (!matchSearch) return false;

      if (siteFilterMode === 'PROFITABLE') {
        return (fin?.monthNetMargin || 0) > 0;
      }
      if (siteFilterMode === 'DEFICIT') {
        return (fin?.monthNetMargin || 0) < 0;
      }
      return true;
    });
  }, [sites, siteFinancialsMap, siteSearchQuery, siteFilterMode]);

  const handleSaveSite = async (siteData: Partial<CompanySite> & { name: string; city: string }) => {
    if (!companyId) return;
    await saveCompanySite(companyId, siteData);
    await loadSites();
    setShowSiteModal(false);
    setSiteToEdit(null);
  };

  const handleDeleteSite = async (site: CompanySite) => {
    if (!companyId) return;
    const res = await deleteCompanySite(companyId, site.id, activities);
    if (!res.success) {
      alert(res.error || 'Impossible de supprimer ce site.');
      return;
    }
    await loadSites();
    if (selectedSiteId === site.id) {
      setSelectedSiteId(null);
    }
  };

  const handleConfirmMoveSector = async (activityId: string, targetSite: CompanySite) => {
    if (!companyId) return;
    const res = await moveSectorToSite(companyId, activityId, targetSite);
    if (!res.success) {
      throw new Error(res.error || 'Erreur lors du déplacement du secteur.');
    }

    setActivities((prev) =>
      prev.map((act) => {
        if (act.id === activityId) {
          return {
            ...act,
            location: targetSite.city || targetSite.name,
            settings: {
              ...(act.settings || {}),
              site_id: targetSite.id,
              site_name: targetSite.name,
              site_city: targetSite.city,
            },
            site_id: targetSite.id,
          };
        }
        return act;
      })
    );

    await loadActivitiesFromSupabase();
    await loadSites();
  };

  const handleAttachExistingSectorToSite = async (activityId: string, customTargetSite?: CompanySite) => {
    const currentSite = customTargetSite || targetSiteForAttach || sites.find((s) => s.id === selectedSiteId) || sites.find((s) => s.is_main) || sites[0];
    if (!currentSite) return;
    await handleConfirmMoveSector(activityId, currentSite);
    setTargetSiteForAttach(null);
  };

  const handleCustomDateChange = async (startDate: string, endDate: string) => {
    setCustomStartDate(startDate);
    setCustomEndDate(endDate);
    if (companyId && startDate && endDate) {
      try {
        const stats = await fetchCustomPeriodMetrics(companyId, startDate, endDate);
        setCustomPeriodStats(stats);
      } catch (err) {
        console.warn('[Hub] Erreur chargement période personnalisée:', err);
      }
    }
  };

  // ── Abonnements Global + Par Secteur (Règles Métier CDC) ──────────────────
  const [globalSub, setGlobalSub] = useState<AbonnementGlobal | null>(null);
  const [sectorSubs, setSectorSubs] = useState<AbonnementSecteur[]>([]);
  const [activationModalData, setActivationModalData] = useState<{
    slug: string;
    name?: string;
  } | null>(null);

  const loadSubscriptions = useCallback(async () => {
    if (!companyId) return;
    try {
      const [gSubRes, sSubsRes] = await Promise.allSettled([
        getAbonnementGlobal(companyId, company),
        getAbonnementsSecteurs(companyId, company),
      ]);
      if (gSubRes.status === 'fulfilled' && gSubRes.value) {
        setGlobalSub(gSubRes.value);
      }
      if (sSubsRes.status === 'fulfilled' && Array.isArray(sSubsRes.value)) {
        setSectorSubs(sSubsRes.value);
      }
    } catch (err) {
      console.warn('[Hub] Erreur chargement abonnements:', err);
    }
  }, [companyId, company]);

  useEffect(() => {
    loadSubscriptions();
  }, [loadSubscriptions]);

  const globalDaysRemaining = useMemo(() => {
    if (globalSub?.date_fin_global) {
      return calcDaysRemaining(globalSub.date_fin_global);
    }
    if (company?.subscription_expires_at) {
      return calcDaysRemaining(company.subscription_expires_at);
    }
    if (company?.created_at && (company?.subscription_status === 'trial' || !company?.subscription_status)) {
      const trialEnd = new Date(new Date(company.created_at).getTime() + 30 * 24 * 60 * 60 * 1000);
      return Math.max(0, calcDaysRemaining(trialEnd));
    }
    return 0;
  }, [globalSub, company]);

  // Badge Global en haut du HUB : Abonnement actif (ou Essai J-XX / Expiré)
  const isAnySectorActive = useMemo(() => {
    const now = new Date();
    return (
      globalSub?.statut_global === 'actif' ||
      company?.subscription_status === 'active' ||
      (company?.is_active === true && sectorSubs.some((s) => s.statut_specifique === 'actif' && (!s.date_fin_specifique || new Date(s.date_fin_specifique) >= now)))
    );
  }, [globalSub, company, sectorSubs]);

  const globalBadgeText = useMemo(() => {
    const now = new Date();
    const compExpiresAt = company?.subscription_expires_at ? new Date(company.subscription_expires_at) : null;
    if (isAnySectorActive) {
      const activeDays = compExpiresAt && compExpiresAt >= now
        ? calcDaysRemaining(compExpiresAt)
        : globalDaysRemaining;
      return activeDays > 0 ? `Abonnement actif – ${activeDays} jours restants` : 'Abonnement actif';
    }
    const isTrial = (globalSub?.statut_global === 'essai' || company?.subscription_status === 'trial') && globalDaysRemaining > 0;
    if (isTrial) {
      return `Essai gratuit – ${globalDaysRemaining} jours restants`;
    }
    if (!globalSub && (!company?.subscription_status || company?.subscription_status === 'trial') && globalDaysRemaining > 0) {
      return `Essai gratuit – ${globalDaysRemaining} jours restants`;
    }
    return 'Abonnement expiré';
  }, [isAnySectorActive, globalSub, globalDaysRemaining, company]);

  // Badge sur chaque tuile secteur (Section 12 du cahier des charges) :
  // - « Essai gratuit » (pour les 3 premiers secteurs maximum couverts par l'essai gratuit du compte)
  // - « Actif » (abonnement payant actif)
  // - « En attente de paiement » (secteur ajouté au-delà des 3 secteurs d'essai ou non encore payé)
  // - « Abonnement expiré » (essai ou abonnement arrivé à échéance)
  const getSectorBadgeInfo = useCallback((sectorSlug: string) => {
    const cleanSlug = canonicalSectorSlug(sectorSlug);
    const sub = sectorSubs.find((s) => matchesSectorCode(s.secteur_code, cleanSlug));
    const now = new Date();

    // 0. Déterminer les secteurs de l'entreprise et l'éligibilité aux 3 premiers secteurs gratuits
    const rawCompSectors = Array.isArray(company?.selected_sectors) && company.selected_sectors.length > 0
      ? company.selected_sectors
      : Array.isArray(company?.sectors) && company.sectors.length > 0
      ? company.sectors
      : [cleanSlug];
    const cleanCompSectors = Array.from(new Set(rawCompSectors.map(canonicalSectorSlug).filter(Boolean)));
    const sectorIndex = cleanCompSectors.indexOf(cleanSlug);
    const isFreeEligible = sectorIndex >= 0 && sectorIndex < 3;

    // Déterminer si l'entreprise ou l'abonnement global est actif (payé)
    const compExpiresAt = company?.subscription_expires_at ? new Date(company.subscription_expires_at) : null;
    const isCompanyActive =
      (company?.subscription_status === 'active' && (!compExpiresAt || compExpiresAt >= now)) ||
      (globalSub?.statut_global === 'actif' && globalDaysRemaining > 0);
    const effectiveGlobalDays = compExpiresAt && compExpiresAt >= now
      ? calcDaysRemaining(compExpiresAt)
      : Math.max(0, globalDaysRemaining);
    const effectiveGlobalDateStr = compExpiresAt && compExpiresAt >= now
      ? compExpiresAt.toLocaleDateString('fr-FR')
      : (globalSub?.date_fin_global ? new Date(globalSub.date_fin_global).toLocaleDateString('fr-FR') : '');

    // 1. Abonnement spécifique payant actif et indépendant sur ce secteur (hors rattachement)
    if (sub?.statut_specifique === 'actif' && !sub?.rattache_au_global && sub?.date_fin_specifique) {
      const fin = new Date(sub.date_fin_specifique);
      const days = calcDaysRemaining(fin);
      const expDateStr = fin.toLocaleDateString('fr-FR');

      if (fin >= now) {
        return {
          label: `Abonnement actif – ${days} jours restants`,
          statusText: 'Actif',
          expirationText: expDateStr ? `Expire le ${expDateStr} (${days}j restants)` : `${days}j restants`,
          isIndividuel: true,
          isRattache: false,
          isNonActive: false,
          days,
          badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-black shadow-sm',
        };
      }
    }

    // 2. Si l'abonnement global ou de l'entreprise est actif (payé)
    if (isCompanyActive) {
      if (sub?.statut_specifique !== 'en_attente_paiement') {
        return {
          label: `Abonnement actif – ${effectiveGlobalDays} jours restants`,
          statusText: 'Actif',
          expirationText: effectiveGlobalDateStr ? `Expire le ${effectiveGlobalDateStr} (${effectiveGlobalDays}j restants)` : `${effectiveGlobalDays}j restants`,
          isIndividuel: false,
          isRattache: true,
          isNonActive: false,
          days: effectiveGlobalDays,
          badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 font-black shadow-sm',
        };
      }
    }

    // 3. Période d'essai gratuit active (> 0 jours restants)
    const isTrialActive = (globalSub?.statut_global === 'essai' || company?.subscription_status === 'trial') && globalDaysRemaining > 0;
    if (isTrialActive) {
      const finGlobal = globalSub?.date_fin_global ? new Date(globalSub.date_fin_global) : null;
      const expGlobalStr = finGlobal ? finGlobal.toLocaleDateString('fr-FR') : '';

      if (isFreeEligible) {
        return {
          label: `Essai gratuit – ${globalDaysRemaining} jours restants`,
          statusText: 'Essai gratuit',
          expirationText: expGlobalStr ? `Fin d'essai : ${expGlobalStr} (${globalDaysRemaining}j restants)` : `${globalDaysRemaining}j restants`,
          isIndividuel: false,
          isRattache: true,
          isNonActive: false,
          days: globalDaysRemaining,
          badgeClass: darkMode
            ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 font-bold'
            : 'bg-blue-50 text-blue-700 border-blue-200 font-bold',
        };
      } else {
        return {
          label: 'En attente de paiement',
          statusText: 'En attente de paiement',
          expirationText: 'Au-delà des 3 secteurs gratuits',
          isIndividuel: false,
          isRattache: false,
          isNonActive: true,
          days: 0,
          badgeClass: 'bg-amber-500/20 text-amber-400 border-amber-500/40 font-bold',
        };
      }
    }

    // 4. Statut expiré (fin d'essai ou d'abonnement échue)
    const finGlobal = globalSub?.date_fin_global ? new Date(globalSub.date_fin_global) : null;
    const expGlobalStr = finGlobal ? finGlobal.toLocaleDateString('fr-FR') : '';
    return {
      label: 'Abonnement expiré',
      statusText: 'Abonnement expiré',
      expirationText: expGlobalStr ? `Expiré le ${expGlobalStr}` : 'Expiré',
      isIndividuel: false,
      isRattache: true,
      isNonActive: true,
      days: 0,
      badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40 font-bold',
    };
  }, [sectorSubs, globalSub, globalDaysRemaining, company, darkMode]);

    // Date du jour formatée en heure locale Cotonou (Africa/Porto-Novo)
  const todayDateDisplay = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'Africa/Porto-Novo',
      }).format(new Date());
    } catch {
      return "Aujourd'hui";
    }
  }, []);

  // Mois en cours automatique selon le fuseau Africa/Porto-Novo (PARTIE 4)
  const currentMonthLabel = useMemo(() => {
    try {
      const now = new Date();
      const monthName = new Intl.DateTimeFormat('fr-FR', {
        month: 'long',
        year: 'numeric',
        timeZone: 'Africa/Porto-Novo',
      }).format(now);
      return monthName.charAt(0).toUpperCase() + monthName.slice(1);
    } catch {
      return 'Mois en cours';
    }
  }, []);

  // ── Métriques financières réelles consolidées (Règle d'or Hub : Fuseau Africa/Porto-Novo) ──
  const isFetchingMetricsRef = useRef(false);
  const loadFinancialMetrics = useCallback(async () => {
    if (!companyId || isFetchingMetricsRef.current) return;
    isFetchingMetricsRef.current = true;
    try {
      const result = await fetchHubFinancialMetrics(companyId);
      if (result?.totals) {
        setHubTotals((prev) => {
          // Préserver les totaux non-nuls pour éviter les passages intempestifs à 0
          if ((!result.totals.ca_mois || result.totals.ca_mois === 0) && prev && prev.ca_mois && prev.ca_mois > 0) {
            return prev;
          }
          return result.totals;
        });
      }
      if (result?.sectors) {
        sectorMetricsRef.current = result.sectors;
        setSectorMetricsMap(result.sectors);
        try {
          localStorage.setItem(`gestio229_metrics_${companyId}`, JSON.stringify(result.sectors));
        } catch (_) {}

        setActivities((prev) => {
          let hasChanged = false;
          const updated = prev.map((act) => {
            const normSlug = (act.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
            const card = result.sectors[normSlug] || result.sectors[act.sectorSlug];
            if (!card) return act;
            // Mois calendaire strict — jamais de fallback sur totalRevenue
            const rev = card.monthRevenue ?? act.revenue ?? 0;
            const exp = card.monthExpenses ?? act.expenses ?? 0;
            const net = card.monthNetMargin ?? act.netMargin ?? 0;

            if (
              act.revenue === rev &&
              act.monthRevenue === (card.monthRevenue ?? 0) &&
              act.expenses === exp &&
              act.netMargin === net &&
              act.dayRevenue === (card.dayRevenue ?? 0)
            ) {
              return act;
            }

            hasChanged = true;
            return {
              ...act,
              dayRevenue: card.dayRevenue ?? act.dayRevenue ?? 0,
              dayRevenueHT: card.dayRevenueHT ?? act.dayRevenueHT ?? 0,
              dayCogsHT: card.dayCogsHT ?? act.dayCogsHT ?? 0,
              dayGrossMargin: card.dayGrossMargin ?? act.dayGrossMargin ?? 0,
              dayExpenses: card.dayExpenses ?? act.dayExpenses ?? 0,
              dayNetMargin: card.dayNetMargin ?? act.dayNetMargin ?? 0,
              monthRevenue: card.monthRevenue ?? act.monthRevenue ?? 0,
              monthRevenueHT: card.monthRevenueHT ?? act.monthRevenueHT ?? 0,
              monthCogsHT: card.monthCogsHT ?? act.monthCogsHT ?? 0,
              monthGrossMargin: card.monthGrossMargin ?? act.monthGrossMargin ?? 0,
              monthExpenses: card.monthExpenses ?? act.monthExpenses ?? 0,
              monthNetMargin: card.monthNetMargin ?? act.monthNetMargin ?? 0,
              revenue: rev,
              expenses: exp,
              netMargin: net,
              stationFinancials: card.stationFinancials || act.stationFinancials,
            };
          });

          if (!hasChanged) return prev;
          try {
            localStorage.setItem(`gestio229_activities_${companyId}`, JSON.stringify(updated));
          } catch (_) {}
          return updated;
        });
      }
    } catch (e) {
      console.warn('[Hub] Erreur métriques financières consolidées:', e);
    } finally {
      isFetchingMetricsRef.current = false;
    }
  }, [companyId]);

  // ── Synchronisation Supabase company_activities ─────────────────────────────
  const isFetchingActivitiesRef = useRef(false);
  const loadActivitiesFromSupabase = useCallback(async () => {
    if (!companyId || isFetchingActivitiesRef.current) return;
    isFetchingActivitiesRef.current = true;
    try {
      // 1. Récupération de l'entreprise si les secteurs ne sont pas fournis dans les props
      let comp = company;
      if (
        (!comp?.selected_sectors || (Array.isArray(comp.selected_sectors) && comp.selected_sectors.length === 0)) &&
        (!comp?.sectors || (Array.isArray(comp.sectors) && comp.sectors.length === 0))
      ) {
        const { data: fetchedComp } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyId)
          .maybeSingle();
        if (fetchedComp) {
          comp = fetchedComp;
        }
      }

      // 2. Extraire strictement les secteurs choisis / configurés à l'inscription
      const rawSectorList: string[] = [];
      if (Array.isArray(comp?.selected_sectors) && comp.selected_sectors.length > 0) {
        rawSectorList.push(...comp.selected_sectors);
      } else if (Array.isArray(comp?.sectors) && comp.sectors.length > 0) {
        rawSectorList.push(...comp.sectors);
      } else if (comp?.active_sector) {
        rawSectorList.push(comp.active_sector);
      }

      // 3. Lire les activités existantes depuis la table company_activities
      const { data: dbActivities, error: dbErr } = await supabase
        .from('company_activities')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: true });

      if (dbErr) {
        console.warn('[Hub] Erreur lecture company_activities Supabase:', dbErr.message);
      }

      // Si dbActivities a des activités enregistrées pour cette entreprise, leurs secteurs sont également légitimes
      if (dbActivities && dbActivities.length > 0) {
        for (const row of dbActivities) {
          if (row.sector_slug) {
            rawSectorList.push(row.sector_slug);
          }
        }
      }

      const targetSlugs = Array.from(
        new Set(
          rawSectorList
            .map((s) => String(s || '').replace(/^sec-/, '').toLowerCase().trim())
            .filter(Boolean)
        )
      );

      // Si aucun secteur n'est spécifié, défaut sur 'boutique'
      if (targetSlugs.length === 0) {
        targetSlugs.push('boutique');
      }

      const existingEntries: ActivityEntry[] = [];
      const coveredSlugs = new Set<string>();

      const targetSet = new Set(targetSlugs);
      const metrics = sectorMetricsRef.current;

      if (dbActivities && dbActivities.length > 0) {
        for (const row of dbActivities) {
          const rawSlug = (row.sector_slug || '').replace(/^sec-/, '').toLowerCase().trim();
          if (!targetSet.has(rawSlug)) {
            continue;
          }
          coveredSlugs.add(rawSlug);
          const meta = getSectorMeta(rawSlug) || getSectorMeta(row.sector_slug) || getSectorMeta(row.sector_code?.toLowerCase());
          const card = metrics[rawSlug] || metrics[row.sector_slug];
          const rev = card ? (card.monthRevenue ?? 0) : 0;
          const exp = card ? (card.monthExpenses ?? 0) : 0;
          const net = card ? (card.monthNetMargin ?? 0) : 0;

          existingEntries.push({
            id: row.id,
            sectorSlug: rawSlug || row.sector_slug,
            sectorLabel: meta?.label || row.activity_name,
            sectorIcon: meta?.emoji ?? '🏢',
            sectorColor: row.color || (meta?.color ?? '#059669'),
            name: row.activity_name,
            location: row.pos_location || comp?.city || 'Bénin',
            manager: row.manager_name || comp?.responsible_name || '',
            status: row.status as ActivityStatus,
            isConfigured: true,
            settings: row.settings || {},
            site_id: row.settings?.site_id,
            revenue: rev,
            grossMargin: card ? (card.monthGrossMargin ?? 0) : 0,
            expenses: exp,
            netMargin: net,
            dayRevenue: card?.dayRevenue ?? 0,
            dayRevenueHT: card?.dayRevenueHT ?? 0,
            dayCogsHT: card?.dayCogsHT ?? 0,
            dayGrossMargin: card?.dayGrossMargin ?? 0,
            dayExpenses: card?.dayExpenses ?? 0,
            dayNetMargin: card?.dayNetMargin ?? 0,
            monthRevenue: card?.monthRevenue ?? 0,
            monthRevenueHT: card?.monthRevenueHT ?? 0,
            monthCogsHT: card?.monthCogsHT ?? 0,
            monthGrossMargin: card?.monthGrossMargin ?? 0,
            monthExpenses: card?.monthExpenses ?? 0,
            monthNetMargin: card?.monthNetMargin ?? 0,
            archivedAt: row.archived_at || undefined,
            stationFinancials: card?.stationFinancials,
          });
        }
      }

      // 4. Identifier les secteurs choisis non encore créés dans company_activities
      const missingSlugs = targetSlugs.filter((slug) => !coveredSlugs.has(slug));
      const newSeededEntries: ActivityEntry[] = [];

      if (missingSlugs.length > 0) {
        const rowsToInsert = missingSlugs.map((rawSlug) => {
          const meta = getSectorMeta(rawSlug);
          const actName = `${companyName || comp?.name || 'Mon Établissement'} — ${meta?.label || rawSlug}`.toUpperCase();
          const assignedId = `act-${companyId.slice(0, 8)}-${rawSlug}`;
          const card = metrics[rawSlug];
          const rev = card ? (card.monthRevenue ?? 0) : 0;
          const exp = card ? (card.monthExpenses ?? 0) : 0;
          const net = card ? (card.monthNetMargin ?? 0) : 0;

          newSeededEntries.push({
            id: assignedId,
            sectorSlug: rawSlug,
            sectorLabel: meta?.label || actName,
            sectorIcon: meta?.emoji ?? '🏢',
            sectorColor: meta?.color ?? '#059669',
            name: actName,
            location: comp?.city || 'Bénin',
            manager: comp?.responsible_name || '',
            status: 'ACTIVE',
            isConfigured: true,
            revenue: rev,
            grossMargin: card ? (card.monthGrossMargin ?? 0) : 0,
            expenses: exp,
            netMargin: net,
            dayRevenue: card?.dayRevenue ?? 0,
            dayRevenueHT: card?.dayRevenueHT ?? 0,
            dayCogsHT: card?.dayCogsHT ?? 0,
            dayGrossMargin: card?.dayGrossMargin ?? 0,
            dayExpenses: card?.dayExpenses ?? 0,
            dayNetMargin: card?.dayNetMargin ?? 0,
            monthRevenue: card?.monthRevenue ?? 0,
            monthRevenueHT: card?.monthRevenueHT ?? 0,
            monthCogsHT: card?.monthCogsHT ?? 0,
            monthGrossMargin: card?.monthGrossMargin ?? 0,
            monthExpenses: card?.monthExpenses ?? 0,
            monthNetMargin: card?.monthNetMargin ?? 0,
            stationFinancials: card?.stationFinancials,
          });

          return {
            company_id: companyId,
            sector_slug: rawSlug,
            sector_code: rawSlug.toUpperCase(),
            activity_name: actName,
            pos_location: comp?.city || 'Bénin',
            manager_name: comp?.responsible_name || '',
            status: 'ACTIVE',
            is_active: true,
            color: meta?.color || '#059669',
          };
        });

        // Insertion groupée asynchrone non-bloquante
        supabase
          .from('company_activities')
          .insert(rowsToInsert)
          .then(() => {})
          .catch(() => {});
      }

      // 5. Fusionner, dédupliquer et mettre à jour le state & localStorage
      const allActivities = [...existingEntries, ...newSeededEntries];
      const seen = new Set<string>();
      const finalUnique: ActivityEntry[] = [];
      for (const item of allActivities) {
        const normSlug = (item.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
        const key = `${normSlug}_${item.name.toLowerCase().trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          finalUnique.push(item);
        }
      }

      if (finalUnique.length > 0) {
        setActivities((prev) => {
          const prevMap = new Map(prev.map((p) => [p.id, p]));
          const merged = finalUnique.map((item) => {
            const existing = prevMap.get(item.id);
            // PRÉSERVATION ABSOLUE DES CHIFFRES : Ne jamais réinitialiser à 0 !
            return {
              ...item,
              revenue: (item.revenue && item.revenue > 0) ? item.revenue : (existing?.revenue ?? 0),
              monthRevenue: (item.monthRevenue && item.monthRevenue > 0) ? item.monthRevenue : (existing?.monthRevenue ?? 0),
              monthGrossMargin: (item.monthGrossMargin && item.monthGrossMargin > 0) ? item.monthGrossMargin : (existing?.monthGrossMargin ?? 0),
              grossMargin: (item.grossMargin && item.grossMargin > 0) ? item.grossMargin : (existing?.grossMargin ?? 0),
              expenses: (item.expenses && item.expenses > 0) ? item.expenses : (existing?.expenses ?? 0),
              monthExpenses: (item.monthExpenses && item.monthExpenses > 0) ? item.monthExpenses : (existing?.monthExpenses ?? 0),
              netMargin: (item.netMargin && item.netMargin !== 0) ? item.netMargin : (existing?.netMargin ?? 0),
              monthNetMargin: (item.monthNetMargin && item.monthNetMargin !== 0) ? item.monthNetMargin : (existing?.monthNetMargin ?? 0),
              dayRevenue: (item.dayRevenue && item.dayRevenue > 0) ? item.dayRevenue : (existing?.dayRevenue ?? 0),
              dayRevenueHT: (item.dayRevenueHT && item.dayRevenueHT > 0) ? item.dayRevenueHT : (existing?.dayRevenueHT ?? 0),
              dayCogsHT: (item.dayCogsHT && item.dayCogsHT > 0) ? item.dayCogsHT : (existing?.dayCogsHT ?? 0),
              dayGrossMargin: (item.dayGrossMargin && item.dayGrossMargin > 0) ? item.dayGrossMargin : (existing?.dayGrossMargin ?? 0),
              dayExpenses: (item.dayExpenses && item.dayExpenses > 0) ? item.dayExpenses : (existing?.dayExpenses ?? 0),
              dayNetMargin: (item.dayNetMargin && item.dayNetMargin !== 0) ? item.dayNetMargin : (existing?.dayNetMargin ?? 0),
              stationFinancials: item.stationFinancials || existing?.stationFinancials,
            };
          });

          // Si aucune modification structurelle, ne pas déclencher de re-render
          const isSame = prev.length === merged.length && prev.every((p, i) =>
            p.id === merged[i]?.id &&
            p.name === merged[i]?.name &&
            p.status === merged[i]?.status &&
            p.monthRevenue === merged[i]?.monthRevenue &&
            (p.settings?.site_id || p.site_id) === (merged[i]?.settings?.site_id || merged[i]?.site_id)
          );
          if (isSame) return prev;

          try {
            localStorage.setItem(`gestio229_activities_${companyId}`, JSON.stringify(merged));
          } catch (_) {}
          return merged;
        });

        loadSites(finalUnique);
      }
    } catch (err) {
      console.error('[Hub] Erreur sync Supabase:', err);
    } finally {
      isFetchingActivitiesRef.current = false;
    }
  }, [companyId, company?.city, loadSites]);

  // Synchronisation immédiate si company est disponible et activities est vide
  useEffect(() => {
    if (activities.length === 0 && company) {
      const raw = Array.isArray(company.selected_sectors) && company.selected_sectors.length > 0
        ? company.selected_sectors
        : Array.isArray(company.sectors) && company.sectors.length > 0
        ? company.sectors
        : company.active_sector ? [company.active_sector] : [];
      const slugs = Array.from(new Set(raw.map((s: string) => String(s).replace(/^sec-/, '').toLowerCase().trim()).filter(Boolean)));
      if (slugs.length > 0) {
        const metrics = sectorMetricsRef.current;
        const initial = slugs.map((slug: string) => {
          const meta = getSectorMeta(slug);
          const actName = `${companyName || company.name || 'Mon Établissement'} — ${meta?.label || slug}`.toUpperCase();
          const card = metrics[slug];
          const rev = card ? (card.monthRevenue ?? 0) : 0;
          const exp = card ? (card.monthExpenses ?? 0) : 0;
          const net = card ? (card.monthNetMargin ?? 0) : 0;
          return {
            id: `act-${(companyId || 'comp').slice(0, 8)}-${slug}`,
            sectorSlug: slug,
            sectorLabel: meta?.label || actName,
            sectorIcon: meta?.emoji ?? '🏢',
            sectorColor: meta?.color ?? '#059669',
            name: actName,
            location: company.city || 'Bénin',
            manager: company.responsible_name || '',
            status: 'ACTIVE' as ActivityStatus,
            isConfigured: true,
            revenue: rev,
            grossMargin: card ? (card.monthGrossMargin ?? 0) : 0,
            expenses: exp,
            netMargin: net,
            dayRevenue: card?.dayRevenue ?? 0,
            dayRevenueHT: card?.dayRevenueHT ?? 0,
            dayCogsHT: card?.dayCogsHT ?? 0,
            dayGrossMargin: card?.dayGrossMargin ?? 0,
            dayExpenses: card?.dayExpenses ?? 0,
            dayNetMargin: card?.dayNetMargin ?? 0,
            monthRevenue: card?.monthRevenue ?? 0,
            monthRevenueHT: card?.monthRevenueHT ?? 0,
            monthCogsHT: card?.monthCogsHT ?? 0,
            monthGrossMargin: card?.monthGrossMargin ?? 0,
            monthExpenses: card?.monthExpenses ?? 0,
            monthNetMargin: card?.monthNetMargin ?? 0,
            stationFinancials: card?.stationFinancials,
          };
        });
        setActivities(initial);
      }
    }
  }, [company, companyId, companyName, activities.length]);

  // Chargement initial stable (une seule fois par companyId)
  const initialLoadedRef = useRef(false);
  useEffect(() => {
    if (!companyId) return;
    if (!initialLoadedRef.current) {
      initialLoadedRef.current = true;
      loadActivitiesFromSupabase();
      loadFinancialMetrics();
      loadSites();
    }
  }, [companyId, loadActivitiesFromSupabase, loadFinancialMetrics, loadSites]);

  // Synchronisation Realtime Supabase multi-appareils (Ventes, Dépenses, Caisses, Activités)
  useEffect(() => {
    if (!companyId) return;

    let debounceTimer: any = null;
    const debouncedRefresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadFinancialMetrics();
      }, 500);
    };

    const channel = supabase
      .channel(`hub_realtime_${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_activities',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          loadActivitiesFromSupabase();
          debouncedRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sales_orders',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'caisse_mouvements',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          debouncedRefresh();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses',
          filter: `company_id=eq.${companyId}`,
        },
        () => {
          debouncedRefresh();
        }
      )
      .subscribe();

    const handleTransaction = () => {
      debouncedRefresh();
    };

    window.addEventListener('gestio:transaction_created', handleTransaction);
    window.addEventListener('gestio:sale_created', handleTransaction);
    window.addEventListener('gestio:depense_created', handleTransaction);

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
      window.removeEventListener('gestio:transaction_created', handleTransaction);
      window.removeEventListener('gestio:sale_created', handleTransaction);
      window.removeEventListener('gestio:depense_created', handleTransaction);
    };
  }, [companyId, loadActivitiesFromSupabase, loadFinancialMetrics]);

  const persist = useCallback(
    (data: ActivityEntry[]) => {
      setActivities(data);
      if (companyId) {
        try {
          localStorage.setItem(`gestio229_activities_${companyId}`, JSON.stringify(data));
        } catch (_) {}
      }
    },
    [companyId]
  );

  // ── Filtrage des activités actives vs archivées (PARTIE 9) ─────────────────
  const visibleActivities = useMemo(() => {
    if (!isAdmin && userAssignedActivityId) {
      const match = activities.filter(
        (a) => a.id === userAssignedActivityId || a.sectorSlug === userAssignedActivityId
      );
      if (match.length > 0) return match;
    }
    return activities;
  }, [activities, isAdmin, userAssignedActivityId]);

  const activeActivities = useMemo(
    () => visibleActivities.filter((a) => a.status !== 'ARCHIVEE'),
    [visibleActivities]
  );

  const archivedActivities = useMemo(
    () => visibleActivities.filter((a) => a.status === 'ARCHIVEE'),
    [visibleActivities]
  );

  const unattachedActivities = useMemo(
    () => activeActivities.filter((a) => !a.settings?.site_id && !a.site_id),
    [activeActivities]
  );

  // ── CALCULS CONSOLIDÉS DU JOUR (PARTIE 3) & DU MOIS (PARTIE 4) ─────────────
  const dayTotals = useMemo(() => {
    const sumRevenue = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.dayRevenue ?? s.dayRevenue ?? 0);
    }, 0);
    const sumGrossMargin = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.dayGrossMargin ?? s.dayGrossMargin ?? 0);
    }, 0);
    const sumCogs = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.dayCogsHT ?? s.dayCogsHT ?? 0);
    }, 0);
    const sumExpenses = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.dayExpenses ?? s.dayExpenses ?? 0);
    }, 0);
    const sumNetMargin = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.dayNetMargin ?? s.dayNetMargin ?? 0);
    }, 0);

    const totalRevenue = hubTotals && typeof hubTotals.ca_jour === 'number' && hubTotals.ca_jour > 0
      ? hubTotals.ca_jour
      : sumRevenue;
    const totalGrossMargin = hubTotals && typeof hubTotals.marge_brute_jour === 'number' && hubTotals.marge_brute_jour > 0
      ? hubTotals.marge_brute_jour
      : sumGrossMargin;
    const totalCogs = hubTotals && typeof hubTotals.cogs_jour_ht === 'number' && hubTotals.cogs_jour_ht > 0
      ? hubTotals.cogs_jour_ht
      : sumCogs;
    const totalExpenses = hubTotals && typeof hubTotals.depenses_jour === 'number' && hubTotals.depenses_jour > 0
      ? hubTotals.depenses_jour
      : sumExpenses;
    const totalNetMargin = hubTotals && typeof hubTotals.marge_jour === 'number' && hubTotals.marge_jour !== 0
      ? hubTotals.marge_jour
      : sumNetMargin;
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalGrossMargin, totalCogs, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities, hubTotals, sectorMetricsMap]);

  const monthTotals = useMemo(() => {
    const sumRevenue = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.monthRevenue ?? s.monthRevenue ?? s.revenue ?? 0);
    }, 0);
    const sumGrossMargin = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.monthGrossMargin ?? s.monthGrossMargin ?? 0);
    }, 0);
    const sumCogs = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.monthCogsHT ?? s.monthCogsHT ?? 0);
    }, 0);
    const sumExpenses = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.monthExpenses ?? s.monthExpenses ?? 0);
    }, 0);
    const sumNetMargin = activeActivities.reduce((a, s) => {
      const norm = (s.sectorSlug || '').toLowerCase().trim().replace(/^sec-/, '');
      const m = sectorMetricsMap[norm] || sectorMetricsMap[s.sectorSlug];
      return a + (m?.monthNetMargin ?? s.monthNetMargin ?? 0);
    }, 0);

    const totalRevenue = hubTotals && typeof hubTotals.ca_mois === 'number' && hubTotals.ca_mois > 0
      ? hubTotals.ca_mois
      : sumRevenue;
    const totalGrossMargin = hubTotals && typeof hubTotals.marge_brute_mois === 'number' && hubTotals.marge_brute_mois > 0
      ? hubTotals.marge_brute_mois
      : sumGrossMargin;
    const totalCogs = hubTotals && typeof hubTotals.cogs_mois_ht === 'number' && hubTotals.cogs_mois_ht > 0
      ? hubTotals.cogs_mois_ht
      : sumCogs;
    const totalExpenses = hubTotals && typeof hubTotals.depenses_mois === 'number' && hubTotals.depenses_mois > 0
      ? hubTotals.depenses_mois
      : sumExpenses;
    const totalNetMargin = hubTotals && typeof hubTotals.marge_mois === 'number' && hubTotals.marge_mois !== 0
      ? hubTotals.marge_mois
      : sumNetMargin;
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalGrossMargin, totalCogs, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities, hubTotals, sectorMetricsMap]);

  // ── Actions : Ajout d'activité (PARTIE 6) ──────────────────────────────────
  const handleAddSubmit = async () => {
    if (!form.sectorSlug) {
      setFormError("Veuillez sélectionner un secteur d'activité.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Le nom de l'établissement est requis.");
      return;
    }
    if (!form.location.trim()) {
      setFormError("Le lieu de l'établissement est requis.");
      return;
    }

    const meta = getSectorMeta(form.sectorSlug);
    if (!meta) {
      setFormError('Secteur introuvable.');
      return;
    }

    try {
      let createdId = generateId();
      const targetSite = selectedSiteId ? sites.find((s) => s.id === selectedSiteId) : sites.find((s) => s.is_main) || sites[0];
      const initialSettings = targetSite
        ? { site_id: targetSite.id, site_name: targetSite.name, site_city: targetSite.city }
        : {};

      if (companyId) {
        const { data: newRow, error: insertErr } = await supabase
          .from('company_activities')
          .insert({
            company_id: companyId,
            sector_slug: meta.slug,
            sector_code: meta.slug.toUpperCase(),
            activity_name: form.name.trim().toUpperCase(),
            pos_location: form.location.trim() || targetSite?.city || 'Bénin',
            manager_name: form.manager.trim(),
            status: 'ACTIVE',
            is_active: true,
            color: meta.color,
            settings: initialSettings,
          })
          .select()
          .single();

        if (insertErr) {
          console.warn('[Hub] Insertion distante différée (RLS/session):', insertErr.message);
        } else if (newRow) {
          createdId = newRow.id;
        }

        // Mettre à jour selected_sectors de la société si nécessaire
        try {
          const currentSectors = Array.isArray(company?.selected_sectors) ? company.selected_sectors : [];
          if (!currentSectors.includes(meta.slug) && !currentSectors.includes(`sec-${meta.slug}`)) {
            await supabase
              .from('companies')
              .update({
                selected_sectors: [...currentSectors, meta.slug],
                sectors: [...currentSectors, meta.slug],
                updated_at: new Date().toISOString(),
              })
              .eq('id', companyId);
          }
        } catch (cErr) {
          console.warn('[Hub] Notice update selected_sectors:', cErr);
        }

        // Section 3 & 4 CDC : Ajouter le secteur sans accorder de nouvel essai individuel de 30 jours
        try {
          await ajouterSecteurAuCompte(companyId, meta.slug, form.name.trim().toUpperCase());
          await loadSubscriptions();
        } catch (subErr) {
          console.warn('[Hub] Notice ajout secteur:', subErr);
        }
      }

      const newEntry: ActivityEntry = {
        id: createdId,
        sectorSlug: meta.slug,
        sectorLabel: meta.label,
        sectorIcon: meta.emoji || '🏢',
        sectorColor: meta.color,
        name: form.name.trim().toUpperCase(),
        location: form.location.trim() || targetSite?.city || 'Bénin',
        manager: form.manager.trim(),
        status: 'ACTIVE',
        isConfigured: true,
        settings: initialSettings,
        site_id: targetSite?.id,
        revenue: 0,
        grossMargin: 0,
        expenses: 0,
        netMargin: 0,
        monthRevenue: 0,
        monthGrossMargin: 0,
        monthExpenses: 0,
        monthNetMargin: 0,
      };

      persist([...activities, newEntry]);
      setShowAddModal(false);
      setForm(EMPTY_FORM);
      setFormError('');
    } catch (err: any) {
      console.error('[Hub] Erreur création activité:', err);
      setFormError(err.message || "Erreur lors de l'enregistrement dans la base de données.");
    }
  };

  // ── Actions : Modification des paramètres (PARTIE 7) ──────────────────────
  const handleSettingsSubmit = async () => {
    if (!showSettingsModal) return;
    if (!form.name.trim()) {
      setFormError("Le nom de l'établissement est requis.");
      return;
    }
    if (!form.location.trim()) {
      setFormError('Le lieu est requis.');
      return;
    }

    try {
      if (companyId) {
        try {
          const { error: upErr } = await supabase
            .from('company_activities')
            .update({
              activity_name: form.name.trim().toUpperCase(),
              pos_location: form.location.trim(),
              manager_name: form.manager.trim(),
              status: form.status,
              updated_at: new Date().toISOString(),
            })
            .eq('id', showSettingsModal.id)
            .eq('company_id', companyId);

          if (upErr) console.warn('[Hub] Update distant différé:', upErr.message);
        } catch (upErr) {
          console.warn('[Hub] Exception update Supabase:', upErr);
        }
      }

      const updated = activities.map((a) =>
        a.id === showSettingsModal.id
          ? {
              ...a,
              name: form.name.trim().toUpperCase(),
              location: form.location.trim(),
              manager: form.manager.trim(),
              status: form.status,
            }
          : a
      );

      persist(updated);
      setShowSettingsModal(null);
      setForm(EMPTY_FORM);
      setFormError('');
    } catch (err: any) {
      console.error('[Hub] Erreur modification activité:', err);
      setFormError(err.message || 'Erreur lors de la mise à jour.');
    }
  };

  // ── Actions : Suppression sécurisée avec double confirmation (PARTIE 9) ───
  const initiateDelete = (act: ActivityEntry) => {
    setDeleteStep1(act);
    setDeleteStep2(null);
  };

  const proceedToSecondConfirmation = () => {
    if (!deleteStep1) return;
    setDeleteStep2(deleteStep1);
    setDeleteStep1(null);
  };

  const confirmFinalSoftDelete = async () => {
    if (!deleteStep2) return;
    try {
      if (companyId) {
        try {
          await supabase
            .from('company_activities')
            .update({
              status: 'ARCHIVEE',
              is_active: false,
              archived_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', deleteStep2.id)
            .eq('company_id', companyId);
        } catch (delErr) {
          console.warn('[Hub] Soft delete distant différé:', delErr);
        }

        // Désactivation automatique des collaborateurs internes liés à ce secteur/activité
        const targetSlug = (deleteStep2.sectorSlug || '').toLowerCase().replace(/^sec-/, '').trim();
        if (targetSlug) {
          try {
            await supabase
              .from('user_profiles')
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq('company_id', companyId)
              .neq('role', 'administrateur')
              .or(`sector_id.eq.${targetSlug},permissions->>sector_slug.eq.${targetSlug},permissions->>activity_id.eq.${deleteStep2.id}`);
          } catch (deactErr) {
            console.error('[Hub] Erreur désactivation collaborateurs liés:', deactErr);
          }
        }
      }
      const updated = activities.map((a) =>
        a.id === deleteStep2.id
          ? {
              ...a,
              status: 'ARCHIVEE' as ActivityStatus,
              archivedAt: new Date().toISOString(),
            }
          : a
      );
      persist(updated);
    } catch (err) {
      console.error('[Hub] Erreur archivage activité:', err);
    } finally {
      setDeleteStep2(null);
    }
  };

  const restoreActivity = async (act: ActivityEntry) => {
    try {
      if (companyId) {
        try {
          await supabase
            .from('company_activities')
            .update({
              status: 'ACTIVE',
              is_active: true,
              archived_at: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', act.id)
            .eq('company_id', companyId);
        } catch (resErr) {
          console.warn('[Hub] Restauration distante différée:', resErr);
        }
      }
      const updated = activities.map((a) =>
        a.id === act.id
          ? { ...a, status: 'ACTIVE' as ActivityStatus, archivedAt: undefined }
          : a
      );
      persist(updated);
    } catch (err) {
      console.error('[Hub] Erreur restauration activité:', err);
    }
  };

  // ── Action : Ouvrir l'application métier (Section 4 : Ouverture vers le Tableau de bord même si inactif) ──
  const handleOpenActivity = (act: ActivityEntry) => {
    // Si l'abonnement du secteur est inactif ou expiré, ouvrir l'interface claire de présentation & abonnement
    const badgeInfo = getSectorBadgeInfo(act.sectorSlug);
    if ((badgeInfo as any)?.isNonActive) {
      setActivationModalData({
        slug: act.sectorSlug,
        name: act.name,
      });
      return;
    }

    if (onSelectSector) {
      onSelectSector(act.sectorSlug, act.id, act.name, act.location);
    } else {
      navigate(`/app/${act.sectorSlug}/tableau-bord?activityId=${act.id}`);
    }
  };

  const handleSectorActivated = async (activatedSlug: string) => {
    await Promise.all([loadSubscriptions(), loadActivitiesFromSupabase()]);
    setActivationModalData(null);
    const act = activities.find((a) => a.sectorSlug === activatedSlug);
    if (onSelectSector && act) {
      onSelectSector(act.sectorSlug, act.id, act.name, act.location);
    } else {
      navigate(`/app/${activatedSlug}`);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadActivitiesFromSupabase();
      await loadFinancialMetrics();
      await loadSubscriptions();
    } catch (err) {
      console.warn('[Hub] Erreur rafraîchissement:', err);
    } finally {
      setTimeout(() => setIsRefreshing(false), 300);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen p-4 sm:p-6 lg:p-8 transition-colors duration-200 selection:bg-emerald-500 selection:text-white ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="w-full max-w-none px-3 lg:px-4 mb-8">
        <div className={`flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-6 border-b ${
          darkMode ? 'border-slate-800' : 'border-slate-200'
        }`}>
          <div className="flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-500 border border-emerald-500/30">
                HUB CENTRAL MULTISERVICES — GESTIO 229
              </span>
              {/* Badge global en haut : Essai J-23 (Règle 6 CDC) */}
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{globalBadgeText}</span>
              </span>
              <span className={`text-xs font-mono ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Bénin • UEMOA (FCFA)</span>
            </div>

            {companyName ? (
              <h1 className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{companyName}</h1>
            ) : (
              <h1 className={`text-2xl sm:text-3xl font-black mt-2 tracking-tight italic ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                — Nom de l'entreprise non configuré —
              </h1>
            )}

            <p className={`text-xs sm:text-sm mt-1 flex items-center gap-2 flex-wrap ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {companyIfu && (
                <>
                  <span>N° IFU : <strong className={`font-mono ${darkMode ? 'text-slate-300' : 'text-slate-800'}`}>{companyIfu}</strong></span>
                  <span>•</span>
                </>
              )}
              <span>Régime : <strong className={darkMode ? 'text-slate-300' : 'text-slate-800'}>{companyRegime}</strong></span>
              <span>•</span>
              <span className="text-emerald-500 font-medium">{activeActivities.length} Activité(s) active(s)</span>
              {archivedActivities.length > 0 && (
                <>
                  <span>•</span>
                  <span className={darkMode ? 'text-slate-500' : 'text-slate-400'}>{archivedActivities.length} archivée(s)</span>
                </>
              )}
            </p>
          </div>

          {/* Actions globales (réservation espace coin vert PWA via ) */}
          <div className="flex items-center gap-2 flex-wrap self-start lg:pr-36">
            {/* Toggle Mode Sombre / Clair */}
            <button
              type="button"
              onClick={toggleDarkMode}
              title={darkMode ? "Passer en mode clair" : "Passer en mode sombre"}
              className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
                darkMode
                  ? 'bg-slate-900 hover:bg-slate-800 text-amber-400 border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 shadow-sm'
              }`}
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>

            <button
              onClick={handleRefresh}
              title="Actualiser"
              className={`p-2 rounded-xl transition-colors border ${
                darkMode
                  ? 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300 hover:text-white'
                  : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm'
              }`}
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-emerald-500' : ''} />
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={() => setShowCompanySettingsModal(true)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                    darkMode
                      ? 'bg-slate-900 hover:bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                      : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-700 shadow-sm'
                  }`}
                >
                  <Settings size={14} /> Entreprise
                </button>
                <button
                  onClick={onOpenSubscription || (() => {
                    const targetSector = (activities[0]?.sectorSlug || company?.active_sector || 'boutique').replace(/^sec-/, '').toLowerCase();
                    navigate(`/app/${targetSector}/abonnement`);
                  })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-xs font-bold text-white transition-colors shadow-sm shadow-indigo-600/20"
                >
                  <CreditCard size={14} /> Mon Abonnement
                </button>
                <button
                  onClick={() => { setForm(EMPTY_FORM); setFormError(''); setShowAddModal(true); }}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white transition-colors shadow-md shadow-emerald-500/20"
                >
                  <Plus size={14} /> Ajouter une activité
                </button>
              </>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                title="Se déconnecter de la session"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors border ${
                  darkMode
                    ? 'bg-slate-900 hover:bg-rose-950/60 border-slate-700 hover:border-rose-500/50 text-slate-300 hover:text-rose-300'
                    : 'bg-white hover:bg-rose-50 border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-600 shadow-sm'
                }`}
              >
                <LogOut size={14} /> Déconnexion
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══ GESTION MULTISITE — NIVEAU 2 : VUE DÉTAILLÉE D'UN SITE ═════════ */}
      {selectedSiteId && (() => {
        const selectedSite = sites.find((s) => s.id === selectedSiteId) || sites[0];
        if (!selectedSite) return null;
        const currentSiteFin = siteFinancialsMap[selectedSite.id] || {
          siteId: selectedSite.id,
          dayRevenue: 0,
          dayGrossMargin: 0,
          dayExpenses: 0,
          dayNetMargin: 0,
          monthRevenue: 0,
          monthGrossMargin: 0,
          monthExpenses: 0,
          monthNetMargin: 0,
          yearRevenue: 0,
          yearGrossMargin: 0,
          yearExpenses: 0,
          yearNetMargin: 0,
          periodRevenue: 0,
          periodGrossMargin: 0,
          periodExpenses: 0,
          periodNetMargin: 0,
          creances: 0,
          profitabilityRate: 0,
          sectorsCount: 0,
        };

        return (
          <div className="w-full max-w-none px-3 lg:px-4 mb-10">
            <SiteDetailView
              site={selectedSite}
              companyName={companyName}
              activities={visibleActivities}
              financials={currentSiteFin}
              sectorMetricsMap={sectorMetricsMap}
              darkMode={darkMode}
              isAdmin={isAdmin}
              currentMonthLabel={currentMonthLabel}
              onBack={() => setSelectedSiteId(null)}
              onEditSite={(s) => {
                setSiteToEdit(s);
                setShowSiteModal(true);
              }}
              onOpenSector={handleOpenActivity}
              onEditSectorSettings={(act) => {
                setForm({
                  sectorSlug: act.sectorSlug,
                  name: act.name,
                  location: act.location,
                  manager: act.manager,
                  status: act.status,
                });
                setFormError('');
                setShowSettingsModal(act);
              }}
              onMoveSector={(act) => {
                setSectorToMove(act);
                setShowMoveSectorModal(true);
              }}
              onDeleteSector={(act) => initiateDelete(act)}
              onClearSector={(act) => setClearSectorTarget(act)}
              onAddSectorToSite={() => setShowAttachSectorModal(true)}
              periodFilter={sitePeriodFilter}
              onPeriodFilterChange={setSitePeriodFilter}
              customStartDate={customStartDate}
              customEndDate={customEndDate}
              onCustomDateChange={handleCustomDateChange}
              customPeriodStats={customPeriodStats}
            />
          </div>
        );
      })()}

      {/* ══ NIVEAU 1 : TABLEAU DE BORD GLOBAL & SITES D'EXPLOITATION ════════ */}
      {!selectedSiteId && (
        <>
      {/* ══ GRILLE KPI DU JOUR & DU MOIS ════════════════════════════════════ */}
      <div className="w-full max-w-none px-3 lg:px-4 grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">

        {/* ── SECTION PARTIE 3 : TABLEAU DE BORD DU JOUR ────────────────── */}
        <div className={`rounded-2xl p-6 shadow-xl relative overflow-hidden border ${
          darkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className={`flex items-center justify-between mb-5 border-b pb-3 ${
            darkMode ? 'border-slate-800' : 'border-slate-100'
          }`}>
            <div>
              <h2 className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${
                darkMode ? 'text-slate-300' : 'text-slate-800'
              }`}>
                <Calendar size={16} className="text-blue-500" />
                TABLEAU DE BORD DU JOUR — {todayDateDisplay}
              </h2>
              <span className={`text-[11px] ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Toutes activités confondues — Données du {todayDateDisplay} (Cotonou)</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20 font-semibold">
              {todayDateDisplay}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* CA DU JOUR */}
            <div className={`p-4 rounded-xl border ${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                CA DU JOUR
              </span>
              <div className={`text-2xl font-black tracking-tight ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                {fmt(dayTotals.totalRevenue)}
              </div>
              <div className="text-xs text-blue-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* DÉPENSES DU JOUR */}
            <div className={`p-4 rounded-xl border ${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                DÉPENSES DU JOUR
              </span>
              <div className="text-2xl font-black text-rose-500 tracking-tight">
                {fmt(dayTotals.totalExpenses)}
              </div>
              <div className="text-xs text-rose-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* MARGE NETTE DU JOUR */}
            <div className={`p-4 rounded-xl border transition-colors ${
              dayTotals.totalNetMargin >= 0
                ? darkMode ? 'bg-slate-950/60 border-emerald-500/20' : 'bg-emerald-50/50 border-emerald-200'
                : darkMode ? 'bg-slate-950/60 border-rose-500/30' : 'bg-rose-50/50 border-rose-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${
                  dayTotals.totalNetMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  MARGE NETTE DU JOUR
                </span>
                {dayTotals.netMarginRate !== 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    dayTotals.totalNetMargin >= 0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {dayTotals.netMarginRate.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className={`text-2xl font-black tracking-tight ${
                dayTotals.totalNetMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}>
                {fmt(dayTotals.totalNetMargin)}
              </div>
              <div className={`text-xs font-semibold mt-0.5 ${
                dayTotals.totalNetMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                F CFA {dayTotals.totalNetMargin < 0 ? '(Déficit)' : '(Bénéfice Réel)'}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION PARTIE 4 : SYNTHÈSE DU MOIS (MOIS EN COURS AUTOMATIQUE) ── */}
        <div className={`rounded-2xl p-6 shadow-xl relative overflow-hidden border ${
          darkMode ? 'bg-slate-900/80 border-indigo-500/30' : 'bg-white border-indigo-200 shadow-sm'
        }`}>
          <div className={`flex items-center justify-between mb-5 border-b pb-3 ${
            darkMode ? 'border-slate-800' : 'border-slate-100'
          }`}>
            <div>
              <h2 className={`text-sm font-bold uppercase tracking-wider flex items-center gap-2 ${
                darkMode ? 'text-indigo-300' : 'text-indigo-900'
              }`}>
                <TrendingUp size={16} className="text-indigo-500" />
                SYNTHÈSE DU MOIS — {currentMonthLabel}
              </h2>
              <span className={`text-[11px] ${darkMode ? 'text-indigo-400/80' : 'text-indigo-600'}`}>Toutes activités confondues — Cumul du mois ({currentMonthLabel})</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 font-bold capitalize">
              {currentMonthLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. CA DU MOIS */}
            <div className={`p-4 rounded-xl border ${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                CA DU MOIS
              </span>
              <div className={`text-2xl font-black tracking-tight ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                {fmt(monthTotals.totalRevenue)}
              </div>
              <div className="text-xs text-indigo-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* 2. MARGE COMMERCIALE BRUTE */}
            <div className={`p-4 rounded-xl border ${
              darkMode ? 'bg-slate-950/60 border-indigo-500/20' : 'bg-indigo-50/50 border-indigo-200'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${
                darkMode ? 'text-indigo-400' : 'text-indigo-700'
              }`}>
                MARGE BRUTE (CA - COGS)
              </span>
              <div className={`text-2xl font-black tracking-tight ${
                monthTotals.totalGrossMargin >= 0
                  ? (darkMode ? 'text-indigo-300' : 'text-indigo-900')
                  : 'text-rose-500'
              }`}>
                {fmt(monthTotals.totalGrossMargin)}
              </div>
              <div className={`text-[11px] font-medium mt-0.5 ${darkMode ? 'text-indigo-400/80' : 'text-indigo-600'}`}>
                {monthTotals.totalCogs > 0
                  ? `Coût d'achat : ${fmt(monthTotals.totalCogs)} F`
                  : (monthTotals.totalGrossMargin > 0 ? "F CFA (Ventes sans achat)" : "Coût d'achat indisponible")}
              </div>
            </div>

            {/* 3. DÉPENSES D'EXPLOITATION DU MOIS */}
            <div className={`p-4 rounded-xl border ${
              darkMode ? 'bg-slate-950/60 border-slate-800/80' : 'bg-slate-50 border-slate-200'
            }`}>
              <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}>
                DÉPENSES DU MOIS
              </span>
              <div className="text-2xl font-black text-rose-500 tracking-tight">
                {fmt(monthTotals.totalExpenses)}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-0.5">Charges d'exploitation</div>
            </div>

            {/* 4. MARGE NETTE DU MOIS (BÉNÉFICE RÉEL) */}
            <div className={`p-4 rounded-xl border transition-colors ${
              monthTotals.totalNetMargin >= 0
                ? darkMode ? 'bg-slate-950/60 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-200'
                : darkMode ? 'bg-slate-950/60 border-rose-500/30' : 'bg-rose-50/50 border-rose-200'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-wider block mb-1 ${
                  monthTotals.totalNetMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'
                }`}>
                  MARGE NETTE DU MOIS
                </span>
                {monthTotals.netMarginRate !== 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    monthTotals.totalNetMargin >= 0
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}>
                    {monthTotals.netMarginRate.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className={`text-2xl font-black tracking-tight ${
                monthTotals.totalNetMargin >= 0 ? 'text-emerald-500' : 'text-rose-500'
              }`}>
                {fmt(monthTotals.totalNetMargin)}
              </div>
              <div className={`text-xs font-semibold mt-0.5 ${
                monthTotals.totalNetMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}>
                F CFA {monthTotals.totalNetMargin < 0 ? '(Déficit)' : '(Bénéfice Réel)'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── BANDEAU SYNTHÈSE GLOBALE & CUMUL ANNUEL (PARTIE 7) ─────────────── */}
      <div className="w-full max-w-none px-3 lg:px-4 mb-8">
        <div className={`p-4 rounded-2xl border shadow-md flex items-center justify-between flex-wrap gap-4 ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center gap-4 flex-wrap text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-500 font-bold">
              <Building2 size={16} />
              <span>{sites.length} Site{sites.length > 1 ? 's' : ''} d'exploitation</span>
            </span>
            <span className="text-slate-400">•</span>
            <span className="flex items-center gap-1.5 text-indigo-400 font-bold">
              <Layers size={16} />
              <span>{activeActivities.length} Secteur{activeActivities.length > 1 ? 's' : ''} actif{activeActivities.length > 1 ? 's' : ''}</span>
            </span>
            {(hubTotals?.creances_totales || 0) > 0 && (
              <>
                <span className="text-slate-400">•</span>
                <span className="flex items-center gap-1.5 text-amber-500">
                  <AlertCircle size={15} />
                  <span>Créances clients en attente : <strong>{fmt(hubTotals?.creances_totales || 0)} F CFA</strong></span>
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
              Cumul annuel : CA <strong className={darkMode ? 'text-indigo-300' : 'text-indigo-700'}>{fmt(hubTotals?.ca_annee || monthTotals.totalRevenue)} F</strong>
            </span>
            <span className="text-slate-400">•</span>
            <span className={(hubTotals?.marge_annee || monthTotals.totalNetMargin) >= 0 ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>
              Marge nette <strong className="font-black">{fmt(hubTotals?.marge_annee || monthTotals.totalNetMargin)} F CFA</strong>
            </span>
          </div>
        </div>
      </div>

      {/* ── 2. GRAPHIQUES CONSOLIDÉS & ANALYSES VISUELLES ─────────────────── */}
      <div className="w-full max-w-none px-3 lg:px-4">
        <HubGlobalCharts
          totals={
            hubTotals || {
              ca_jour: dayTotals.totalRevenue,
              depenses_jour: dayTotals.totalExpenses,
              marge_jour: dayTotals.totalNetMargin,
              ca_mois: monthTotals.totalRevenue,
              depenses_mois: monthTotals.totalExpenses,
              marge_mois: monthTotals.totalNetMargin,
              ca_annee: monthTotals.totalRevenue,
              depenses_annee: monthTotals.totalExpenses,
              marge_annee: monthTotals.totalNetMargin,
              creances_totales: 0,
              date: '',
              mois_debut: '',
              mois_fin: '',
              annee_debut: '',
              annee_fin: '',
            }
          }
          sites={sites}
          siteFinancialsMap={siteFinancialsMap}
          sectorMetricsMap={sectorMetricsMap}
          activities={activeActivities}
          darkMode={darkMode}
        />
      </div>

      {/* ── 3. MES SITES D'EXPLOITATION (GRILLE NIVEAU 1) ───────────────── */}
      <div className="w-full max-w-none px-3 lg:px-4 mb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className={`text-xl font-black uppercase tracking-tight flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <Building2 size={22} className="text-emerald-500" />
              <span>Mes Sites d'Exploitation ({sites.length})</span>
            </h2>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Visualisez la rentabilité de chaque site. Cliquez sur « VOIR LE DÉTAIL » pour gérer les secteurs rattachés.
            </p>
          </div>

          {/* Recherche, filtres & Nouveau site */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <input
              type="text"
              placeholder="Rechercher un site..."
              value={siteSearchQuery}
              onChange={(e) => setSiteSearchQuery(e.target.value)}
              className={`px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500/30 w-44 sm:w-56 ${
                darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
              }`}
            />

            <div className="flex items-center gap-1 p-0.5 rounded-xl border bg-slate-100 dark:bg-slate-900 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSiteFilterMode('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  siteFilterMode === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : darkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tous
              </button>
              <button
                type="button"
                onClick={() => setSiteFilterMode('PROFITABLE')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  siteFilterMode === 'PROFITABLE'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : darkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Rentables
              </button>
              <button
                type="button"
                onClick={() => setSiteFilterMode('DEFICIT')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  siteFilterMode === 'DEFICIT'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : darkMode
                    ? 'text-slate-400 hover:text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Déficitaires
              </button>
            </div>

            {archivedActivities.length > 0 && (
              <button
                type="button"
                onClick={() => setShowArchived(!showArchived)}
                className={`text-xs flex items-center gap-1.5 px-3 py-2 rounded-xl border transition-colors ${
                  darkMode
                    ? 'border-slate-800 text-slate-400 hover:text-white bg-slate-900/60'
                    : 'border-slate-200 text-slate-600 hover:text-slate-900 bg-white'
                }`}
              >
                <Archive size={14} />
                <span>{showArchived ? 'Masquer' : 'Voir'} archives ({archivedActivities.length})</span>
              </button>
            )}

            {isAdmin && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTargetSiteForAttach(sites.find((s) => s.is_main) || sites[0] || null);
                    setShowAttachSectorModal(true);
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                    darkMode
                      ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border-slate-700'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                  title="Rattacher une activité existante à un site"
                >
                  <ArrowRightLeft size={14} className="text-emerald-500" />
                  <span>Rattacher une activité</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSiteToEdit(null);
                    setShowSiteModal(true);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-[0.99] cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Nouveau site</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Bannière d'information pour les entreprises existantes ayant des activités non rattachées */}
        {unattachedActivities.length > 0 && (
          <div className={`p-4 rounded-2xl border mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm ${
            darkMode ? 'bg-amber-950/30 border-amber-800/60 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-500 shrink-0">
                <AlertCircle size={20} />
              </div>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider">
                  {unattachedActivities.length} activité(s) antérieure(s) à rattacher
                </h4>
                <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Rattachez vos activités existantes à un site d'exploitation pour organiser vos points de vente et accéder à leurs espaces métiers.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTargetSiteForAttach(sites.find((s) => s.is_main) || sites[0] || null);
                setShowAttachSectorModal(true);
              }}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shrink-0 transition-all shadow-sm shadow-amber-600/20 active:scale-95 cursor-pointer"
            >
              Rattacher une activité
            </button>
          </div>
        )}

        {/* Grille des cartes des sites */}
        {filteredSites.length === 0 ? (
          <div
            className={`rounded-2xl p-10 border text-center space-y-3 ${
              darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-500 w-16 h-16 mx-auto flex items-center justify-center">
              <Building2 size={30} />
            </div>
            <h3 className={`text-base font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              Aucun site d'exploitation trouvé
            </h3>
            <p className={`text-xs max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {siteSearchQuery || siteFilterMode !== 'ALL'
                ? 'Aucun site ne correspond aux critères de recherche actuels.'
                : 'Créez votre premier site pour organiser vos points de vente et vos secteurs.'}
            </p>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  setSiteToEdit(null);
                  setShowSiteModal(true);
                }}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all"
              >
                <Plus size={14} />
                <span>Créer un site</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSites.map((site) => {
              const fin = siteFinancialsMap[site.id] || {
                siteId: site.id,
                dayRevenue: 0,
                dayGrossMargin: 0,
                dayExpenses: 0,
                dayNetMargin: 0,
                monthRevenue: 0,
                monthGrossMargin: 0,
                monthExpenses: 0,
                monthNetMargin: 0,
                yearRevenue: 0,
                yearGrossMargin: 0,
                yearExpenses: 0,
                yearNetMargin: 0,
                periodRevenue: 0,
                periodGrossMargin: 0,
                periodExpenses: 0,
                periodNetMargin: 0,
                creances: 0,
                profitabilityRate: 0,
                sectorsCount: 0,
              };

              return (
                <SiteCard
                  key={site.id}
                  site={site}
                  financials={fin}
                  darkMode={darkMode}
                  isAdmin={isAdmin}
                  onViewDetail={(s) => setSelectedSiteId(s.id)}
                  onEditSite={(s) => {
                    setSiteToEdit(s);
                    setShowSiteModal(true);
                  }}
                  onDeleteSite={handleDeleteSite}
                />
              );
            })}
          </div>
        )}
      </div>



      {/* ══ SECTION ACTIVITÉS ARCHIVÉES (PARTIE 9 — CONSERVATION DES DONNÉES) ═ */}
      {showArchived && archivedActivities.length > 0 && (
        <div className="w-full max-w-none px-3 lg:px-4 mb-12 p-6 bg-slate-900/40 border border-slate-800 rounded-2xl">
          <h4 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
            <Archive size={16} className="text-slate-500" />
            <span>Activités archivées (données historiques conservées)</span>
          </h4>
          <p className="text-xs text-slate-500 mb-4">
            Ces activités ont été retirées de l'espace actif. Toutes les données commerciales, comptables et factures normalisées sont conservées.
          </p>

          <div className="space-y-3">
            {archivedActivities.map((act) => (
              <div key={act.id} className="flex items-center justify-between p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                <div>
                  <div className="font-bold text-slate-300 flex items-center gap-2">
                    <span>{act.name}</span>
                    <span className="text-xs text-slate-500">({act.location})</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {act.sectorLabel} • Archivée le {act.archivedAt ? new Date(act.archivedAt).toLocaleDateString('fr-FR') : 'Récemment'}
                  </div>
                </div>
                <button
                  onClick={() => restoreActivity(act)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition-colors"
                >
                  <RestoreIcon size={13} />
                  <span>Restaurer l'accès</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}

      {/* ══ MODAL PARTIE 6 — AJOUTER UNE ACTIVITÉ ═══════════════════════════ */}
      {showAddModal && (
        <Modal title="Ajouter une Activité au Hub GESTIO 229" onClose={() => { setShowAddModal(false); setFormError(''); }} wide={true}>
          <p className="text-xs text-slate-400 mb-4">
            Choisissez un sous-logiciel métier parmi les 19 activités disponibles pour créer et activer son espace d'exploitation autonome.
          </p>

          <SectorSelector
            value={form.sectorSlug}
            onChange={(slug) => {
              const meta = getSectorMeta(slug);
              setForm((f) => ({
                ...f,
                sectorSlug: slug,
                name: f.name ? f.name : (meta ? `${companyName || 'Mon Établissement'} — ${meta.name}`.toUpperCase() : ''),
                location: f.location || company?.city || 'Cotonou'
              }));
            }}
          />

          <InputField
            label="Nom de l'établissement * (Ex: Poissonnerie Dieu Fera)"
            placeholder="Ex: Poissonnerie Dieu Fera"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />

          <InputField
            label="Lieu * (Ex: Calavi)"
            placeholder="Ex: Calavi, Cotonou - Akpakpa..."
            value={form.location}
            onChange={(v) => setForm((f) => ({ ...f, location: v }))}
          />

          <InputField
            label="Responsable du point de vente (optionnel)"
            placeholder="Ex: Adjoua Kossou"
            value={form.manager}
            onChange={(v) => setForm((f) => ({ ...f, manager: v }))}
          />

          {formError && <p className="text-rose-400 text-xs mt-2 font-medium">{formError}</p>}

          <div className="flex gap-2 mt-6 justify-end">
            <button
              onClick={() => { setShowAddModal(false); setFormError(''); }}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleAddSubmit}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold transition-colors shadow-md shadow-emerald-500/20"
            >
              Créer l'activité
            </button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL PARTIE 7 — PARAMÈTRES D'UNE ACTIVITÉ ═══════════════════════ */}
      {showSettingsModal && (
        <Modal
          title={`PARAMÈTRES — ${showSettingsModal.name}`}
          onClose={() => { setShowSettingsModal(null); setFormError(''); }}
        >
          <p className="text-xs text-slate-400 mb-4">
            Modifiez les informations propres à cette activité. La modification met à jour automatiquement la carte du HUB sans supprimer les données commerciales ou financières existantes.
          </p>

          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-slate-800/60 rounded-xl border border-slate-700 text-xs text-slate-300">
            <span className="font-semibold">{showSettingsModal.sectorLabel}</span>
          </div>

          <InputField
            label="Nom de l'établissement :"
            placeholder="Nom de l'établissement"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
          />

          <InputField
            label="Lieu :"
            placeholder="Lieu de l'établissement"
            value={form.location}
            onChange={(v) => setForm((f) => ({ ...f, location: v }))}
          />

          <InputField
            label="Responsable :"
            placeholder="Responsable"
            value={form.manager}
            onChange={(v) => setForm((f) => ({ ...f, manager: v }))}
          />

          {/* Statut de l'activité (PARTIE 9) */}
          <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Statut de l'activité :</label>
            <div className="relative">
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ActivityStatus }))}
                className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
              >
                <option value="ACTIVE">ACTIVE (Accès normal)</option>
                <option value="SUSPENDUE">SUSPENDUE (Opérations en pause)</option>
                <option value="ARCHIVEE">ARCHIVÉE (Masquée du HUB)</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {formError && <p className="text-rose-400 text-xs mt-2 font-medium">{formError}</p>}

          {isAdmin && (
            <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between items-center">
              <div>
                <p className="text-xs font-bold text-slate-300">Zone d'administration</p>
                <p className="text-[11px] text-slate-500">Vider les données opérationnelles tout en conservant les factures</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setClearSectorTarget(showSettingsModal);
                  setShowSettingsModal(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-amber-400 bg-amber-950/40 border border-amber-700/60 hover:bg-amber-900/60 transition-colors cursor-pointer"
              >
                <Trash2 size={13} className="text-amber-500" />
                <span>Vider le secteur</span>
              </button>
            </div>
          )}

          <div className="flex gap-2 mt-6 justify-end">
            <button
              onClick={() => { setShowSettingsModal(null); setFormError(''); }}
              className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={handleSettingsSubmit}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors"
            >
              Enregistrer les modifications
            </button>
          </div>
        </Modal>
      )}

      {/* ══ MODAL PARTIE 9 — PREMIÈRE CONFIRMATION DE SUPPRESSION ════════════ */}
      {deleteStep1 && (
        <Modal title="Supprimer cette activité ?" onClose={() => setDeleteStep1(null)}>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              Voulez-vous retirer cet établissement de votre espace HUB ?
            </p>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
              <div className="font-black text-white text-base uppercase">
                {deleteStep1.name}
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-medium">
                <MapPin size={13} className="text-slate-500" />
                <span>{deleteStep1.location}</span>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3">
              <button
                onClick={() => setDeleteStep1(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={proceedToSecondConfirmation}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-colors"
              >
                Continuer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL PARTIE 9 — DEUXIÈME CONFIRMATION DE SUPPRESSION (ATTENTION) ══ */}
      {deleteStep2 && (
        <Modal title="ATTENTION" onClose={() => setDeleteStep2(null)}>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-rose-950/30 border border-rose-800/60 rounded-xl">
              <AlertTriangle size={24} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 space-y-2">
                <p className="font-bold text-rose-300 text-sm">
                  Vous êtes sur le point de supprimer cette activité de votre espace GESTIO 229.
                </p>
                <p>
                  Cette opération peut affecter l'accès aux données et aux fonctionnalités de cette activité.
                </p>
                <p className="text-slate-400 italic">
                  🛡️ Conformité légale : Vos données financières, factures E-MECEF et écritures SYSCOHADA seront archivées en sécurité et ne seront pas détruites.
                </p>
                <p className="font-semibold text-white pt-1">
                  Confirmez-vous définitivement cette opération ?
                </p>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setDeleteStep2(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                ANNULER
              </button>
              <button
                onClick={confirmFinalSoftDelete}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold transition-colors shadow-lg shadow-rose-900/40"
              >
                CONFIRMER LA SUPPRESSION
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ MODAL ENTREPRISE & LICENCE ══════════════════════════════════════ */}
      {showCompanySettingsModal && (
        <Modal title="Paramètres de l'Entreprise" onClose={() => setShowCompanySettingsModal(false)} wide>
          <div className="space-y-4">
            <InfoRow label="Nom de l'entreprise" value={companyName || '—'} />
            <InfoRow label="Numéro IFU" value={companyIfu || '—'} mono />
            <InfoRow label="Régime fiscal" value={companyRegime} />
            <InfoRow label="Zone géographique" value="Bénin — UEMOA (FCFA)" />
            <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700/40 rounded-xl text-xs text-blue-300">
              Ces paramètres sont communs à l'ensemble de vos établissements et sont certifiés conformes DGI Bénin.
            </div>
          </div>
        </Modal>
      )}

      {showSubscriptionModal && (
        <Modal title="Abonnement & Licence" onClose={() => setShowSubscriptionModal(false)} wide>
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-emerald-900/20 border border-emerald-700/40 rounded-xl">
              <CheckCircle size={24} className="text-emerald-400 flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-300">Licence Active — HUB MULTISERVICES</p>
                <p className="text-xs text-slate-400 mt-0.5">Accès à l'ensemble des 15 secteurs métiers. Multi-établissements illimité.</p>
              </div>
            </div>
            <InfoRow label="Plan" value="HUB Multiservices Pro" />
            <InfoRow label="Établissements actifs" value={`${activeActivities.length} actif(s)`} />
            <InfoRow label="Sauvegarde" value="Locale + Cloud Supabase" />
          </div>
        </Modal>
      )}

      {/* ══ MODAL ACTIVATION NOUVEAU SECTEUR (RÈGLE 3 CDC) ════════════════ */}
      {activationModalData && (
        <ActiverSecteurModal
          isOpen={Boolean(activationModalData)}
          sectorSlugOrCode={activationModalData.slug}
          sectorName={activationModalData.name}
          companyId={companyId}
          onClose={() => setActivationModalData(null)}
          onActivated={handleSectorActivated}
        />
      )}

      {/* ══ MODAL VIDER LE SECTEUR (REMISE À ZÉRO PROPRE DES DONNÉES) ═══════ */}
      {clearSectorTarget && (
        <ClearSectorModal
          isOpen={Boolean(clearSectorTarget)}
          activity={clearSectorTarget}
          companyId={companyId}
          darkMode={darkMode}
          onClose={() => setClearSectorTarget(null)}
          onSuccess={() => {
            loadFinancialMetrics();
            loadActivitiesFromSupabase();
          }}
        />
      )}

      {/* ══ MODAL SITE D'EXPLOITATION (CRÉATION / MODIFICATION) ══════════════ */}
      <SiteModal
        isOpen={showSiteModal}
        onClose={() => {
          setShowSiteModal(false);
          setSiteToEdit(null);
        }}
        onSave={handleSaveSite}
        siteToEdit={siteToEdit}
        darkMode={darkMode}
      />

      {/* ══ MODAL DÉPLACEMENT D'UN SECTEUR VERS UN AUTRE SITE ═══════════════ */}
      <MoveSectorModal
        isOpen={showMoveSectorModal}
        onClose={() => {
          setShowMoveSectorModal(false);
          setSectorToMove(null);
        }}
        sector={sectorToMove}
        currentSite={
          sites.find(
            (s) => s.id === (sectorToMove?.settings?.site_id || sectorToMove?.site_id)
          ) ||
          sites.find((s) => s.is_main) ||
          sites[0] ||
          null
        }
        availableSites={sites}
        onConfirmMove={handleConfirmMoveSector}
        darkMode={darkMode}
      />

      {/* ══ MODAL RATTACHEMENT DE SECTEUR AU SITE SÉLECTIONNÉ ═══════════════ */}
      <AttachSectorModal
        isOpen={showAttachSectorModal}
        onClose={() => {
          setShowAttachSectorModal(false);
          setTargetSiteForAttach(null);
        }}
        targetSite={
          targetSiteForAttach ||
          sites.find((s) => s.id === selectedSiteId) ||
          sites.find((s) => s.is_main) ||
          sites[0] ||
          null
        }
        availableSites={sites}
        allActivities={activities}
        onAttachExistingSector={handleAttachExistingSectorToSite}
        onCreateNewSector={() => {
          setForm(EMPTY_FORM);
          setFormError('');
          setShowAddModal(true);
        }}
        darkMode={darkMode}
      />

    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANTS UI
// ─────────────────────────────────────────────────────────────────────────────

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}

const Modal: React.FC<ModalProps> = ({ title, onClose, children, wide = false }) => {
  const { darkMode } = useUIStore();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className={`rounded-2xl shadow-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] overflow-y-auto border ${
        darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        <div className={`flex items-center justify-between p-5 border-b ${
          darkMode ? 'border-slate-800' : 'border-slate-100'
        }`}>
          <h3 className={`text-base font-bold tracking-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-900'
          }`}>
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}

const InputField: React.FC<InputFieldProps> = ({ label, placeholder, value, onChange }) => {
  const { darkMode } = useUIStore();
  return (
    <div className="mb-3">
      <label className={`block text-xs font-semibold mb-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl px-3.5 py-2.5 text-sm transition-colors border focus:outline-none focus:border-emerald-500 ${
          darkMode
            ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder:text-slate-600'
            : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400'
        }`}
      />
    </div>
  );
};

interface SectorSelectorProps {
  value: string;
  onChange: (slug: string) => void;
}

const SectorSelector: React.FC<SectorSelectorProps> = ({ value, onChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const categories = useMemo(() => {
    const cats = new Set<string>();
    ALL_SECTORS_CATALOG.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return ['ALL', ...Array.from(cats)];
  }, []);

  const filteredSectors = useMemo(() => {
    return ALL_SECTORS_CATALOG.filter((s) => {
      const matchSearch =
        !searchTerm.trim() ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.badge.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCat = selectedCategory === 'ALL' || s.category === selectedCategory;
      return matchSearch && matchCat;
    });
  }, [searchTerm, selectedCategory]);

  const selected = ALL_SECTORS_CATALOG.find((s) => s.slug === value);

  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-bold text-slate-300">
          Sélectionnez le Sous-Logiciel Métier * ({ALL_SECTORS_CATALOG.length} disponibles) :
        </label>
        {selected && (
          <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
            ✓ {selected.name}
          </span>
        )}
      </div>

      {/* Barre de recherche et filtre de catégorie */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Rechercher par nom, métier (ex: Quincaillerie, Poissonnerie, Pharmacie...)"
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
        />
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
        >
          <option value="ALL">Toutes catégories</option>
          {categories.filter((c) => c !== 'ALL').map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Grille défilante des 19 activités */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
        {filteredSectors.map((s) => {
          const isSelected = value === s.slug;
          return (
            <div
              key={s.slug}
              onClick={() => onChange(s.slug)}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-500/10 ring-1 ring-emerald-500'
                  : 'bg-slate-800/70 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{s.emoji}</span>
                    <span className="font-bold text-xs text-white leading-tight">{s.name}</span>
                  </div>
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">{s.description}</p>
              </div>
              <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-700/50 text-[10px]">
                <span className="text-slate-500">{s.category}</span>
                <span className="font-bold px-1.5 py-0.5 rounded bg-slate-900/60 text-slate-300 border border-slate-700">
                  {s.badge}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, mono = false }) => (
  <div className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
    <span className="text-xs text-slate-400">{label}</span>
    <span className={`text-sm font-semibold text-slate-200 ${mono ? 'font-mono' : ''}`}>{value}</span>
  </div>
);

export default MultiservicesHub;
