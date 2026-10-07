// =============================================================================
// GESTIO 229 SaaS — Module Vente Express & Centre d'Impression Moderne
// Navigation tactile par onglets : Vente Express, Commandes, Production, En Attente, Articles & Catégories, Rapports Matières
// Contrôle session de caisse, Panier multi-articles, Déduction matières BOM,
// Enregistrement des ventes & Création directe d'Articles et Matières Premières,
// Coûts matières cumulés, Coût par matière, Filtres avancés & Traçabilité complète.
// Zéro donnée fictive : Supabase est la source unique de vérité.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Printer, ShoppingCart, CheckCircle2, DollarSign, RefreshCw,
  Search, Plus, Minus, Trash2, Clock, AlertTriangle, Layers,
  Scissors, User, Phone, Check, ArrowRight, Play, Eye, FileText,
  Lock, Unlock, ChevronRight, PackageCheck, AlertOctagon, Sparkles,
  Box, Edit3, X, BarChart3, Filter, Calendar, TrendingUp
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  imprimerieService,
  PrestationImprimerie,
  CommandeImprimerie,
  MatierePremiere,
  PrestationMatiereBOM,
  StatutCommande
} from '../../../services/imprimerieService'
import {
  checkSectorCaisseStatus,
  CaisseStatusResult
} from '../../../services/caisseSectorService'
import { supabase } from '../../../lib/supabase'

interface CartItem {
  prestation: PrestationImprimerie
  quantite: number
  largeur: number
  hauteur: number
  prixUnitaire: number
  totalLigne: number
}

