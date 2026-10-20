// =============================================================================
// GESTIO 229 — MODULE MAINTENANCE & ÉQUIPEMENTS HÔTELIERS
// =============================================================================
// Suivi des pannes, interventions techniques, blocage des chambres hors service
// et validation de remise en disponibilité.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Wrench, Check, Clock, AlertTriangle, ShieldAlert, RefreshCw,
  Plus, CheckCircle2, X, Search, BedDouble, Hammer, DollarSign
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import {
  HotelMaintenanceTicket,
  HotelChambre,
  fetchMaintenanceTickets,
  declarerPanneMaintenance,
  resoudrePanneMaintenance,
  fetchHotelChambres
} from '../../../services/hotelService'
import clsx from 'clsx'

export const HotelMaintenancePage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [tickets, setTickets] = useState<HotelMaintenanceTicket[]>([])
  const [chambres, setChambres] = useState<HotelChambre[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [processing, setProcessing] = useState<boolean>(false)

  // Filtres
  const [statutFilter, setStatutFilter] = useState<string>('TOUS')
  const [search, setSearch] = useState<string>('')

  // Modale déclaration incident
  const [showDeclareModal, setShowDeclareModal] = useState<boolean>(false)
  const [ticketForm, setTicketForm] = useState({
    chambre_numero: '',
    equipement: 'Climatiseur',
    description: '',
    urgence: 'URGENTE' as HotelMaintenanceTicket['urgence'],
    technicien: 'Technicien Interne',
    cout_estime: 0,
  })

  // Modale résolution
  const [selectedTicket, setSelectedTicket] = useState<HotelMaintenanceTicket | null>(null)
  const [showResolveModal, setShowResolveModal] = useState<boolean>(false)
  const [resolutionNote, setResolutionNote] = useState<string>('Pièce remplacée et testée avec succès.')

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [tData, chData] = await Promise.all([
        fetchMaintenanceTickets(companyId),
        fetchHotelChambres(companyId),
      ])
      setTickets(tData)
      setChambres(chData)
    } catch (err) {
      console.warn('[HotelMaintenance] Erreur chargement maintenance:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      if (statutFilter !== 'TOUS' && t.statut !== statutFilter) return false
      if (search && !t.chambre_numero.includes(search) && !t.equipement.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [tickets, statutFilter, search])

  // Compteurs
  const countSignale = tickets.filter(t => t.statut === 'SIGNALE').length
  const countEnCours = tickets.filter(t => t.statut === 'EN_COURS').length
  const countResolu = tickets.filter(t => t.statut === 'RESOLU').length

  // Déclaration de panne
  const handleDeclarerPanne = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ticketForm.chambre_numero) {
      toast.error('Chambre requise', 'Veuillez sélectionner la chambre concernée.')
      return
    }

    setProcessing(true)
    try {
      await declarerPanneMaintenance(companyId || '', {
        chambre_numero: ticketForm.chambre_numero,
        equipement: ticketForm.equipement,
        description: ticketForm.description || `Panne de ${ticketForm.equipement}`,
        urgence: ticketForm.urgence,
        technicien: ticketForm.technicien,
        cout_estime: Number(ticketForm.cout_estime) || 0,
      })

      toast.warning(
        'Panne enregistrée !',
        `La Chambre ${ticketForm.chambre_numero} a été passée au statut MAINTENANCE et bloquée pour la location.`
      )

      setShowDeclareModal(false)
      setTicketForm({
        chambre_numero: '',
        equipement: 'Climatiseur',
        description: '',
        urgence: 'URGENTE',
        technicien: 'Technicien Interne',
        cout_estime: 0,
      })
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Résolution de panne
  const handleValiderResolution = async () => {
    if (!selectedTicket) return
    setProcessing(true)
    try {
      await resoudrePanneMaintenance(companyId || '', selectedTicket.id, resolutionNote)

      toast.success(
        'Intervention clôturée avec succès !',
        `La Chambre ${selectedTicket.chambre_numero} a été remise au Housekeeping pour nettoyage et contrôle.`
      )

      setShowResolveModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── EN-TÊTE MAINTENANCE ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-orange-400 font-black shadow-lg shadow-orange-500/20">
            <Wrench className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">
                Maintenance & Équipements
              </h1>
              <span className="bg-orange-500/20 text-orange-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-orange-500/30">
                Service Technique
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Signalement de pannes • Blocage des chambres • Clôture des réparations
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowDeclareModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black shadow-lg shadow-orange-600/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Signaler une Panne</span>
        </button>
      </div>

      {/* ─── KPIS MAINTENANCE ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Pannes Signalées</span>
            <span className="text-2xl font-black font-mono text-rose-400">{countSignale}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Réparations en cours</span>
            <span className="text-2xl font-black font-mono text-amber-400">{countEnCours}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Pannes résolues</span>
            <span className="text-2xl font-black font-mono text-emerald-400">{countResolu}</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* ─── FILTRES ET RECHERCHE ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chambre ou équipement..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
            />
          </div>

          <select
            value={statutFilter}
            onChange={(e) => setStatutFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none"
          >
            <option value="TOUS">Tous les statuts</option>
            <option value="SIGNALE">Signalé</option>
            <option value="EN_COURS">En cours</option>
            <option value="RESOLU">Résolu</option>
          </select>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* ─── LISTE DES TICKETS DE MAINTENANCE ─── */}
      <div className="space-y-3">
        {filteredTickets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-3xl space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
            <p>Aucun incident technique en cours. Toutes les installations sont fonctionnelles.</p>
          </div>
        ) : (
          filteredTickets.map((t) => {
            const isSignale = t.statut === 'SIGNALE'
            const isEnCours = t.statut === 'EN_COURS'
            const isResolu = t.statut === 'RESOLU'

            return (
              <div
                key={t.id}
                className={clsx(
                  'p-4 sm:p-5 rounded-3xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4',
                  !isResolu
                    ? 'bg-slate-900 border-orange-500/30 hover:border-orange-500/50'
                    : 'bg-slate-950/60 border-slate-800'
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex flex-col items-center justify-center font-mono font-bold text-sm">
                    <span className="text-[9px] uppercase text-slate-400">Ch.</span>
                    <span>{t.chambre_numero}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        Chambre {t.chambre_numero} • {t.equipement}
                      </span>
                      <span className={clsx(
                        'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                        t.urgence === 'BLOQUANTE' || t.urgence === 'URGENTE'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      )}>
                        {t.urgence}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-1">
                      {t.description}
                    </p>

                    <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-1.5">
                      <span>Signalé le : {new Date(t.date_signalement).toLocaleDateString('fr-FR')}</span>
                      <span>•</span>
                      <span>Technicien : <strong className="text-slate-300">{t.technicien || 'Équipe interne'}</strong></span>
                      {t.cout_estime && t.cout_estime > 0 && (
                        <>
                          <span>•</span>
                          <span>Coût : {formatFCFA(t.cout_estime)}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions Résolution */}
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <span className={clsx(
                    'text-[10px] font-bold px-2.5 py-1 rounded-full border mr-2',
                    isSignale ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                    isEnCours ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  )}>
                    {t.statut}
                  </span>

                  {!isResolu && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTicket(t)
                        setShowResolveModal(true)
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Clôturer Réparation</span>
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ─── MODALE 1 : SIGNALEMENT DE PANNE ─── */}
      {showDeclareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowDeclareModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-orange-400" />
              Signaler un Incident Technique
            </h3>

            <p className="text-xs text-slate-400">
              La chambre sélectionnée passera automatiquement au statut <strong>MAINTENANCE</strong> et sera bloquée à la location.
            </p>

            <form onSubmit={handleDeclarerPanne} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Chambre concernée *</label>
                <select
                  required
                  value={ticketForm.chambre_numero}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, chambre_numero: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                >
                  <option value="">Sélectionner une chambre</option>
                  {chambres.map(c => (
                    <option key={c.id} value={c.numero_chambre}>
                      Ch. {c.numero_chambre} ({c.type_chambre} - Statut : {c.statut})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Équipement</label>
                  <select
                    value={ticketForm.equipement}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, equipement: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="Climatiseur">Climatiseur</option>
                    <option value="Plomberie">Plomberie / Sanitaire</option>
                    <option value="Chauffe-eau">Chauffe-eau</option>
                    <option value="Serrure">Serrure Électronique</option>
                    <option value="Téléviseur">Téléviseur / Réception</option>
                    <option value="Électricité">Électricité / Prises</option>
                    <option value="Mobilier">Mobilier / Literie</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Gravité</label>
                  <select
                    value={ticketForm.urgence}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, urgence: e.target.value as any }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  >
                    <option value="URGENTE">Urgente (Bloquante)</option>
                    <option value="MOYENNE">Moyenne</option>
                    <option value="FAIBLE">Mineure</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Description de la panne *</label>
                <textarea
                  rows={2}
                  required
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="ex: Fuite d'eau continue sous le lavabo, robinet mitigeur cassé..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Technicien / Prestataire</label>
                  <input
                    type="text"
                    value={ticketForm.technicien}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, technicien: e.target.value }))}
                    placeholder="ex: Plombier Michel"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Coût estimé (FCFA)</label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={ticketForm.cout_estime}
                    onChange={(e) => setTicketForm(prev => ({ ...prev, cout_estime: Number(e.target.value) || 0 }))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowDeclareModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer & Bloquer Chambre</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE 2 : RÉSOLUTION DE PANNE ─── */}
      {showResolveModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowResolveModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Clôture Intervention — Ch. {selectedTicket.chambre_numero}
            </h3>

            <p className="text-xs text-slate-400">
              Confirmez la réparation de : <strong>{selectedTicket.equipement}</strong> ({selectedTicket.description}).
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Rapport d'intervention</label>
              <textarea
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Détails des réparations effectuées..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300">
              À la clôture, la Chambre {selectedTicket.chambre_numero} passera à <strong>À NETTOYER</strong> dans le Housekeeping pour vérification avant d'accueillir un nouveau client.
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
              >
                Annuler
              </button>

              <button
                type="button"
                disabled={processing}
                onClick={handleValiderResolution}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>Valider Réparation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HotelMaintenancePage
