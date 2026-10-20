// =============================================================================
// GESTIO 229 — RÉCEPTION & SÉJOURS HÔTELIERS
// =============================================================================
// Gestion opérationnelle complète : Arrivées, Départs, Check-in, Check-out,
// Comptes de séjour (Folios), Acomptes, Facturation et Changement de chambre.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ConciergeBell, Users, BedDouble, Calendar, Check, X,
  Clock, DollarSign, Wallet, Smartphone, CreditCard, Landmark,
  AlertTriangle, CheckCircle2, ArrowRight, Printer, Plus,
  Search, RefreshCw, Sparkles, FileText, Coffee, Edit3, ArrowRightLeft
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import {
  HotelChambre,
  HotelSejour,
  HotelReservation,
  PrestationConsommee,
  fetchHotelChambres,
  fetchHotelSejours,
  fetchHotelReservations,
  executerCheckIn,
  executerCheckOut,
  changerChambreClient,
  ajusterDureeSejour,
  ajouterPrestationSejour,
  DEFAULT_HOTEL_SERVICES
} from '../../../services/hotelService'
import clsx from 'clsx'

export const HotelReceptionPage: React.FC = () => {
  const { companyId, company } = useTenant()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'sejours' | 'checkin' | 'departs' | 'historique'>('sejours')
  const [loading, setLoading] = useState<boolean>(true)
  const [processing, setProcessing] = useState<boolean>(false)

  // Données
  const [chambres, setChambres] = useState<HotelChambre[]>([])
  const [sejours, setSejours] = useState<HotelSejour[]>([])
  const [reservations, setReservations] = useState<HotelReservation[]>([])
  const [search, setSearch] = useState<string>('')

  // Modales d'actions
  const [selectedSejour, setSelectedSejour] = useState<HotelSejour | null>(null)
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false)
  const [showPrestationModal, setShowPrestationModal] = useState<boolean>(false)
  const [showChangementChambreModal, setShowChangementChambreModal] = useState<boolean>(false)
  const [showProlongationModal, setShowProlongationModal] = useState<boolean>(false)
  const [lastFacture, setLastFacture] = useState<any | null>(null)

  // Formulaire Check-in rapide
  const [checkInForm, setCheckInForm] = useState({
    clientNom: '',
    clientTelephone: '',
    clientPieceId: '',
    nationalite: 'Béninoise',
    chambreNumero: '',
    dateCheckIn: new Date().toISOString().slice(0, 10),
    dateCheckOutPrevue: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    nbNuits: 1,
    tarifNuit: 25000,
    acompteVerse: 0,
    modePaiementAcompte: 'CASH',
    reservationId: '',
    notes: '',
  })

  // Formulaire Check-out
  const [checkoutModeReglement, setCheckoutModeReglement] = useState<string>('CASH')
  const [checkoutMontantSaisi, setCheckoutMontantSaisi] = useState<string>('')

  // Formulaire Prestation
  const [prestationForm, setPrestationForm] = useState({
    serviceId: DEFAULT_HOTEL_SERVICES[0]?.id || '',
    serviceNom: DEFAULT_HOTEL_SERVICES[0]?.nom || '',
    categorie: DEFAULT_HOTEL_SERVICES[0]?.categorie || 'Restauration',
    quantite: 1,
    prixUnitaire: DEFAULT_HOTEL_SERVICES[0]?.prix || 3500,
    regleImmediatement: false,
    modeReglement: 'CASH',
  })

  // Formulaire Changement de chambre
  const [nouvelleChambreNumero, setNouvelleChambreNumero] = useState<string>('')
  const [motifChangement, setMotifChangement] = useState<string>('Surclassement ou convenance client')

  // Formulaire Prolongation
  const [nouvelleDateSortie, setNouvelleDateSortie] = useState<string>('')
  const [nouveauNbNuits, setNouveauNbNuits] = useState<number>(1)

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [chData, sejData, resData] = await Promise.all([
        fetchHotelChambres(companyId),
        fetchHotelSejours(companyId),
        fetchHotelReservations(companyId),
      ])
      setChambres(chData)
      setSejours(sejData)
      setReservations(resData)

      // Sélectionner la première chambre libre par défaut pour le check-in
      const premiereLibre = chData.find(c => c.statut === 'LIBRE')
      if (premiereLibre && !checkInForm.chambreNumero) {
        setCheckInForm(prev => ({
          ...prev,
          chambreNumero: premiereLibre.numero_chambre,
          tarifNuit: premiereLibre.tarif_nuit,
        }))
      }
    } catch (err) {
      console.warn('[HotelReception] Erreur chargement réception:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId, checkInForm.chambreNumero])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Séjours filtrés
  const sejoursActifs = useMemo(() => {
    return sejours.filter(s => s.statut === 'EN_COURS' && (
      !search ||
      s.client_nom.toLowerCase().includes(search.toLowerCase()) ||
      s.chambre_numero.toLowerCase().includes(search.toLowerCase()) ||
      (s.client_telephone && s.client_telephone.includes(search))
    ))
  }, [sejours, search])

  const sejoursHistorique = useMemo(() => {
    return sejours.filter(s => s.statut === 'CLOTURE' && (
      !search ||
      s.client_nom.toLowerCase().includes(search.toLowerCase()) ||
      s.chambre_numero.toLowerCase().includes(search.toLowerCase())
    ))
  }, [sejours, search])

  const arriveesEnAttente = useMemo(() => {
    return reservations.filter(r => r.statut === 'CONFIRMEE' && (
      !search ||
      r.client_nom.toLowerCase().includes(search.toLowerCase()) ||
      r.chambre_numero.toLowerCase().includes(search.toLowerCase())
    ))
  }, [reservations, search])

  // Recalcul automatique du nombre de nuits au check-in
  const handleDateChange = (type: 'in' | 'out', val: string) => {
    let newIn = type === 'in' ? val : checkInForm.dateCheckIn
    let newOut = type === 'out' ? val : checkInForm.dateCheckOutPrevue

    const tIn = new Date(newIn).getTime()
    const tOut = new Date(newOut).getTime()
    const nuits = Math.max(1, Math.round((tOut - tIn) / (1000 * 60 * 60 * 24)))

    setCheckInForm(prev => ({
      ...prev,
      dateCheckIn: newIn,
      dateCheckOutPrevue: newOut,
      nbNuits: nuits,
    }))
  }

  // Sélection d'une chambre au formulaire check-in
  const handleChambreSelect = (chNum: string) => {
    const target = chambres.find(c => c.numero_chambre === chNum)
    setCheckInForm(prev => ({
      ...prev,
      chambreNumero: chNum,
      tarifNuit: target ? target.tarif_nuit : prev.tarifNuit,
    }))
  }

  // Exécution du Check-in
  const handleValiderCheckIn = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!checkInForm.clientNom.trim()) {
      toast.error('Nom manquant', 'Veuillez saisir le nom complet du client.')
      return
    }
    if (!checkInForm.chambreNumero) {
      toast.error('Chambre manquante', 'Veuillez sélectionner une chambre disponible.')
      return
    }

    setProcessing(true)
    try {
      const res = await executerCheckIn(companyId || '', checkInForm)
      if (!res.success) {
        toast.error('Échec Check-in', res.error || 'La chambre n\'est pas disponible.')
        return
      }

      toast.success(
        'Check-in validé !',
        `Le client ${checkInForm.clientNom} a été installé en Chambre ${checkInForm.chambreNumero}.`
      )

      // Réinitialiser formulaire
      setCheckInForm(prev => ({
        ...prev,
        clientNom: '',
        clientTelephone: '',
        clientPieceId: '',
        acompteVerse: 0,
        reservationId: '',
        notes: '',
      }))

      await loadData()
      setActiveTab('sejours')
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Ouvrir modale de Check-out
  const handleOuvrirCheckout = (s: HotelSejour) => {
    setSelectedSejour(s)
    setCheckoutMontantSaisi(String(s.solde_restant))
    setShowCheckoutModal(true)
  }

  // Valider Check-out
  const handleValiderCheckout = async () => {
    if (!selectedSejour) return
    setProcessing(true)
    try {
      const montantPaye = parseFloat(checkoutMontantSaisi) || 0
      const res = await executerCheckOut(companyId || '', selectedSejour.id, {
        montantRegle: montantPaye,
        modeReglement: checkoutModeReglement,
      })

      if (!res.success) {
        toast.error('Erreur Check-out', res.error)
        return
      }

      setLastFacture(res.facture)
      setShowCheckoutModal(false)
      toast.success(
        'Séjour clôturé !',
        `Chambre ${selectedSejour.chambre_numero} libérée et transmise au Housekeeping pour nettoyage.`
      )

      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Valider Prestation
  const handleValiderPrestation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSejour) return

    setProcessing(true)
    try {
      const res = await ajouterPrestationSejour(companyId || '', selectedSejour.id, prestationForm)
      if (!res.success) {
        toast.error('Erreur', res.error)
        return
      }

      toast.success('Prestation ajoutée', `${prestationForm.serviceNom} ajouté au compte de séjour.`)
      setShowPrestationModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Valider Changement de chambre
  const handleValiderChangementChambre = async () => {
    if (!selectedSejour || !nouvelleChambreNumero) return
    setProcessing(true)
    try {
      const res = await changerChambreClient(companyId || '', selectedSejour.id, nouvelleChambreNumero, motifChangement)
      if (!res.success) {
        toast.error('Impossible de changer la chambre', res.error)
        return
      }

      toast.success('Chambre changée', `Le client a été transféré vers la Chambre ${nouvelleChambreNumero}.`)
      setShowChangementChambreModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Valider Prolongation
  const handleValiderProlongation = async () => {
    if (!selectedSejour || !nouvelleDateSortie) return
    setProcessing(true)
    try {
      const res = await ajusterDureeSejour(companyId || '', selectedSejour.id, nouvelleDateSortie, nouveauNbNuits)
      if (!res.success) {
        toast.error('Prolongation refusée', res.error)
        return
      }

      toast.success('Séjour prolongé', `Nouvelle date de départ : ${new Date(nouvelleDateSortie).toLocaleDateString('fr-FR')}.`)
      setShowProlongationModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  const chambresDisponibles = chambres.filter(c => c.statut === 'LIBRE')

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── EN-TÊTE RÉCEPTION ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black shadow-lg shadow-indigo-500/20">
            <ConciergeBell className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">
                Réception & Gestion des Séjours
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
                Front Desk
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Check-in • Check-out • Suivi des hébergés • Folios & Consommations
            </p>
          </div>
        </div>

        {/* Bouton Check-in Direct */}
        <button
          type="button"
          onClick={() => setActiveTab('checkin')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/25 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Nouveau Check-in</span>
        </button>
      </div>

      {/* ─── ONGLETS DE NAVIGATION RÉCEPTION ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('sejours')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2',
              activeTab === 'sejours'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span>En Séjour ({sejoursActifs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('checkin')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2',
              activeTab === 'checkin'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <ConciergeBell className="w-3.5 h-3.5" />
            <span>Arrivées & Check-in ({arriveesEnAttente.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('historique')}
            className={clsx(
              'px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2',
              activeTab === 'historique'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Historique Séjours</span>
          </button>
        </div>

        {/* Barre de recherche */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher client, chambre..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* ─── ONGLET 1 : SÉJOURS EN COURS (CLIENTS HÉBERGÉS) ─── */}
      {activeTab === 'sejours' && (
        <div className="space-y-4">
          {sejoursActifs.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/50 border border-dashed border-slate-800 rounded-3xl text-slate-500 text-xs space-y-2">
              <BedDouble className="w-8 h-8 mx-auto text-slate-600" />
              <p>Aucun client en séjour actuellement.</p>
              <button
                type="button"
                onClick={() => setActiveTab('checkin')}
                className="text-indigo-400 font-bold hover:underline"
              >
                Enregistrer un Check-in maintenant
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {sejoursActifs.map((s) => {
                const totalNuitees = s.montant_nuitees || 0
                const totalServices = s.montant_services || 0
                const solde = s.solde_restant || 0

                return (
                  <div
                    key={s.id}
                    className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition"
                  >
                    <div>
                      {/* En-tête carte chambre */}
                      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                        <div className="flex items-center gap-2.5">
                          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-mono font-black text-sm flex items-center justify-center">
                            {s.chambre_numero}
                          </div>
                          <div>
                            <span className="font-black text-sm text-white block">
                              Chambre {s.chambre_numero}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {formatFCFA(s.tarifNuit)} / nuit
                            </span>
                          </div>
                        </div>

                        <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                          Occupée
                        </span>
                      </div>

                      {/* Client & Dates */}
                      <div className="py-3 space-y-2 text-xs">
                        <div>
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Client</span>
                          <span className="font-bold text-white text-sm">{s.client_nom}</span>
                          {s.client_telephone && (
                            <span className="text-slate-400 text-[11px] block">{s.client_telephone}</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                          <div>
                            <span className="text-slate-500 block">Arrivée</span>
                            <span className="font-semibold text-slate-300">
                              {new Date(s.date_check_in).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Départ prévu</span>
                            <span className="font-semibold text-amber-300">
                              {new Date(s.date_check_out_prevue).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Compte de Séjour (Folio) */}
                      <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 space-y-1.5 text-xs">
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Nuitées ({s.nb_nuits} nuits) :</span>
                          <span className="font-mono text-slate-200">{formatFCFA(totalNuitees)}</span>
                        </div>
                        {totalServices > 0 && (
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>Services & Minibar ({s.prestations.length}) :</span>
                            <span className="font-mono text-slate-200">{formatFCFA(totalServices)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-slate-400 text-[11px]">
                          <span>Acomptes & Règlements :</span>
                          <span className="font-mono text-emerald-400">-{formatFCFA(s.montant_paye)}</span>
                        </div>
                        <div className="pt-1.5 border-t border-slate-800 flex justify-between font-black text-xs">
                          <span className="text-slate-300 uppercase">Solde dû :</span>
                          <span className={clsx('font-mono', solde > 0 ? 'text-amber-400' : 'text-emerald-400')}>
                            {formatFCFA(solde)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions sur le séjour */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSejour(s)
                            setShowPrestationModal(true)
                          }}
                          className="py-1.5 px-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1"
                          title="Ajouter une prestation (boisson, petit-déj, blanchisserie)"
                        >
                          <Coffee className="w-3 h-3 text-amber-400" />
                          <span>Prestation</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSejour(s)
                            setNouvelleChambreNumero('')
                            setShowChangementChambreModal(true)
                          }}
                          className="py-1.5 px-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1"
                          title="Changer de chambre en conservant le compte"
                        >
                          <ArrowRightLeft className="w-3 h-3 text-blue-400" />
                          <span>Changer</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSejour(s)
                            setNouvelleDateSortie(s.date_check_out_prevue)
                            setNouveauNbNuits(s.nb_nuits)
                            setShowProlongationModal(true)
                          }}
                          className="py-1.5 px-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-bold transition flex items-center justify-center gap-1"
                          title="Prolonger ou ajuster le séjour"
                        >
                          <Calendar className="w-3 h-3 text-emerald-400" />
                          <span>Prolonger</span>
                        </button>
                      </div>

                      {/* Bouton Check-out */}
                      <button
                        type="button"
                        onClick={() => handleOuvrirCheckout(s)}
                        className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Check-out & Clôture</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── ONGLET 2 : ARRIVÉES ATTENDUES & FORMULAIRE CHECK-IN ─── */}
      {activeTab === 'checkin' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Formulaire de Check-in (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <ConciergeBell className="w-5 h-5 text-indigo-400" />
                Formulaire d'Arrivée & Check-in
              </h2>
              <span className="text-xs text-slate-400">
                {chambresDisponibles.length} chambre{chambresDisponibles.length > 1 ? 's' : ''} libre{chambresDisponibles.length > 1 ? 's' : ''}
              </span>
            </div>

            <form onSubmit={handleValiderCheckIn} className="space-y-4">
              {/* Client & Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Nom et Prénom du client *
                  </label>
                  <input
                    type="text"
                    required
                    value={checkInForm.clientNom}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, clientNom: e.target.value }))}
                    placeholder="ex: Jean DUPONT"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Téléphone (WhatsApp / Appel)
                  </label>
                  <input
                    type="tel"
                    value={checkInForm.clientTelephone}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, clientTelephone: e.target.value }))}
                    placeholder="+229 97 00 00 00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Pièce d'Identité / Passeport N°
                  </label>
                  <input
                    type="text"
                    value={checkInForm.clientPieceId}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, clientPieceId: e.target.value }))}
                    placeholder="CIP / CNI / Passeport"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Nationalité
                  </label>
                  <input
                    type="text"
                    value={checkInForm.nationalite}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, nationalite: e.target.value }))}
                    placeholder="Béninoise, Française, etc."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Chambre & Tarifs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Chambre disponible *
                  </label>
                  <select
                    value={checkInForm.chambreNumero}
                    onChange={(e) => handleChambreSelect(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Sélectionner une chambre libre</option>
                    {chambresDisponibles.map(c => (
                      <option key={c.id} value={c.numero_chambre}>
                        Ch. {c.numero_chambre} — {c.type_chambre} ({formatFCFA(c.tarif_nuit)}/nuit)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Tarif par nuit appliqué (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={checkInForm.tarifNuit}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, tarifNuit: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Dates & Nuits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Date d'arrivée
                  </label>
                  <input
                    type="date"
                    value={checkInForm.dateCheckIn}
                    onChange={(e) => handleDateChange('in', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Date de départ prévue
                  </label>
                  <input
                    type="date"
                    value={checkInForm.dateCheckOutPrevue}
                    onChange={(e) => handleDateChange('out', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Nombre de nuits
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={checkInForm.nbNuits}
                    readOnly
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-indigo-400 font-bold font-mono"
                  />
                </div>
              </div>

              {/* Acompte & Paiement */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Acompte versé à l'arrivée (FCFA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={checkInForm.acompteVerse}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, acompteVerse: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Mode de règlement acompte
                  </label>
                  <select
                    value={checkInForm.modePaiementAcompte}
                    onChange={(e) => setCheckInForm(prev => ({ ...prev, modePaiementAcompte: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CASH">Espèces</option>
                    <option value="MOMO">Mobile Money (MoMo / Moov)</option>
                    <option value="CARD">Carte Bancaire</option>
                    <option value="TRANSFER">Virement Bancaire</option>
                  </select>
                </div>
              </div>

              {/* Récapitulatif du séjour */}
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Montant Total Nuitées</span>
                  <span className="text-xl font-black font-mono text-emerald-400">
                    {formatFCFA(checkInForm.nbNuits * checkInForm.tarifNuit)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Reste à régler au Check-out</span>
                  <span className="text-sm font-black font-mono text-amber-400">
                    {formatFCFA(Math.max(0, (checkInForm.nbNuits * checkInForm.tarifNuit) - checkInForm.acompteVerse))}
                  </span>
                </div>
              </div>

              {/* Bouton Validation */}
              <button
                type="submit"
                disabled={processing || !checkInForm.clientNom || !checkInForm.chambreNumero}
                className={clsx(
                  'w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition shadow-xl',
                  processing || !checkInForm.clientNom || !checkInForm.chambreNumero
                    ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/25'
                )}
              >
                {processing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Enregistrement en cours...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Confirmer le Check-in & Installer le Client</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Liste des Réservations Confirmées en attente (5 cols) */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              Réservations en attente d'arrivée ({arriveesEnAttente.length})
            </h2>

            {arriveesEnAttente.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                Aucune réservation confirmée en attente.
              </div>
            ) : (
              <div className="space-y-3">
                {arriveesEnAttente.map((r) => (
                  <div
                    key={r.id}
                    className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2 text-xs"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-bold text-white text-sm block">{r.client_nom}</span>
                        <span className="text-slate-400 text-[11px]">Chambre {r.chambre_numero} • {r.nb_nuits} nuits</span>
                      </div>
                      <span className="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {r.numero_reservation}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                      <span>Du {new Date(r.date_arrivee).toLocaleDateString('fr-FR')} au {new Date(r.date_depart).toLocaleDateString('fr-FR')}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setCheckInForm(prev => ({
                            ...prev,
                            clientNom: r.client_nom,
                            clientTelephone: r.client_telephone || '',
                            chambreNumero: r.chambre_numero,
                            dateCheckIn: r.date_arrivee,
                            dateCheckOutPrevue: r.date_depart,
                            nbNuits: r.nb_nuits,
                            tarifNuit: r.tarif_nuit,
                            acompteVerse: r.acompte_verse,
                            reservationId: r.id,
                          }))
                        }}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-[11px] transition"
                      >
                        Charger dans formulaire
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── ONGLET 3 : HISTORIQUE DES SÉJOURS & MAINS COURANTES ─── */}
      {activeTab === 'historique' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            Mains Courantes & Historique des Séjours Clôturés ({sejoursHistorique.length})
          </h2>

          {sejoursHistorique.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
              Aucun séjour clôturé dans l'historique.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                    <th className="py-3 px-3">Chambre</th>
                    <th className="py-3 px-3">Client</th>
                    <th className="py-3 px-3">Période</th>
                    <th className="py-3 px-3">Nuitées</th>
                    <th className="py-3 px-3">Prestations</th>
                    <th className="py-3 px-3">Total Facturé</th>
                    <th className="py-3 px-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {sejoursHistorique.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-indigo-400">Ch. {s.chambre_numero}</td>
                      <td className="py-3 px-3 font-bold text-white">{s.client_nom}</td>
                      <td className="py-3 px-3 text-slate-400">
                        {new Date(s.date_check_in).toLocaleDateString('fr-FR')} $\rightarrow$ {new Date(s.date_check_out_prevue).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 px-3 font-mono">{formatFCFA(s.montant_nuitees)}</td>
                      <td className="py-3 px-3 font-mono">{formatFCFA(s.montant_services)}</td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-400">{formatFCFA(s.total_facture)}</td>
                      <td className="py-3 px-3">
                        <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                          Clôturé
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

      {/* ─── MODALE 1 : CHECK-OUT & FACTURATION DU SÉJOUR ─── */}
      {showCheckoutModal && selectedSejour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowCheckoutModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  Clôture de Séjour & Check-out
                </h3>
                <p className="text-xs text-slate-400">
                  Chambre {selectedSejour.chambre_numero} • {selectedSejour.client_nom}
                </p>
              </div>
            </div>

            {/* Récapitulatif Folio */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Nuitées ({selectedSejour.nb_nuits} nuits) :</span>
                <span className="font-mono text-white">{formatFCFA(selectedSejour.montant_nuitees)}</span>
              </div>
              {selectedSejour.prestations.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Prestations & Consommations ({selectedSejour.prestations.length}) :</span>
                  <span className="font-mono text-white">{formatFCFA(selectedSejour.montant_services)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>Total Facturé :</span>
                <span className="font-mono text-white font-bold">{formatFCFA(selectedSejour.total_facture)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Acomptes / Paiements reçus :</span>
                <span className="font-mono text-emerald-400">-{formatFCFA(selectedSejour.montant_paye)}</span>
              </div>
              <div className="border-t border-slate-800 pt-2 flex justify-between font-black text-sm">
                <span className="text-slate-200">SOLDE NET RESTANT DÛ :</span>
                <span className="text-amber-400 font-mono">{formatFCFA(selectedSejour.solde_restant)}</span>
              </div>
            </div>

            {/* Saisie du règlement final */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Montant encaissé au départ (FCFA)
                </label>
                <input
                  type="number"
                  min="0"
                  value={checkoutMontantSaisi}
                  onChange={(e) => setCheckoutMontantSaisi(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-base font-black font-mono text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Mode de règlement
                </label>
                <select
                  value={checkoutModeReglement}
                  onChange={(e) => setCheckoutModeReglement(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="CASH">Espèces</option>
                  <option value="MOMO">Mobile Money (MoMo / Moov)</option>
                  <option value="CARD">Carte Bancaire</option>
                  <option value="TRANSFER">Virement Bancaire</option>
                  <option value="CREDIT">Crédit Accordé (Paiement ultérieur)</option>
                </select>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  À la validation du check-out, la Chambre {selectedSejour.chambre_numero} passera automatiquement à l'état <strong>À NETTOYER</strong> et sera confiée au Housekeeping.
                </span>
              </div>
            </div>

            {/* Boutons d'actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
              >
                Annuler
              </button>

              <button
                type="button"
                disabled={processing}
                onClick={handleValiderCheckout}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black transition shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2"
              >
                {processing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                <span>Confirmer Check-out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALE 2 : AJOUT DE PRESTATION / SERVICE AU COMPTE ─── */}
      {showPrestationModal && selectedSejour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowPrestationModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                <Coffee className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">
                  Ajout Prestation / Consommation
                </h3>
                <p className="text-xs text-slate-400">
                  Chambre {selectedSejour.chambre_numero} • {selectedSejour.client_nom}
                </p>
              </div>
            </div>

            <form onSubmit={handleValiderPrestation} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Service / Article
                </label>
                <select
                  value={prestationForm.serviceId}
                  onChange={(e) => {
                    const sel = DEFAULT_HOTEL_SERVICES.find(s => s.id === e.target.value)
                    if (sel) {
                      setPrestationForm(prev => ({
                        ...prev,
                        serviceId: sel.id,
                        serviceNom: sel.nom,
                        categorie: sel.categorie,
                        prixUnitaire: sel.prix,
                      }))
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  {DEFAULT_HOTEL_SERVICES.map(s => (
                    <option key={s.id} value={s.id}>
                      [{s.categorie}] {s.nom} ({formatFCFA(s.prix)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Quantité
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={prestationForm.quantite}
                    onChange={(e) => setPrestationForm(prev => ({ ...prev, quantite: Math.max(1, Number(e.target.value) || 1) }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Prix Total
                  </label>
                  <div className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-xs text-emerald-400 font-mono font-black">
                    {formatFCFA(prestationForm.quantite * prestationForm.prixUnitaire)}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={prestationForm.regleImmediatement}
                    onChange={(e) => setPrestationForm(prev => ({ ...prev, regleImmediatement: e.target.checked }))}
                    className="rounded bg-slate-950 border-slate-800 text-indigo-600 focus:ring-0"
                  />
                  <span>Règlement immédiat au comptoir (Espèces/MoMo)</span>
                </label>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPrestationModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Ajouter au Folio</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE 3 : CHANGEMENT DE CHAMBRE ─── */}
      {showChangementChambreModal && selectedSejour && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowChangementChambreModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-400" />
              Changement de Chambre
            </h3>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs space-y-1">
              <div>Chambre actuelle : <strong className="text-white">Ch. {selectedSejour.chambre_numero}</strong></div>
              <div>Client : <strong className="text-white">{selectedSejour.client_nom}</strong></div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Nouvelle Chambre disponible
                </label>
                <select
                  value={nouvelleChambreNumero}
                  onChange={(e) => setNouvelleChambreNumero(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">Sélectionner une chambre libre</option>
                  {chambresDisponibles.map(c => (
                    <option key={c.id} value={c.numero_chambre}>
                      Ch. {c.numero_chambre} — {c.type_chambre} ({formatFCFA(c.tarif_nuit)}/nuit)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Motif du changement
                </label>
                <input
                  type="text"
                  value={motifChangement}
                  onChange={(e) => setMotifChangement(e.target.value)}
                  placeholder="ex: Problème climatisation, surclassement, demande client"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="text-[11px] text-slate-400 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                L'ancienne Chambre {selectedSejour.chambre_numero} passera à <strong>À NETTOYER</strong> et l'ensemble des montants facturés sera conservé.
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowChangementChambreModal(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
              >
                Annuler
              </button>

              <button
                type="button"
                disabled={processing || !nouvelleChambreNumero}
                onClick={handleValiderChangementChambre}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Transférer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALE 4 : FACTURE REÇU DE SÉJOUR IMPRIMABLE ─── */}
      {lastFacture && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setLastFacture(null)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Facture format Ticket Hôtel */}
            <div id="hotel-invoice-print" className="bg-white text-slate-950 rounded-2xl p-5 shadow-inner font-mono text-xs space-y-3">
              <div className="text-center border-b border-dashed border-slate-300 pb-3">
                <div className="font-black text-sm uppercase tracking-wide text-slate-900">
                  {company?.name || 'HÔTEL & RÉSIDENCE GESTIO229'}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  REÇU / FACTURE DÉTAILLÉE DE SÉJOUR
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  N° {lastFacture.numero} • {lastFacture.date} à {lastFacture.heure}
                </div>
              </div>

              <div className="space-y-1 py-1 border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Client :</span>
                  <span className="font-bold">{lastFacture.clientNom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Chambre :</span>
                  <span className="font-bold">Ch. {lastFacture.chambreNumero}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Période :</span>
                  <span>{lastFacture.nbNuits} nuit(s) ({lastFacture.dateArrivee} $\rightarrow$ {lastFacture.dateDepart})</span>
                </div>
              </div>

              {/* Lignes facturées */}
              <div className="space-y-1 py-2 border-b border-dashed border-slate-300">
                <div className="flex justify-between text-slate-800">
                  <span>Hébergement ({lastFacture.nbNuits} nuits) :</span>
                  <span className="font-bold">{formatFCFA(lastFacture.montantNuitees)}</span>
                </div>
                {lastFacture.prestations && lastFacture.prestations.length > 0 && (
                  <div className="flex justify-between text-slate-800">
                    <span>Prestations annexes :</span>
                    <span className="font-bold">{formatFCFA(lastFacture.montantServices)}</span>
                  </div>
                )}
              </div>

              {/* Total & Solde */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-sm font-black">
                  <span>TOTAL SÉJOUR :</span>
                  <span className="text-slate-950">{formatFCFA(lastFacture.totalTTC)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-emerald-700 font-bold">
                  <span>Total Payé :</span>
                  <span>{formatFCFA(lastFacture.totalPaye)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Solde restant dû :</span>
                  <span>{formatFCFA(lastFacture.soldeRestant)}</span>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Règlement final par :</span>
                  <span>{lastFacture.modeReglement}</span>
                </div>
              </div>

              <div className="text-center pt-2 text-[10px] text-slate-500 border-t border-dashed border-slate-300">
                Nous vous remercions de votre fidélité et vous souhaitons un agréable voyage !
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <Printer className="w-4 h-4" />
                Imprimer Facture
              </button>

              <button
                type="button"
                onClick={() => setLastFacture(null)}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HotelReceptionPage
