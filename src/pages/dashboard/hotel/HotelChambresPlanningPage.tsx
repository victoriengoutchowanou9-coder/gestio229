// =============================================================================
// GESTIO 229 — GESTION DES CHAMBRES, TARIFS & PLANNING DE RÉSERVATION
// =============================================================================
// Plan des chambres, catégories, équipements, tarifs et calendrier d'occupation.
// Prévention stricte des doubles réservations et conflits de dates.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  BedDouble, Plus, Calendar, Check, X, Search, RefreshCw,
  Users, DollarSign, Wifi, Tv, Wind, Coffee, Sparkles, Wrench,
  AlertTriangle, Filter, ChevronLeft, ChevronRight, Edit3
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import {
  HotelChambre,
  HotelReservation,
  fetchHotelChambres,
  fetchHotelReservations,
  saveHotelChambre,
  creerReservation,
  verifierDisponibiliteChambre
} from '../../../services/hotelService'
import clsx from 'clsx'

export const HotelChambresPlanningPage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [chambres, setChambres] = useState<HotelChambre[]>([])
  const [reservations, setReservations] = useState<HotelReservation[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [processing, setProcessing] = useState<boolean>(false)

  // Filtres
  const [search, setSearch] = useState<string>('')
  const [statutFilter, setStatutFilter] = useState<string>('TOUS')
  const [typeFilter, setTypeFilter] = useState<string>('TOUS')
  const [viewMode, setViewMode] = useState<'grille' | 'planning'>('grille')

  // Modales
  const [showChambreModal, setShowChambreModal] = useState<boolean>(false)
  const [showReservationModal, setShowReservationModal] = useState<boolean>(false)
  const [editingChambre, setEditingChambre] = useState<HotelChambre | null>(null)

  // Formulaire Chambre
  const [chambreForm, setChambreForm] = useState({
    numero_chambre: '',
    type_chambre: 'Standard' as HotelChambre['type_chambre'],
    etage: 1,
    tarif_nuit: 25000,
    capacite: 2,
    equipements: ['Climatisation', 'Wifi', 'TV HD'],
    statut: 'LIBRE' as HotelChambre['statut'],
    notes: '',
  })

  // Formulaire Réservation
  const [resForm, setResForm] = useState({
    chambre_numero: '',
    client_nom: '',
    client_telephone: '',
    client_email: '',
    date_arrivee: new Date().toISOString().slice(0, 10),
    date_depart: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    nb_nuits: 1,
    tarif_nuit: 25000,
    acompte_verse: 0,
    mode_acompte: 'CASH',
    notes: '',
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [chData, resData] = await Promise.all([
        fetchHotelChambres(companyId),
        fetchHotelReservations(companyId),
      ])
      setChambres(chData)
      setReservations(resData)
    } catch (err) {
      console.warn('[HotelChambres] Erreur chargement chambres:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtrage des chambres
  const filteredChambres = useMemo(() => {
    return chambres.filter(c => {
      if (search && !c.numero_chambre.includes(search) && !c.type_chambre.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      if (statutFilter !== 'TOUS' && c.statut !== statutFilter) {
        return false
      }
      if (typeFilter !== 'TOUS' && c.type_chambre !== typeFilter) {
        return false
      }
      return true
    })
  }, [chambres, search, statutFilter, typeFilter])

  // Ouvrir modale ajout/édition chambre
  const handleOpenChambreModal = (c?: HotelChambre) => {
    if (c) {
      setEditingChambre(c)
      setChambreForm({
        numero_chambre: c.numero_chambre,
        type_chambre: c.type_chambre,
        etage: c.etage,
        tarif_nuit: c.tarif_nuit,
        capacite: c.capacite || 2,
        equipements: c.equipements || ['Climatisation', 'Wifi'],
        statut: c.statut,
        notes: c.notes || '',
      })
    } else {
      setEditingChambre(null)
      setChambreForm({
        numero_chambre: String(100 + chambres.length + 1),
        type_chambre: 'Standard',
        etage: 1,
        tarif_nuit: 25000,
        capacite: 2,
        equipements: ['Climatisation', 'Wifi', 'TV HD'],
        statut: 'LIBRE',
        notes: '',
      })
    }
    setShowChambreModal(true)
  }

  // Sauvegarder chambre
  const handleSaveChambre = async (e: React.FormEvent) => {
    e.preventDefault()
    setProcessing(true)
    try {
      await saveHotelChambre(companyId || '', {
        id: editingChambre ? editingChambre.id : undefined,
        ...chambreForm,
      })

      toast.success(
        editingChambre ? 'Chambre modifiée' : 'Chambre ajoutée',
        `La chambre ${chambreForm.numero_chambre} a été enregistrée avec succès.`
      )

      setShowChambreModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Ouvrir modale réservation pour une chambre spécifique
  const handleOpenReservationModal = (c: HotelChambre) => {
    setResForm({
      chambre_numero: c.numero_chambre,
      client_nom: '',
      client_telephone: '',
      client_email: '',
      date_arrivee: new Date().toISOString().slice(0, 10),
      date_depart: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      nb_nuits: 1,
      tarif_nuit: c.tarif_nuit,
      acompte_verse: 0,
      mode_acompte: 'CASH',
      notes: '',
    })
    setShowReservationModal(true)
  }

  // Recalcul automatique des nuits pour réservation
  const handleResDateChange = (type: 'in' | 'out', val: string) => {
    let newIn = type === 'in' ? val : resForm.date_arrivee
    let newOut = type === 'out' ? val : resForm.date_depart

    const tIn = new Date(newIn).getTime()
    const tOut = new Date(newOut).getTime()
    const nuits = Math.max(1, Math.round((tOut - tIn) / (1000 * 60 * 60 * 24)))

    setResForm(prev => ({
      ...prev,
      date_arrivee: newIn,
      date_depart: newOut,
      nb_nuits: nuits,
    }))
  }

  // Sauvegarder réservation
  const handleSaveReservation = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resForm.client_nom.trim()) {
      toast.error('Nom requis', 'Veuillez saisir le nom du client.')
      return
    }

    setProcessing(true)
    try {
      const targetChambre = chambres.find(c => c.numero_chambre === resForm.chambre_numero)
      const res = await creerReservation(companyId || '', {
        chambre_id: targetChambre?.id || `ch-${resForm.chambre_numero}`,
        chambre_numero: resForm.chambre_numero,
        client_nom: resForm.client_nom,
        client_telephone: resForm.client_telephone,
        client_email: resForm.client_email,
        date_arrivee: resForm.date_arrivee,
        date_depart: resForm.date_depart,
        nb_nuits: resForm.nb_nuits,
        tarif_nuit: resForm.tarif_nuit,
        total_estime: resForm.nb_nuits * resForm.tarif_nuit,
        acompte_verse: resForm.acompte_verse,
        mode_acompte: resForm.mode_acompte,
        notes: resForm.notes,
      })

      if (!res.success) {
        toast.error('Réservation refusée', res.error)
        return
      }

      toast.success(
        'Réservation confirmée !',
        `Réservation N° ${res.reservation?.numero_reservation} enregistrée pour ${resForm.client_nom}.`
      )

      setShowReservationModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Statuts & styles
  const getStatutBadge = (statut: HotelChambre['statut']) => {
    switch (statut) {
      case 'LIBRE':
        return { label: 'Libre', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' }
      case 'OCCUPEE':
        return { label: 'Occupée', class: 'bg-rose-500/10 text-rose-400 border-rose-500/30' }
      case 'A_NETTOYER':
        return { label: 'À Nettoyer', class: 'bg-amber-500/10 text-amber-400 border-amber-500/30' }
      case 'EN_COURS_NETTOYAGE':
        return { label: 'Ménage en cours', class: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' }
      case 'MAINTENANCE':
        return { label: 'Maintenance', class: 'bg-orange-500/10 text-orange-400 border-orange-500/30' }
      case 'RESERVEE':
        return { label: 'Réservée', class: 'bg-blue-500/10 text-blue-400 border-blue-500/30' }
      default:
        return { label: statut, class: 'bg-slate-800 text-slate-300 border-slate-700' }
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── EN-TÊTE MODULE ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-black shadow-lg shadow-indigo-500/20">
            <BedDouble className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">
                Chambres, Tarifs & Réservations
              </h1>
              <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-indigo-500/30">
                {chambres.length} Chambres
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Plan des chambres • Tarifs nuitées • Calendrier des réservations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleOpenChambreModal()}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black shadow-lg shadow-indigo-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Ajouter une Chambre</span>
          </button>
        </div>
      </div>

      {/* ─── FILTRES ET RECHERCHE ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          {/* Recherche */}
          <div className="relative w-48 sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="N° ou type de chambre..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Filtre Statut */}
          <select
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="TOUS">Tous les statuts</option>
            <option value="LIBRE">Libre</option>
            <option value="OCCUPEE">Occupée</option>
            <option value="A_NETTOYER">À Nettoyer</option>
            <option value="EN_COURS_NETTOYAGE">Ménage en cours</option>
            <option value="MAINTENANCE">Maintenance</option>
            <option value="RESERVEE">Réservée</option>
          </select>

          {/* Filtre Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="TOUS">Toutes catégories</option>
            <option value="Standard">Standard</option>
            <option value="Supérieure">Supérieure</option>
            <option value="Suite VIP">Suite VIP</option>
            <option value="Familiale">Familiale</option>
            <option value="Appartement">Appartement</option>
          </select>
        </div>

        {/* Boutons Basculement Grille / Planning */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setViewMode('grille')}
            className={clsx(
              'px-3 py-1 rounded-lg font-bold transition',
              viewMode === 'grille' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            )}
          >
            Grille des Chambres
          </button>
          <button
            type="button"
            onClick={() => setViewMode('planning')}
            className={clsx(
              'px-3 py-1 rounded-lg font-bold transition',
              viewMode === 'planning' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
            )}
          >
            Calendrier Réservations
          </button>
        </div>
      </div>

      {/* ─── MODE 1 : GRILLE VISUELLE DES CHAMBRES ─── */}
      {viewMode === 'grille' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredChambres.map((c) => {
            const badge = getStatutBadge(c.statut)
            const isLibre = c.statut === 'LIBRE'

            return (
              <div
                key={c.id}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-5 shadow-sm space-y-4 flex flex-col justify-between transition group"
              >
                <div>
                  {/* Carte Chambre Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black font-mono text-white">
                          Ch. {c.numero_chambre}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          (Étage {c.etage})
                        </span>
                      </div>
                      <span className="text-xs text-indigo-400 font-bold block mt-0.5">
                        {c.type_chambre}
                      </span>
                    </div>

                    <span className={clsx('text-[10px] font-bold px-2.5 py-0.5 rounded-full border', badge.class)}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Tarif & Capacité */}
                  <div className="mt-3 py-2 border-y border-slate-800/80 flex items-baseline justify-between">
                    <div>
                      <span className="text-base font-black font-mono text-emerald-400">
                        {formatFCFA(c.tarif_nuit)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-normal"> / nuit</span>
                    </div>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-slate-500" />
                      {c.capacite || 2} pers.
                    </span>
                  </div>

                  {/* Équipements */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(c.equipements || []).map((eq, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-slate-950 text-slate-300 px-2 py-0.5 rounded-lg border border-slate-800"
                      >
                        {eq}
                      </span>
                    ))}
                  </div>

                  {/* Client actuel si occupée */}
                  {c.client_actuel && (
                    <div className="mt-3 p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Occupant</span>
                      <span className="font-bold text-white truncate block">{c.client_actuel}</span>
                      {c.date_sortie_prevue && (
                        <span className="text-[10px] text-amber-400 font-mono block">
                          Jusqu'au {new Date(c.date_sortie_prevue).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions sur la chambre */}
                <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                  {isLibre && (
                    <button
                      type="button"
                      onClick={() => handleOpenReservationModal(c)}
                      className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Réserver</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenChambreModal(c)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
                    title="Modifier la chambre ou son tarif"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── MODE 2 : CALENDRIER / PLANNING DES RÉSERVATIONS ─── */}
      {viewMode === 'planning' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              Toutes les Réservations Enregistrées ({reservations.length})
            </h2>
          </div>

          {reservations.length === 0 ? (
            <div className="p-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
              Aucune réservation enregistrée pour le moment.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                    <th className="py-3 px-3">N° Réservation</th>
                    <th className="py-3 px-3">Chambre</th>
                    <th className="py-3 px-3">Client</th>
                    <th className="py-3 px-3">Arrivée</th>
                    <th className="py-3 px-3">Départ</th>
                    <th className="py-3 px-3">Nuits</th>
                    <th className="py-3 px-3">Montant Estimé</th>
                    <th className="py-3 px-3">Acompte</th>
                    <th className="py-3 px-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {reservations.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-3 font-mono font-bold text-indigo-400">{r.numero_reservation}</td>
                      <td className="py-3 px-3 font-mono font-bold text-white">Ch. {r.chambre_numero}</td>
                      <td className="py-3 px-3 font-bold text-slate-200">
                        {r.client_nom}
                        {r.client_telephone && (
                          <span className="block text-[10px] text-slate-500 font-normal">{r.client_telephone}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-mono">
                        {new Date(r.date_arrivee).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 px-3 text-slate-300 font-mono">
                        {new Date(r.date_depart).toLocaleDateString('fr-FR')}
                      </td>
                      <td className="py-3 px-3 font-mono text-center">{r.nb_nuits}</td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                        {formatFCFA(r.total_estime)}
                      </td>
                      <td className="py-3 px-3 font-mono text-amber-400">
                        {formatFCFA(r.acompte_verse)}
                      </td>
                      <td className="py-3 px-3">
                        <span className={clsx(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                          r.statut === 'CONFIRMEE' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                          r.statut === 'CHECKED_IN' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          r.statut === 'CHECKED_OUT' ? 'bg-slate-800 text-slate-400 border-slate-700' :
                          'bg-rose-500/10 text-rose-400 border-rose-500/30'
                        )}>
                          {r.statut}
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

      {/* ─── MODALE : CRÉATION / MODIFICATION DE CHAMBRE ─── */}
      {showChambreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowChambreModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <BedDouble className="w-5 h-5 text-indigo-400" />
              {editingChambre ? `Modifier Chambre ${editingChambre.numero_chambre}` : 'Ajouter une Chambre'}
            </h3>

            <form onSubmit={handleSaveChambre} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Numéro Chambre *</label>
                  <input
                    type="text"
                    required
                    value={chambreForm.numero_chambre}
                    onChange={(e) => setChambreForm(prev => ({ ...prev, numero_chambre: e.target.value }))}
                    placeholder="ex: 101"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Étage</label>
                  <input
                    type="number"
                    min="0"
                    value={chambreForm.etage}
                    onChange={(e) => setChambreForm(prev => ({ ...prev, etage: Number(e.target.value) || 1 }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Catégorie *</label>
                  <select
                    value={chambreForm.type_chambre}
                    onChange={(e) => setChambreForm(prev => ({ ...prev, type_chambre: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Standard">Standard</option>
                    <option value="Supérieure">Supérieure</option>
                    <option value="Suite VIP">Suite VIP</option>
                    <option value="Familiale">Familiale</option>
                    <option value="Appartement">Appartement</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Capacité (personnes)</label>
                  <input
                    type="number"
                    min="1"
                    value={chambreForm.capacite}
                    onChange={(e) => setChambreForm(prev => ({ ...prev, capacite: Number(e.target.value) || 2 }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tarif par nuitée (FCFA) *</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  required
                  value={chambreForm.tarif_nuit}
                  onChange={(e) => setChambreForm(prev => ({ ...prev, tarif_nuit: Number(e.target.value) || 0 }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-emerald-400 font-mono font-black focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowChambreModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE : PRISE DE RÉSERVATION AVEC VÉRIFICATION CONFLIT ─── */}
      {showReservationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowReservationModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              Réservation — Chambre {resForm.chambre_numero}
            </h3>

            <form onSubmit={handleSaveReservation} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Nom du client *</label>
                <input
                  type="text"
                  required
                  value={resForm.client_nom}
                  onChange={(e) => setResForm(prev => ({ ...prev, client_nom: e.target.value }))}
                  placeholder="ex: Patrick KOFFI"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Téléphone client</label>
                <input
                  type="tel"
                  value={resForm.client_telephone}
                  onChange={(e) => setResForm(prev => ({ ...prev, client_telephone: e.target.value }))}
                  placeholder="+229 97 00 00 00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Date d'arrivée</label>
                  <input
                    type="date"
                    required
                    value={resForm.date_arrivee}
                    onChange={(e) => handleResDateChange('in', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Date de départ</label>
                  <input
                    type="date"
                    required
                    value={resForm.date_depart}
                    onChange={(e) => handleResDateChange('out', e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Acompte versé (FCFA)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={resForm.acompte_verse}
                    onChange={(e) => setResForm(prev => ({ ...prev, acompte_verse: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Mode acompte</label>
                  <select
                    value={resForm.mode_acompte}
                    onChange={(e) => setResForm(prev => ({ ...prev, mode_acompte: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="CASH">Espèces</option>
                    <option value="MOMO">Mobile Money</option>
                    <option value="CARD">Carte Bancaire</option>
                  </select>
                </div>
              </div>

              {/* Total calculé */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                <span className="text-slate-400">Total estimé ({resForm.nb_nuits} nuits) :</span>
                <span className="font-mono font-bold text-emerald-400">
                  {formatFCFA(resForm.nb_nuits * resForm.tarif_nuit)}
                </span>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowReservationModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmer Réservation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default HotelChambresPlanningPage
