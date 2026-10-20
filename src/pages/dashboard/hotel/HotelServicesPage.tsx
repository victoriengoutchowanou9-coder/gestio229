// =============================================================================
// GESTIO 229 — SERVICES & CONSOMMATIONS HÔTELIÈRES
// =============================================================================
// Gestion des prestations annexes : Petit-déjeuner, Blanchisserie, Minibar,
// Restauration, Salles de réunion et Navettes. Affectation aux folios clients.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Coffee, Utensils, Shirt, Wine, Sparkles, Navigation, Calendar,
  Plus, Check, X, Search, RefreshCw, DollarSign, Wallet, Smartphone,
  CheckCircle2, ShoppingCart, ArrowRight
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import {
  DEFAULT_HOTEL_SERVICES,
  HotelServiceConfig,
  HotelSejour,
  fetchHotelSejours,
  ajouterPrestationSejour,
  getLocalHotelData,
  setLocalHotelData
} from '../../../services/hotelService'
import clsx from 'clsx'

export const HotelServicesPage: React.FC = () => {
  const navigate = useNavigate()
  const { companyId, sectorSlug, currentSectorSlug } = useTenant()
  const { toast } = useUIStore()
  const cleanSector = (currentSectorSlug || sectorSlug || 'hotel').toLowerCase().trim().replace(/^sec-/, '')

  const [services, setServices] = useState<HotelServiceConfig[]>([])
  const [sejours, setSejours] = useState<HotelSejour[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [processing, setProcessing] = useState<boolean>(false)

  // Filtre catégorie
  const [activeCat, setActiveCat] = useState<string>('TOUTES')
  const [search, setSearch] = useState<string>('')

  // Modale affectation service
  const [selectedService, setSelectedService] = useState<HotelServiceConfig | null>(null)
  const [showOrderModal, setShowOrderModal] = useState<boolean>(false)

  const [orderForm, setOrderForm] = useState({
    sejourId: '',
    quantite: 1,
    regleImmediatement: false,
    modeReglement: 'CASH',
  })

  // Modale configuration nouveau service
  const [showNewServiceModal, setShowNewServiceModal] = useState<boolean>(false)
  const [newServiceForm, setNewServiceForm] = useState({
    nom: '',
    categorie: 'Restauration' as HotelServiceConfig['categorie'],
    prix: 2500,
    unite: 'Unité',
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const sejData = await fetchHotelSejours(companyId)
      setSejours(sejData.filter(s => s.statut === 'EN_COURS'))

      const srvData = getLocalHotelData<HotelServiceConfig[]>(companyId, 'services_config', DEFAULT_HOTEL_SERVICES)
      setServices(srvData)
    } catch (err) {
      console.warn('[HotelServices] Erreur chargement services:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredServices = useMemo(() => {
    return services.filter(s => {
      if (activeCat !== 'TOUTES' && s.categorie !== activeCat) return false
      if (search && !s.nom.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [services, activeCat, search])

  // Basculer l'état actif/inactif d'un service proposé
  const handleToggleService = (id: string) => {
    const updated = services.map(s => s.id === id ? { ...s, actif: !s.actif } : s)
    setServices(updated)
    setLocalHotelData(companyId || '', 'services_config', updated)
    toast.success('Configuration mise à jour', 'Le statut du service a été modifié.')
  }

  // Ouvrir commande de service
  const handleOpenOrder = (s: HotelServiceConfig) => {
    setSelectedService(s)
    setOrderForm({
      sejourId: sejours.length > 0 ? sejours[0].id : '',
      quantite: 1,
      regleImmediatement: false,
      modeReglement: 'CASH',
    })
    setShowOrderModal(true)
  }

  // Valider la commande
  const handleValiderOrder = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedService) return
    if (!orderForm.sejourId) {
      toast.error('Client requis', 'Veuillez sélectionner la chambre ou le client hébergé.')
      return
    }

    setProcessing(true)
    try {
      const res = await ajouterPrestationSejour(companyId || '', orderForm.sejourId, {
        serviceNom: selectedService.nom,
        categorie: selectedService.categorie,
        quantite: orderForm.quantite,
        prixUnitaire: selectedService.prix,
        regleImmediatement: orderForm.regleImmediatement,
        modeReglement: orderForm.modeReglement,
      })

      if (!res.success) {
        toast.error('Erreur', res.error)
        return
      }

      toast.success(
        'Prestation enregistrée !',
        orderForm.regleImmediatement
          ? `${selectedService.nom} encaissé au comptoir avec succès.`
          : `${selectedService.nom} affecté au compte de séjour de la Chambre.`
      )

      setShowOrderModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Créer nouveau service
  const handleCreateNewService = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newServiceForm.nom.trim()) return

    const newSrv: HotelServiceConfig = {
      id: `srv-${Date.now()}`,
      nom: newServiceForm.nom,
      categorie: newServiceForm.categorie,
      prix: Number(newServiceForm.prix) || 0,
      unite: newServiceForm.unite || 'Unité',
      actif: true,
    }

    const updated = [...services, newSrv]
    setServices(updated)
    setLocalHotelData(companyId || '', 'services_config', updated)
    toast.success('Service créé', `${newSrv.nom} a été ajouté au catalogue hôtelier.`)
    setShowNewServiceModal(false)
    setNewServiceForm({ nom: '', categorie: 'Restauration', prix: 2500, unite: 'Unité' })
  }

  const categories = ['TOUTES', 'Petit-déjeuner', 'Blanchisserie', 'Minibar', 'Restauration', 'Transport', 'Salle']

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── EN-TÊTE SERVICES ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black shadow-lg shadow-amber-500/20">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">
                Services & Consommations
              </h1>
              <span className="bg-amber-500/20 text-amber-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-500/30">
                Prestations Hôtelières
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Petit-déjeuner • Blanchisserie • Minibar • Room Service • Facturation sur compte de chambre
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Raccourci vers Vente & POS si bar/resto complet */}
          <button
            type="button"
            onClick={() => navigate(`/app/${cleanSector}/vente-pos`)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition"
          >
            <ShoppingCart className="w-4 h-4 text-indigo-400" />
            <span>Vente & POS Comptoir</span>
          </button>

          <button
            type="button"
            onClick={() => setShowNewServiceModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Nouveau Service</span>
          </button>
        </div>
      </div>

      {/* ─── CATÉGORIES & RECHERCHE ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCat(cat)}
              className={clsx(
                'px-3 py-1.5 rounded-xl text-xs font-bold transition',
                activeCat === cat
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une prestation..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* ─── GRILLE DES SERVICES HÔTELIERS ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filteredServices.map((s) => {
          return (
            <div
              key={s.id}
              className={clsx(
                'rounded-3xl p-5 border transition flex flex-col justify-between space-y-4',
                s.actif
                  ? 'bg-slate-900 border-slate-800 hover:border-slate-700 shadow-sm'
                  : 'bg-slate-950/40 border-slate-800/50 opacity-60'
              )}
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 uppercase">
                    {s.categorie}
                  </span>

                  {/* Toggle Actif / Désactivé */}
                  <button
                    type="button"
                    onClick={() => handleToggleService(s.id)}
                    className={clsx(
                      'text-[10px] font-bold px-2 py-0.5 rounded-md transition',
                      s.actif ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                    )}
                    title="Cliquer pour activer/désactiver ce service"
                  >
                    {s.actif ? 'Proposé' : 'Non proposé'}
                  </button>
                </div>

                <div className="mt-3">
                  <h3 className="font-bold text-white text-sm line-clamp-2">
                    {s.nom}
                  </h3>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-base font-black font-mono text-emerald-400">
                      {formatFCFA(s.prix)}
                    </span>
                    <span className="text-[10px] text-slate-500">/ {s.unite}</span>
                  </div>
                </div>
              </div>

              {/* Bouton d'affectation */}
              <button
                type="button"
                disabled={!s.actif || sejours.length === 0}
                onClick={() => handleOpenOrder(s)}
                className={clsx(
                  'w-full py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 shadow-md',
                  !s.actif || sejours.length === 0
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/15'
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Facturer à une Chambre</span>
              </button>
            </div>
          )
        })}
      </div>

      {/* ─── MODALE 1 : AFFECTER UNE PRESTATION À UNE CHAMBRE ─── */}
      {showOrderModal && selectedService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowOrderModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Coffee className="w-5 h-5 text-amber-400" />
              Facturer : {selectedService.nom}
            </h3>

            <form onSubmit={handleValiderOrder} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Chambre cliente hébergée *
                </label>
                <select
                  required
                  value={orderForm.sejourId}
                  onChange={(e) => setOrderForm(prev => ({ ...prev, sejourId: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Sélectionner une chambre occupée</option>
                  {sejours.map(s => (
                    <option key={s.id} value={s.id}>
                      Ch. {s.chambre_numero} — {s.client_nom} (Solde actuel: {formatFCFA(s.solde_restant)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Quantité</label>
                  <input
                    type="number"
                    min="1"
                    value={orderForm.quantite}
                    onChange={(e) => setOrderForm(prev => ({ ...prev, quantite: Math.max(1, Number(e.target.value) || 1) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Total Facturé</label>
                  <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-black">
                    {formatFCFA(orderForm.quantite * selectedService.prix)}
                  </div>
                </div>
              </div>

              {/* Mode de règlement */}
              <div className="pt-2 space-y-2 border-t border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={orderForm.regleImmediatement}
                    onChange={(e) => setOrderForm(prev => ({ ...prev, regleImmediatement: e.target.checked }))}
                    className="rounded bg-slate-950 border-slate-800 text-amber-500 focus:ring-0"
                  />
                  <span>Règlement immédiat au comptoir (Espèces / MoMo)</span>
                </label>

                {!orderForm.regleImmediatement ? (
                  <p className="text-[11px] text-indigo-300 bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-500/20">
                    Le montant sera ajouté au compte de séjour (folio) du client et réglé au moment du Check-out.
                  </p>
                ) : (
                  <select
                    value={orderForm.modeReglement}
                    onChange={(e) => setOrderForm(prev => ({ ...prev, modeReglement: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="CASH">Espèces</option>
                    <option value="MOMO">Mobile Money (MoMo / Moov)</option>
                    <option value="CARD">Carte Bancaire</option>
                  </select>
                )}
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowOrderModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={processing || !orderForm.sejourId}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE 2 : CONFIGURATION NOUVEAU SERVICE ─── */}
      {showNewServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowNewServiceModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-amber-400" />
              Ajouter un Service au Catalogue
            </h3>

            <form onSubmit={handleCreateNewService} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Désignation du service *</label>
                <input
                  type="text"
                  required
                  value={newServiceForm.nom}
                  onChange={(e) => setNewServiceForm(prev => ({ ...prev, nom: e.target.value }))}
                  placeholder="ex: Location Vélo VTT, Massage Détente..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Catégorie</label>
                  <select
                    value={newServiceForm.categorie}
                    onChange={(e) => setNewServiceForm(prev => ({ ...prev, categorie: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="Restauration">Restauration</option>
                    <option value="Petit-déjeuner">Petit-déjeuner</option>
                    <option value="Blanchisserie">Blanchisserie</option>
                    <option value="Minibar">Minibar</option>
                    <option value="Transport">Transport / Navette</option>
                    <option value="Salle">Salle / Événement</option>
                    <option value="Autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Unité</label>
                  <input
                    type="text"
                    value={newServiceForm.unite}
                    onChange={(e) => setNewServiceForm(prev => ({ ...prev, unite: e.target.value }))}
                    placeholder="ex: Séancier, Heure, Pers."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tarif unitaire (FCFA) *</label>
                <input
                  type="number"
                  min="0"
                  step="500"
                  required
                  value={newServiceForm.prix}
                  onChange={(e) => setNewServiceForm(prev => ({ ...prev, prix: Number(e.target.value) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewServiceModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer Service</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default HotelServicesPage
