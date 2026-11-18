// =============================================================================
// GESTIO 229 SaaS — Configuration & Gestion de l'Équipe (Utilisateurs Internes)
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Building2, Save, ShieldCheck, Users, Plus, KeyRound, Check,
  X, AlertCircle, Lock, UserCheck, Shield, ToggleLeft, ToggleRight,
  Briefcase, Store, Printer, Sparkles, Layers, Wrench, Truck, ArrowRightLeft, CheckCircle,
  GraduationCap, Award, BookOpen, Fuel, Percent, History,
  Eye, Edit3, Trash2, CheckSquare, DollarSign, CheckCircle2, Sliders
} from 'lucide-react'
import { logAuditEvent } from '../../../services/auditService'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { ALL_SECTORS_CATALOG } from '../../../core/modules/moduleRegistry'
import { getActiveSectorMeta } from '../../../lib/sectorClient'
import SectorLoader from '../../../lib/SectorLoader'
import {
  getRolesForSector,
  normalizeSectorSlug,
  SECTOR_ROLES_CATALOG,
  SectorRoleDefinition
} from '../../../core/team/sectorRoles'
import { imprimerieService, ImprimerieConfig } from '../../../services/imprimerieService'
import { useGarageConfig } from '../../../hooks/useGarageConfig'
import { useEcoleConfig } from '../../../hooks/useEcoleConfig'
import { EcoleTypeEtablissement } from '../../../services/ecoleService'
import { useSalesCircuitConfig } from '../../../hooks/useSalesCircuitConfig'
import { SalesCircuitMode } from '../../../services/salesCircuitService'
import {
  getStationExonerationConfig,
  saveStationExonerationConfig,
  calculateFuelExonerationTax,
  StationExonerationConfig
} from '../../../services/stationFuelService'

// ─── MAPPING DES MODULES & PERMISSIONS DYNAMIQUES PAR SECTEUR ────────────────
const MODULES_PAR_SECTEUR: Record<string, Array<{ id: string; label: string }>> = {
  "poissonnerie": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "chambres_froides", label: "Chambres Froides & T°" },
    { id: "avaries_frigorifiques", label: "Avaries Frigorifiques" },
  ],
  "poissonnerie_produits_frais": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "chambres_froides", label: "Chambres Froides & T°" },
    { id: "avaries_frigorifiques", label: "Avaries Frigorifiques" },
  ],
  "quincaillerie": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "materiaux_lourds", label: "Matériaux Lourds" },
  ],
  "quincaillerie_materiaux": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "materiaux_lourds", label: "Matériaux Lourds" },
  ],
  "supermarche": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
  ],
  "supermarche_superette": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
  ],
  "brasserie": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "consignes_retours", label: "Consignes & Retours" },
  ],
  "brasserie_boissons": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "consignes_retours", label: "Consignes & Retours" },
  ],
  "restaurant": [
    { id: "ventes_pos", label: "Commandes & POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Recettes" },
    { id: "clients", label: "Clients & Résas" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "cuisine_kds", label: "Cuisine & Bar (KDS)" },
  ],
  "station-service": [
    { id: "ventes_pos", label: "Ventes & Pompes" },
    { id: "caisse", label: "Caisse Pompistes" },
    { id: "stocks_inventaires", label: "Cuves & Lubrifiants" },
    { id: "clients", label: "Clients Flotte" },
    { id: "fournisseurs_achats", label: "Fournisseurs Carburants" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
  ],
  "imprimerie": [
    { id: "ventes_pos", label: "Vente Rapide & Caisse" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks Papiers & Encres" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
    { id: "devis_bat", label: "Devis & Ordres BAT" },
    { id: "prestations", label: "Prestations & Tarifs" },
  ],
  "immobilier": [
    { id: "biens_locations", label: "Biens & Logements" },
    { id: "proprietaires_mandats", label: "Propriétaires & Mandats" },
    { id: "clients", label: "Locataires" },
    { id: "contrats_loyers", label: "Contrats & Baux" },
    { id: "etats_lieux", label: "États des Lieux" },
    { id: "cautions_depots", label: "Cautions & Dépôts" },
    { id: "quittances", label: "Quittances & Reçus" },
    { id: "caisse", label: "Caisse" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "depenses", label: "Dépenses & Travaux" },
    { id: "maintenances_travaux", label: "Maintenance & Interventions" },
    { id: "fournisseurs_achats", label: "Fournisseurs & Artisans" },
    { id: "reporting_rapports", label: "Rapports & Analyses" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
  ],
  "location": [
    { id: "biens_locations", label: "Biens & Logements" },
    { id: "proprietaires_mandats", label: "Propriétaires & Mandats" },
    { id: "clients", label: "Locataires" },
    { id: "contrats_loyers", label: "Contrats & Baux" },
    { id: "etats_lieux", label: "États des Lieux" },
    { id: "cautions_depots", label: "Cautions & Dépôts" },
    { id: "quittances", label: "Quittances & Reçus" },
    { id: "caisse", label: "Caisse" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "depenses", label: "Dépenses & Travaux" },
    { id: "maintenances_travaux", label: "Maintenance & Interventions" },
    { id: "fournisseurs_achats", label: "Fournisseurs & Artisans" },
    { id: "reporting_rapports", label: "Rapports & Analyses" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
  ],
  "default": [
    { id: "ventes_pos", label: "Ventes / POS" },
    { id: "caisse", label: "Caisse" },
    { id: "stocks_inventaires", label: "Stocks & Inventaires" },
    { id: "clients", label: "Clients" },
    { id: "fournisseurs_achats", label: "Fournisseurs / Achats" },
    { id: "depenses", label: "Dépenses" },
    { id: "reporting_rapports", label: "Reporting & Rapports" },
    { id: "tresorerie_banques", label: "Trésorerie & Banques" },
    { id: "comptabilite_syscohada", label: "Comptabilité SYSCOHADA" },
  ]
}

export const ConfigPage: React.FC = () => {
  const { company, user, refreshTenantContext } = useAuthStore()
  const { sectorSlug: currentSectorSlug, sectorMeta: tenantSectorMeta } = useTenant()
  const { toast } = useUIStore()

  // Déclaration robuste et unifiée de sectorMeta pour ConfigPage (évite "sectorMeta is not defined")
  const sectorMeta = React.useMemo(() => {
    const meta =
      tenantSectorMeta ||
      getActiveSectorMeta() ||
      ALL_SECTORS_CATALOG.find((s) => s.slug === currentSectorSlug) || {
        code: (currentSectorSlug || 'BOUTIQUE').toUpperCase(),
        slug: currentSectorSlug || 'boutique',
        name: 'Paramètres de Gestion',
        emoji: '🏢',
        icon: 'Store',
        label: 'Paramètres de Gestion',
        color: '#059669',
        badge: 'Sous-Logiciel',
        description: 'Espace configuration GESTIO 229',
        category: 'Général',
      }

    return {
      name: meta?.name || 'Paramètres de Gestion',
      label: (meta as any)?.label || meta?.name || 'Paramètres de Gestion',
      icon: (meta as any)?.icon || 'Store',
      emoji: meta?.emoji || '🏢',
      slug: meta?.slug || currentSectorSlug || 'boutique',
      color: (meta as any)?.color || '#059669',
      badge: (meta as any)?.badge || 'Sous-Logiciel',
      category: (meta as any)?.category || 'Général',
      ...meta,
    }
  }, [tenantSectorMeta, currentSectorSlug])

  // Sécurisation anti-collision : unifie sectorMeta et secteurMeta
  const secteurMeta = sectorMeta

  const [activeTab, setActiveTab] = useState<'etablissement' | 'fiscalite' | 'notifications' | 'utilisateurs' | 'circuit_ventes' | 'imprimerie' | 'garage' | 'ecole' | 'station'>('etablissement')

  // ─── Configuration Organisation des Ventes & Encaissements (Par Secteur) ───
  const {
    circuitMode,
    isIntegrated: isCircuitIntegrated,
    isSeparated: isCircuitSeparated,
    pendingCount: circuitPendingCount,
    selectMode: selectCircuitMode,
    loading: loadingCircuitMode
  } = useSalesCircuitConfig(currentSectorSlug)

  const [switchingCircuitModal, setSwitchingCircuitModal] = useState(false)
  const [targetCircuitMode, setTargetCircuitMode] = useState<SalesCircuitMode | null>(null)
  const [switchingCircuit, setSwitchingCircuit] = useState(false)

  const handleConfirmSwitchCircuit = async () => {
    if (!targetCircuitMode) return
    setSwitchingCircuit(true)
    try {
      const res = await selectCircuitMode(targetCircuitMode)
      if (res.success) {
        toast.success(
          `Organisation des ventes mise à jour pour ${sectorMeta?.name || currentSectorSlug} !`,
          targetCircuitMode === 'INTEGRE'
            ? 'Mode 1 activé : Vente et encaissement par le même utilisateur.'
            : 'Mode 2 activé : Séparation entre vendeur et caissière (Module Vendeur activé).'
        )
        setSwitchingCircuitModal(false)
      } else {
        toast.error('Erreur', res.error || 'Impossible de mettre à jour le mode.')
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Une anomalie est survenue.')
    } finally {
      setSwitchingCircuit(false)
    }
  }

  // ─── États Établissement ──────────────────────────────────────────────────
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    legal_form: 'SARL',
    ifu_number: '',
    rccm_number: '',
    regime_fiscal: 'Régime Réel Simplifié (RRS)',
    address: '',
    city: 'Cotonou',
    phone: '',
    email: '',
    logo_url: '',
    currency: 'FCFA',
    tva_default_rate: 18,
    aib_default_rate: 1,
    e_mecef_active: false,
    e_mecef_connected: false,
    e_mecef_nim: '',
    e_mecef_token: '',
    e_mecef_api_url: '',
    closure_email_1: '',
    closure_email_2: '',
    closure_email_3: '',
    auto_send_closure_pdf: true,
  })

  // ─── Secteurs souscrits par l'entreprise ──────────────────────────────────
  const subscribedSectors = React.useMemo(() => {
    const rawList: any[] = []
    if (Array.isArray((company as any)?.selected_sectors)) rawList.push(...(company as any).selected_sectors)
    if (Array.isArray((company as any)?.sectors)) rawList.push(...(company as any).sectors)
    if ((company as any)?.active_sector) rawList.push((company as any).active_sector)
    if (Array.isArray((company as any)?.company_sectors)) rawList.push(...(company as any).company_sectors)

    const normalizedSlugs = new Set<string>()
    rawList.forEach((s) => {
      const slug = typeof s === 'string' ? s : s?.slug || s?.sector_slug || s?.code
      if (slug) normalizedSlugs.add(normalizeSectorSlug(slug))
    })

    if (currentSectorSlug) {
      normalizedSlugs.add(normalizeSectorSlug(currentSectorSlug))
    }

    if (normalizedSlugs.size === 0) {
      return ALL_SECTORS_CATALOG
    }

    return ALL_SECTORS_CATALOG.filter((sec) => normalizedSlugs.has(sec.slug))
  }, [company, currentSectorSlug])

  // ─── Configuration Métier : Imprimerie & Sérigraphie (STRICTEMENT SECTEUR ACTIF) ───
  const isImprimerie = React.useMemo(() => {
    const slug = currentSectorSlug ? normalizeSectorSlug(currentSectorSlug) : ''
    return slug === 'imprimerie' || slug === 'impression' || slug === 'serigraphie'
  }, [currentSectorSlug])

  const [imprimerieCfg, setImprimerieCfg] = useState<ImprimerieConfig>({
    company_id: company?.id || '',
    sector_slug: 'imprimerie',
    mode_gestion: 'classique',
    marge_cible_pct: 40,
    mention_devis: "Validité de l'offre : 15 jours. Acompte de 50% à la commande, solde à la livraison.",
    conditions_vente: 'B.A.T. signé obligatoire avant impression finale.',
    taux_tva_defaut: 18,
    taux_aib_defaut: 1,
    devise: 'FCFA',
  })
  const [savingImprimerie, setSavingImprimerie] = useState(false)

  useEffect(() => {
    if (company?.id && isImprimerie) {
      imprimerieService.getConfig(company.id, 'imprimerie').then((cfg) => {
        if (cfg) setImprimerieCfg(cfg)
      })
    }
  }, [company?.id, isImprimerie])

  const handleSaveImprimerie = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id) return
    setSavingImprimerie(true)
    try {
      await imprimerieService.saveConfig({
        ...imprimerieCfg,
        company_id: company.id,
        sector_slug: 'imprimerie'
      })
      toast.success('Configuration Imprimerie enregistrée avec succès !')
    } catch (err: any) {
      toast.error('Erreur', err.message || 'Impossible d\'enregistrer la configuration')
    } finally {
      setSavingImprimerie(false)
    }
  }

  // ─── Configuration Métier : Atelier, Garage & BTP Multisite (STRICTEMENT SECTEUR ACTIF) ───
  const isGarage = React.useMemo(() => {
    const slug = currentSectorSlug ? normalizeSectorSlug(currentSectorSlug) : ''
    return slug === 'garage' || slug === 'atelier' || slug === 'mecanique' || slug === 'btp'
  }, [currentSectorSlug])

  const {
    versionMode: garageMode,
    isClassic: isGarageClassic,
    isBtp: isGarageBtp,
    selectVersion: selectGarageVersion,
    loading: loadingGarageConfig,
    reload: reloadGarageConfig
  } = useGarageConfig()

  const [switchingGarageModal, setSwitchingGarageModal] = useState(false)
  const [targetGarageMode, setTargetGarageMode] = useState<'CLASSIC' | 'BTP_MULTISITE' | null>(null)
  const [switchingGarage, setSwitchingGarage] = useState(false)

  const handleConfirmSwitchVersion = async () => {
    if (!targetGarageMode) return
    setSwitchingGarage(true)
    try {
      const ok = await selectGarageVersion(targetGarageMode)
      if (ok) {
        // Enregistrement synchrone localstorage pour basculement immédiat du menu
        try {
          if (company?.id) {
            localStorage.setItem(`gestio229_garage_mode_${company.id}`, targetGarageMode)
          }
        } catch (_) {}

        toast.success(
          'Version mise à jour avec succès !',
          targetGarageMode === 'CLASSIC'
            ? 'Votre établissement est désormais en mode Garage & Mécanique classique.'
            : 'Votre établissement est désormais en mode Parc Matériel BTP & Maintenance Multisite.'
        )
        setSwitchingGarageModal(false)

        try {
          if (typeof reloadGarageConfig === 'function') {
            await reloadGarageConfig()
          }
        } catch (e) {
          console.warn('[ConfigPage] Avertissement reload garage config:', e)
        }

        try {
          if (typeof refreshTenantContext === 'function') {
            await refreshTenantContext()
          }
        } catch (e) {
          console.warn('[ConfigPage] Avertissement refresh tenant context:', e)
        }

        setTimeout(() => {
          window.location.reload()
        }, 500)
      } else {
        toast.error('Erreur', 'Impossible de modifier la version.')
      }
    } catch (err: any) {
      console.error('[handleConfirmSwitchVersion] Erreur:', err)
      toast.error('Erreur de basculement', err?.message || 'Une anomalie est survenue lors du basculement.')
    } finally {
      setSwitchingGarage(false)
    }
  }

  // ─── Configuration Métier : École & Centre de Formation (STRICTEMENT SECTEUR ACTIF) ───
  const isEcole = React.useMemo(() => {
    const slug = currentSectorSlug ? normalizeSectorSlug(currentSectorSlug) : ''
    return slug === 'ecole' || slug === 'formation' || slug === 'education'
  }, [currentSectorSlug])

  useEffect(() => {
    if (activeTab === 'imprimerie' && !isImprimerie) setActiveTab('profil')
    if (activeTab === 'garage_version' && !isGarage) setActiveTab('profil')
    if (activeTab === 'ecole_version' && !isEcole) setActiveTab('profil')
  }, [activeTab, isImprimerie, isGarage, isEcole])

  const {
    typeEtablissement: ecoleType,
    isScolaire: isEcoleScolaire,
    isFormationPro: isEcoleFormationPro,
    isMixte: isEcoleMixte,
    selectType: selectEcoleType,
    loading: loadingEcoleConfig,
    reload: reloadEcoleConfig
  } = useEcoleConfig()

  const [switchingEcoleModal, setSwitchingEcoleModal] = useState(false)
  const [targetEcoleType, setTargetEcoleType] = useState<EcoleTypeEtablissement | null>(null)
  const [switchingEcole, setSwitchingEcole] = useState(false)

  const handleConfirmSwitchEcole = async () => {
    if (!targetEcoleType) return
    setSwitchingEcole(true)
    try {
      const ok = await selectEcoleType(targetEcoleType)
      if (ok) {
        try {
          if (company?.id) {
            localStorage.setItem(`gestio229_ecole_type_${company.id}`, targetEcoleType)
          }
        } catch (_) {}

        toast.success(
          'Profil mis à jour avec succès !',
          targetEcoleType === 'SCOLAIRE'
            ? 'Votre établissement est désormais en mode Établissement Scolaire.'
            : targetEcoleType === 'FORMATION_PRO'
            ? 'Votre établissement est désormais en mode Centre de Formation Pro.'
            : 'Votre établissement est désormais en mode Établissement Mixte.'
        )
        setSwitchingEcoleModal(false)

        try {
          if (typeof reloadEcoleConfig === 'function') {
            await reloadEcoleConfig()
          }
        } catch (e) {
          console.warn('[ConfigPage] Avertissement reload ecole config:', e)
        }

        try {
          if (typeof refreshTenantContext === 'function') {
            await refreshTenantContext()
          }
        } catch (e) {
          console.warn('[ConfigPage] Avertissement refresh tenant context:', e)
        }

        setTimeout(() => {
          window.location.reload()
        }, 500)
      } else {
        toast.error('Erreur', 'Impossible de modifier le profil.')
      }
    } catch (err: any) {
      console.error('[handleConfirmSwitchEcole] Erreur:', err)
      toast.error('Erreur de mise à jour', err?.message || 'Une anomalie est survenue lors de la mise à jour.')
    } finally {
      setSwitchingEcole(false)
    }
  }

  // ─── Configuration Métier : Station-Service & Exonération TVA ──────────────
  const isStationService = React.useMemo(() => {
    const slug = currentSectorSlug ? normalizeSectorSlug(currentSectorSlug) : ''
    return slug === 'station-service' || slug === 'station' || slug === 'hydrocarbures'
  }, [currentSectorSlug])

  const [stationExoCfg, setStationExoCfg] = useState<StationExonerationConfig>({
    is_active: false,
    taux_exoneration_pct: 0,
    history: []
  })
  const [savingStationExo, setSavingStationExo] = useState(false)
  const [loadingStationExo, setLoadingStationExo] = useState(false)

  useEffect(() => {
    if (company?.id && isStationService) {
      setLoadingStationExo(true)
      getStationExonerationConfig(company.id)
        .then((cfg) => {
          if (cfg) setStationExoCfg(cfg)
        })
        .finally(() => setLoadingStationExo(false))
    }
  }, [company?.id, isStationService])

  const handleSaveStationExoneration = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id) return
    setSavingStationExo(true)
    try {
      const res = await saveStationExonerationConfig(
        company.id,
        {
          is_active: stationExoCfg.is_active,
          taux_exoneration_pct: stationExoCfg.taux_exoneration_pct
        },
        undefined,
        { id: user?.id, name: user?.full_name || user?.email }
      )
      if (res.success && res.data) {
        setStationExoCfg(res.data)
        toast.success(
          'Paramétrage d\'exonération TVA enregistré !',
          stationExoCfg.is_active
            ? `Exonération active à ${stationExoCfg.taux_exoneration_pct}%. Ce taux s'appliquera automatiquement à chaque vente.`
            : 'Exonération désactivée. Les prochaines ventes seront calculées au taux de TVA standard.'
        )
      } else {
        toast.error('Erreur', res.error || 'Impossible d\'enregistrer')
      }
    } catch (err: any) {
      toast.error('Erreur', err?.message || 'Erreur lors de l\'enregistrement')
    } finally {
      setSavingStationExo(false)
    }
  }

  // ─── Filtre par secteur dans la vue de l'équipe ───────────────────────────
  // Par défaut, filtre sur le secteur actuellement ouvert (ex: microfinance)
  const [sectorFilter, setSectorFilter] = useState<string>(
    currentSectorSlug ? normalizeSectorSlug(currentSectorSlug) : 'all'
  )

  // ─── États Équipe & Utilisateurs Internes ──────────────────────────────────
  const [usersList, setUsersList] = useState<any[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creatingUser, setCreatingUser] = useState(false)
  const [createError, setCreateError] = useState('')

  // Formulaire création utilisateur interne
  const defaultSector = currentSectorSlug
    ? normalizeSectorSlug(currentSectorSlug)
    : subscribedSectors[0]?.slug || 'boutique'

  const initialRoles = getRolesForSector(defaultSector)
  const initialRole = initialRoles[0] || {
    id: 'caissier',
    defaultPermissions: {
      ventes: true,
      caisse: true,
      stock: false,
      clients: true,
      fournisseurs: false,
      depenses: false,
      reporting: false,
      finances: false,
      syscohada: false,
      admin: false,
    },
  }

  const [newUser, setNewUser] = useState({
    full_name: '',
    phone: '',
    username: '',
    initial_password: '',
    role: initialRole.id,
    sector: defaultSector,
    permissions: {
      ventes_pos: !!initialRole.defaultPermissions?.ventes,
      caisse: !!initialRole.defaultPermissions?.caisse,
      stocks_inventaires: !!initialRole.defaultPermissions?.stock,
      clients: !!initialRole.defaultPermissions?.clients,
      fournisseurs_achats: !!initialRole.defaultPermissions?.fournisseurs,
      depenses: !!initialRole.defaultPermissions?.depenses,
      reporting_rapports: !!initialRole.defaultPermissions?.reporting,
      tresorerie_banques: !!initialRole.defaultPermissions?.finances,
      comptabilite_syscohada: !!initialRole.defaultPermissions?.syscohada,
      ...initialRole.defaultPermissions,
    },
  })

  // Réinitialisation mot de passe modal
  const [resetModalUser, setResetModalUser] = useState<any | null>(null)
  const [resetPasswordVal, setResetPasswordVal] = useState('')
  const [savingReset, setSavingReset] = useState(false)

  // ─── Modal Modification Permissions Utilisateur Interne Existant ──
  const [editPermissionsUser, setEditPermissionsUser] = useState<any | null>(null)
  const [editPermissionsSectors, setEditPermissionsSectors] = useState<Record<string, {
    access: boolean
    role: string
    role_label: string
    permissions: {
      view: boolean
      create: boolean
      edit: boolean
      delete: boolean
      validate: boolean
      encaissement: boolean
    }
    modules: Record<string, boolean>
  }>>({})
  const [selectedEditSector, setSelectedEditSector] = useState<string>('')
  const [savingPermissions, setSavingPermissions] = useState(false)
  const [editPermissionsError, setEditPermissionsError] = useState('')

  // Charger les informations entreprise
  useEffect(() => {
    if (company) {
      setForm({
        name: company.name || '',
        legal_form: company.legal_form || 'SARL',
        ifu_number: company.ifu_number || '',
        rccm_number: company.rccm_number || '',
        regime_fiscal: company.regime_fiscal || 'Régime Réel Simplifié (RRS)',
        address: company.address || '',
        city: company.city || 'Cotonou',
        phone: company.phone || '',
        email: company.email || '',
        logo_url: company.logo_url || '',
        currency: company.currency || 'FCFA',
        tva_default_rate: company.tva_default_rate ?? 18,
        aib_default_rate: company.aib_default_rate ?? 1,
        e_mecef_active: company.e_mecef_active ?? false,
        e_mecef_connected: (company as any).e_mecef_connected ?? false,
        e_mecef_nim: company.e_mecef_nim || '',
        e_mecef_token: (company as any).e_mecef_token || '',
        e_mecef_api_url: (company as any).e_mecef_api_url || '',
        closure_email_1: (company as any).closure_email_1 || (company as any).email || '',
        closure_email_2: (company as any).closure_email_2 || '',
        closure_email_3: (company as any).closure_email_3 || '',
        auto_send_closure_pdf: (company as any).auto_send_closure_pdf ?? true,
      })
    }
  }, [company])

  // Charger la liste des utilisateurs de l'entreprise
  const fetchUsers = async () => {
    if (!company?.id) return
    setLoadingUsers(true)
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('company_id', company.id)
        .order('created_at', { ascending: true })

      if (error) throw error
      setUsersList(data || [])
    } catch (err: any) {
      console.error('Erreur chargement utilisateurs:', err)
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (company?.id && activeTab === 'utilisateurs') {
      fetchUsers()
    }
  }, [company?.id, activeTab])

  // Sauvegarde des paramètres entreprise
  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!company?.id) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          ...form,
          onboarding_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', company.id)

      if (error) throw error

      if (company?.id) {
        localStorage.setItem(`gestio229_emecef_active_${company.id}`, form.e_mecef_active ? 'true' : 'false')
      }

      toast.success('Configuration sauvegardée avec succès')
      await refreshTenantContext()
    } catch (err: any) {
      toast.error('Erreur de mise à jour', err.message)
    } finally {
      setSaving(false)
    }
  }

  // Création d'un utilisateur interne
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError('')

    const trimmedUsername = newUser.username.trim().toLowerCase()
    if (!trimmedUsername || trimmedUsername.length < 3) {
      setCreateError("L'identifiant doit comporter au moins 3 caractères.")
      return
    }

    if (!newUser.initial_password || newUser.initial_password.length < 4) {
      setCreateError("Le mot de passe initial doit comporter au moins 4 caractères.")
      return
    }

    if (!newUser.full_name.trim()) {
      setCreateError("Veuillez renseigner le nom complet de l'utilisateur.")
      return
    }

    setCreatingUser(true)
    try {
      // 1. Vérifier l'unicité de l'identifiant
      const { data: existing } = await supabase
        .from('user_profiles')
        .select('id')
        .ilike('username', trimmedUsername)
        .maybeSingle()

      if (existing) {
        setCreateError(`L'identifiant "${trimmedUsername}" est déjà utilisé.`)
        setCreatingUser(false)
        return
      }

      // Email synthétique pour respecter la contrainte DB NOT NULL UNIQUE
      const safeEmail = `${trimmedUsername}@${company?.id?.slice(0, 8) || 'ent'}.gestio229.local`

      // 2. Insérer dans user_profiles avec TOUTES les clés de secteur pour zéro échec
      const cleanSector = normalizeSectorSlug(newUser.sector)
      const currentSectorRoles = getRolesForSector(cleanSector)
      const selectedRoleMeta = currentSectorRoles.find((r) => r.id === newUser.role)
      const roleLabel = selectedRoleMeta?.label || newUser.role

      const { error: insertErr } = await supabase
        .from('user_profiles')
        .insert({
          company_id: company?.id,
          full_name: newUser.full_name.trim(),
          username: trimmedUsername,
          email: safeEmail,
          pos_pin_code: newUser.initial_password,
          phone: newUser.phone.trim() || null,
          role: newUser.role,
          is_active: true,
          permissions: {
            ...newUser.permissions,
            ventes: !!((newUser.permissions as any).ventes_pos ?? (newUser.permissions as any).ventes),
            ventes_pos: !!((newUser.permissions as any).ventes_pos ?? (newUser.permissions as any).ventes),
            caisse: !!(newUser.permissions as any).caisse,
            stock: !!((newUser.permissions as any).stocks_inventaires ?? (newUser.permissions as any).stock),
            stocks_inventaires: !!((newUser.permissions as any).stocks_inventaires ?? (newUser.permissions as any).stock),
            clients: !!(newUser.permissions as any).clients,
            fournisseurs: !!((newUser.permissions as any).fournisseurs_achats ?? (newUser.permissions as any).fournisseurs),
            fournisseurs_achats: !!((newUser.permissions as any).fournisseurs_achats ?? (newUser.permissions as any).fournisseurs),
            depenses: !!(newUser.permissions as any).depenses,
            reporting: !!((newUser.permissions as any).reporting_rapports ?? (newUser.permissions as any).reporting),
            reporting_rapports: !!((newUser.permissions as any).reporting_rapports ?? (newUser.permissions as any).reporting),
            finances: !!((newUser.permissions as any).tresorerie_banques ?? (newUser.permissions as any).finances),
            tresorerie_banques: !!((newUser.permissions as any).tresorerie_banques ?? (newUser.permissions as any).finances),
            syscohada: !!((newUser.permissions as any).comptabilite_syscohada ?? (newUser.permissions as any).syscohada),
            comptabilite_syscohada: !!((newUser.permissions as any).comptabilite_syscohada ?? (newUser.permissions as any).syscohada),
            sector: cleanSector,
            sector_slug: cleanSector,
            assigned_sector: cleanSector,
            sector_id: cleanSector,
            role_label: roleLabel,
            commercial: !!((newUser.permissions as any).ventes_pos ?? (newUser.permissions as any).ventes),
            treasury: !!((newUser.permissions as any).tresorerie_banques ?? (newUser.permissions as any).finances),
            purchases: !!((newUser.permissions as any).fournisseurs_achats ?? (newUser.permissions as any).fournisseurs),
            accounting: !!((newUser.permissions as any).comptabilite_syscohada ?? (newUser.permissions as any).syscohada)
          }
        })

      if (insertErr) throw insertErr

      toast.success(`Utilisateur ${newUser.full_name} créé avec succès pour le secteur ${cleanSector} !`)
      setShowCreateModal(false)
      // Réinitialiser le formulaire avec le secteur actif
      const nextRoles = getRolesForSector(defaultSector)
      const nextRole = nextRoles[0]
      setNewUser({
        full_name: '',
        phone: '',
        username: '',
        initial_password: '',
        role: nextRole?.id || 'caissier',
        sector: defaultSector,
        permissions: {
          ...(nextRole?.defaultPermissions || initialRole.defaultPermissions),
        }
      })
      await fetchUsers()
    } catch (err: any) {
      setCreateError(err.message || "Erreur lors de la création de l'utilisateur")
    } finally {
      setCreatingUser(false)
    }
  }

  // Activer / Désactiver un utilisateur
  const toggleUserStatus = async (userItem: any) => {
    try {
      const newStatus = !userItem.is_active
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', userItem.id)

      if (error) throw error
      toast.success(`Statut mis à jour : ${newStatus ? 'Actif' : 'Désactivé'}`)
      await fetchUsers()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  // Réinitialiser mot de passe d'un utilisateur interne
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetModalUser) return
    if (resetPasswordVal.length < 4) {
      toast.error('Le mot de passe doit comporter au moins 4 caractères.')
      return
    }

    setSavingReset(true)
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          pos_pin_code: resetPasswordVal,
          updated_at: new Date().toISOString()
        })
        .eq('id', resetModalUser.id)

      if (error) throw error
      toast.success(`Mot de passe réinitialisé pour ${resetModalUser.username}`)
      setResetModalUser(null)
      setResetPasswordVal('')
      await fetchUsers()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setSavingReset(false)
    }
  }

  // ─── Gestion de la Modification des Accès & Permissions Utilisateurs ────────
  const handleOpenEditPermissions = (targetUser: any) => {
    const isCurrentUserAdmin = user?.role === 'administrateur' || user?.role === 'super_admin'
    if (!isCurrentUserAdmin) {
      toast.error('Accès refusé', 'Seuls les administrateurs peuvent modifier les accès.')
      return
    }

    const perm = (typeof targetUser.permissions === 'object' && targetUser.permissions) ? targetUser.permissions : {}
    const currentPrimarySector = normalizeSectorSlug(
      perm.sector_slug || perm.sector || perm.assigned_sector || perm.sector_id || targetUser.sector_id || subscribedSectors[0]?.slug || 'boutique'
    )

    const initialSectorsConfig: Record<string, any> = {}

    // Pour chaque secteur de l'entreprise
    subscribedSectors.forEach((sec) => {
      const secSlug = normalizeSectorSlug(sec.slug)
      const secRoles = getRolesForSector(secSlug)
      const defaultRoleDef = secRoles[0]
      const defaultRoleId = defaultRoleDef?.id || 'caissier'

      // Récupérer la configuration existante si déjà personnalisée
      const existingSecConf = perm.sectors?.[secSlug]

      if (existingSecConf) {
        initialSectorsConfig[secSlug] = {
          access: Boolean(existingSecConf.access),
          role: existingSecConf.role || defaultRoleId,
          role_label: existingSecConf.role_label || secRoles.find(r => r.id === existingSecConf.role)?.label || defaultRoleDef?.label || defaultRoleId,
          permissions: {
            view: existingSecConf.permissions?.view ?? true,
            create: existingSecConf.permissions?.create ?? (defaultRoleId !== 'auditeur'),
            edit: existingSecConf.permissions?.edit ?? false,
            delete: existingSecConf.permissions?.delete ?? false,
            validate: existingSecConf.permissions?.validate ?? false,
            encaissement: existingSecConf.permissions?.encaissement ?? (defaultRoleId === 'caissier' || defaultRoleId === 'vendeur'),
          },
          modules: existingSecConf.modules || {}
        }
      } else {
        // Déterminer si l'utilisateur a accès par défaut
        const isPrimary = (secSlug === currentPrimarySector)
        const inAllowed = Array.isArray(perm.allowed_sectors) && perm.allowed_sectors.map(normalizeSectorSlug).includes(secSlug)
        const hasAccess = isPrimary || inAllowed

        const assignedRole = isPrimary ? (targetUser.role || defaultRoleId) : defaultRoleId
        const roleMeta = secRoles.find(r => r.id === assignedRole) || defaultRoleDef
        const defP = roleMeta?.defaultPermissions || {}

        // Résoudre les modules disponibles pour ce secteur
        const availableSecList = SectorLoader.getAvailableModulesForSector(secSlug, company)
        const modsList = availableSecList.length > 0
          ? availableSecList
          : (MODULES_PAR_SECTEUR[secSlug] || MODULES_PAR_SECTEUR['default'])

        const initialMods: Record<string, boolean> = {}
        modsList.forEach((m) => {
          if (isPrimary && perm[m.id] !== undefined) {
            initialMods[m.id] = Boolean(perm[m.id])
          } else {
            initialMods[m.id] = Boolean((defP as any)[m.id])
          }
        })

        initialSectorsConfig[secSlug] = {
          access: hasAccess,
          role: assignedRole,
          role_label: roleMeta?.label || assignedRole,
          permissions: {
            view: perm.can_view ?? true,
            create: perm.can_create ?? !!defP.ventes,
            edit: perm.can_edit ?? false,
            delete: perm.can_delete ?? false,
            validate: perm.can_validate ?? false,
            encaissement: perm.can_encaissement ?? (assignedRole === 'caissier' || assignedRole === 'vendeur' || !!defP.caisse),
          },
          modules: initialMods
        }
      }
    })

    setEditPermissionsUser(targetUser)
    setEditPermissionsSectors(initialSectorsConfig)
    setSelectedEditSector(currentPrimarySector || subscribedSectors[0]?.slug || '')
    setEditPermissionsError('')
  }

  const handleEditSectorRoleChange = (sectorSlug: string, newRole: string) => {
    const rolesForSec = getRolesForSector(sectorSlug)
    const roleMeta = rolesForSec.find(r => r.id === newRole)
    const defP = roleMeta?.defaultPermissions || {}

    // Résoudre modules disponibles
    const availableSecList = SectorLoader.getAvailableModulesForSector(sectorSlug, company)
    const modsList = availableSecList.length > 0
      ? availableSecList
      : (MODULES_PAR_SECTEUR[sectorSlug] || MODULES_PAR_SECTEUR['default'])

    const updatedMods: Record<string, boolean> = {}
    modsList.forEach((m) => {
      updatedMods[m.id] = Boolean((defP as any)[m.id])
    })

    setEditPermissionsSectors(prev => ({
      ...prev,
      [sectorSlug]: {
        ...prev[sectorSlug],
        role: newRole,
        role_label: roleMeta?.label || newRole,
        permissions: {
          view: true,
          create: !!defP.ventes || newRole === 'caissier' || newRole === 'vendeur',
          edit: !!defP.stock || !!defP.admin,
          delete: !!defP.admin,
          validate: !!defP.finances || !!defP.syscohada || !!defP.admin,
          encaissement: newRole === 'caissier' || newRole === 'vendeur' || !!defP.caisse,
        },
        modules: updatedMods
      }
    }))
  }

  const handleToggleSectorAccess = (sectorSlug: string) => {
    setEditPermissionsSectors(prev => {
      const current = prev[sectorSlug]
      if (!current) return prev
      const newAccess = !current.access
      return {
        ...prev,
        [sectorSlug]: {
          ...current,
          access: newAccess
        }
      }
    })
  }

  const handleSaveUserPermissions = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editPermissionsUser) return

    const isCurrentUserAdmin = user?.role === 'administrateur' || user?.role === 'super_admin'
    if (!isCurrentUserAdmin) {
      setEditPermissionsError('Action non autorisée. Seuls les administrateurs peuvent modifier les accès.')
      return
    }

    setSavingPermissions(true)
    setEditPermissionsError('')

    try {
      const allowedSectors = Object.keys(editPermissionsSectors).filter(
        s => editPermissionsSectors[s].access
      )

      // Déterminer le secteur principal
      const primarySector = editPermissionsSectors[selectedEditSector]?.access
        ? selectedEditSector
        : (allowedSectors[0] || selectedEditSector || 'boutique')

      const primaryConfig = editPermissionsSectors[primarySector] || {
        role: 'caissier',
        role_label: 'Caissier',
        permissions: { view: true, create: true, edit: false, delete: false, validate: false, encaissement: true },
        modules: {}
      }

      const existingPerm = (typeof editPermissionsUser.permissions === 'object' && editPermissionsUser.permissions)
        ? editPermissionsUser.permissions
        : {}

      const updatedPermissionsPayload = {
        ...existingPerm,
        is_internal_user: true,
        allowed_sectors: allowedSectors,
        sectors: editPermissionsSectors,
        // Compatibilité descendante absolue
        sector: primarySector,
        sector_slug: primarySector,
        assigned_sector: primarySector,
        sector_id: primarySector,
        role_label: primaryConfig.role_label,
        // Permissions d'actions globales
        can_view: primaryConfig.permissions.view,
        can_create: primaryConfig.permissions.create,
        can_edit: primaryConfig.permissions.edit,
        can_delete: primaryConfig.permissions.delete,
        can_validate: primaryConfig.permissions.validate,
        can_encaissement: primaryConfig.permissions.encaissement,
        // Drapeaux canoniques pour les modules
        ventes: !!primaryConfig.modules['ventes'] || !!primaryConfig.modules['ventes_pos'] || !!primaryConfig.permissions.create,
        ventes_pos: !!primaryConfig.modules['ventes_pos'] || !!primaryConfig.modules['ventes'],
        caisse: !!primaryConfig.modules['caisse'] || !!primaryConfig.permissions.encaissement,
        stock: !!primaryConfig.modules['stock'] || !!primaryConfig.modules['stocks_inventaires'],
        stocks_inventaires: !!primaryConfig.modules['stocks_inventaires'] || !!primaryConfig.modules['stock'],
        clients: !!primaryConfig.modules['clients'],
        fournisseurs: !!primaryConfig.modules['fournisseurs'] || !!primaryConfig.modules['fournisseurs_achats'],
        fournisseurs_achats: !!primaryConfig.modules['fournisseurs_achats'] || !!primaryConfig.modules['fournisseurs'],
        depenses: !!primaryConfig.modules['depenses'],
        reporting: !!primaryConfig.modules['reporting'] || !!primaryConfig.modules['reporting_rapports'],
        reporting_rapports: !!primaryConfig.modules['reporting_rapports'] || !!primaryConfig.modules['reporting'],
        finances: !!primaryConfig.modules['finances'] || !!primaryConfig.modules['tresorerie_banques'],
        tresorerie_banques: !!primaryConfig.modules['tresorerie_banques'] || !!primaryConfig.modules['finances'],
        syscohada: !!primaryConfig.modules['syscohada'] || !!primaryConfig.modules['comptabilite_syscohada'],
        comptabilite_syscohada: !!primaryConfig.modules['comptabilite_syscohada'] || !!primaryConfig.modules['syscohada'],
        // Modules personnalisés
        ...primaryConfig.modules
      }

      const { error: updateErr } = await supabase
        .from('user_profiles')
        .update({
          role: primaryConfig.role,
          sector_id: primarySector,
          sector_slug: primarySector,
          permissions: updatedPermissionsPayload,
          updated_at: new Date().toISOString()
        })
        .eq('id', editPermissionsUser.id)

      if (updateErr) throw updateErr

      // Enregistrer l'événement d'audit
      try {
        await logAuditEvent({
          companyId: company?.id,
          userId: user?.id,
          userName: user?.full_name || 'Administrateur',
          module: 'utilisateurs',
          action: 'MODIFIER_ACCES_UTILISATEUR',
          description: `Mise à jour des accès et permissions pour l'utilisateur ${editPermissionsUser.full_name} (${editPermissionsUser.username})`,
          entityName: 'user_profiles',
          entityId: editPermissionsUser.id,
          details: {
            username: editPermissionsUser.username,
            allowed_sectors: allowedSectors,
            primary_sector: primarySector,
            primary_role: primaryConfig.role,
            sectors_summary: Object.keys(editPermissionsSectors).map(slug => ({
              slug,
              access: editPermissionsSectors[slug].access,
              role: editPermissionsSectors[slug].role
            }))
          }
        })
      } catch (auditErr) {
        console.warn('Erreur non bloquante logAuditEvent:', auditErr)
      }

      toast.success(`Accès et permissions de ${editPermissionsUser.full_name} mis à jour avec succès !`)
      setEditPermissionsUser(null)
      await fetchUsers()
      if (editPermissionsUser.id === user?.id) {
        await refreshTenantContext()
      }
    } catch (err: any) {
      setEditPermissionsError(err.message || 'Erreur lors de la mise à jour des permissions.')
    } finally {
      setSavingPermissions(false)
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Paramètres de Gestion</h1>
          <p className="text-slate-500 text-xs mt-1">
            Configuration juridique, fiscale, alertes de clôture et gestion de l'équipe
          </p>
        </div>

        {/* Onglets */}
        <div className="flex bg-slate-200/80 p-1 rounded-2xl gap-1 overflow-x-auto">
          <button
            onClick={() => setActiveTab('etablissement')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'etablissement'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Building2 className="w-4 h-4 text-emerald-600" />
            <span>Établissement</span>
          </button>
          <button
            onClick={() => setActiveTab('fiscalite')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'fiscalite'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Fiscalité & e-MECeF</span>
          </button>
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Store className="w-4 h-4 text-emerald-600" />
            <span>Clôtures & Emails</span>
          </button>
          <button
            onClick={() => setActiveTab('utilisateurs')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'utilisateurs'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Équipe & Accès</span>
          </button>
          <button
            onClick={() => setActiveTab('circuit_ventes')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
              activeTab === 'circuit_ventes'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
            <span>Circuit Ventes & Caisses</span>
            {circuitPendingCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700 font-black">
                {circuitPendingCount}
              </span>
            )}
          </button>
          {isImprimerie && (
            <button
              onClick={() => setActiveTab('imprimerie')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'imprimerie'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Printer className="w-4 h-4 text-emerald-600" />
              <span>Atelier Imprimerie</span>
            </button>
          )}
          {isGarage && (
            <button
              onClick={() => setActiveTab('garage')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'garage'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Wrench className="w-4 h-4 text-amber-600" />
              <span>Version Garage & BTP</span>
            </button>
          )}
          {isEcole && (
            <button
              onClick={() => setActiveTab('ecole')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'ecole'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-lime-600" />
              <span>Profil École & Formation</span>
            </button>
          )}
          {isStationService && (
            <button
              onClick={() => setActiveTab('station')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                activeTab === 'station'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Fuel className="w-4 h-4 text-amber-500" />
              <span>Station-Service</span>
            </button>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* ONGLET 1 : ÉTABLISSEMENT                                            */}
      {/* =================================================================== */}
      {activeTab === 'etablissement' && (
        <form onSubmit={handleSaveCompany} className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <span>Identité de l'Entreprise</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Raison Sociale *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Forme Juridique</label>
                <select
                  value={form.legal_form}
                  onChange={(e) => setForm({ ...form, legal_form: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="SARL">SARL (Société à Responsabilité Limitée)</option>
                  <option value="SAS">SAS (Société par Actions Simplifiée)</option>
                  <option value="Ets">Établissement Individuel / Profession libérale</option>
                  <option value="SA">SA (Société Anonyme)</option>
                  <option value="GIE">GIE (Groupement d'Intérêt Économique)</option>
                </select>
              </div>
            </div>

            {/* Logo de l'Entreprise */}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Logo de l'Entreprise (s'affiche sur les factures A4 et les tickets de caisse)
              </label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  <img
                    src={form.logo_url}
                    alt="Aperçu logo"
                    className="w-12 h-12 object-contain rounded-xl border border-slate-200 p-1 bg-white flex-shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-[10px] font-bold flex-shrink-0">
                    Logo
                  </div>
                )}
                <input
                  type="text"
                  value={form.logo_url}
                  onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                  placeholder="Lien ou URL directe vers l'image du logo (ex: https://...)"
                  className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Téléphone Principal</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+229 01 00 00 00"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Email Officiel</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="contact@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Adresse Géographique</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Quartier, Carré, Rue, Immeuble..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ville</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">N° RCCM</label>
                <input
                  type="text"
                  value={form.rccm_number}
                  onChange={(e) => setForm({ ...form, rccm_number: e.target.value })}
                  placeholder="RB/COT/2026/B..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Devise Principale</label>
                <input
                  type="text"
                  value={form.currency}
                  readOnly
                  className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-1">Zone UEMOA (FCFA - XOF)</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enregistrement en cours...' : 'Enregistrer les informations'}</span>
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ONGLET 2 : FISCALITÉ DGI BÉNIN & e-MECeF                            */}
      {/* =================================================================== */}
      {activeTab === 'fiscalite' && (
        <form onSubmit={handleSaveCompany} className="space-y-6 animate-fadeIn">
          {/* Identifiants Fiscaux */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <span>Régime Fiscal & IFU Bénin</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Numéro IFU (13 Chiffres) *</label>
                <input
                  type="text"
                  required
                  value={form.ifu_number}
                  onChange={(e) => setForm({ ...form, ifu_number: e.target.value })}
                  placeholder="Ex: 3202612345678"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Régime d'Imposition</label>
                <select
                  value={form.regime_fiscal}
                  onChange={(e) => setForm({ ...form, regime_fiscal: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                >
                  <option value="Régime Réel Simplifié (RRS)">Régime Réel Simplifié (RRS)</option>
                  <option value="Régime Réel Normal (RRN)">Régime Réel Normal (RRN)</option>
                  <option value="Régime de la TPS">Régime de la TPS (Non assujetti TVA)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Taux TVA par Défaut</label>
                <div className="relative">
                  <input
                    type="number"
                    value={form.tva_default_rate}
                    onChange={(e) => setForm({ ...form, tva_default_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">18% pour les assujettis TVA, 0% pour TPS / exonérés.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Taux Acompte AIB</label>
                <div className="relative">
                  <input
                    type="number"
                    value={form.aib_default_rate}
                    onChange={(e) => setForm({ ...form, aib_default_rate: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold"
                  />
                  <span className="absolute right-3 top-2 text-xs text-slate-400 font-bold">%</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">1% (entreprises immatriculées) ou 5% (prestataires/non immatriculés). Calculé strictement sur le HT.</p>
              </div>
            </div>
          </div>

          {/* Rubrique : CONFIGURATION e-MECeF / FACTURATION */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-600" />
                  <span>CONFIGURATION e-MECeF / FACTURATION</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gestion conditionnelle du titre du document commercial (Bon de Commande vs Facture de Vente)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  form.e_mecef_active
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-indigo-50 text-indigo-800 border border-indigo-200'
                }`}>
                  {form.e_mecef_active ? '● FACTURE DE VENTE (e-MECeF Associé)' : '○ BON DE COMMANDE (Non associé)'}
                </span>
              </div>
            </div>

            {/* Explications des deux situations exigées */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                !form.e_mecef_active ? 'bg-indigo-50/50 border-indigo-300 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <h4 className="font-black text-slate-800 mb-1 flex items-center gap-1.5">
                  <span>CAS 1 : Compte e-MECeF non associé ou option désactivée</span>
                  {!form.e_mecef_active && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full">Actif</span>}
                </h4>
                <p>
                  Le document généré porte automatiquement le titre <strong>BON DE COMMANDE</strong> (n'affiche pas "Facture de vente") avec la mention : <em>« Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande »</em>.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border text-xs leading-relaxed ${
                form.e_mecef_active ? 'bg-emerald-50/50 border-emerald-300 text-slate-700' : 'bg-slate-50 border-slate-200 text-slate-500'
              }`}>
                <h4 className="font-black text-slate-800 mb-1 flex items-center gap-1.5">
                  <span>CAS 2 : Compte e-MECeF associé et option activée</span>
                  {form.e_mecef_active && <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full">Actif</span>}
                </h4>
                <p>
                  Le document commercial émis porte automatiquement le titre officiel <strong>FACTURE DE VENTE</strong>.
                </p>
              </div>
            </div>

            {/* Bouton d'activation exigé */}
            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-2xl border border-slate-200 hover:bg-slate-100 transition">
                <input
                  type="checkbox"
                  checked={form.e_mecef_active}
                  onChange={(e) => setForm({
                    ...form,
                    e_mecef_active: e.target.checked,
                    e_mecef_connected: e.target.checked
                  })}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <div>
                  <span className="text-xs font-bold text-slate-900">
                    Mon entreprise dispose d'un compte e-MECeF associé à GESTIO229
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Active l'intitulé officiel « FACTURE DE VENTE » propre à cette entreprise. Si décoché, l'application génère un « BON DE COMMANDE ».
                  </p>
                </div>
              </label>
            </div>

            {form.e_mecef_connected && (
              <div className="p-4 bg-emerald-50/40 border border-emerald-200 rounded-2xl space-y-4 animate-fadeIn">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">NIM e-MECeF Officiel *</label>
                    <input
                      type="text"
                      value={form.e_mecef_nim}
                      onChange={(e) => setForm({ ...form, e_mecef_nim: e.target.value })}
                      placeholder="Ex: BENIN-DGI-EMEF-2026-001"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">URL API Serveur e-MECeF</label>
                    <input
                      type="text"
                      value={form.e_mecef_api_url}
                      onChange={(e) => setForm({ ...form, e_mecef_api_url: e.target.value })}
                      placeholder="https://emef.dgi.bj/api/..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Jeton d'autorisation (Token API DGI)</label>
                  <input
                    type="password"
                    value={form.e_mecef_token}
                    onChange={(e) => setForm({ ...form, e_mecef_token: e.target.value })}
                    placeholder="Clé secrète / Token JWT fourni par la DGI"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enregistrement en cours...' : 'Enregistrer la fiscalité'}</span>
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ONGLET 3 : CLÔTURES DE CAISSE & NOTIFICATIONS EMAIL                */}
      {/* =================================================================== */}
      {activeTab === 'notifications' && (
        <form onSubmit={handleSaveCompany} className="space-y-6 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-600" />
                <span>Destinataires du Rapport de Clôture Quotidienne (Z de caisse)</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                À chaque clôture de caisse, un rapport récapitulatif détaillé en PDF est automatiquement généré et transmis à un minimum de 3 adresses emails configurées ci-dessous (Direction, Gérant, Comptable).
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Destinataire 1 (Direction Générale / Propriétaire) *
                </label>
                <input
                  type="email"
                  required
                  value={form.closure_email_1}
                  onChange={(e) => setForm({ ...form, closure_email_1: e.target.value })}
                  placeholder="directeur@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Destinataire 2 (Gérant / Responsable de Boutique) *
                </label>
                <input
                  type="email"
                  required
                  value={form.closure_email_2}
                  onChange={(e) => setForm({ ...form, closure_email_2: e.target.value })}
                  placeholder="gerant@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Destinataire 3 (Comptabilité / Auditeur Externe) *
                </label>
                <input
                  type="email"
                  required
                  value={form.closure_email_3}
                  onChange={(e) => setForm({ ...form, closure_email_3: e.target.value })}
                  placeholder="comptable@entreprise.bj"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.auto_send_closure_pdf}
                  onChange={(e) => setForm({ ...form, auto_send_closure_pdf: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
                />
                <span className="text-xs font-bold text-slate-800">
                  Envoi automatique instantané du PDF de clôture lors de la validation du Z de caisse
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-md shadow-emerald-200 transition"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Enregistrement en cours...' : 'Enregistrer les alertes de clôture'}</span>
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ONGLET 4 : ÉQUIPE & UTILISATEURS INTERNES                          */}
      {/* =================================================================== */}
      {activeTab === 'utilisateurs' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Bannière explicative */}
          <div className="bg-emerald-950 text-white p-6 rounded-3xl shadow-sm border border-emerald-900/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black tracking-tight flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-400" />
                <span>Gestion des Utilisateurs Internes</span>
              </h2>
              <p className="text-xs text-emerald-200/80 mt-1 max-w-2xl leading-relaxed">
                Configurez manuellement les identifiants, mots de passe, rôles, secteurs et permissions
                de chaque membre de votre personnel (Caissiers, Magasiniers, Gestionnaires, etc.).
              </p>
            </div>
            <button
              onClick={() => { setShowCreateModal(true); setCreateError(''); }}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black rounded-xl shadow-lg shadow-emerald-500/30 transition shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Créer un utilisateur</span>
            </button>
          </div>

          {/* Filtres par Secteur d'Activité */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setSectorFilter('all')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shadow-sm ${
                sectorFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              <span>Toutes les activités ({usersList.length})</span>
            </button>

            {subscribedSectors.map((sec) => {
              const count = usersList.filter((u) => {
                const perm = (typeof u.permissions === 'object' && u.permissions) ? u.permissions : {}
                const userSec = normalizeSectorSlug(
                  perm.sector_slug || perm.sector || perm.assigned_sector || perm.sector_id || u.sector_id || ''
                )
                return userSec === sec.slug
              }).length

              return (
                <button
                  key={sec.slug}
                  onClick={() => setSectorFilter(sec.slug)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap shadow-sm ${
                    sectorFilter === sec.slug
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-600/30'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{sec.emoji}</span>
                  <span>{sec.name}</span>
                  <span className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] ${
                    sectorFilter === sec.slug ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Tableau des utilisateurs filtrés */}
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span>Équipe du secteur :</span>
                <span className="text-emerald-700 font-black">
                  {sectorFilter === 'all' ? 'Toutes activités confondues' : subscribedSectors.find(s => s.slug === sectorFilter)?.name || sectorFilter}
                </span>
              </h3>
            </div>

            {loadingUsers ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Chargement des profils utilisateurs...
              </div>
            ) : (() => {
              const filteredList = usersList.filter((item) => {
                if (sectorFilter === 'all') return true
                const perm = (typeof item.permissions === 'object' && item.permissions) ? item.permissions : {}
                const itemSector = normalizeSectorSlug(
                  perm.sector_slug || perm.sector || perm.assigned_sector || perm.sector_id || item.sector_id || ''
                )
                const isAdmin = item.role === 'administrateur' || item.role === 'super_admin'
                return isAdmin || itemSector === sectorFilter
              })

              if (filteredList.length === 0) {
                return (
                  <div className="p-12 text-center text-slate-500 text-xs">
                    Aucun membre assigné à ce secteur pour le moment. Cliquez sur "Créer un utilisateur" pour en ajouter un.
                  </div>
                )
              }

              return (
                <div className="divide-y divide-slate-100 overflow-x-auto">
                  {filteredList.map((item) => {
                    const isAdmin = item.role === 'administrateur' || item.role === 'super_admin'
                    const perm = (typeof item.permissions === 'object' && item.permissions) ? item.permissions : {}
                    const itemSector = normalizeSectorSlug(
                      perm.sector_slug || perm.sector || perm.assigned_sector || perm.sector_id || item.sector_id || ''
                    )
                    const itemSectorMeta = ALL_SECTORS_CATALOG.find((s) => s.slug === itemSector) || sectorMeta
                    const sectorRoles = getRolesForSector(itemSector)
                    const roleMeta = sectorRoles.find((r) => r.id === item.role)
                    const roleLabel = perm.role_label || roleMeta?.label || item.role

                    return (
                      <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xs ${
                            isAdmin ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {item.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-slate-800 truncate">{item.full_name}</p>
                              {isAdmin && (
                                <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full">
                                  Administrateur Global
                                </span>
                              )}
                              {!isAdmin && (itemSectorMeta || sectorMeta) && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full">
                                  <span>{(itemSectorMeta || sectorMeta).emoji}</span>
                                  <span>{(itemSectorMeta || sectorMeta).name}</span>
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                              <span>Identifiant : <strong className="text-slate-700 font-mono">{item.username}</strong></span>
                              <span>•</span>
                              <span>Rôle : <strong className="text-emerald-700 font-semibold">{roleLabel}</strong></span>
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${
                            item.is_active !== false ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {item.is_active !== false ? 'Actif' : 'Désactivé'}
                          </span>

                          {!isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenEditPermissions(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 hover:text-emerald-800 bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl transition shadow-xs"
                                title="Modifier les accès"
                              >
                                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                <span className="hidden sm:inline">Modifier les accès</span>
                              </button>

                              <button
                                onClick={() => { setResetModalUser(item); setResetPasswordVal(''); }}
                                className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                                title="Réinitialiser le mot de passe"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => toggleUserStatus(item)}
                                className={`p-2 rounded-xl transition ${
                                  item.is_active !== false
                                    ? 'text-rose-500 hover:bg-rose-50'
                                    : 'text-emerald-600 hover:bg-emerald-50'
                                }`}
                                title={item.is_active !== false ? 'Désactiver le compte' : 'Activer le compte'}
                              >
                                {item.is_active !== false ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ONGLET : ORGANISATION DES VENTES ET DES ENCAISSEMENTS                */}
      {/* =================================================================== */}
      {activeTab === 'circuit_ventes' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Bannière de l'organisation active par secteur */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Paramétrage Indépendant par Secteur • {sectorMeta?.name || currentSectorSlug}</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Organisation active ({sectorMeta?.name || currentSectorSlug}) : </span>
                <span className={isCircuitSeparated ? 'text-amber-400' : 'text-emerald-400'}>
                  {isCircuitSeparated
                    ? 'Mode 2 — Séparation entre Vendeur et Caissière'
                    : 'Mode 1 — Vente et Encaissement par le même utilisateur'}
                </span>
              </h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                {isCircuitSeparated
                  ? `Pour le secteur ${sectorMeta?.name || currentSectorSlug}, les vendeurs disposent du Module Vendeur pour saisir les bons de commande et les transmettre à la caisse. Les caissières les récupèrent dans Vente ou POS pour l'encaissement.`
                  : `Pour le secteur ${sectorMeta?.name || currentSectorSlug}, l'utilisateur autorisé effectue la vente et encaisse directement le client dans le même circuit. Les autres secteurs conservent indépendamment leur propre mode.`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setTargetCircuitMode(isCircuitSeparated ? 'INTEGRE' : 'SEPARE_VENDEUR_CAISSIERE')
                setSwitchingCircuitModal(true)
              }}
              className="flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-emerald-500/20 transition shrink-0 cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Changer pour ce secteur</span>
            </button>
          </div>

          {/* Grille des 2 modes configurables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* MODE 1 */}
            <div
              className={`p-6 rounded-3xl border-2 transition flex flex-col justify-between ${
                isCircuitIntegrated
                  ? 'border-emerald-500 bg-white shadow-md ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-slate-50/50 opacity-80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <Store className="w-5 h-5" />
                  </div>
                  {isCircuitIntegrated ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                      <CheckCircle className="w-3.5 h-3.5" /> Actif
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetCircuitMode('INTEGRE')
                        setSwitchingCircuitModal(true)
                      }}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Activer ce mode
                    </button>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">
                  MODE 1 — Vente et encaissement par le même utilisateur
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  L'utilisateur autorisé peut effectuer la vente et encaisser le client dans le même circuit, conformément aux permissions qui lui sont accordées.
                </p>
                <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                  <li className="flex items-center gap-2">✓ Conserve le fonctionnement actuel et historique de l'entreprise</li>
                  <li className="flex items-center gap-2">✓ Encaissement direct au point de vente (comptoir unique)</li>
                  <li className="flex items-center gap-2">✓ Aucun changement inutile dans le parcours des utilisateurs</li>
                  <li className="flex items-center gap-2">✓ Déstockage et ticket générés en une seule étape</li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Circuit standard direct</span>
                {isCircuitIntegrated ? (
                  <span className="text-xs font-bold text-emerald-600">Mode par défaut</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetCircuitMode('INTEGRE')
                      setSwitchingCircuitModal(true)
                    }}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
                  >
                    Sélectionner
                  </button>
                )}
              </div>
            </div>

            {/* MODE 2 */}
            <div
              className={`p-6 rounded-3xl border-2 transition flex flex-col justify-between ${
                isCircuitSeparated
                  ? 'border-amber-500 bg-white shadow-md ring-2 ring-amber-500/20'
                  : 'border-slate-200 bg-slate-50/50 opacity-80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  {isCircuitSeparated ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                      <CheckCircle className="w-3.5 h-3.5" /> Actif
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetCircuitMode('SEPARE_VENDEUR_CAISSIERE')
                        setSwitchingCircuitModal(true)
                      }}
                      className="text-xs font-bold text-amber-600 hover:underline"
                    >
                      Activer ce mode
                    </button>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 text-base mb-1">
                  MODE 2 — Séparation entre vendeur et caissière
                </h3>
                <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                  Les vendeurs établissent les bons de commande et les transmettent à la caisse. Les caissières récupèrent ces bons et procèdent aux encaissements.
                </p>
                <ul className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-4">
                  <li className="flex items-center gap-2">✓ Le vendeur prépare et valide le bon de commande sans encaisser</li>
                  <li className="flex items-center gap-2">✓ Transmission automatique vers « Bons en attente d'encaissement » en Caisse</li>
                  <li className="flex items-center gap-2">✓ La caissière sélectionne le bon, valide le règlement et délivre le reçu</li>
                  <li className="flex items-center gap-2">✓ Traçabilité stricte : Vendeur et Caissière distincts sur chaque transaction</li>
                </ul>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-400">Circuit à deux étapes</span>
                {isCircuitSeparated ? (
                  <span className="text-xs font-bold text-amber-600">Mode actif</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setTargetCircuitMode('SEPARE_VENDEUR_CAISSIERE')
                      setSwitchingCircuitModal(true)
                    }}
                    className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition"
                  >
                    Sélectionner
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmation Changement d'Organisation des Ventes */}
      {switchingCircuitModal && targetCircuitMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-emerald-600" />
                <span>Confirmer le changement d'organisation</span>
              </h3>
              <button
                onClick={() => setSwitchingCircuitModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Vous êtes sur le point de passer le secteur <strong>{sectorMeta?.name || currentSectorSlug}</strong> en{' '}
              <strong>
                {targetCircuitMode === 'INTEGRE'
                  ? 'Mode 1 (Vente et encaissement intégrés par le même utilisateur)'
                  : 'Mode 2 (Séparation entre vendeur et caissière)'}
              </strong>.
            </p>
            <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-2.5">
              Ce réglage s'applique <strong>exclusivement au secteur {sectorMeta?.name || currentSectorSlug}</strong>. Les autres secteurs d'activité de votre entreprise ne seront pas modifiés.
            </p>

            {circuitPendingCount > 0 && targetCircuitMode === 'INTEGRE' && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Opérations en cours ({circuitPendingCount} bons en attente)</span>
                </p>
                <p className="text-[11px] text-amber-700">
                  {circuitPendingCount} bon(s) de commande sont actuellement en attente d'encaissement. Le changement de mode ne supprimera aucun bon ni aucun paiement : ils restent consultables et encaissables dans l'historique de caisse.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSwitchingCircuitModal(false)}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={switchingCircuit}
                onClick={handleConfirmSwitchCircuit}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition disabled:opacity-50"
              >
                {switchingCircuit ? 'Enregistrement...' : 'Confirmer le changement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ONGLET 5 : ATELIER IMPRIMERIE & SÉRIGRAPHIE                         */}
      {/* =================================================================== */}
      {activeTab === 'imprimerie' && (
        <form onSubmit={handleSaveImprimerie} className="space-y-6 animate-fadeIn">
          {/* Mode de gestion du centre d'impression */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                <span>Niveau de Gestion & Fonctionnement de l'Imprimerie</span>
              </h3>
              <span className="text-xs font-bold px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                Mode actuel : {imprimerieCfg.mode_gestion === 'simplifie' ? 'Mode 1 — Simplifié' : 'Mode 2 — Classique'}
              </span>
            </div>

            <p className="text-xs text-slate-500">
              Choisissez le niveau de complexité adapté à votre organisation. Ce réglage adapte les écrans de devis, les workflows d'atelier et la gestion des matières.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Carte Mode 1 */}
              <div
                onClick={() => setImprimerieCfg({ ...imprimerieCfg, mode_gestion: 'simplifie' })}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition relative ${
                  imprimerieCfg.mode_gestion === 'simplifie'
                    ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-slate-900 text-sm">Mode 1 — Centre Simplifié</h4>
                  </div>
                  <input
                    type="radio"
                    name="mode_gestion"
                    checked={imprimerieCfg.mode_gestion === 'simplifie'}
                    onChange={() => setImprimerieCfg({ ...imprimerieCfg, mode_gestion: 'simplifie' })}
                    className="text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Pour petits ateliers, graphistes indépendants et points de vente rapides. Vente rapide au comptoir, devis direct, encaissement immédiat et déduction automatique des matières premières.
                </p>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Vente rapide POS</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Devis express</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Encaissement direct</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Marge estimée</span>
                </div>
              </div>

              {/* Carte Mode 2 */}
              <div
                onClick={() => setImprimerieCfg({ ...imprimerieCfg, mode_gestion: 'classique' })}
                className={`p-5 rounded-2xl border-2 cursor-pointer transition relative ${
                  imprimerieCfg.mode_gestion === 'classique'
                    ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-slate-900 text-sm">Mode 2 — Centre Classique</h4>
                  </div>
                  <input
                    type="radio"
                    name="mode_gestion"
                    checked={imprimerieCfg.mode_gestion === 'classique'}
                    onChange={() => setImprimerieCfg({ ...imprimerieCfg, mode_gestion: 'classique' })}
                    className="text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  Pour centres d'impression structurés, imprimeries industrielles et ateliers de sérigraphie. Devis détaillés au m², file d'attente Graphiste & B.A.T., bons de production, consommations réelles vs chutes, sous-traitance et rentabilité analytique.
                </p>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Devis au m²</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">File PAO & B.A.T.</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Suivi des chutes</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Sous-traitance</span>
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-medium">Rentabilité réelle</span>
                </div>
              </div>
            </div>
          </div>

          {/* Paramètres financiers et atelier */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
              <Building2 className="w-5 h-5 text-emerald-600" />
              <span>Paramètres Financiers & Atelier</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Marge Cible Atelier (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={imprimerieCfg.marge_cible_pct}
                  onChange={(e) => setImprimerieCfg({ ...imprimerieCfg, marge_cible_pct: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400">Pourcentage d'alerte sous-rentabilité</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">TVA par Défaut (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={imprimerieCfg.taux_tva_defaut}
                  onChange={(e) => setImprimerieCfg({ ...imprimerieCfg, taux_tva_defaut: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400">Norme Bénin : 18%</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">AIB par Défaut (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={imprimerieCfg.taux_aib_defaut}
                  onChange={(e) => setImprimerieCfg({ ...imprimerieCfg, taux_aib_defaut: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold text-slate-900"
                />
                <span className="text-[10px] text-slate-400">1% (Prestataires immatriculés) ou 5%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mention Légale sur Devis</label>
                <textarea
                  rows={3}
                  value={imprimerieCfg.mention_devis}
                  onChange={(e) => setImprimerieCfg({ ...imprimerieCfg, mention_devis: e.target.value })}
                  placeholder="Ex: Validité de l'offre : 15 jours. Acompte de 50% à la commande..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Conditions de Vente & B.A.T.</label>
                <textarea
                  rows={3}
                  value={imprimerieCfg.conditions_vente}
                  onChange={(e) => setImprimerieCfg({ ...imprimerieCfg, conditions_vente: e.target.value })}
                  placeholder="Ex: B.A.T. signé obligatoire avant impression finale..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs text-slate-800"
                />
              </div>
            </div>
          </div>

          {/* Bouton de sauvegarde */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingImprimerie}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{savingImprimerie ? 'Enregistrement en cours...' : 'Enregistrer les paramètres Imprimerie'}</span>
            </button>
          </div>
        </form>
      )}

      {/* =================================================================== */}
      {/* ONGLET 6 : ATELIER, GARAGE & PARC BTP MULTISITE                    */}
      {/* =================================================================== */}
      {activeTab === 'garage' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Bannière de la version active */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 text-white p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Wrench className="w-3.5 h-3.5" />
                <span>Secteur Atelier, Garage & Mécanique</span>
              </div>
              <h2 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Version active : </span>
                <span className={isGarageBtp ? 'text-amber-400' : 'text-emerald-400'}>
                  {isGarageBtp
                    ? 'Parc Matériel BTP & Maintenance Multisite'
                    : 'Garage & Mécanique classique (Atelier Pro)'}
                </span>
              </h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                {isGarageBtp
                  ? "Votre établissement fonctionne en mode Flotte Lourde & Chantiers BTP : gestion multisite (agences, ateliers, dépôts), compteurs km et heures moteur, cuves de gasoil, chauffeurs CACES et TCO."
                  : "Votre établissement fonctionne en mode Atelier Garage Automobile : réception & diagnostic, devis et ordres de réparation (OR), affectation mécaniciens, pièces détachées et assurances/sinistres."}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setTargetGarageMode(isGarageBtp ? 'CLASSIC' : 'BTP_MULTISITE')
                setSwitchingGarageModal(true)
              }}
              className="flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-amber-500/20 transition shrink-0 cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>Changer de version</span>
            </button>
          </div>

          {/* Comparatif et options de la version */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Version 1 */}
            <div
              className={`p-6 rounded-3xl border-2 transition flex flex-col justify-between ${
                isGarageClassic
                  ? 'border-emerald-500 bg-white dark:bg-slate-900 shadow-md ring-2 ring-emerald-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 opacity-80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
                    <Wrench className="w-5 h-5" />
                  </div>
                  {isGarageClassic ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      <CheckCircle className="w-3.5 h-3.5" /> Actif
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetGarageMode('CLASSIC')
                        setSwitchingGarageModal(true)
                      }}
                      className="text-xs font-bold text-emerald-600 hover:underline"
                    >
                      Activer cette version
                    </button>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                  Version 1 — Garage & Mécanique classique
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Idéal pour garages auto, carrosseries, ateliers moto et centres de service rapide.
                </p>
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <li className="flex items-center gap-2">✓ Fiches véhicules & historique complet</li>
                  <li className="flex items-center gap-2">✓ Fiche de réception & diagnostic d'entrée</li>
                  <li className="flex items-center gap-2">✓ Devis mécanique et conversion immédiate en OR</li>
                  <li className="flex items-center gap-2">✓ Ordres de réparation (OR) & affectation mécaniciens</li>
                  <li className="flex items-center gap-2">✓ Suivi des sinistres et règlements assurances</li>
                  <li className="flex items-center gap-2">✓ Calcul automatique de marge brute par réparation</li>
                </ul>
              </div>
            </div>

            {/* Version 2 */}
            <div
              className={`p-6 rounded-3xl border-2 transition flex flex-col justify-between ${
                isGarageBtp
                  ? 'border-amber-500 bg-white dark:bg-slate-900 shadow-md ring-2 ring-amber-500/20'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 opacity-80'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                    <Truck className="w-5 h-5" />
                  </div>
                  {isGarageBtp ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      <CheckCircle className="w-3.5 h-3.5" /> Actif
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetGarageMode('BTP_MULTISITE')
                        setSwitchingGarageModal(true)
                      }}
                      className="text-xs font-bold text-amber-600 hover:underline"
                    >
                      Activer cette version
                    </button>
                  )}
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                  Version 2 — Parc Matériel BTP & Multisite
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                  Idéal pour entreprises BTP, terrassement, transport lourd et carrières.
                </p>
                <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-4">
                  <li className="flex items-center gap-2">✓ Organisation multisite (dépôts, ateliers, bases)</li>
                  <li className="flex items-center gap-2">✓ Relevés compteurs (heures moteur & kilomètres)</li>
                  <li className="flex items-center gap-2">✓ Maintenance préventive déclenchée par seuils</li>
                  <li className="flex items-center gap-2">✓ Dépannage sur chantier & arrêts de production</li>
                  <li className="flex items-center gap-2">✓ Cuves à gasoil & contrôle surconsommation L/100, L/h</li>
                  <li className="flex items-center gap-2">✓ Conducteurs d'engins, CACES R482 & visites médicales</li>
                  <li className="flex items-center gap-2">✓ Coût horaire de revient réel & TCO machine</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMATION DU CHANGEMENT DE VERSION GARAGE */}
      {switchingGarageModal && targetGarageMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-lg text-slate-900 dark:text-white">
                  Changer la version du sous-logiciel ?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Vous vous apprêtez à basculer vers :{' '}
                  <strong className="text-amber-600 font-bold">
                    {targetGarageMode === 'CLASSIC'
                      ? 'Garage & Mécanique classique'
                      : 'Parc Matériel BTP & Maintenance Multisite'}
                  </strong>
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-white">
                Protection et intégrité de vos données :
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <li>Aucune donnée historique ne sera supprimée.</li>
                <li>Les menus de navigation et tableaux de bord seront immédiatement adaptés.</li>
                <li>Vous pourrez rebasculer à tout moment entre les deux versions sans contrainte.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={switchingGarage}
                onClick={() => setSwitchingGarageModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={switchingGarage}
                onClick={handleConfirmSwitchVersion}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black shadow-lg shadow-amber-600/20 transition flex items-center gap-2"
              >
                {switchingGarage ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Mise à jour en cours...</span>
                  </>
                ) : (
                  <span>Confirmer le basculement</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ONGLET 7 : ÉCOLE & CENTRE DE FORMATION                             */}
      {/* =================================================================== */}
      {activeTab === 'ecole' && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-500/10 text-lime-700 dark:text-lime-300 text-xs font-bold uppercase tracking-wider">
                  <GraduationCap className="w-3.5 h-3.5" />
                  <span>Secteur Éducation & Centre de Formation</span>
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  Profil Actif :{' '}
                  <span className="text-lime-600 dark:text-lime-400">
                    {isEcoleScolaire && 'Établissement Scolaire (Cursus Général)'}
                    {isEcoleFormationPro && 'Centre de Formation Professionnelle & Continue'}
                    {isEcoleMixte && 'Établissement Mixte (Double Cursus)'}
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
                  {isEcoleScolaire && 'Votre établissement fonctionne en mode Enseignement Général (Maternelle, Primaire, Collège, Lycée) : bulletins scolaires officiels, emploi du temps, assiduité et devoirs.'}
                  {isEcoleFormationPro && 'Votre établissement fonctionne en mode Centre de Formation Professionnelle : modules certifiants, sessions calendaires et certificats vérifiables avec QR Code.'}
                  {isEcoleMixte && 'Votre établissement combine les classes académiques annuelles et les formations professionnelles certifiantes.'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTargetEcoleType(isEcoleScolaire ? 'FORMATION_PRO' : isEcoleFormationPro ? 'MIXTE' : 'SCOLAIRE')
                  setSwitchingEcoleModal(true)
                }}
                className="px-4 py-2.5 rounded-xl border-2 border-lime-600 text-lime-600 hover:bg-lime-50 dark:hover:bg-lime-950 font-bold text-xs shrink-0 flex items-center gap-2 transition"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Changer de profil</span>
              </button>
            </div>

            {/* Comparatif des 3 profils */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {/* Carte 1 : Scolaire */}
              <div
                className={`p-6 rounded-3xl border-2 transition flex flex-col justify-between ${
                  isEcoleScolaire
                    ? 'border-lime-500 bg-lime-50/50 dark:bg-lime-950/20 shadow-md ring-4 ring-lime-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-lime-100 dark:bg-lime-950 text-lime-600 flex items-center justify-center">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    {isEcoleScolaire ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300">
                        <CheckCircle className="w-3.5 h-3.5" /> Actif
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetEcoleType('SCOLAIRE')
                          setSwitchingEcoleModal(true)
                        }}
                        className="text-xs font-bold text-lime-600 hover:underline"
                      >
                        Activer ce profil
                      </button>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                    Profil 1 — Établissement Scolaire
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    Idéal pour Primaires, Collèges, Lycées et Groupes Scolaires.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <li className="flex items-center gap-2">✓ Années académiques & trimestres/semestres</li>
                    <li className="flex items-center gap-2">✓ Fiches élèves & matricules réglementaires</li>
                    <li className="flex items-center gap-2">✓ Emploi du temps & détection conflits de salle</li>
                    <li className="flex items-center gap-2">✓ Saisie notes, calcul moyennes & bulletins PDF</li>
                    <li className="flex items-center gap-2">✓ Échéanciers de paiement & reçus officiels</li>
                  </ul>
                </div>
              </div>

              {/* Carte 2 : Formation Pro */}
              <div
                className={`p-6 rounded-3xl border-2 transition flex flex-col justify-between ${
                  isEcoleFormationPro
                    ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20 shadow-md ring-4 ring-blue-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-950 text-blue-600 flex items-center justify-center">
                      <Award className="w-6 h-6" />
                    </div>
                    {isEcoleFormationPro ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        <CheckCircle className="w-3.5 h-3.5" /> Actif
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetEcoleType('FORMATION_PRO')
                          setSwitchingEcoleModal(true)
                        }}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Activer ce profil
                      </button>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                    Profil 2 — Formation Professionnelle
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    Idéal pour Cabinets, Instituts techniques et Académies de métiers.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <li className="flex items-center gap-2">✓ Catalogue des formations & modules certifiants</li>
                    <li className="flex items-center gap-2">✓ Sessions calendaires et cohortes d'apprenants</li>
                    <li className="flex items-center gap-2">✓ Attestations & parchemins avec numéro unique</li>
                    <li className="flex items-center gap-2">✓ QR-Code de vérification anti-fraude</li>
                    <li className="flex items-center gap-2">✓ Facturation par session ou forfait entreprise</li>
                  </ul>
                </div>
              </div>

              {/* Carte 3 : Établissement Mixte */}
              <div
                className={`p-6 rounded-3xl border-2 transition flex flex-col justify-between ${
                  isEcoleMixte
                    ? 'border-purple-500 bg-purple-50/50 dark:bg-purple-950/20 shadow-md ring-4 ring-purple-500/10'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-90'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-purple-100 dark:bg-purple-950 text-purple-600 flex items-center justify-center">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    {isEcoleMixte ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                        <CheckCircle className="w-3.5 h-3.5" /> Actif
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setTargetEcoleType('MIXTE')
                          setSwitchingEcoleModal(true)
                        }}
                        className="text-xs font-bold text-purple-600 hover:underline"
                      >
                        Activer ce profil
                      </button>
                    )}
                  </div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base mb-1">
                    Profil 3 — Établissement Mixte
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    Pour Universités, Grandes Écoles et Centres d'excellence hybrides.
                  </p>
                  <ul className="space-y-2 text-xs text-slate-600 dark:text-slate-300 border-t border-slate-100 dark:border-slate-800 pt-4">
                    <li className="flex items-center gap-2">✓ Tous les modules Scolaires et Formation réunis</li>
                    <li className="flex items-center gap-2">✓ Classes régulières + Formations continues</li>
                    <li className="flex items-center gap-2">✓ Bulletins de notes & Certificats de compétences</li>
                    <li className="flex items-center gap-2">✓ Bibliothèque, supports de cours & prêts</li>
                    <li className="flex items-center gap-2">✓ Trésorerie consolidée multi-activités</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* ONGLET MÉTIER : PARAMÈTRES DU SECTEUR STATION-SERVICE                */}
      {/* PARAMÈTRE D'EXONÉRATION DE TVA PERMANENT                           */}
      {/* =================================================================== */}
      {activeTab === 'station' && isStationService && (
        <div className="space-y-6 animate-fadeIn">
          {/* Card principale de configuration de l'exonération */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 flex items-center justify-center font-black">
                  <Fuel className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 dark:text-white text-lg">
                    PARAMÈTRE D'EXONÉRATION DE TVA
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Secteur Station-Service & Hydrocarbures — Pourcentage d'exonération permanent applicable automatiquement à chaque vente
                  </p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black ${
                stationExoCfg.is_active
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${stationExoCfg.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {stationExoCfg.is_active ? `Exonération active (${stationExoCfg.taux_exoneration_pct}%)` : 'Exonération désactivée'}
              </span>
            </div>

            <form onSubmit={handleSaveStationExoneration} className="space-y-6">
              {/* Toggle Activation / Désactivation */}
              <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Statut de l'exonération de TVA</span>
                  </label>
                  <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                    Lorsqu'elle est activée, GESTIO 229 applique automatiquement ce pourcentage sur chaque vente de carburant à la pompe sans que l'utilisateur n'ait à le renseigner à chaque fois.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStationExoCfg(prev => ({ ...prev, is_active: !prev.is_active }))}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black transition shrink-0 ${
                    stationExoCfg.is_active
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20'
                      : 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {stationExoCfg.is_active ? (
                    <>
                      <ToggleRight className="w-5 h-5" />
                      <span>Exonération ACTIVÉE</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-5 h-5 text-slate-400" />
                      <span>Exonération DÉSACTIVÉE</span>
                    </>
                  )}
                </button>
              </div>

              {/* Saisie du pourcentage d'exonération */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3">
                  <label className="block text-xs font-black text-slate-800 dark:text-slate-200 flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Percent className="w-4 h-4 text-amber-500" />
                      <span>Pourcentage d'exonération (%)</span>
                    </span>
                    <span className="text-base font-black text-amber-600">
                      {stationExoCfg.taux_exoneration_pct}%
                    </span>
                  </label>

                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    disabled={!stationExoCfg.is_active}
                    value={stationExoCfg.taux_exoneration_pct}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0))
                      setStationExoCfg(prev => ({ ...prev, taux_exoneration_pct: val }))
                    }}
                    placeholder="Ex: 50 pour 50%"
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-lg font-black text-slate-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
                  />

                  {/* Curseur de réglage rapide */}
                  <div className="pt-2">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      disabled={!stationExoCfg.is_active}
                      value={stationExoCfg.taux_exoneration_pct}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0
                        setStationExoCfg(prev => ({ ...prev, taux_exoneration_pct: val }))
                      }}
                      className="w-full accent-amber-500 cursor-pointer disabled:opacity-40"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-bold pt-1">
                      <span>0% (Taxable)</span>
                      <span>25%</span>
                      <span>50%</span>
                      <span>75%</span>
                      <span>100% (Totalement exonéré)</span>
                    </div>
                  </div>
                </div>

                {/* Simulation fiscale en temps réel */}
                <div className="p-5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 space-y-3">
                  <div className="flex items-center justify-between text-xs font-black text-amber-900 dark:text-amber-200">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                      <span>Exemple de calcul automatique (Vente 10 000 FCFA TTC)</span>
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-200/60 dark:bg-amber-900 text-amber-900 dark:text-amber-100 text-[10px]">
                      TVA standard 18%
                    </span>
                  </div>

                  {(() => {
                    const sim = calculateFuelExonerationTax(10000, stationExoCfg, 18)
                    return (
                      <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                        <div className="flex justify-between">
                          <span>Montant Total TTC :</span>
                          <span className="font-bold">10 000 FCFA</span>
                        </div>
                        <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-semibold">
                          <span>Montant exonéré :</span>
                          <span>{sim.montantExonere.toLocaleString('fr-FR')} FCFA</span>
                        </div>
                        <div className="flex justify-between text-slate-600 dark:text-slate-400">
                          <span>Montant net HT taxable :</span>
                          <span className="font-bold">{sim.montantTaxableHT.toLocaleString('fr-FR')} FCFA</span>
                        </div>
                        <div className="flex justify-between text-amber-700 dark:text-amber-400 font-semibold">
                          <span>TVA (18%) :</span>
                          <span>{sim.montantTVA.toLocaleString('fr-FR')} FCFA</span>
                        </div>
                        <div className="pt-2 border-t border-amber-200 dark:border-amber-800/40 text-[11px] text-slate-500 dark:text-slate-400 italic">
                          NB: Conformément à la réglementation fiscale, le ticket client affichera le montant net HT taxable, la TVA, le montant exonéré et le total TTC, sans mentionner le pourcentage.
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* Bouton d'enregistrement */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={savingStationExo}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {savingStationExo ? (
                    <>
                      <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Enregistrement en cours...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Enregistrer le paramètre</span>
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Historique des modifications */}
            {stationExoCfg.history && stationExoCfg.history.length > 0 && (
              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <h4 className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-500" />
                  <span>Historique des modifications du pourcentage d'exonération</span>
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-[11px] uppercase font-bold text-slate-500">
                      <tr>
                        <th className="px-3 py-2 rounded-l-lg">Date & Heure</th>
                        <th className="px-3 py-2">Ancien taux</th>
                        <th className="px-3 py-2">Nouveau taux</th>
                        <th className="px-3 py-2">Statut</th>
                        <th className="px-3 py-2 rounded-r-lg">Modifié par</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {stationExoCfg.history.map((h, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-2 font-mono text-[11px]">
                            {new Date(h.date_modification).toLocaleString('fr-FR')}
                          </td>
                          <td className="px-3 py-2 font-bold">{h.ancien_taux_pct}%</td>
                          <td className="px-3 py-2 font-bold text-amber-600">{h.nouveau_taux_pct}%</td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              h.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                            }`}>
                              {h.is_active ? 'Actif' : 'Inactif'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500">{h.user_name || 'Administrateur'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMATION DU CHANGEMENT DE PROFIL ÉCOLE */}
      {switchingEcoleModal && targetEcoleType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full shadow-2xl border border-slate-200 dark:border-slate-700 p-6 sm:p-8 space-y-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-lime-100 dark:bg-lime-950/80 text-lime-600 flex items-center justify-center shrink-0">
                <ArrowRightLeft className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-black text-lg text-slate-900 dark:text-white">
                  Changer le profil de l'établissement ?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Vous vous apprêtez à basculer vers :{' '}
                  <strong className="text-lime-600 font-bold">
                    {targetEcoleType === 'SCOLAIRE' && 'Établissement Scolaire'}
                    {targetEcoleType === 'FORMATION_PRO' && 'Centre de Formation Pro'}
                    {targetEcoleType === 'MIXTE' && 'Établissement Mixte'}
                  </strong>
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2 text-xs text-slate-600 dark:text-slate-300">
              <p className="font-semibold text-slate-900 dark:text-white">
                Intégrité et sécurité des données :
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                <li>Tous vos élèves, apprenants, notes et reçus existants sont conservés sans aucune perte.</li>
                <li>L'interface et les fonctionnalités s'adaptent instantanément au profil choisi.</li>
                <li>Vous pourrez rebasculer ou ajuster ce choix à tout moment.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={switchingEcole}
                onClick={() => setSwitchingEcoleModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={switchingEcole}
                onClick={handleConfirmSwitchEcole}
                className="px-6 py-2.5 rounded-xl bg-lime-600 hover:bg-lime-700 text-white text-xs font-black shadow-lg shadow-lime-600/20 transition flex items-center gap-2"
              >
                {switchingEcole ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Mise à jour en cours...</span>
                  </>
                ) : (
                  <span>Confirmer le basculement</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL : CRÉATION UTILISATEUR INTERNE (ADMINISTRATEUR)               */}
      {/* =================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base leading-snug">Créer un utilisateur interne</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Renseignez l'identifiant, le mot de passe, l'activité et le rôle métier spécialisé
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 overflow-y-auto space-y-4">
              {createError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              {/* Secteur d'affectation en PREMIER pour orienter les rôles */}
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl">
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-emerald-600" />
                  <span>Activité / Secteur d'affectation *</span>
                </label>
                <select
                  value={newUser.sector}
                  onChange={(e) => {
                    const newSector = normalizeSectorSlug(e.target.value)
                    const rolesForSec = getRolesForSector(newSector)
                    const firstR = rolesForSec[0]
                    const defaultPerms = firstR ? { ...firstR.defaultPermissions } : {}
                    const mappedPerms: Record<string, boolean> = {
                      ventes_pos: !!defaultPerms.ventes,
                      caisse: !!defaultPerms.caisse,
                      stocks_inventaires: !!defaultPerms.stock,
                      clients: !!defaultPerms.clients,
                      fournisseurs_achats: !!defaultPerms.fournisseurs,
                      depenses: !!defaultPerms.depenses,
                      reporting_rapports: !!defaultPerms.reporting,
                      tresorerie_banques: !!defaultPerms.finances,
                      comptabilite_syscohada: !!defaultPerms.syscohada,
                      chambres_froides: false,
                      avaries_frigorifiques: false,
                      materiaux_lourds: false,
                      consignes_retours: false,
                      cuisine_kds: false,
                      ...defaultPerms
                    }
                    setNewUser({
                      ...newUser,
                      sector: newSector,
                      role: firstR ? firstR.id : 'caissier',
                      permissions: mappedPerms,
                    })
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-emerald-300 rounded-xl text-sm font-bold text-slate-800"
                >
                  {subscribedSectors.map((sec) => (
                    <option key={sec.slug} value={sec.slug}>
                      {sec.emoji} {sec.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-emerald-800/80 mt-1">
                  Les rôles et autorisations ci-dessous s'adaptent automatiquement à ce métier.
                </p>
              </div>

              {/* Nom & Téléphone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nom complet *</label>
                  <input
                    type="text"
                    required
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    placeholder="Ex: Koffi Mensah"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Téléphone</label>
                  <input
                    type="tel"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    placeholder="Ex: 0197000000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              {/* Identifiant & Mot de passe */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Identifiant de connexion *</label>
                  <input
                    type="text"
                    required
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="Ex: agent_koffi, caissier1"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Utilisé pour se connecter (sans email).</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Mot de passe initial *</label>
                  <input
                    type="text"
                    required
                    value={newUser.initial_password}
                    onChange={(e) => setNewUser({ ...newUser, initial_password: e.target.value })}
                    placeholder="Mot de passe temporaire"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Modifiable par l'utilisateur ensuite.</p>
                </div>
              </div>

              {/* Rôle métier contextualisé pour ce secteur */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Rôle métier spécialisé pour {subscribedSectors.find(s => s.slug === newUser.sector)?.name || newUser.sector} *
                </label>
                <select
                  value={newUser.role}
                  onChange={(e) => {
                    const chosenId = e.target.value
                    const sectorRoles = getRolesForSector(newUser.sector)
                    const roleDef = sectorRoles.find((r) => r.id === chosenId)
                    if (roleDef) {
                      const defP = roleDef.defaultPermissions || {}
                      setNewUser({
                        ...newUser,
                        role: chosenId,
                        permissions: {
                          ...newUser.permissions,
                          ventes_pos: !!defP.ventes,
                          caisse: !!defP.caisse,
                          stocks_inventaires: !!defP.stock,
                          clients: !!defP.clients,
                          fournisseurs_achats: !!defP.fournisseurs,
                          depenses: !!defP.depenses,
                          reporting_rapports: !!defP.reporting,
                          tresorerie_banques: !!defP.finances,
                          comptabilite_syscohada: !!defP.syscohada,
                          ...defP
                        },
                      })
                    } else {
                      setNewUser({ ...newUser, role: chosenId })
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                >
                  {getRolesForSector(newUser.sector).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label} — {r.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* Permissions & Droits d'accès dynamiques par secteur */}
              {(() => {
                const currentSecSlug = normalizeSectorSlug(newUser.sector)
                const currentSectorMeta = subscribedSectors.find(s => s.slug === newUser.sector) || ALL_SECTORS_CATALOG.find(s => s.slug === currentSecSlug) || sectorMeta
                const secteurNom = currentSectorMeta?.name || sectorMeta?.name || newUser.sector
                const availableSectorList = SectorLoader.getAvailableModulesForSector(currentSecSlug, company)
                const modulesAAfficher = availableSectorList.length > 0
                  ? availableSectorList
                  : (MODULES_PAR_SECTEUR[newUser.sector] || MODULES_PAR_SECTEUR[currentSecSlug] || MODULES_PAR_SECTEUR['default'])

                return (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                      PERMISSIONS ET DROITS D'ACCÈS - {secteurNom}
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                      {modulesAAfficher.map((mod) => (
                        <label key={mod.id} className="flex items-center gap-2 cursor-pointer text-slate-700 select-none">
                          <input
                            type="checkbox"
                            checked={!!(newUser.permissions as any)[mod.id]}
                            onChange={(e) => setNewUser({
                              ...newUser,
                              permissions: {
                                ...newUser.permissions,
                                [mod.id]: e.target.checked
                              }
                            })}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <span>{mod.label}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-2">
                      Modules du secteur : {secteurNom} ({modulesAAfficher.length} modules)
                    </p>
                  </div>
                )
              })()}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {creatingUser ? 'Enregistrement...' : 'Enregistrer l’utilisateur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL : RÉINITIALISATION DU MOT DE PASSE                            */}
      {/* =================================================================== */}
      {resetModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                Réinitialiser le mot de passe de <span className="text-emerald-700">{resetModalUser.username}</span>
              </h3>
              <button
                onClick={() => setResetModalUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nouveau mot de passe pour cet utilisateur
                </label>
                <input
                  type="text"
                  required
                  value={resetPasswordVal}
                  onChange={(e) => setResetPasswordVal(e.target.value)}
                  placeholder="Ex: MotDePasse2026"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingReset}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition disabled:opacity-50"
                >
                  {savingReset ? 'Mise à jour...' : 'Confirmer le nouveau mot de passe'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL : MODIFIER LES ACCÈS & PERMISSIONS UTILISATEUR                */}
      {/* =================================================================== */}
      {editPermissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-3xl w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
            {/* En-tête */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-snug flex items-center gap-2">
                    <span>Modifier les accès :</span>
                    <span className="text-emerald-400">{editPermissionsUser.full_name}</span>
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                    <span>Identifiant : <strong className="text-slate-200 font-mono">{editPermissionsUser.username}</strong></span>
                    <span>•</span>
                    <span className={editPermissionsUser.is_active !== false ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                      {editPermissionsUser.is_active !== false ? 'Compte Actif' : 'Compte Désactivé'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setEditPermissionsUser(null)}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corps du formulaire */}
            <form onSubmit={handleSaveUserPermissions} className="p-6 overflow-y-auto space-y-6 flex-1">
              {editPermissionsError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editPermissionsError}</span>
                </div>
              )}

              {/* Sélection du secteur à configurer */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                  Gestion des accès par secteur d'activité ({subscribedSectors.length} secteur(s))
                </label>
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {subscribedSectors.map((sec) => {
                    const secSlug = normalizeSectorSlug(sec.slug)
                    const conf = editPermissionsSectors[secSlug]
                    const hasAccess = conf?.access ?? false
                    const isSelected = (selectedEditSector === secSlug)

                    return (
                      <button
                        key={sec.slug}
                        type="button"
                        onClick={() => setSelectedEditSector(secSlug)}
                        className={`p-3 rounded-2xl text-left border transition shrink-0 flex flex-col justify-between gap-1.5 min-w-[170px] ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50/50 shadow-sm ring-2 ring-emerald-500/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-lg">{sec.emoji}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            hasAccess
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}>
                            {hasAccess ? 'Accès Actif' : 'Aucun accès'}
                          </span>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 truncate">{sec.name}</p>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5 font-medium">
                            {hasAccess ? (conf?.role_label || conf?.role || 'Autorisé') : 'Désactivé'}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Configuration détaillée du secteur sélectionné */}
              {(() => {
                const currentSec = subscribedSectors.find(s => normalizeSectorSlug(s.slug) === selectedEditSector) || subscribedSectors[0]
                const curSlug = normalizeSectorSlug(currentSec?.slug || selectedEditSector)
                const curConf = editPermissionsSectors[curSlug] || {
                  access: false,
                  role: 'caissier',
                  role_label: 'Caissier',
                  permissions: { view: true, create: true, edit: false, delete: false, validate: false, encaissement: true },
                  modules: {}
                }
                const rolesList = getRolesForSector(curSlug)
                const availableMods = SectorLoader.getAvailableModulesForSector(curSlug, company)
                const displayedMods = availableMods.length > 0
                  ? availableMods
                  : (MODULES_PAR_SECTEUR[curSlug] || MODULES_PAR_SECTEUR['default'])

                return (
                  <div className="space-y-4">
                    {/* Carte 1 : Activation / Révocation de l'accès au secteur */}
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{currentSec?.emoji}</span>
                          <h4 className="text-sm font-black text-slate-800">
                            Autorisation pour : {currentSec?.name || curSlug}
                          </h4>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {curConf.access
                            ? `L'utilisateur a accès au secteur ${currentSec?.name}. Vous pouvez ajuster son rôle et ses droits ci-dessous.`
                            : `Aucun accès configuré. L'utilisateur ne pourra pas accéder à ${currentSec?.name}.`}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleToggleSectorAccess(curSlug)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                          curConf.access
                            ? 'bg-rose-100 hover:bg-rose-200 text-rose-700'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                        }`}
                      >
                        {curConf.access ? (
                          <>
                            <X className="w-4 h-4" />
                            <span>Révoquer l'accès</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4" />
                            <span>Autoriser l'accès à ce secteur</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Si l'accès est actif : Rôle, permissions et modules */}
                    {curConf.access ? (
                      <div className="space-y-4">
                        {/* 1. Rôle et responsabilités */}
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-2">
                          <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <Briefcase className="w-4 h-4 text-emerald-600" />
                            <span>Rôle métier & Responsabilité ({currentSec?.name})</span>
                          </label>
                          <select
                            value={curConf.role}
                            onChange={(e) => handleEditSectorRoleChange(curSlug, e.target.value)}
                            className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800"
                          >
                            {rolesList.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.label} — {r.description}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-slate-400">
                            Changer le rôle pré-configure automatiquement les permissions adaptées à ce métier.
                          </p>
                        </div>

                        {/* 2. Matrice des Permissions d'Action */}
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div>
                              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                <Shield className="w-4 h-4 text-emerald-600" />
                                <span>Permissions d'action sur le secteur</span>
                              </h5>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                Définissez les opérations permises à l'utilisateur dans ce secteur.
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { view: true, create: true, edit: true, delete: true, validate: true, encaissement: true }
                                    }
                                  }))
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                              >
                                Tout autoriser
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { view: true, create: false, edit: false, delete: false, validate: false, encaissement: false }
                                    }
                                  }))
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                              >
                                Lecture seule
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                            {/* Consultation */}
                            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white cursor-pointer transition select-none">
                              <input
                                type="checkbox"
                                checked={curConf.permissions.view}
                                onChange={(e) => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { ...prev[curSlug].permissions, view: e.target.checked }
                                    }
                                  }))
                                }}
                                className="w-4 h-4 mt-0.5 accent-emerald-600 rounded"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">👁️ Consultation</span>
                                <span className="text-[10px] text-slate-500">Consulter les données et tableaux de bord</span>
                              </div>
                            </label>

                            {/* Création */}
                            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white cursor-pointer transition select-none">
                              <input
                                type="checkbox"
                                checked={curConf.permissions.create}
                                onChange={(e) => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { ...prev[curSlug].permissions, create: e.target.checked }
                                    }
                                  }))
                                }}
                                className="w-4 h-4 mt-0.5 accent-emerald-600 rounded"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">➕ Création</span>
                                <span className="text-[10px] text-slate-500">Enregistrer des opérations et ventes</span>
                              </div>
                            </label>

                            {/* Modification */}
                            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white cursor-pointer transition select-none">
                              <input
                                type="checkbox"
                                checked={curConf.permissions.edit}
                                onChange={(e) => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { ...prev[curSlug].permissions, edit: e.target.checked }
                                    }
                                  }))
                                }}
                                className="w-4 h-4 mt-0.5 accent-emerald-600 rounded"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">✏️ Modification</span>
                                <span className="text-[10px] text-slate-500">Mettre à jour les informations existantes</span>
                              </div>
                            </label>

                            {/* Suppression */}
                            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white cursor-pointer transition select-none">
                              <input
                                type="checkbox"
                                checked={curConf.permissions.delete}
                                onChange={(e) => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { ...prev[curSlug].permissions, delete: e.target.checked }
                                    }
                                  }))
                                }}
                                className="w-4 h-4 mt-0.5 accent-emerald-600 rounded"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">🗑️ Suppression</span>
                                <span className="text-[10px] text-slate-500">Supprimer des données ou écritures</span>
                              </div>
                            </label>

                            {/* Validation */}
                            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white cursor-pointer transition select-none">
                              <input
                                type="checkbox"
                                checked={curConf.permissions.validate}
                                onChange={(e) => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { ...prev[curSlug].permissions, validate: e.target.checked }
                                    }
                                  }))
                                }}
                                className="w-4 h-4 mt-0.5 accent-emerald-600 rounded"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">✅ Validation</span>
                                <span className="text-[10px] text-slate-500">Valider les commandes, dépenses ou régularisations</span>
                              </div>
                            </label>

                            {/* Encaissement */}
                            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white cursor-pointer transition select-none">
                              <input
                                type="checkbox"
                                checked={curConf.permissions.encaissement}
                                onChange={(e) => {
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: {
                                      ...prev[curSlug],
                                      permissions: { ...prev[curSlug].permissions, encaissement: e.target.checked }
                                    }
                                  }))
                                }}
                                className="w-4 h-4 mt-0.5 accent-emerald-600 rounded"
                              />
                              <div>
                                <span className="text-xs font-bold text-slate-800 block">💵 Encaissement</span>
                                <span className="text-[10px] text-slate-500">Encaisser les règlements (espèces / MoMo)</span>
                              </div>
                            </label>
                          </div>
                        </div>

                        {/* 3. Modules Accessibles pour ce Secteur */}
                        <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <div>
                              <h5 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                <Layers className="w-4 h-4 text-emerald-600" />
                                <span>Modules accessibles ({displayedMods.length} modules)</span>
                              </h5>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {displayedMods.filter(m => Boolean(curConf.modules[m.id])).length} / {displayedMods.length} module(s) activé(s)
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const allM: Record<string, boolean> = {}
                                  displayedMods.forEach(m => { allM[m.id] = true })
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: { ...prev[curSlug], modules: allM }
                                  }))
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition"
                              >
                                Tout cocher
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const noM: Record<string, boolean> = {}
                                  displayedMods.forEach(m => { noM[m.id] = false })
                                  setEditPermissionsSectors(prev => ({
                                    ...prev,
                                    [curSlug]: { ...prev[curSlug], modules: noM }
                                  }))
                                }}
                                className="px-2 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                              >
                                Tout décocher
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto pr-1">
                            {displayedMods.map((mod) => {
                              const isChecked = Boolean(curConf.modules[mod.id])
                              return (
                                <label
                                  key={mod.id}
                                  className={`flex items-center gap-2 p-2.5 rounded-xl border transition cursor-pointer select-none ${
                                    isChecked
                                      ? 'bg-emerald-50/70 border-emerald-300 text-slate-900 font-semibold'
                                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      setEditPermissionsSectors(prev => ({
                                        ...prev,
                                        [curSlug]: {
                                          ...prev[curSlug],
                                          modules: {
                                            ...prev[curSlug].modules,
                                            [mod.id]: e.target.checked
                                          }
                                        }
                                      }))
                                    }}
                                    className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                                  />
                                  <span className="text-xs truncate" title={mod.label}>{mod.label}</span>
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Si l'accès est désactivé */
                      <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
                        <h5 className="text-sm font-bold text-slate-700">
                          Aucun accès au secteur {currentSec?.name || curSlug}
                        </h5>
                        <p className="text-xs text-slate-500 max-w-md mx-auto">
                          Cet utilisateur n'a aucun accès aux modules, données ni encaissements de ce secteur. Cliquez sur « Autoriser l'accès à ce secteur » ci-dessus si vous souhaitez lui attribuer un rôle et des droits.
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Boutons d'action : ANNULER & ENREGISTRER LES MODIFICATIONS */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setEditPermissionsUser(null)}
                  className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={savingPermissions}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-md transition disabled:opacity-50 flex items-center gap-2"
                >
                  {savingPermissions ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Enregistrer les modifications</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ConfigPage
