import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
  CheckCircle2,
  ChevronDown,
  Calendar,
  MapPin,
  ExternalLink,
  Archive,
  AlertTriangle,
  RotateCcw as RestoreIcon,
} from 'lucide-react';
import { ALL_SECTORS_CATALOG, SectorDefinition } from '../../core/modules/moduleRegistry';

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
  // PARTIE 3 : Métriques du Jour (F CFA)
  revenue: number;             // CA DU JOUR
  expenses: number;            // DÉPENSES DU JOUR
  netMargin: number;           // MARGE NETTE DU JOUR
  // PARTIE 4 : Métriques du Mois (F CFA)
  monthRevenue: number;        // CA DU MOIS
  monthExpenses: number;       // DÉPENSES DU MOIS
  monthNetMargin: number;      // MARGE NETTE DU MOIS
  archivedAt?: string;         // Date d'archivage (si statut = ARCHIVEE)
}

export interface MultiservicesHubProps {
  companyName?: string;
  companyIfu?: string;
  companyRegime?: string;
  onSelectSector?: (sectorSlug: string, activityId: string, activityName?: string, location?: string) => void;
  onOpenOnboarding?: (sectorSlug: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES & JEU DE TEST (VALEURS DU CAHIER DE CHARGES)
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gestio229_hub_sectors_v3';
const TEST_FLAG_KEY = 'gestio229_test_dataset_active';

/**
 * Données de test issues fidèlement du cahier des charges (Partie 3, 4 et 5).
 * Ces données sont injectées UNIQUEMENT pour valider les tests et peuvent être purgées à 100%.
 */
const TEST_DATASET: ActivityEntry[] = [
  {
    id: 'test-act-1',
    sectorSlug: 'poissonnerie',
    sectorLabel: 'Poissonnerie & Surgelés',
    sectorIcon: '🐟',
    sectorColor: '#06B6D4',
    name: 'POISSONNERIE DIEU FERA',
    location: 'Calavi',
    manager: 'Adjoua Kossou',
    status: 'ACTIVE',
    isConfigured: true,
    // Valeurs Jour (Partie 5 : CA 850 000 / Dépenses 120 000 / Marge 210 000 F CFA)
    revenue: 850000,
    expenses: 120000,
    netMargin: 210000,
    // Valeurs Mois (Partie 4 : CA mois 13 200 000 / Dépenses 4 100 000 / Marge 3 350 000 F CFA)
    monthRevenue: 13200000,
    monthExpenses: 4100000,
    monthNetMargin: 3350000,
  },
  {
    id: 'test-act-2',
    sectorSlug: 'quincaillerie',
    sectorLabel: 'Quincaillerie & Matériaux BTP',
    sectorIcon: '🔧',
    sectorColor: '#3B82F6',
    name: 'QUINCAILLERIE MODERNE',
    location: 'Cotonou - Sainte Rita',
    manager: 'Marc Agossou',
    status: 'ACTIVE',
    isConfigured: true,
    // Valeurs Jour (CA 1 000 000 / Dépenses 300 000 / Marge 420 000 F CFA)
    revenue: 1000000,
    expenses: 300000,
    netMargin: 420000,
    // Valeurs Mois (CA mois 12 200 000 / Dépenses 4 100 000 / Marge 3 100 000 F CFA)
    monthRevenue: 12200000,
    monthExpenses: 4100000,
    monthNetMargin: 3100000,
  },
];
// Totaux Jour attendus : CA = 1 850 000 / Dépenses = 420 000 / Marge = 630 000 F CFA
// Totaux Mois attendus (PARTIE 4) : CA = 25 400 000 / Dépenses = 8 200 000 / Marge = 6 450 000 F CFA

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

const fmt = (n: number) => n.toLocaleString('fr-FR');

const generateId = () => `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const getSectorMeta = (slug: string): SectorDefinition | undefined =>
  ALL_SECTORS_CATALOG.find((s) => s.slug === slug);

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export const MultiservicesHub: React.FC<MultiservicesHubProps> = ({
  companyName = '',
  companyIfu = '',
  companyRegime = 'Réel Normal',
  onSelectSector,
  onOpenOnboarding,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [isTestDataActive, setIsTestDataActive] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState<ActivityEntry | null>(null); // PARTIE 7
  const [showCompanySettingsModal, setShowCompanySettingsModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

  // Double confirmation suppression (PARTIE 9)
  const [deleteStep1, setDeleteStep1] = useState<ActivityEntry | null>(null);
  const [deleteStep2, setDeleteStep2] = useState<ActivityEntry | null>(null);

  // Formulaire add/edit
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');

  // Mois en cours automatique (PARTIE 4)
  const currentMonthLabel = useMemo(() => {
    try {
      const now = new Date();
      const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(now);
      return monthName.charAt(0).toUpperCase() + monthName.slice(1);
    } catch {
      return 'Mois en cours';
    }
  }, []);

  // ── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: ActivityEntry[] = JSON.parse(raw);
        setActivities(parsed);
      }
      const testFlag = localStorage.getItem(TEST_FLAG_KEY) === 'true';
      setIsTestDataActive(testFlag);
    } catch {
      // ignore
    }
  }, []);

  const persist = useCallback((data: ActivityEntry[]) => {
    setActivities(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, []);

  // ── Dataset test & purge ───────────────────────────────────────────────────
  const injectTestDataset = () => {
    persist(TEST_DATASET);
    setIsTestDataActive(true);
    localStorage.setItem(TEST_FLAG_KEY, 'true');
  };

  const purgeTestDataset = () => {
    persist([]);
    setIsTestDataActive(false);
    localStorage.removeItem(TEST_FLAG_KEY);
  };

  // ── Filtrage des activités actives vs archivées (PARTIE 9) ─────────────────
  const activeActivities = useMemo(
    () => activities.filter((a) => a.status !== 'ARCHIVEE'),
    [activities]
  );

  const archivedActivities = useMemo(
    () => activities.filter((a) => a.status === 'ARCHIVEE'),
    [activities]
  );

  // ── CALCULS CONSOLIDÉS DU JOUR (PARTIE 3) & DU MOIS (PARTIE 4) ─────────────
  const dayTotals = useMemo(() => {
    const totalRevenue = activeActivities.reduce((a, s) => a + (s.revenue || 0), 0);
    const totalExpenses = activeActivities.reduce((a, s) => a + (s.expenses || 0), 0);
    const totalNetMargin = activeActivities.reduce((a, s) => a + (s.netMargin || 0), 0);
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities]);

  const monthTotals = useMemo(() => {
    const totalRevenue = activeActivities.reduce((a, s) => a + (s.monthRevenue || 0), 0);
    const totalExpenses = activeActivities.reduce((a, s) => a + (s.monthExpenses || 0), 0);
    const totalNetMargin = activeActivities.reduce((a, s) => a + (s.monthNetMargin || 0), 0);
    const netMarginRate = totalRevenue > 0 ? (totalNetMargin / totalRevenue) * 100 : 0;
    return { totalRevenue, totalExpenses, totalNetMargin, netMarginRate };
  }, [activeActivities]);

  // ── Actions : Ajout d'activité (PARTIE 6) ──────────────────────────────────
  const handleAddSubmit = () => {
    if (!form.sectorSlug) { setFormError('Veuillez sélectionner un secteur d\'activité.'); return; }
    if (!form.name.trim()) { setFormError("Le nom de l'établissement est requis."); return; }
    if (!form.location.trim()) { setFormError("Le lieu de l'établissement est requis."); return; }

    const meta = getSectorMeta(form.sectorSlug);
    if (!meta) { setFormError('Secteur introuvable.'); return; }

    const newEntry: ActivityEntry = {
      id: generateId(),
      sectorSlug: meta.slug,
      sectorLabel: meta.label,
      sectorIcon: meta.icon,
      sectorColor: meta.color,
      name: form.name.trim().toUpperCase(),
      location: form.location.trim(),
      manager: form.manager.trim(),
      status: 'ACTIVE',
      isConfigured: true,
      revenue: 0,
      expenses: 0,
      netMargin: 0,
      monthRevenue: 0,
      monthExpenses: 0,
      monthNetMargin: 0,
    };

    persist([...activities, newEntry]);
    setShowAddModal(false);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  // ── Actions : Modification des paramètres (PARTIE 7) ──────────────────────
  const handleSettingsSubmit = () => {
    if (!showSettingsModal) return;
    if (!form.name.trim()) { setFormError("Le nom de l'établissement est requis."); return; }
    if (!form.location.trim()) { setFormError("Le lieu est requis."); return; }

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

  const confirmFinalSoftDelete = () => {
    if (!deleteStep2) return;
    // RÈGLE CRITIQUE PARTIE 9 : Pas de suppression physique destructrice.
    // L'activité passe en statut 'ARCHIVEE' pour préserver l'historique financier et légal.
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
    setDeleteStep2(null);
  };

  const restoreActivity = (act: ActivityEntry) => {
    const updated = activities.map((a) =>
      a.id === act.id
        ? { ...a, status: 'ACTIVE' as ActivityStatus, archivedAt: undefined }
        : a
    );
    persist(updated);
  };

  // ── Action : Ouvrir l'application métier (PARTIE 8) ────────────────────────
  const handleOpenActivity = (act: ActivityEntry) => {
    if (onSelectSector) {
      onSelectSector(act.sectorSlug, act.id, act.name, act.location);
    } else {
      window.location.href = `/app/${act.sectorSlug}?activityId=${act.id}`;
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 selection:bg-emerald-500 selection:text-white">

      {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30">
                HUB CENTRAL MULTISERVICES — GESTIO 229
              </span>
              <span className="text-xs text-slate-400 font-mono">Bénin • UEMOA (FCFA)</span>
              {isTestDataActive && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40">
                  <FlaskConical size={11} />
                  DONNÉES TEST DU CAHIER ACTIVES
                </span>
              )}
            </div>

            {companyName ? (
              <h1 className="text-2xl sm:text-3xl font-black text-white mt-2 tracking-tight">{companyName}</h1>
            ) : (
              <h1 className="text-2xl sm:text-3xl font-black text-slate-500 mt-2 tracking-tight italic">
                — Nom de l'entreprise non configuré —
              </h1>
            )}

            <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
              {companyIfu && (
                <>
                  <span>N° IFU : <strong className="text-slate-300 font-mono">{companyIfu}</strong></span>
                  <span>•</span>
                </>
              )}
              <span>Régime : <strong className="text-slate-300">{companyRegime}</strong></span>
              <span>•</span>
              <span className="text-emerald-400 font-medium">{activeActivities.length} Activité(s) active(s)</span>
              {archivedActivities.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-slate-500">{archivedActivities.length} archivée(s)</span>
                </>
              )}
            </p>
          </div>

          {/* Actions globales */}
          <div className="flex items-center gap-2 flex-wrap self-start">
            <button
              onClick={handleRefresh}
              title="Actualiser"
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-300 hover:text-white transition-colors"
            >
              <RefreshCw size={15} className={isRefreshing ? 'animate-spin text-emerald-400' : ''} />
            </button>
            <button
              onClick={() => setShowCompanySettingsModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <Settings size={14} /> Entreprise
            </button>
            <button
              onClick={() => setShowSubscriptionModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-slate-300 hover:text-white transition-colors"
            >
              <CreditCard size={14} /> Licence
            </button>
            {isTestDataActive ? (
              <button
                onClick={purgeTestDataset}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-900/40 hover:bg-rose-800/60 border border-rose-600/50 rounded-xl text-xs font-bold text-rose-400 hover:text-rose-300 transition-colors"
              >
                <RotateCcw size={13} /> Purger données test
              </button>
            ) : (
              <button
                onClick={injectTestDataset}
                className="flex items-center gap-1.5 px-3 py-2 bg-amber-900/30 hover:bg-amber-800/40 border border-amber-600/40 rounded-xl text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors"
              >
                <FlaskConical size={13} /> Injecter données test
              </button>
            )}
            <button
              onClick={() => { setForm(EMPTY_FORM); setFormError(''); setShowAddModal(true); }}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-xs font-bold text-white transition-colors shadow-md shadow-emerald-500/20"
            >
              <Plus size={14} /> Ajouter une activité
            </button>
          </div>
        </div>
      </div>

      {/* ══ GRILLE KPI DU JOUR & DU MOIS ════════════════════════════════════ */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">

        {/* ── SECTION PARTIE 3 : TABLEAU DE BORD DU JOUR ────────────────── */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Calendar size={16} className="text-blue-400" />
                TABLEAU DE BORD DU JOUR
              </h2>
              <span className="text-[11px] text-slate-500">Toutes activités confondues — Données du jour</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
              Aujourd'hui
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* CA DU JOUR */}
            <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                CA DU JOUR
              </span>
              <div className="text-2xl font-black text-white tracking-tight">
                {fmt(dayTotals.totalRevenue)}
              </div>
              <div className="text-xs text-blue-400 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* DÉPENSES DU JOUR */}
            <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                DÉPENSES DU JOUR
              </span>
              <div className="text-2xl font-black text-rose-400 tracking-tight">
                {fmt(dayTotals.totalExpenses)}
              </div>
              <div className="text-xs text-rose-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* MARGE NETTE DU JOUR */}
            <div className="bg-slate-950/60 border border-emerald-500/20 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                MARGE NETTE DU JOUR
              </span>
              <div className="text-2xl font-black text-emerald-400 tracking-tight">
                {fmt(dayTotals.totalNetMargin)}
              </div>
              <div className="text-xs text-emerald-500 font-semibold mt-0.5">F CFA</div>
            </div>
          </div>
        </div>

        {/* ── SECTION PARTIE 4 : SYNTHÈSE DU MOIS (MOIS EN COURS AUTOMATIQUE) ── */}
        <div className="bg-slate-900/80 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-5 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                <TrendingUp size={16} className="text-indigo-400" />
                SYNTHÈSE DU MOIS
              </h2>
              <span className="text-[11px] text-indigo-400/80">Toutes activités confondues — {currentMonthLabel}</span>
            </div>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold">
              {currentMonthLabel}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* CA DU MOIS */}
            <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                CA DU MOIS
              </span>
              <div className="text-2xl font-black text-white tracking-tight">
                {fmt(monthTotals.totalRevenue)}
              </div>
              <div className="text-xs text-indigo-400 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* DÉPENSES DU MOIS */}
            <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                DÉPENSES DU MOIS
              </span>
              <div className="text-2xl font-black text-rose-400 tracking-tight">
                {fmt(monthTotals.totalExpenses)}
              </div>
              <div className="text-xs text-rose-500 font-semibold mt-0.5">F CFA</div>
            </div>

            {/* MARGE NETTE DU MOIS */}
            <div className="bg-slate-950/60 border border-emerald-500/30 p-4 rounded-xl">
              <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block mb-1">
                MARGE NETTE DU MOIS
              </span>
              <div className="text-2xl font-black text-emerald-400 tracking-tight">
                {fmt(monthTotals.totalNetMargin)}
              </div>
              <div className="text-xs text-emerald-500 font-semibold mt-0.5">F CFA</div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ ÉTAT VIDE (AUCUNE ACTIVITÉ ENREGISTRÉE) ══════════════════════════ */}
      {activeActivities.length === 0 && (
        <div className="max-w-7xl mx-auto mb-10">
          <div className="bg-slate-900/50 border border-dashed border-slate-700 rounded-2xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-4">
              <Building2 size={32} className="text-slate-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-400 mb-2">Aucune activité active</h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
              Renseignez vos établissements pour afficher leurs cartes et accéder à leurs espaces métiers dédiés.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={() => { setForm(EMPTY_FORM); setFormError(''); setShowAddModal(true); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-bold text-white transition-colors"
              >
                <Plus size={16} /> Ajouter une activité
              </button>
              <button
                onClick={injectTestDataset}
                className="flex items-center gap-2 px-5 py-2.5 bg-amber-900/30 hover:bg-amber-800/40 border border-amber-600/40 rounded-xl text-sm font-bold text-amber-400 transition-colors"
              >
                <FlaskConical size={15} /> Charger l'exemple du cahier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PARTIE 5 — CARTE DE CHAQUE ACTIVITÉ ═════════════════════════════ */}
      {activeActivities.length > 0 && (
        <div className="max-w-7xl mx-auto mb-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Établissements & Activités ({activeActivities.length})</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Accès direct aux applications métiers autonomes</p>
            </div>
            {archivedActivities.length > 0 && (
              <button
                onClick={() => setShowArchived(!showArchived)}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <Archive size={14} />
                <span>{showArchived ? 'Masquer' : 'Voir'} archives ({archivedActivities.length})</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeActivities.map((act) => (
              <div
                key={act.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col justify-between shadow-xl transition-all relative overflow-hidden"
              >
                {/* 5.1 En-tête de la carte : Nom de l'activité & Lieu */}
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <span className="text-2xl" title={act.sectorLabel}>{act.sectorIcon}</span>
                      <div>
                        <h4 className="text-base font-black text-white uppercase tracking-tight leading-tight">
                          {act.name}
                        </h4>
                        <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5 font-medium">
                          <MapPin size={12} className="text-slate-500" />
                          <span>{act.location || 'Lieu non spécifié'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Badge de statut (PARTIE 9) */}
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                        act.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          : act.status === 'SUSPENDUE'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {act.status}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-500 mb-4 pl-9">
                    {act.sectorLabel}
                  </div>

                  {/* 5.1 Corps financier obligatoire : CA, Dépenses, Marge Nette */}
                  <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-2 mb-6">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">CA :</span>
                      <span className="font-mono font-bold text-white">{fmt(act.revenue)} F CFA</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Dépenses :</span>
                      <span className="font-mono font-bold text-rose-400">{fmt(act.expenses)} F CFA</span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/80">
                      <span className="font-semibold text-emerald-400">Marge nette :</span>
                      <span className="font-mono font-black text-emerald-400">{fmt(act.netMargin)} F CFA</span>
                    </div>
                  </div>
                </div>

                {/* 5.1 Boutons obligatoires : OUVRIR, Paramètres, Supprimer */}
                <div className="space-y-2.5">
                  {/* BOUTON OUVRIR (PARTIE 8) */}
                  <button
                    type="button"
                    onClick={() => handleOpenActivity(act)}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-500/20 active:scale-[0.99] cursor-pointer"
                  >
                    <span>OUVRIR</span>
                    <ExternalLink size={14} />
                  </button>

                  {/* BOUTONS PARAMÈTRES & SUPPRIMER (PARTIE 7 & PARTIE 9) */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
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
                      className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700/60"
                    >
                      <Settings size={13} />
                      <span>Paramètres</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => initiateDelete(act)}
                      className="py-2 px-3 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-700/60 hover:border-rose-800/40"
                    >
                      <Trash2 size={13} />
                      <span>Supprimer</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ SECTION ACTIVITÉS ARCHIVÉES (PARTIE 9 — CONSERVATION DES DONNÉES) ═ */}
      {showArchived && archivedActivities.length > 0 && (
        <div className="max-w-7xl mx-auto mb-12 p-6 bg-slate-900/40 border border-slate-800 rounded-2xl">
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
                    <span>{act.sectorIcon}</span>
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

      {/* ══ MODAL PARTIE 6 — AJOUTER UNE ACTIVITÉ ═══════════════════════════ */}
      {showAddModal && (
        <Modal title="Ajouter une Activité au Hub" onClose={() => { setShowAddModal(false); setFormError(''); }}>
          <p className="text-xs text-slate-400 mb-4">
            Renseignez les informations de cet établissement. Elles apparaîtront directement sur la carte du HUB.
          </p>

          <SectorSelector
            value={form.sectorSlug}
            onChange={(slug) => setForm((f) => ({ ...f, sectorSlug: slug }))}
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
            <span className="text-lg">{showSettingsModal.sectorIcon}</span>
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
              <CheckCircle2 size={24} className="text-emerald-400 flex-shrink-0" />
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

const Modal: React.FC<ModalProps> = ({ title, onClose, children, wide = false }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
    <div className={`bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}>
      <div className="flex items-center justify-between p-5 border-b border-slate-800">
        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
          <X size={18} />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

interface InputFieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}

const InputField: React.FC<InputFieldProps> = ({ label, placeholder, value, onChange }) => (
  <div className="mb-3">
    <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
    />
  </div>
);

interface SectorSelectorProps {
  value: string;
  onChange: (slug: string) => void;
}

const SectorSelector: React.FC<SectorSelectorProps> = ({ value, onChange }) => {
  const selected = ALL_SECTORS_CATALOG.find((s) => s.slug === value);
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-slate-400 mb-1.5">Secteur d'activité : *</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
        >
          <option value="">— Sélectionnez un secteur d'activité —</option>
          {ALL_SECTORS_CATALOG.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.icon} {s.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
      </div>
      {selected && (
        <p className="text-xs text-slate-500 mt-1.5 pl-1">{selected.description || selected.label}</p>
      )}
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