export const ImprimerieVenteRapidePage: React.FC = () => {
  const navigate = useNavigate()
  const { companyId, sectorSlug } = useTenant()
  const { user } = useAuthStore()
  const { toast } = useUIStore() as any

  const activeSector = sectorSlug || 'imprimerie'
  const prefix = `/app/${activeSector}`

  // ── Navigation par Onglets (Vente Express, Commandes, Production, En attente, Articles, Rapports Matières) ──
  const [activeTab, setActiveTab] = useState<'express' | 'commandes' | 'production' | 'attente' | 'articles' | 'rapports'>('express')

  // ── Données Métier ──
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [prestations, setPrestations] = useState<PrestationImprimerie[]>([])
  const [commandes, setCommandes] = useState<CommandeImprimerie[]>([])
  const [matieres, setMatieres] = useState<MatierePremiere[]>([])
  const [consommations, setConsommations] = useState<any[]>([])
  const [caisseStatus, setCaisseStatus] = useState<CaisseStatusResult | null>(null)

  // ── Filtres & Recherche Articles ──
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Tous')

  // ── Panier Vente Express ──
  const [panier, setPanier] = useState<CartItem[]>([])
  const [clientNom, setClientNom] = useState<string>('Client Comptoir')
  const [clientTel, setClientTel] = useState<string>('')
  const [modePaiement, setModePaiement] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('especes')
  const [montantPaye, setMontantPaye] = useState<number>(0)

  // ── Modal / Sélection Dimensions au m² ──
  const [dimModalItem, setDimModalItem] = useState<PrestationImprimerie | null>(null)
  const [dimLargeur, setDimLargeur] = useState<number>(1)
  const [dimHauteur, setDimHauteur] = useState<number>(1)
  const [dimQuantite, setDimQuantite] = useState<number>(1)

  // ── Modal Détail Commande ──
  const [selectedCommandeDetail, setSelectedCommandeDetail] = useState<CommandeImprimerie | null>(null)

  // ── Modal Création / Modification Article & Prestation ──
  const [showArticleModal, setShowArticleModal] = useState(false)
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null)
  const [articleForm, setArticleForm] = useState({
    code: '',
    nom: '',
    categorie: 'Impression',
    mode_calcul: 'unite' as 'unite' | 'page' | 'm2',
    prix_vente: 100,
    unite_facturation: 'u',
  })
  const [articleBOM, setArticleBOM] = useState<Array<{
    matiere_id: string
    quantite_prevue: number
    unite: string
    cout_unitaire_prevu: number
  }>>([])

  // ── Modal Création Matière Première ──
  const [showMatiereModal, setShowMatiereModal] = useState(false)
  const [matiereForm, setMatiereForm] = useState({
    code: '',
    nom: '',
    categorie: 'Supports',
    unite: 'm2',
    stock_actuel: 100,
    stock_minimum: 10,
    cout_moyen: 500,
  })

  // ── Filtres pour l'onglet Rapports Matières ──
  const [rapportPeriode, setRapportPeriode] = useState<'jour' | 'semaine' | 'mois' | 'annee' | 'personnalise' | 'tout'>('mois')
  const [rapportDateDebut, setRapportDateDebut] = useState('')
  const [rapportDateFin, setRapportDateFin] = useState('')
  const [rapportMatiereFilter, setRapportMatiereFilter] = useState('TOUTES')
  const [rapportSearch, setRapportSearch] = useState('')

  // ── Filtre Historique Commandes ──
  const [commandeFilter, setCommandeFilter] = useState<'toutes' | 'jour' | 'soldes' | 'attente'>('toutes')
  const [commandeSearch, setCommandeSearch] = useState('')

  // ── Reçu de succès après encaissement ──
  const [recuSuccess, setRecuSuccess] = useState<{
    cmdNumero: string
    recuRef: string
    total: number
    paye: number
    reste: number
    date: string
    items: Array<{ nom: string; qte: number; total: number }>
  } | null>(null)

  const isCaissiere = user?.role === 'caissiere' || user?.role === 'caissier' || user?.role === 'administrateur' || user?.role === 'gerant'
  const isGraphiste = user?.role === 'graphiste' || user?.role === 'graphiste_pao' || user?.role === 'operateur_presse'

  const notify = (type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (typeof toast === 'function') toast(msg, type)
      else window.alert(msg)
    } catch {
      window.alert(msg)
    }
  }

  // ── Chargement des données réelles ──
  const loadAllData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [presList, cmdsList, matsList, consList, cStatus] = await Promise.all([
        imprimerieService.getPrestations(companyId, activeSector),
        imprimerieService.getCommandes(companyId, activeSector),
        imprimerieService.getMatieres(companyId, activeSector),
        supabase
          .from('imprimerie_consommations')
          .select('*, matiere:imprimerie_matieres(nom, code, unite, categorie, stock_actuel, stock_minimum, cout_moyen), commande:imprimerie_commandes(numero_commande, client_nom)')
          .eq('company_id', companyId)
          .order('created_at', { ascending: false }),
        checkSectorCaisseStatus(companyId, activeSector),
      ])
      setPrestations(presList)
      setCommandes(cmdsList)
      setMatieres(matsList)
      setConsommations(consList.data || [])
      setCaisseStatus(cStatus)
    } catch (e) {
      console.error('[Imprimerie] Erreur chargement données:', e)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadAllData()
  }, [loadAllData])

  // ── Catégories uniques extraites des prestations ──
  const categoriesList = useMemo(() => {
    const cats = Array.from(new Set(prestations.map((p) => p.categorie || 'Impression'))).filter(Boolean)
    return ['Tous', ...cats]
  }, [prestations])

  // ── Prestations filtrées pour la vente express ──
  const filteredPrestations = useMemo(() => {
    return prestations.filter((p) => {
      const matchSearch =
        p.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCat = selectedCategory === 'Tous' || p.categorie === selectedCategory
      return matchSearch && matchCat
    })
  }, [prestations, searchTerm, selectedCategory])

  // ── Total panier ──
  const totalPanier = useMemo(() => {
    return panier.reduce((acc, it) => acc + it.totalLigne, 0)
  }, [panier])

  useEffect(() => {
    setMontantPaye(totalPanier)
  }, [totalPanier])

  const resteAPayer = Math.max(0, totalPanier - montantPaye)

  // ── Ajout d'une prestation au panier ──
  const handleSelectPrestation = (pres: PrestationImprimerie) => {
    if (pres.mode_calcul === 'm2') {
      setDimModalItem(pres)
      setDimLargeur(1)
      setDimHauteur(1)
      setDimQuantite(1)
      return
    }

    setPanier((prev) => {
      const existing = prev.find((item) => item.prestation.id === pres.id)
      if (existing) {
        return prev.map((item) =>
          item.prestation.id === pres.id
            ? {
                ...item,
                quantite: item.quantite + 1,
                totalLigne: (item.quantite + 1) * item.prixUnitaire,
              }
            : item
        )
      }
      const pu = Number(pres.prix_vente || 0)
      return [
        ...prev,
        {
          prestation: pres,
          quantite: 1,
          largeur: 0,
          hauteur: 0,
          prixUnitaire: pu,
          totalLigne: pu,
        },
      ]
    })
  }

  // ── Validation dimensions au m² ──
  const handleValiderDimensionsM2 = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dimModalItem) return

    const l = Math.max(0.1, dimLargeur)
    const h = Math.max(0.1, dimHauteur)
    const q = Math.max(1, dimQuantite)
    const surfaceTotale = Number((l * h).toFixed(3))
    const pu = Number(dimModalItem.prix_vente || 0)
    const total = Math.round(surfaceTotale * q * pu)

    setPanier((prev) => [
      ...prev,
      {
        prestation: dimModalItem,
        quantite: q,
        largeur: l,
        hauteur: h,
        prixUnitaire: pu,
        totalLigne: total,
      },
    ])
    setDimModalItem(null)
  }

  // ── Modification quantité panier ──
  const handleUpdateQuantite = (index: number, delta: number) => {
    setPanier((prev) =>
      prev
        .map((it, idx) => {
          if (idx !== index) return it
          const newQ = it.quantite + delta
          if (newQ <= 0) return null
          const surfaceFactor = it.prestation.mode_calcul === 'm2' && it.largeur && it.hauteur ? it.largeur * it.hauteur : 1
          return {
            ...it,
            quantite: newQ,
            totalLigne: Math.round(newQ * surfaceFactor * it.prixUnitaire),
          }
        })
        .filter(Boolean) as CartItem[]
    )
  }

  // ── Suppression ligne panier ──
  const handleRemoveItem = (index: number) => {
    setPanier((prev) => prev.filter((_, idx) => idx !== index))
  }

  // ── Vider le panier ──
  const handleViderPanier = () => {
    setPanier([])
    setClientNom('Client Comptoir')
    setClientTel('')
    setMontantPaye(0)
  }

  // ── Validation de la vente express ──
  const handleValiderVente = async (isAttente: boolean = false) => {
    if (panier.length === 0) {
      notify('error', 'Le panier est vide !')
      return
    }

    if (!isAttente && !caisseStatus?.isTodayOpen) {
      notify('error', "La session de caisse n'est pas ouverte. Veuillez d'abord ouvrir la caisse ou mettre la vente en attente.")
      return
    }

    setSubmitting(true)
    try {
      const res = await imprimerieService.creerVentePanier(
        companyId!,
        activeSector,
        {
          items: panier,
          clientNom: clientNom.trim() || 'Client Comptoir',
          clientTel: clientTel.trim() || undefined,
          modePaiement,
          montantPaye: isAttente ? 0 : montantPaye,
          isEnAttente: isAttente,
        },
        user
      )

      if (isAttente) {
        notify('success', `Commande ${res.commande.numero_commande} mise en attente pour validation par la caissière !`)
        handleViderPanier()
        loadAllData()
        setActiveTab('attente')
      } else {
        notify('success', `Vente ${res.commande.numero_commande} enregistrée et encaissée avec succès !`)
        setRecuSuccess({
          cmdNumero: res.commande.numero_commande,
          recuRef: res.recuRef,
          total: totalPanier,
          paye: montantPaye,
          reste: resteAPayer,
          date: new Date().toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          items: panier.map((p) => ({
            nom: p.prestation.nom,
            qte: p.quantite,
            total: p.totalLigne,
          })),
        })
        handleViderPanier()
        loadAllData()
      }
    } catch (err: any) {
      console.error('Erreur vente express:', err)
      notify('error', err.message || 'Erreur lors de la validation de la vente.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Encaissement d'une vente en attente par la caissière avec déduction matières ──
  const handleEncaisserAttente = async (cmd: CommandeImprimerie) => {
    if (!caisseStatus?.isTodayOpen) {
      notify('error', "Veuillez d'abord ouvrir la session de caisse du jour pour encaisser.")
      return
    }

    try {
      await imprimerieService.validerEtEncaisserVenteAttente(
        cmd.id,
        cmd.company_id,
        activeSector,
        'especes',
        user
      )
      notify('success', `Commande ${cmd.numero_commande} validée, matières déstockées et montant encaissé en caisse !`)
      loadAllData()
    } catch (e: any) {
      notify('error', e.message || 'Erreur encaissement.')
    }
  }

  // ── Création / Modification d'un Article & Prestation ──
  const handleOpenArticleModal = (pres?: PrestationImprimerie) => {
    if (pres) {
      setEditingArticleId(pres.id)
      setArticleForm({
        code: pres.code,
        nom: pres.nom,
        categorie: pres.categorie || 'Impression',
        mode_calcul: pres.mode_calcul as any,
        prix_vente: Number(pres.prix_vente || 0),
        unite_facturation: pres.unite_facturation || 'u',
      })
      setArticleBOM(
        (pres.matieres_bom || []).map((b) => ({
          matiere_id: b.matiere_id,
          quantite_prevue: Number(b.quantite_prevue || 1),
          unite: b.unite || 'u',
          cout_unitaire_prevu: Number(b.cout_unitaire_prevu || 0),
        }))
      )
    } else {
      setEditingArticleId(null)
      setArticleForm({
        code: `ART${String(prestations.length + 1).padStart(3, '0')}`,
        nom: '',
        categorie: 'Impression',
        mode_calcul: 'unite',
        prix_vente: 100,
        unite_facturation: 'u',
      })
      setArticleBOM([])
    }
    setShowArticleModal(true)
  }

  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!articleForm.nom.trim()) {
      notify('error', "Le nom de l'article est obligatoire.")
      return
    }

    try {
      await imprimerieService.savePrestation(
        {
          id: editingArticleId || undefined,
          company_id: companyId!,
          sector_slug: activeSector,
          code: articleForm.code || `ART${Date.now().toString().slice(-4)}`,
          nom: articleForm.nom.trim(),
          categorie: articleForm.categorie,
          mode_calcul: articleForm.mode_calcul,
          prix_vente: Number(articleForm.prix_vente || 0),
          unite_facturation: articleForm.mode_calcul === 'm2' ? 'm2' : articleForm.unite_facturation,
          prix_minimum: Number(articleForm.prix_vente || 0),
          prix_gros: Number(articleForm.prix_vente || 0),
          tva_applicable: false,
          aib_applicable: false,
          cout_mo_defaut: 0,
          cout_finition_defaut: 0,
          cout_autres_defaut: 0,
          est_actif: true,
        },
        articleBOM.map((b) => ({
          matiere_id: b.matiere_id,
          quantite_prevue: Number(b.quantite_prevue || 1),
          unite: b.unite,
          cout_unitaire_prevu: Number(b.cout_unitaire_prevu || 0),
          cout_total_prevu: Number(b.quantite_prevue || 1) * Number(b.cout_unitaire_prevu || 0),
        }))
      )

      notify('success', editingArticleId ? 'Article mis à jour avec succès !' : 'Nouvel article créé avec succès !')
      setShowArticleModal(false)
      loadAllData()
    } catch (err: any) {
      notify('error', err.message || "Erreur enregistrement de l'article.")
    }
  }

  // ── Création d'une Matière Première ──
  const handleSaveMatiere = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!matiereForm.nom.trim()) {
      notify('error', 'Le nom de la matière première est obligatoire.')
      return
    }

    try {
      await imprimerieService.saveMatiere({
        company_id: companyId!,
        sector_slug: activeSector,
        code: matiereForm.code || `MAT${Date.now().toString().slice(-4)}`,
        nom: matiereForm.nom.trim(),
        categorie: matiereForm.categorie,
        unite: matiereForm.unite,
        stock_actuel: Number(matiereForm.stock_actuel || 0),
        stock_minimum: Number(matiereForm.stock_minimum || 5),
        cout_moyen: Number(matiereForm.cout_moyen || 0),
        dernier_cout_achat: Number(matiereForm.cout_moyen || 0),
        valeur_stock: Number(matiereForm.stock_actuel || 0) * Number(matiereForm.cout_moyen || 0),
        est_actif: true,
      })

      notify('success', 'Matière première enregistrée dans le stock avec succès !')
      setShowMatiereModal(false)
      setMatiereForm({
        code: '',
        nom: '',
        categorie: 'Supports',
        unite: 'm2',
        stock_actuel: 100,
        stock_minimum: 10,
        cout_moyen: 500,
      })
      loadAllData()
    } catch (err: any) {
      notify('error', err.message || 'Erreur création matière.')
    }
  }

  // ── Commandes en attente ──
  const commandesEnAttente = useMemo(() => {
    return commandes.filter(
      (c) => c.statut_paiement === 'non_paye' || c.statut === 'nouveau' || c.solde_restant > 0
    )
  }, [commandes])

  // ── Commandes en production ──
  const commandesProduction = useMemo(() => {
    return commandes.filter((c) =>
      ['a_concevoir', 'maquette_attente', 'maquette_validee', 'en_production', 'en_impression', 'en_finition'].includes(
        c.statut
      )
    )
  }, [commandes])

  // ── Commandes filtrées pour l'historique ──
  const filteredCommandesHistorique = useMemo(() => {
    const now = new Date()
    return commandes.filter((c) => {
      const matchSearch =
        c.numero_commande.toLowerCase().includes(commandeSearch.toLowerCase()) ||
        c.client_nom.toLowerCase().includes(commandeSearch.toLowerCase()) ||
        c.titre_travail.toLowerCase().includes(commandeSearch.toLowerCase())

      if (!matchSearch) return false

      if (commandeFilter === 'jour') {
        const d = new Date(c.date_commande)
        return d.toDateString() === now.toDateString()
      }
      if (commandeFilter === 'soldes') {
        return c.statut_paiement === 'solde'
      }
      if (commandeFilter === 'attente') {
        return c.statut_paiement !== 'solde' || c.solde_restant > 0
      }
      return true
    })
  }, [commandes, commandeFilter, commandeSearch])

  // ── ANALYSE RAPPORTS MATIÈRES PREMIÈRES ──
  const isDateInRapportPeriode = useCallback((dateStr?: string) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    const now = new Date()

    if (rapportPeriode === 'tout') return true
    if (rapportPeriode === 'jour') return d.toDateString() === now.toDateString()
    if (rapportPeriode === 'semaine') {
      const diff = (now.getTime() - d.getTime()) / (1000 * 3600 * 24)
      return diff >= 0 && diff <= 7
    }
    if (rapportPeriode === 'mois') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    if (rapportPeriode === 'annee') return d.getFullYear() === now.getFullYear()
    if (rapportPeriode === 'personnalise') {
      if (rapportDateDebut && d < new Date(rapportDateDebut)) return false
      if (rapportDateFin) {
        const end = new Date(rapportDateFin)
        end.setHours(23, 59, 59, 999)
        if (d > end) return false
      }
      return true
    }
    return true
  }, [rapportPeriode, rapportDateDebut, rapportDateFin])

  const filteredConsommationsRapport = useMemo(() => {
    return consommations.filter((c) => {
      if (!isDateInRapportPeriode(c.created_at)) return false
      if (rapportMatiereFilter !== 'TOUTES' && c.matiere_id !== rapportMatiereFilter) return false
      if (rapportSearch.trim()) {
        const q = rapportSearch.toLowerCase()
        const matchText =
          (c.matiere?.nom || '').toLowerCase().includes(q) ||
          (c.matiere?.code || '').toLowerCase().includes(q)
        if (!matchText) return false
      }
      return true
    })
  }, [consommations, isDateInRapportPeriode, rapportMatiereFilter, rapportSearch])

  const statsRapportMatieres = useMemo(() => {
    const cumulCout = filteredConsommationsRapport.reduce((acc, c) => acc + Number(c.cout_total || 0), 0)
    const cumulQte = filteredConsommationsRapport.reduce((acc, c) => acc + Number(c.quantite_reelle || 0), 0)

    const map: Record<string, {
      id: string
      nom: string
      code: string
      categorie: string
      unite: string
      stockActuel: number
      stockMinimum: number
      qteTotale: number
      coutTotal: number
      nbVentes: number
      coutUnitaireMoyen: number
      partPct: number
    }> = {}

    filteredConsommationsRapport.forEach((c) => {
      const id = c.matiere_id || 'autre'
      const nom = c.matiere?.nom || 'Matière Inconnue'
      const code = c.matiere?.code || '-'
      const categorie = c.matiere?.categorie || 'Général'
      const unite = c.matiere?.unite || 'u'
      const stockActuel = Number(c.matiere?.stock_actuel || 0)
      const stockMinimum = Number(c.matiere?.stock_minimum || 0)

      if (!map[id]) {
        map[id] = {
          id,
          nom,
          code,
          categorie,
          unite,
          stockActuel,
          stockMinimum,
          qteTotale: 0,
          coutTotal: 0,
          nbVentes: 0,
          coutUnitaireMoyen: 0,
          partPct: 0,
        }
      }

      map[id].qteTotale += Number(c.quantite_reelle || 0)
      map[id].coutTotal += Number(c.cout_total || 0)
      map[id].nbVentes += 1
    })

    const parMatiere = Object.values(map).map((item) => ({
      ...item,
      coutUnitaireMoyen: item.qteTotale > 0 ? item.coutTotal / item.qteTotale : 0,
      partPct: cumulCout > 0 ? (item.coutTotal / cumulCout) * 100 : 0,
    })).sort((a, b) => b.coutTotal - a.coutTotal)

    return {
      cumulCout,
      cumulQte,
      parMatiere,
      nbSorties: filteredConsommationsRapport.length,
    }
  }, [filteredConsommationsRapport])

  return (
    <div className="space-y-5 pb-16 animate-fadeIn">
      {/* ── BARRE DE NAVIGATION SUPÉRIEURE PAR ONGLETS (STYLE CAPTURE D'ÉCRAN) ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 -mx-4 sm:-mx-6 -mt-6 px-4 sm:px-6 pt-3 flex items-center justify-between overflow-x-auto gap-2">
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Onglet 1 : Vente Express */}
          <button
            onClick={() => setActiveTab('express')}
            className={`px-3.5 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'express'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <ShoppingCart className="w-4 h-4 text-purple-600" /> Vente Express
          </button>

          {/* Onglet 2 : Commandes & Historique */}
          <button
            onClick={() => setActiveTab('commandes')}
            className={`px-3.5 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'commandes'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-blue-600" /> Commandes
            <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded-full text-[10px] font-black">
              {commandes.length}
            </span>
          </button>

          {/* Onglet 3 : Production */}
          <button
            onClick={() => setActiveTab('production')}
            className={`px-3.5 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'production'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <RefreshCw className="w-4 h-4 text-emerald-600" /> Production
            {commandesProduction.length > 0 && (
              <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded-full text-[10px] font-black">
                {commandesProduction.length}
              </span>
            )}
          </button>

          {/* Onglet 4 : En attente (Caissière) */}
          <button
            onClick={() => setActiveTab('attente')}
            className={`px-3.5 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'attente'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Clock className="w-4 h-4 text-amber-500" /> En attente
            {commandesEnAttente.length > 0 && (
              <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 rounded-full text-[10px] font-black">
                {commandesEnAttente.length}
              </span>
            )}
          </button>

          {/* Onglet 5 : Articles & Catégories */}
          <button
            onClick={() => setActiveTab('articles')}
            className={`px-3.5 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'articles'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-slate-600" /> Articles & Catégories
            <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 rounded-full text-[10px] font-black">
              {prestations.length}
            </span>
          </button>

          {/* Onglet 6 : Rapports Matières & Coûts */}
          <button
            onClick={() => setActiveTab('rapports')}
            className={`px-3.5 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'rapports'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Box className="w-4 h-4 text-purple-600" /> Coûts Matières
            <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded-full text-[10px] font-black">
              {Math.round(statsRapportMatieres.cumulCout).toLocaleString('fr-FR')} F
            </span>
          </button>
        </div>

        <button
          onClick={loadAllData}
          className="p-2 text-slate-400 hover:text-slate-700 rounded-xl transition"
          title="Actualiser"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── BANNIÈRE STATUT DE CAISSE (STYLE CAPTURE D'ÉCRAN) ── */}
      {caisseStatus && !caisseStatus.isTodayOpen && (
        <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3.5 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5 text-xs text-amber-900 dark:text-amber-200 font-medium">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>La caisse n'est pas ouverte aujourd'hui</strong> — vos ventes seront préparées et mises en attente, mais ne pourront pas être encaissées directement.
            </span>
          </div>

          <button
            onClick={() => navigate(`${prefix}/caisse`)}
            className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition shadow-xs whitespace-nowrap shrink-0"
          >
            Ouvrir la caisse
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VUE 1 : VENTE EXPRESS (GRILLE ARTICLES TACTILE + PANIER)              */}
      {/* ===================================================================== */}
      {activeTab === 'express' && (
        <>
          {recuSuccess ? (
            <div className="max-w-md mx-auto bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 shadow-md text-center space-y-4 animate-scaleUp">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  Vente Encaissée avec Succès !
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  Réf : {recuSuccess.recuRef} • {recuSuccess.cmdNumero}
                </p>
              </div>

              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl text-left text-xs space-y-2">
                <div className="divide-y divide-slate-100">
                  {recuSuccess.items.map((it, idx) => (
                    <div key={idx} className="py-1.5 flex justify-between">
                      <span className="font-semibold text-slate-800">{it.nom} x {it.qte}</span>
                      <span className="font-mono text-slate-600">{it.total.toLocaleString('fr-FR')} F</span>
                    </div>
                  ))}
                </div>

                <div className="border-t border-slate-200 pt-2 flex justify-between font-black text-sm">
                  <span>Total Payé</span>
                  <span className="text-emerald-700">{recuSuccess.paye.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-4 h-4" /> Imprimer le reçu
                </button>
                <button
                  onClick={() => setRecuSuccess(null)}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition"
                >
                  Nouvelle Vente
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* ── COLONNE GAUCHE (8/12) : ARTICLES, RECHERCHE & CATÉGORIES ── */}
              <div className="lg:col-span-8 space-y-4">
                {/* 1. Barre de Recherche */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Rechercher par code, nom..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm font-medium focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition"
                  />
                </div>

                {/* 2. Pilules de Catégories */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {categoriesList.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap ${
                        selectedCategory === cat
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* 3. Titre Section Articles */}
                <div className="flex items-center justify-between pt-1">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Articles ({filteredPrestations.length})
                  </h2>

                  <button
                    onClick={() => handleOpenArticleModal()}
                    className="text-xs font-bold text-purple-700 hover:text-purple-800 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ajouter un article
                  </button>
                </div>

                {/* 4. Grille des Articles */}
                {filteredPrestations.length === 0 ? (
                  <div className="bg-white dark:bg-slate-800 border border-slate-200 rounded-3xl p-12 text-center text-slate-400 space-y-3">
                    <p className="text-xs">Aucun article ne correspond à votre recherche.</p>
                    <button
                      onClick={() => handleOpenArticleModal()}
                      className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold"
                    >
                      + Créer un article de vente rapide
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {filteredPrestations.map((pres) => {
                      const nbBOM = pres.matieres_bom?.length || 0
                      return (
                        <div
                          key={pres.id}
                          onClick={() => handleSelectPrestation(pres)}
                          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-3.5 text-center flex flex-col justify-between hover:border-purple-400 hover:shadow-md transition cursor-pointer select-none group min-h-[120px]"
                        >
                          <div>
                            <h3 className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-purple-700 transition line-clamp-2 leading-tight">
                              {pres.nom}
                            </h3>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              {pres.code}
                            </span>
                          </div>

                          <div className="pt-2">
                            <span className="text-sm font-black text-purple-700 dark:text-purple-400 block">
                              {Number(pres.prix_vente).toLocaleString('fr-FR')} FCFA
                            </span>

                            {/* Badge BOM */}
                            {nbBOM > 0 ? (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded-md mt-1">
                                <Box className="w-2.5 h-2.5" /> {nbBOM} matière(s) liée(s)
                              </span>
                            ) : (
                              <span className="text-[9px] text-slate-400 block mt-1">
                                Prestation directe
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── COLONNE DROITE (4/12) : PANIER DE VENTE TACTILE ── */}
              <div className="lg:col-span-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-4 sm:p-5 shadow-xs space-y-4 sticky top-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-purple-600" /> Panier ({panier.length})
                  </h3>

                  {panier.length > 0 && (
                    <button
                      onClick={handleViderPanier}
                      className="text-[11px] text-rose-600 font-bold hover:underline"
                    >
                      Vider
                    </button>
                  )}
                </div>

                {/* Liste des articles du panier */}
                {panier.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Panier vide. Cliquez sur un article à gauche pour l'ajouter.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto pr-1">
                    {panier.map((item, index) => (
                      <div key={index} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 truncate">{item.prestation.nom}</p>
                          <p className="text-[10px] text-slate-400">
                            {item.prestation.mode_calcul === 'm2'
                              ? `${item.largeur}m x ${item.hauteur}m (${Number(item.largeur * item.hauteur).toFixed(2)}m²)`
                              : `${item.prixUnitaire.toLocaleString('fr-FR')} F/u`}
                          </p>
                        </div>

                        {/* Sélecteur quantité */}
                        <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1">
                          <button
                            onClick={() => handleUpdateQuantite(index, -1)}
                            className="p-1 hover:bg-white rounded-lg text-slate-700 transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-xs px-1 min-w-[16px] text-center">
                            {item.quantite}
                          </span>
                          <button
                            onClick={() => handleUpdateQuantite(index, 1)}
                            className="p-1 hover:bg-white rounded-lg text-slate-700 transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-right font-black text-slate-900 min-w-[65px]">
                          {item.totalLigne.toLocaleString('fr-FR')} F
                        </div>

                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="p-1 text-slate-300 hover:text-rose-600 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Saisie Client */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Nom du client (Client Comptoir)"
                      value={clientNom}
                      onChange={(e) => setClientNom(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
                    />
                  </div>
                </div>

                {/* Choix Mode Paiement */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                    Mode de Règlement
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setModePaiement('especes')}
                      className={`py-1.5 rounded-xl border transition ${
                        modePaiement === 'especes'
                          ? 'bg-purple-50 border-purple-500 text-purple-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Espèces
                    </button>
                    <button
                      type="button"
                      onClick={() => setModePaiement('momo_mtn')}
                      className={`py-1.5 rounded-xl border transition ${
                        modePaiement === 'momo_mtn'
                          ? 'bg-purple-50 border-purple-500 text-purple-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      MTN MoMo
                    </button>
                    <button
                      type="button"
                      onClick={() => setModePaiement('momo_moov')}
                      className={`py-1.5 rounded-xl border transition ${
                        modePaiement === 'momo_moov'
                          ? 'bg-purple-50 border-purple-500 text-purple-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Moov Flooz
                    </button>
                  </div>
                </div>

                {/* Grand Total */}
                <div className="pt-2 border-t border-slate-200 flex justify-between items-baseline">
                  <span className="text-sm font-bold text-slate-700">Total</span>
                  <span className="text-2xl font-black text-slate-900">
                    {totalPanier.toLocaleString('fr-FR')} <span className="text-xs font-bold">FCFA</span>
                  </span>
                </div>

                {/* Actions Panier */}
                <div className="space-y-2 pt-2">
                  <button
                    disabled={panier.length === 0 || submitting}
                    onClick={() => handleValiderVente(false)}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-2xl text-xs sm:text-sm transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-purple-600/20"
                  >
                    <Check className="w-4 h-4" />
                    {submitting ? 'Validation...' : 'Valider ma vente'}
                  </button>

                  <button
                    disabled={panier.length === 0 || submitting}
                    onClick={() => handleValiderVente(true)}
                    className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-2xl text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Mettre en attente (Validation Caissière)
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* VUE 2 : HISTORIQUE DES COMMANDES & VENTES ENREGISTRÉES                */}
      {/* ===================================================================== */}
      {activeTab === 'commandes' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-600" /> Historique de Toutes les Ventes & Commandes
              </h3>
              <p className="text-xs text-slate-400">
                Toutes les ventes rapides et commandes enregistrées avec traçabilité complète
              </p>
            </div>

            {/* Filtres Rapides */}
            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
                <button
                  onClick={() => setCommandeFilter('toutes')}
                  className={`px-2.5 py-1 rounded-lg ${commandeFilter === 'toutes' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  Toutes
                </button>
                <button
                  onClick={() => setCommandeFilter('jour')}
                  className={`px-2.5 py-1 rounded-lg ${commandeFilter === 'jour' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  Aujourd'hui
                </button>
                <button
                  onClick={() => setCommandeFilter('soldes')}
                  className={`px-2.5 py-1 rounded-lg ${commandeFilter === 'soldes' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  Soldées
                </button>
                <button
                  onClick={() => setCommandeFilter('attente')}
                  className={`px-2.5 py-1 rounded-lg ${commandeFilter === 'attente' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  En attente
                </button>
              </div>
            </div>
          </div>

          {/* Recherche */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par N° commande, client..."
              value={commandeSearch}
              onChange={(e) => setCommandeSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium"
            />
          </div>

          {filteredCommandesHistorique.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Aucune vente trouvée avec ces critères.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5">N° Vente</th>
                    <th className="text-left px-3 py-2.5">Date</th>
                    <th className="text-left px-3 py-2.5">Client</th>
                    <th className="text-left px-3 py-2.5">Travail</th>
                    <th className="text-right px-3 py-2.5">Total TTC</th>
                    <th className="text-right px-3 py-2.5">Payé</th>
                    <th className="text-center px-3 py-2.5">Statut</th>
                    <th className="text-center px-3 py-2.5">Paiement</th>
                    <th className="text-center px-3 py-2.5">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCommandesHistorique.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{c.numero_commande}</td>
                      <td className="px-3 py-2.5 text-slate-500">{c.date_commande}</td>
                      <td className="px-3 py-2.5 font-semibold text-slate-800">{c.client_nom}</td>
                      <td className="px-3 py-2.5 text-slate-600 truncate max-w-xs">{c.titre_travail}</td>
                      <td className="px-3 py-2.5 text-right font-black text-slate-900">
                        {Number(c.total_ttc).toLocaleString('fr-FR')} F
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-600">
                        {Number(c.montant_paye).toLocaleString('fr-FR')} F
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          {c.statut}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            c.statut_paiement === 'solde'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {c.statut_paiement === 'solde' ? 'Payé ✓' : 'En attente'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => setSelectedCommandeDetail(c)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition flex items-center gap-1 mx-auto"
                        >
                          <Eye className="w-3 h-3" /> Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VUE 3 : FILE DE PRODUCTION                                            */}
      {/* ===================================================================== */}
      {activeTab === 'production' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600" /> File d'Attente Machine & Graphisme
            </h3>
            <span className="text-xs text-slate-500">{commandesProduction.length} travail(aux)</span>
          </div>

          {commandesProduction.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Aucune commande en production actuellement.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {commandesProduction.map((cmd) => (
                <div key={cmd.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-900 block">{cmd.numero_commande}</span>
                      <span className="text-xs font-semibold text-slate-700">{cmd.client_nom}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                      {cmd.statut}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 line-clamp-2">{cmd.titre_travail}</p>

                  <div className="flex gap-2 pt-2 border-t border-slate-200">
                    <button
                      onClick={async () => {
                        await imprimerieService.updateCommandeStatus(cmd.id, 'en_impression', user)
                        loadAllData()
                      }}
                      className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <Play className="w-3 h-3" /> Imprimer
                    </button>
                    <button
                      onClick={async () => {
                        await imprimerieService.updateCommandeStatus(cmd.id, 'termine', user)
                        loadAllData()
                      }}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <Check className="w-3 h-3" /> Terminer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VUE 4 : EN ATTENTE DE VALIDATION CAISSIÈRE                           */}
      {/* ===================================================================== */}
      {activeTab === 'attente' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> Ventes en Attente d'Encaissement
              </h3>
              <p className="text-xs text-slate-400">
                Commandes saisies par le graphiste prêtes à être encaissées et validées par la caissière.
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full">
              {commandesEnAttente.length} en attente
            </span>
          </div>

          {commandesEnAttente.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Aucune vente en attente. Tout est soldé et encaissé !
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {commandesEnAttente.map((cmd) => (
                <div key={cmd.id} className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono font-bold text-xs text-slate-900 block">{cmd.numero_commande}</span>
                      <span className="text-xs font-semibold text-slate-700">{cmd.client_nom}</span>
                    </div>
                    <span className="font-black text-xs text-amber-700">
                      Reste : {Number(cmd.solde_restant || cmd.total_ttc).toLocaleString('fr-FR')} F
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 truncate">{cmd.titre_travail}</p>

                  <button
                    onClick={() => handleEncaisserAttente(cmd)}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <DollarSign className="w-4 h-4" /> Encaisser & Valider (Déstocker Matières)
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VUE 5 : ARTICLES & CATÉGORIES (GESTION DU CATALOGUE & MATIÈRES)      */}
      {/* ===================================================================== */}
      {activeTab === 'articles' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Layers className="w-4 h-4 text-purple-600" /> Catalogue des Articles & Liaison Matières Premières
              </h3>
              <p className="text-xs text-slate-400">
                Ajoutez vos articles de vente express et associez les matières premières consommées à chaque vente
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleOpenArticleModal()}
                className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Nouvel Article de Vente
              </button>

              <button
                onClick={() => setShowMatiereModal(true)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              >
                <Box className="w-3.5 h-3.5 text-purple-600" /> Nouvelle Matière Première
              </button>
            </div>
          </div>

          {/* Grille des articles existants avec bouton d'édition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 pt-2">
            {prestations.map((p) => {
              const nbBOM = p.matieres_bom?.length || 0
              return (
                <div
                  key={p.id}
                  className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 text-xs flex flex-col justify-between space-y-2 hover:border-purple-300 transition"
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-slate-900 dark:text-slate-100">{p.nom}</span>
                      <button
                        onClick={() => handleOpenArticleModal(p)}
                        className="text-slate-400 hover:text-purple-600 p-1 transition"
                        title="Modifier cet article & ses matières"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <span className="text-[10px] text-slate-400 font-mono block">
                      {p.code} • {p.categorie}
                    </span>

                    <span className="font-black text-purple-700 block mt-1">
                      {Number(p.prix_vente).toLocaleString('fr-FR')} FCFA /{p.unite_facturation}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-[10px]">
                    <span className={nbBOM > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
                      {nbBOM > 0 ? `${nbBOM} matière(s) liée(s)` : 'Sans matière'}
                    </span>
                    <button
                      onClick={() => handleOpenArticleModal(p)}
                      className="text-purple-600 font-bold hover:underline"
                    >
                      Configurer BOM
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* VUE 6 : COÛTS MATIÈRES PREMIÈRES (CUMUL & PAR MATIÈRE + FILTRES)      */}
      {/* ===================================================================== */}
      {activeTab === 'rapports' && (
        <div className="space-y-5">
          {/* ── BARRE DE FILTRES RAPIDES ── */}
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-2xl text-xs font-bold text-slate-600">
                <button
                  onClick={() => setRapportPeriode('jour')}
                  className={`px-3 py-1.5 rounded-xl transition ${rapportPeriode === 'jour' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  Aujourd'hui
                </button>
                <button
                  onClick={() => setRapportPeriode('semaine')}
                  className={`px-3 py-1.5 rounded-xl transition ${rapportPeriode === 'semaine' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  7 jours
                </button>
                <button
                  onClick={() => setRapportPeriode('mois')}
                  className={`px-3 py-1.5 rounded-xl transition ${rapportPeriode === 'mois' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  Ce mois
                </button>
                <button
                  onClick={() => setRapportPeriode('annee')}
                  className={`px-3 py-1.5 rounded-xl transition ${rapportPeriode === 'annee' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  Cette année
                </button>
                <button
                  onClick={() => setRapportPeriode('personnalise')}
                  className={`px-3 py-1.5 rounded-xl transition ${rapportPeriode === 'personnalise' ? 'bg-white text-purple-700 shadow-xs' : ''}`}
                >
                  Personnalisé
                </button>
                <button
                  onClick={() => setRapportPeriode('tout')}
                  className={`px-3 py-1.5 rounded-xl transition ${rapportPeriode === 'tout' ? 'bg-white text-slate-900 shadow-xs' : ''}`}
                >
                  Tout
                </button>
              </div>

              {rapportPeriode === 'personnalise' && (
                <div className="flex items-center gap-2 text-xs font-medium">
                  <span className="text-slate-500">Du :</span>
                  <input
                    type="date"
                    value={rapportDateDebut}
                    onChange={(e) => setRapportDateDebut(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                  <span className="text-slate-500">Au :</span>
                  <input
                    type="date"
                    value={rapportDateFin}
                    onChange={(e) => setRapportDateFin(e.target.value)}
                    className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              )}
            </div>

            {/* Filtre par matière et recherche */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 text-xs">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Rechercher matière par nom..."
                  value={rapportSearch}
                  onChange={(e) => setRapportSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                />
              </div>

              <select
                value={rapportMatiereFilter}
                onChange={(e) => setRapportMatiereFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium"
              >
                <option value="TOUTES">Toutes les matières premières</option>
                {matieres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nom} ({m.unite})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── CARTES KPIS MATIÈRES PREMIÈRES ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 text-xs">
            {/* KPI 1 : CUMUL COÛT MATIÈRES */}
            <div className="bg-purple-900 text-white p-4 rounded-3xl shadow-xs space-y-1">
              <div className="flex items-center justify-between text-purple-200">
                <span className="font-bold uppercase tracking-wider text-[10px]">Coût Cumulé Matières</span>
                <Box className="w-4 h-4 text-purple-300" />
              </div>
              <p className="text-2xl font-black text-white">
                {Math.round(statsRapportMatieres.cumulCout).toLocaleString('fr-FR')}{' '}
                <span className="text-xs font-normal">FCFA</span>
              </p>
              <p className="text-[11px] text-purple-200">
                Cumul sur la période sélectionnée
              </p>
            </div>

            {/* KPI 2 : VOLUME CONSOMMÉ */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[10px]">Quantité Déstockée</span>
                <Scissors className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-2xl font-black text-slate-900">
                {statsRapportMatieres.cumulQte.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
              </p>
              <p className="text-[11px] text-slate-400">
                {statsRapportMatieres.parMatiere.length} matière(s) utilisée(s)
              </p>
            </div>

            {/* KPI 3 : NOMBRE DE SORTIES */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-1">
              <div className="flex items-center justify-between text-slate-400">
                <span className="font-bold uppercase tracking-wider text-[10px]">Sorties Enregistrées</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-black text-emerald-700">
                {statsRapportMatieres.nbSorties}
              </p>
              <p className="text-[11px] text-slate-400">
                Liaisons ventes express & commandes
              </p>
            </div>

            {/* KPI 4 : LIEN PAGE COMPLÈTE */}
            <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <span className="font-bold uppercase tracking-wider text-[10px] text-slate-400">Rapport Complet</span>
                <p className="text-xs font-bold text-slate-800 mt-1">Marges, rentabilité clients et pertes</p>
              </div>
              <button
                onClick={() => navigate(`${prefix}/reporting`)}
                className="py-1.5 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-xl text-xs transition flex items-center justify-between mt-2"
              >
                <span>Voir le rapport financier</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* ── TABLEAU ANALYTIQUE COÛT PAR MATIÈRE PREMIÈRE ── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                  <Box className="w-4 h-4 text-purple-600" /> Coût & Consommation par Matière Première
                </h3>
                <p className="text-[11px] text-slate-400">
                  Détail du coût de chaque matière première consommée lors des ventes
                </p>
              </div>

              <span className="text-xs font-bold px-3 py-1 bg-purple-50 text-purple-700 rounded-full">
                {statsRapportMatieres.parMatiere.length} matière(s)
              </span>
            </div>

            {statsRapportMatieres.parMatiere.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Aucune matière première consommée sur cette période ou selon les filtres.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600">
                    <tr>
                      <th className="text-left px-4 py-3">Matière Première</th>
                      <th className="text-left px-4 py-3">Catégorie</th>
                      <th className="text-center px-4 py-3">Unité</th>
                      <th className="text-center px-4 py-3">Ventes</th>
                      <th className="text-right px-4 py-3">Quantité Cumulée</th>
                      <th className="text-right px-4 py-3">Coût Unitaire Moyen</th>
                      <th className="text-right px-4 py-3">Coût Total (Cumul)</th>
                      <th className="text-left px-4 py-3 w-40">Part (%)</th>
                      <th className="text-center px-4 py-3">Stock Restant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statsRapportMatieres.parMatiere.map((m) => {
                      const isStockAlerte = m.stockActuel <= m.stockMinimum
                      return (
                        <tr key={m.id} className="hover:bg-slate-50 transition">
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900 block">{m.nom}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{m.code}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-semibold">
                              {m.categorie}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-semibold text-slate-600">{m.unite}</td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700">{m.nbVentes}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">
                            {m.qteTotale.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} {m.unite}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">
                            {Math.round(m.coutUnitaireMoyen).toLocaleString('fr-FR')} F
                          </td>
                          <td className="px-4 py-3 text-right font-black text-purple-700 text-sm">
                            {Math.round(m.coutTotal).toLocaleString('fr-FR')} F
                          </td>
                          <td className="px-4 py-3">
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold">{m.partPct.toFixed(1)}%</span>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-purple-600 h-full rounded-full"
                                  style={{ width: `${Math.min(100, m.partPct)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                isStockAlerte ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {m.stockActuel} {m.unite} {isStockAlerte ? '⚠️' : '✓'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-purple-50/70 border-t-2 border-purple-200 font-black text-slate-900">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right uppercase tracking-wider text-purple-900">
                        Total Cumulé Coûts Matières :
                      </td>
                      <td className="px-4 py-3 text-right text-purple-900">
                        {statsRapportMatieres.cumulQte.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">-</td>
                      <td className="px-4 py-3 text-right text-purple-950 text-sm">
                        {Math.round(statsRapportMatieres.cumulCout).toLocaleString('fr-FR')} FCFA
                      </td>
                      <td colSpan={2} className="px-4 py-3 text-purple-700 text-left">
                        100%
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1 : CRÉATION / MODIFICATION ARTICLE & LIAISON MATIÈRES (BOM)    */}
      {/* ===================================================================== */}
      {showArticleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-lg w-full space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-black text-base text-slate-900 dark:text-slate-100">
                  {editingArticleId ? "Modifier l'Article de Vente" : "Nouvel Article de Vente Express"}
                </h4>
                <p className="text-xs text-slate-400">
                  Définissez le tarif et les matières premières associées (déstockées à la vente)
                </p>
              </div>
              <button
                onClick={() => setShowArticleModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveArticle} className="space-y-4 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-600 block mb-1">Code Article</label>
                  <input
                    type="text"
                    value={articleForm.code}
                    onChange={(e) => setArticleForm({ ...articleForm, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                    placeholder="ART026"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Catégorie</label>
                  <input
                    type="text"
                    value={articleForm.categorie}
                    onChange={(e) => setArticleForm({ ...articleForm, categorie: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    placeholder="Impression, Fournitures..."
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-600 block mb-1">Désignation de l'Article *</label>
                <input
                  type="text"
                  required
                  value={articleForm.nom}
                  onChange={(e) => setArticleForm({ ...articleForm, nom: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  placeholder="Ex: Chemise dossier, Bâche 510g HD, Couché A3..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-600 block mb-1">Mode de Calcul</label>
                  <select
                    value={articleForm.mode_calcul}
                    onChange={(e) => setArticleForm({ ...articleForm, mode_calcul: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="unite">À l'unité (pièce / article)</option>
                    <option value="page">Par page</option>
                    <option value="m2">Au m² (Largeur x Hauteur)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Prix de Vente (FCFA) *</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={articleForm.prix_vente}
                    onChange={(e) => setArticleForm({ ...articleForm, prix_vente: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-purple-700"
                  />
                </div>
              </div>

              {/* ── SECTION MATIÈRES PREMIÈRES ASSOCIÉES (BOM) ── */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Box className="w-3.5 h-3.5 text-purple-600" /> Matières Premières Liées (BOM)
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      if (matieres.length === 0) {
                        notify('error', "Veuillez d'abord créer au moins une matière première !")
                        return
                      }
                      setArticleBOM((prev) => [
                        ...prev,
                        {
                          matiere_id: matieres[0].id,
                          quantite_prevue: 1,
                          unite: matieres[0].unite,
                          cout_unitaire_prevu: Number(matieres[0].cout_moyen || 0),
                        },
                      ])
                    }}
                    className="text-[11px] font-bold text-purple-700 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Associer une matière
                  </button>
                </div>

                {articleBOM.length === 0 ? (
                  <p className="text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-xl text-center">
                    Aucune matière première liée. La vente ne déduira pas de stock de matière.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {articleBOM.map((bom, bIdx) => {
                      const matObj = matieres.find((m) => m.id === bom.matiere_id)
                      return (
                        <div key={bIdx} className="p-2 bg-slate-50 rounded-xl flex items-center gap-2 text-xs">
                          <select
                            value={bom.matiere_id}
                            onChange={(e) => {
                              const selectedM = matieres.find((m) => m.id === e.target.value)
                              setArticleBOM((prev) =>
                                prev.map((item, idx) =>
                                  idx === bIdx
                                    ? {
                                        ...item,
                                        matiere_id: e.target.value,
                                        unite: selectedM?.unite || 'u',
                                        cout_unitaire_prevu: Number(selectedM?.cout_moyen || 0),
                                      }
                                    : item
                                )
                              )
                            }}
                            className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs"
                          >
                            {matieres.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.nom} ({m.unite})
                              </option>
                            ))}
                          </select>

                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={bom.quantite_prevue}
                              onChange={(e) => {
                                const val = Number(e.target.value)
                                setArticleBOM((prev) =>
                                  prev.map((item, idx) =>
                                    idx === bIdx ? { ...item, quantite_prevue: val } : item
                                  )
                                )
                              }}
                              className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-center"
                            />
                            <span className="text-[10px] text-slate-500">{bom.unite}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => setArticleBOM((prev) => prev.filter((_, idx) => idx !== bIdx))}
                            className="p-1 text-slate-400 hover:text-rose-600 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowArticleModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition shadow-xs"
                >
                  Enregistrer l'Article
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2 : NOUVELLE MATIÈRE PREMIÈRE                                  */}
      {/* ===================================================================== */}
      {showMatiereModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-black text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Box className="w-4 h-4 text-purple-600" /> Nouvelle Matière Première
              </h4>
              <button
                onClick={() => setShowMatiereModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMatiere} className="space-y-3 text-xs font-semibold">
              <div>
                <label className="text-slate-600 block mb-1">Nom de la Matière *</label>
                <input
                  type="text"
                  required
                  value={matiereForm.nom}
                  onChange={(e) => setMatiereForm({ ...matiereForm, nom: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  placeholder="Ex: Bâche 510g, Papier couché 300g, Encre noire..."
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 block mb-1">Catégorie</label>
                  <select
                    value={matiereForm.categorie}
                    onChange={(e) => setMatiereForm({ ...matiereForm, categorie: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="Supports">Supports (Bâche, Vinyle)</option>
                    <option value="Papier">Papier / Carton</option>
                    <option value="Encres">Encres & Toners</option>
                    <option value="Textiles">Textiles & T-shirts</option>
                    <option value="Finition">Finition (Œillets, Colle)</option>
                  </select>
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Unité</label>
                  <select
                    value={matiereForm.unite}
                    onChange={(e) => setMatiereForm({ ...matiereForm, unite: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="m2">m²</option>
                    <option value="feuille">Feuille</option>
                    <option value="ml">ml / Litre</option>
                    <option value="piece">Pièce / Unité</option>
                    <option value="rouleau">Rouleau</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 block mb-1">Stock Initial</label>
                  <input
                    type="number"
                    min="0"
                    value={matiereForm.stock_actuel}
                    onChange={(e) => setMatiereForm({ ...matiereForm, stock_actuel: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>

                <div>
                  <label className="text-slate-600 block mb-1">Coût Achat (FCFA)</label>
                  <input
                    type="number"
                    min="0"
                    value={matiereForm.cout_moyen}
                    onChange={(e) => setMatiereForm({ ...matiereForm, cout_moyen: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-purple-700"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowMatiereModal(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition"
                >
                  Ajouter au Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3 : DÉTAIL D'UNE VENTE / COMMANDE ENREGISTRÉE                   */}
      {/* ===================================================================== */}
      {selectedCommandeDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl border border-slate-200 text-xs">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <span className="font-mono font-bold text-sm text-slate-900 block">
                  {selectedCommandeDetail.numero_commande}
                </span>
                <span className="text-slate-500">{selectedCommandeDetail.client_nom} • {selectedCommandeDetail.date_commande}</span>
              </div>
              <button
                onClick={() => setSelectedCommandeDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="font-bold text-slate-700 block uppercase tracking-wider text-[10px]">
                Lignes d'articles vendus :
              </span>
              <div className="bg-slate-50 p-3 rounded-2xl space-y-2">
                {selectedCommandeDetail.lignes?.map((lig, idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs">
                    <div>
                      <span className="font-bold text-slate-900">{lig.designation}</span>
                      <span className="text-slate-500 block text-[10px]">Quantité : {lig.quantite}</span>
                    </div>
                    <span className="font-mono font-black text-slate-900">
                      {Number(lig.montant_ttc).toLocaleString('fr-FR')} F
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-purple-50 p-3 rounded-2xl space-y-1 font-semibold">
              <div className="flex justify-between text-slate-700">
                <span>Total Vente :</span>
                <span className="font-black text-slate-900">{Number(selectedCommandeDetail.total_ttc).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Montant Payé :</span>
                <span className="font-black">{Number(selectedCommandeDetail.montant_paye).toLocaleString('fr-FR')} FCFA</span>
              </div>
              <div className="flex justify-between text-amber-700">
                <span>Reste Dû :</span>
                <span className="font-black">{Number(selectedCommandeDetail.solde_restant).toLocaleString('fr-FR')} FCFA</span>
              </div>
            </div>

            <button
              onClick={() => setSelectedCommandeDetail(null)}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL CALCUL SURFACES AU M² POUR BÂCHE & GRAND FORMAT                */}
      {/* ===================================================================== */}
      {dimModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl border border-slate-200">
            <div>
              <h4 className="font-black text-sm text-slate-900 dark:text-slate-100">
                Dimensions pour {dimModalItem.nom}
              </h4>
              <p className="text-xs text-slate-500">
                Tarif : {Number(dimModalItem.prix_vente).toLocaleString('fr-FR')} F / m²
              </p>
            </div>

            <form onSubmit={handleValiderDimensionsM2} className="space-y-3 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-600 block mb-1">Largeur (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={dimLargeur}
                    onChange={(e) => setDimLargeur(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1">Hauteur (m)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={dimHauteur}
                    onChange={(e) => setDimHauteur(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-600 block mb-1">Nombre d'exemplaires</label>
                <input
                  type="number"
                  min="1"
                  value={dimQuantite}
                  onChange={(e) => setDimQuantite(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="p-3 bg-purple-50 rounded-xl text-center font-black text-purple-900">
                Total estimé :{' '}
                {Math.round(
                  (dimLargeur || 1) * (dimHauteur || 1) * (dimQuantite || 1) * Number(dimModalItem.prix_vente || 0)
                ).toLocaleString('fr-FR')}{' '}
                FCFA
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDimModalItem(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-bold transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition"
                >
                  Ajouter au Panier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ImprimerieVenteRapidePage
