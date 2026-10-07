// =============================================================================
// GESTIO 229 SaaS — Module Vente Express & Centre d'Impression Moderne
// Navigation tactile par onglets : Vente Express, Commandes, Production, En Attente, Articles & Catégories
// Contrôle session de caisse, Panier multi-articles, Déduction matières BOM,
// Workflow : Le Graphiste prépare / met en attente — La Caissière encaisse et valide.
// Zéro donnée fictive : Supabase est la source de vérité.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Printer, ShoppingCart, CheckCircle2, DollarSign, RefreshCw,
  Search, Plus, Minus, Trash2, Clock, AlertTriangle, Layers,
  Scissors, User, Phone, Check, ArrowRight, Play, Eye, FileText,
  Lock, Unlock, ChevronRight, PackageCheck, AlertOctagon, Sparkles
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import {
  imprimerieService,
  PrestationImprimerie,
  CommandeImprimerie,
  StatutCommande
} from '../../../services/imprimerieService'
import {
  checkSectorCaisseStatus,
  CaisseStatusResult
} from '../../../services/caisseSectorService'

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

  // ── Navigation par Onglets (comme le design de référence) ──
  const [activeTab, setActiveTab] = useState<'express' | 'commandes' | 'production' | 'attente' | 'articles'>('express')

  // ── Données Métier ──
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [prestations, setPrestations] = useState<PrestationImprimerie[]>([])
  const [commandes, setCommandes] = useState<CommandeImprimerie[]>([])
  const [caisseStatus, setCaisseStatus] = useState<CaisseStatusResult | null>(null)

  // ── Filtres & Recherche ──
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
      const [presList, cmdsList, cStatus] = await Promise.all([
        imprimerieService.getPrestations(companyId, activeSector),
        imprimerieService.getCommandes(companyId, activeSector),
        checkSectorCaisseStatus(companyId, activeSector),
      ])
      setPrestations(presList)
      setCommandes(cmdsList)
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

  // ── Catégories uniques extraites des vraies prestations ──
  const categoriesList = useMemo(() => {
    const cats = Array.from(new Set(prestations.map((p) => p.categorie || 'Impression'))).filter(Boolean)
    return ['Tous', ...cats]
  }, [prestations])

  // ── Prestations filtrées ──
  const filteredPrestations = useMemo(() => {
    return prestations.filter((p) => {
      const matchSearch =
        p.nom.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCat = selectedCategory === 'Tous' || p.categorie === selectedCategory
      return matchSearch && matchCat
    })
  }, [prestations, searchTerm, selectedCategory])

  // ── Calcul total panier ──
  const totalPanier = useMemo(() => {
    return panier.reduce((acc, it) => acc + it.totalLigne, 0)
  }, [panier])

  // Ajuster le montant payé par défaut lorsque le panier change
  useEffect(() => {
    setMontantPaye(totalPanier)
  }, [totalPanier])

  const resteAPayer = Math.max(0, totalPanier - montantPaye)

  // ── Ajout d'une prestation au panier ──
  const handleSelectPrestation = (pres: PrestationImprimerie) => {
    if (pres.mode_calcul === 'm2') {
      // Ouvrir le modal dimensions pour calcul surface
      setDimModalItem(pres)
      setDimLargeur(1)
      setDimHauteur(1)
      setDimQuantite(1)
      return
    }

    // Prestation à l'unité / page
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
          largeur: 1,
          hauteur: 1,
          prixUnitaire: pu,
          totalLigne: pu,
        },
      ]
    })
  }

  // ── Valider ajout avec dimensions m² ──
  const handleValiderDimensionsM2 = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dimModalItem) return
    const surface = (dimLargeur || 1) * (dimHauteur || 1)
    const pu = Number(dimModalItem.prix_vente || 0)
    const totalLigne = Math.round(surface * (dimQuantite || 1) * pu)

    setPanier((prev) => [
      ...prev,
      {
        prestation: dimModalItem,
        quantite: dimQuantite || 1,
        largeur: dimLargeur || 1,
        hauteur: dimHauteur || 1,
        prixUnitaire: pu,
        totalLigne,
      },
    ])
    setDimModalItem(null)
  }

  // ── Modification quantité panier ──
  const handleUpdateQty = (index: number, delta: number) => {
    setPanier((prev) => {
      const item = prev[index]
      if (!item) return prev
      const newQty = item.quantite + delta
      if (newQty <= 0) {
        return prev.filter((_, i) => i !== index)
      }
      let newTotal = 0
      if (item.prestation.mode_calcul === 'm2') {
        const surface = (item.largeur || 1) * (item.hauteur || 1)
        newTotal = Math.round(surface * newQty * item.prixUnitaire)
      } else {
        newTotal = Math.round(newQty * item.prixUnitaire)
      }
      return prev.map((it, i) => (i === index ? { ...it, quantite: newQty, totalLigne: newTotal } : it))
    })
  }

  const handleViderPanier = () => {
    setPanier([])
    setClientNom('Client Comptoir')
    setClientTel('')
  }

  // ── Validation de la Vente Express / Mise en Attente ──
  const handleValiderVente = async (mettreEnAttente: boolean = false) => {
    if (!companyId || panier.length === 0) return

    // Si la caisse est fermée et qu'on essaie d'encaisser directement
    if (!mettreEnAttente && caisseStatus && !caisseStatus.isTodayOpen) {
      notify('error', "La caisse n'est pas ouverte. Vous devez ouvrir la caisse ou mettre la vente en attente.")
      return
    }

    setSubmitting(true)
    try {
      const res = await imprimerieService.creerVentePanier(
        companyId,
        activeSector,
        {
          items: panier,
          clientNom: clientNom.trim() || 'Client Comptoir',
          clientTel: clientTel.trim() || undefined,
          modePaiement,
          montantPaye: mettreEnAttente ? 0 : montantPaye,
          isEnAttente: mettreEnAttente,
        },
        user
      )

      if (mettreEnAttente) {
        notify('success', `Vente ${res.commande.numero_commande} mise en attente pour validation/encaissement caisse !`)
        handleViderPanier()
        loadAllData()
        setActiveTab('attente')
      } else {
        // Enregistrement succès et affichage ticket
        setRecuSuccess({
          cmdNumero: res.commande.numero_commande,
          recuRef: res.recuRef,
          total: totalPanier,
          paye: montantPaye,
          reste: resteAPayer,
          date: new Date().toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
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
        notify('success', 'Vente encaissée et matières déduites du stock avec succès !')
        loadAllData()
      }
    } catch (err: any) {
      notify('error', err.message || 'Erreur lors de la validation.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Encaissement d'une vente en attente par la caissière ──
  const handleEncaisserAttente = async (cmd: CommandeImprimerie) => {
    if (!caisseStatus?.isTodayOpen) {
      notify('error', "Veuillez d'abord ouvrir la session de caisse du jour pour encaisser.")
      return
    }

    try {
      await imprimerieService.enregistrerPaiement(
        {
          company_id: cmd.company_id,
          sector_slug: activeSector,
          commande_id: cmd.id,
          montant: Number(cmd.total_ttc),
          mode_paiement: 'especes',
          reference_recu: `REC-ATT-${Date.now().toString().slice(-5)}`,
          type_paiement: 'solde',
        },
        user
      )

      // Passer le statut de la commande à 'livre'
      await imprimerieService.updateCommandeStatus(cmd.id, 'livre', user)
      notify('success', `Commande ${cmd.numero_commande} validée et encaissée avec succès !`)
      loadAllData()
    } catch (e: any) {
      notify('error', e.message || 'Erreur encaissement.')
    }
  }

  // ── Commandes en attente (non payées / à encaisser) ──
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

  return (
    <div className="space-y-5 pb-16 animate-fadeIn">
      {/* ── BARRE DE NAVIGATION SUPÉRIEURE PAR ONGLETS (STYLE CAPTURE) ── */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 -mx-4 sm:-mx-6 -mt-6 px-4 sm:px-6 pt-3 flex items-center justify-between overflow-x-auto gap-2">
        <div className="flex items-center gap-1 sm:gap-2">
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

          <button
            onClick={() => setActiveTab('articles')}
            className={`px-3.5 py-2.5 font-bold text-xs sm:text-sm border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'articles'
                ? 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4 text-slate-600" /> Articles & Catégories
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
      {/* VUE 1 : VENTE EXPRESS & PANIER (INTERFACE PRINCIPALE) */}
      {/* ===================================================================== */}
      {activeTab === 'express' && (
        <>
          {/* ÉCRAN TICKET APRÈS ENCAISSEMENT RÉUSSI */}
          {recuSuccess ? (
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-emerald-200 dark:border-emerald-800 shadow-xl p-6 space-y-5 animate-scaleUp text-center max-w-md mx-auto">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">Vente Encaissée avec Succès !</h3>
                <p className="text-xs text-slate-500 font-mono">Reçu N° <strong>{recuSuccess.recuRef}</strong></p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900/50 rounded-2xl text-left space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">N° Commande :</span>
                  <span className="font-mono font-bold">{recuSuccess.cmdNumero}</span>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-2 space-y-1">
                  {recuSuccess.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-slate-700 dark:text-slate-300">
                      <span>{it.nom} (x{it.qte})</span>
                      <span className="font-bold">{it.total.toLocaleString('fr-FR')} F</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 font-black text-sm">
                  <span>Total :</span>
                  <span>{recuSuccess.total.toLocaleString('fr-FR')} FCFA</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-bold">
                  <span>Encaissé :</span>
                  <span>{recuSuccess.paye.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
                >
                  <Printer className="w-4 h-4" /> Imprimer Ticket
                </button>
                <button
                  onClick={() => {
                    setRecuSuccess(null)
                    handleViderPanier()
                  }}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition"
                >
                  Nouvelle Vente
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* ── COLONNE GAUCHE (8 COLONNES) : RECHERCHE + CATÉGORIES + ARTICLES ── */}
              <div className="lg:col-span-8 space-y-4">
                {/* Champ de recherche rapide */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Rechercher par code, nom de prestation..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 shadow-2xs"
                  />
                </div>

                {/* Pilules Catégories */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {categoriesList.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition whitespace-nowrap shadow-2xs ${
                        selectedCategory === cat
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Grille des Articles / Prestations (Style Cartes Blanches Capture) */}
                <div className="space-y-2">
                  <h3 className="text-xs font-black text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                    Articles & Prestations
                  </h3>

                  {filteredPrestations.length === 0 ? (
                    <div className="p-12 text-center bg-white dark:bg-slate-800 rounded-3xl border border-dashed border-slate-300 text-slate-400 text-xs">
                      Aucune prestation trouvée. Créez vos prestations dans l'onglet "Articles & Catégories".
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {filteredPrestations.map((pres) => (
                        <div
                          key={pres.id}
                          onClick={() => handleSelectPrestation(pres)}
                          className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 shadow-2xs hover:shadow-md cursor-pointer transition-all flex flex-col justify-between text-center group active:scale-95 min-h-[125px]"
                        >
                          <div>
                            <span className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-purple-600 block line-clamp-2 leading-tight">
                              {pres.nom}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">
                              {pres.code}
                            </span>
                          </div>

                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                            <span className="text-xs font-black text-purple-700 dark:text-purple-400 block">
                              {Number(pres.prix_vente || 0).toLocaleString('fr-FR')} FCFA
                            </span>
                            {pres.mode_calcul === 'm2' && (
                              <span className="text-[9px] text-slate-400 font-semibold block">
                                au m²
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── COLONNE DROITE (4 COLONNES) : LE PANIER TACTILE ── */}
              <div className="lg:col-span-4 bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 pb-3">
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-purple-600" /> Panier
                  </h3>
                  {panier.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                      {panier.length} article(s)
                    </span>
                  )}
                </div>

                {/* Contenu du Panier */}
                {panier.length === 0 ? (
                  <div className="py-12 text-center text-slate-400 text-xs">
                    Panier vide
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 divide-y divide-slate-100 dark:divide-slate-700/50">
                    {panier.map((item, idx) => (
                      <div key={idx} className="pt-2 flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                            {item.prestation.nom}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {item.prixUnitaire.toLocaleString('fr-FR')} F
                            {item.prestation.mode_calcul === 'm2'
                              ? ` × (${item.largeur}m × ${item.hauteur}m)`
                              : ''}
                          </span>
                        </div>

                        {/* Boutons Quantité */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleUpdateQty(idx, -1)}
                            className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold w-5 text-center">{item.quantite}</span>
                          <button
                            onClick={() => handleUpdateQty(idx, 1)}
                            className="w-5 h-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center transition"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="font-black text-slate-900 dark:text-slate-100 shrink-0 w-16 text-right">
                          {item.totalLigne.toLocaleString('fr-FR')} F
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                <div className="pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total</span>
                  <span className="text-lg font-black text-slate-900 dark:text-slate-100">
                    {totalPanier.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>

                {/* Informations Client */}
                {panier.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-700 text-xs">
                    <input
                      type="text"
                      placeholder="Nom du client (Client Comptoir par défaut)"
                      value={clientNom}
                      onChange={(e) => setClientNom(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs"
                    />

                    {/* Mode de paiement */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <select
                        value={modePaiement}
                        onChange={(e) => setModePaiement(e.target.value as any)}
                        className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold"
                      >
                        <option value="especes">Espèces</option>
                        <option value="momo_mtn">MTN MoMo</option>
                        <option value="momo_moov">Moov Money</option>
                        <option value="banque">Banque</option>
                        <option value="credit">Crédit</option>
                      </select>

                      <input
                        type="number"
                        min={0}
                        max={totalPanier}
                        placeholder="Montant payé"
                        value={montantPaye}
                        onChange={(e) => setMontantPaye(Number(e.target.value))}
                        className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-emerald-700"
                      />
                    </div>
                  </div>
                )}

                {/* Boutons d'Action (Valider / Vider) */}
                <div className="space-y-2 pt-2">
                  {/* Bouton 1 : Valider et encaisser (Action Caissière / Responsable) */}
                  <button
                    disabled={panier.length === 0 || submitting}
                    onClick={() => handleValiderVente(false)}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl text-xs transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    {submitting ? 'Validation...' : 'Valider ma vente'}
                  </button>

                  {/* Bouton 2 : Mettre en attente (Action Graphiste avant validation caisse) */}
                  <button
                    disabled={panier.length === 0 || submitting}
                    onClick={() => handleValiderVente(true)}
                    className="w-full py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold rounded-2xl text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
                    title="Enregistrer la commande pour que la caissière l'encaisse"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Mettre en attente (Validation Caissière)
                  </button>

                  {/* Bouton 3 : Vider le panier */}
                  <button
                    disabled={panier.length === 0}
                    onClick={handleViderPanier}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold rounded-xl text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400" /> Vider le panier
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===================================================================== */}
      {/* VUE 2 : COMMANDES */}
      {/* ===================================================================== */}
      {activeTab === 'commandes' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" /> Historique des Commandes d'Impression
            </h3>
            <span className="text-xs text-slate-500">{commandes.length} commande(s)</span>
          </div>

          {commandes.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              Aucune commande enregistrée.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5">N° Commande</th>
                    <th className="text-left px-3 py-2.5">Client</th>
                    <th className="text-left px-3 py-2.5">Travail</th>
                    <th className="text-right px-3 py-2.5">Total TTC</th>
                    <th className="text-right px-3 py-2.5">Payé</th>
                    <th className="text-center px-3 py-2.5">Statut</th>
                    <th className="text-center px-3 py-2.5">Paiement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commandes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-3 py-2.5 font-mono font-bold text-slate-900">{c.numero_commande}</td>
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
                          {c.statut_paiement === 'solde' ? 'Payé ✓' : 'Partiel / En attente'}
                        </span>
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
      {/* VUE 3 : FILE DE PRODUCTION ATELIER */}
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
                <div key={cmd.id} className="p-4 bg-slate-50 dark:bg-slate-900/40 rounded-2xl border border-slate-200 space-y-3">
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
      {/* VUE 4 : EN ATTENTE DE VALIDATION CAISSIÈRE */}
      {/* ===================================================================== */}
      {activeTab === 'attente' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500" /> Ventes en Attente d'Encaissement
              </h3>
              <p className="text-xs text-slate-400">
                Commandes saisies par le graphiste ou mises en attente, prêtes à être encaissées par la caissière.
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
                    <DollarSign className="w-4 h-4" /> Encaisser & Valider
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* VUE 5 : ARTICLES & CATÉGORIES (GESTION DU CATALOGUE) */}
      {/* ===================================================================== */}
      {activeTab === 'articles' && (
        <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-purple-600" /> Catalogue des Prestations & Articles
            </h3>

            <button
              onClick={() => navigate(`${prefix}/prestations`)}
              className="px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> Gérer Prestations & BOM
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {prestations.map((p) => (
              <div key={p.id} className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 text-xs space-y-1">
                <span className="font-bold text-slate-900 dark:text-slate-100 block">{p.nom}</span>
                <span className="text-[10px] text-slate-400 font-mono block">{p.code} · {p.categorie}</span>
                <span className="font-black text-purple-700 block mt-1">
                  {Number(p.prix_vente).toLocaleString('fr-FR')} FCFA /{p.unite_facturation}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL CALCUL SURFACES AU M² POUR IMPRESSIONS GRAND FORMAT / BÂCHE */}
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
