// =============================================================================
// GESTIO 229 — MODULE HOUSEKEEPING & ÉTAGES
// =============================================================================
// Gestion de la propreté, du nettoyage, du contrôle des chambres et de la
// remise en disponibilité. Liaison directe avec Réception et Maintenance.
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, Check, Clock, AlertTriangle, Users, BedDouble,
  ShieldAlert, RefreshCw, Plus, CheckCircle2, X, Filter, Search, Wrench
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import {
  HotelHousekeepingTask,
  HotelChambre,
  fetchHousekeepingTasks,
  creerTacheHousekeeping,
  changerStatutHousekeeping,
  fetchHotelChambres,
  declarerPanneMaintenance
} from '../../../services/hotelService'
import clsx from 'clsx'

export const HotelHousekeepingPage: React.FC = () => {
  const { companyId } = useTenant()
  const { toast } = useUIStore()

  const [tasks, setTasks] = useState<HotelHousekeepingTask[]>([])
  const [chambres, setChambres] = useState<HotelChambre[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [processing, setProcessing] = useState<boolean>(false)

  // Filtres
  const [filterStatut, setFilterStatut] = useState<string>('TOUS')
  const [search, setSearch] = useState<string>('')

  // Modales
  const [showNewTaskModal, setShowNewTaskModal] = useState<boolean>(false)
  const [showAnomalieModal, setShowAnomalieModal] = useState<boolean>(false)
  const [selectedTask, setSelectedTask] = useState<HotelHousekeepingTask | null>(null)

  // Formulaire nouvelle tâche
  const [newTaskForm, setNewTaskForm] = useState({
    chambre_numero: '',
    agent_nom: '',
    priorite: 'NORMALE' as 'NORMALE' | 'URGENTE',
    observations: '',
  })

  // Formulaire anomalie
  const [anomalieForm, setAnomalieForm] = useState({
    equipement: 'Climatiseur',
    description: '',
    urgence: 'URGENTE' as 'FAIBLE' | 'MOYENNE' | 'URGENTE' | 'BLOQUANTE',
  })

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [tData, chData] = await Promise.all([
        fetchHousekeepingTasks(companyId),
        fetchHotelChambres(companyId),
      ])
      setTasks(tData)
      setChambres(chData)
    } catch (err) {
      console.warn('[Housekeeping] Erreur chargement:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (filterStatut !== 'TOUS' && t.statut !== filterStatut) return false
      if (search && !t.chambre_numero.includes(search) && !t.agent_nom.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [tasks, filterStatut, search])

  // Compteurs
  const countANettoyer = tasks.filter(t => t.statut === 'A_NETTOYER').length
  const countEnCours = tasks.filter(t => t.statut === 'EN_COURS').length
  const countAControler = tasks.filter(t => t.statut === 'A_CONTROLER').length
  const countPropre = tasks.filter(t => t.statut === 'PROPRE_DISPONIBLE').length

  // Changement de statut d'une tâche
  const handleChangerStatut = async (task: HotelHousekeepingTask, nouveauStatut: HotelHousekeepingTask['statut']) => {
    setProcessing(true)
    try {
      await changerStatutHousekeeping(companyId || '', task.id, nouveauStatut)

      if (nouveauStatut === 'PROPRE_DISPONIBLE') {
        toast.success(
          'Chambre propre et disponible !',
          `La Chambre ${task.chambre_numero} a été validée et remise à l'état LIBRE pour la réception.`
        )
      } else {
        toast.success('Statut mis à jour', `Chambre ${task.chambre_numero} : ${nouveauStatut.replace('_', ' ')}`)
      }

      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Créer une nouvelle tâche de nettoyage manuelle
  const handleCreerTache = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskForm.chambre_numero) {
      toast.error('Chambre requise', 'Veuillez sélectionner une chambre.')
      return
    }

    setProcessing(true)
    try {
      await creerTacheHousekeeping(companyId || '', {
        chambre_numero: newTaskForm.chambre_numero,
        date: new Date().toISOString().slice(0, 10),
        agent_nom: newTaskForm.agent_nom || 'Agent d\'étage',
        statut: 'A_NETTOYER',
        priorite: newTaskForm.priorite,
        observations: newTaskForm.observations,
      })

      toast.success('Tâche créée', `Nettoyage programmé pour la Chambre ${newTaskForm.chambre_numero}.`)
      setShowNewTaskModal(false)
      setNewTaskForm({ chambre_numero: '', agent_nom: '', priorite: 'NORMALE', observations: '' })
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  // Signaler anomalie / transférer en maintenance
  const handleDeclarerAnomalie = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTask) return

    setProcessing(true)
    try {
      await declarerPanneMaintenance(companyId || '', {
        chambre_numero: selectedTask.chambre_numero,
        equipement: anomalieForm.equipement,
        description: anomalieForm.description || `Anomalie signalée lors du ménage : ${anomalieForm.equipement}`,
        urgence: anomalieForm.urgence,
        technicien: 'Service Technique Interne',
      })

      toast.warning(
        'Anomalie transférée en Maintenance !',
        `La Chambre ${selectedTask.chambre_numero} a été bloquée en maintenance.`
      )

      setShowAnomalieModal(false)
      await loadData()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ─── EN-TÊTE HOUSEKEEPING ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black shadow-lg shadow-amber-500/20">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white">
                Housekeeping & Entretien des Étages
              </h1>
              <span className="bg-amber-500/20 text-amber-300 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-500/30">
                Gouvernante
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Nettoyage des chambres • Contrôle qualité • Remise en disponibilité
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowNewTaskModal(true)}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black shadow-lg shadow-amber-500/20 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Nouvelle Tâche de Ménage</span>
        </button>
      </div>

      {/* ─── STATUTS EN UN COUP D'ŒIL (KPIs HOUSEKEEPING) ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setFilterStatut('A_NETTOYER')}
          className={clsx(
            'p-4 rounded-2xl border text-left transition',
            filterStatut === 'A_NETTOYER'
              ? 'bg-amber-500/15 border-amber-500/50 ring-2 ring-amber-500/20'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          )}
        >
          <span className="text-[10px] text-amber-400 font-bold block uppercase tracking-wider">À Nettoyer</span>
          <span className="text-2xl font-black font-mono text-white">{countANettoyer}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Chambres libérées</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatut('EN_COURS')}
          className={clsx(
            'p-4 rounded-2xl border text-left transition',
            filterStatut === 'EN_COURS'
              ? 'bg-indigo-500/15 border-indigo-500/50 ring-2 ring-indigo-500/20'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          )}
        >
          <span className="text-[10px] text-indigo-400 font-bold block uppercase tracking-wider">En Cours</span>
          <span className="text-2xl font-black font-mono text-white">{countEnCours}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Ménage en cours</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatut('A_CONTROLER')}
          className={clsx(
            'p-4 rounded-2xl border text-left transition',
            filterStatut === 'A_CONTROLER'
              ? 'bg-blue-500/15 border-blue-500/50 ring-2 ring-blue-500/20'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          )}
        >
          <span className="text-[10px] text-blue-400 font-bold block uppercase tracking-wider">À Contrôler</span>
          <span className="text-2xl font-black font-mono text-white">{countAControler}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Inspection gouvernante</span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatut('PROPRE_DISPONIBLE')}
          className={clsx(
            'p-4 rounded-2xl border text-left transition',
            filterStatut === 'PROPRE_DISPONIBLE'
              ? 'bg-emerald-500/15 border-emerald-500/50 ring-2 ring-emerald-500/20'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          )}
        >
          <span className="text-[10px] text-emerald-400 font-bold block uppercase tracking-wider">Prêtes & Libres</span>
          <span className="text-2xl font-black font-mono text-white">{countPropre}</span>
          <span className="text-[10px] text-slate-500 block mt-1">Validées pour accueil</span>
        </button>
      </div>

      {/* ─── BARRE D'OUTILS ET RECHERCHE ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2">
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher chambre ou agent..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="button"
            onClick={() => { setFilterStatut('TOUS'); setSearch(''); }}
            className="text-xs font-semibold text-slate-400 hover:text-white px-2 py-1"
          >
            Réinitialiser filtres
          </button>
        </div>

        <button
          type="button"
          onClick={loadData}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* ─── LISTE DES TÂCHES DE HOUSEKEEPING ─── */}
      <div className="space-y-3">
        {filteredTasks.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-3xl space-y-2">
            <Sparkles className="w-8 h-8 mx-auto text-slate-600" />
            <p>Aucune tâche de ménage ne correspond aux filtres.</p>
          </div>
        ) : (
          filteredTasks.map((t) => {
            const isANettoyer = t.statut === 'A_NETTOYER'
            const isEnCours = t.statut === 'EN_COURS'
            const isAControler = t.statut === 'A_CONTROLER'
            const isPropre = t.statut === 'PROPRE_DISPONIBLE'

            return (
              <div
                key={t.id}
                className={clsx(
                  'p-4 sm:p-5 rounded-3xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4',
                  t.priorite === 'URGENTE' && !isPropre
                    ? 'bg-rose-950/20 border-rose-500/40'
                    : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                )}
              >
                {/* Infos Chambre & Agent */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center font-mono font-bold text-sm">
                    <span className="text-[9px] text-slate-400 uppercase">Ch.</span>
                    <span className="text-white text-base">{t.chambre_numero}</span>
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">
                        Chambre {t.chambre_numero}
                      </span>
                      {t.priorite === 'URGENTE' && (
                        <span className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Départ récent • Prioritaire
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 flex items-center gap-3 mt-1">
                      <span>Agent affecté : <strong className="text-slate-200">{t.agent_nom}</strong></span>
                      <span>•</span>
                      <span>Date : {t.date}</span>
                    </div>
                    {t.observations && (
                      <p className="text-[11px] text-slate-500 mt-1 italic">
                        {t.observations}
                      </p>
                    )}
                  </div>
                </div>

                {/* Workflow Statut & Actions */}
                <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
                  {/* Badge statut actuel */}
                  <span className={clsx(
                    'text-[10px] font-bold px-2.5 py-1 rounded-full border mr-2',
                    isANettoyer ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                    isEnCours ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                    isAControler ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                    'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  )}>
                    {t.statut.replace('_', ' ')}
                  </span>

                  {/* Boutons d'avancement du cycle de nettoyage */}
                  {isANettoyer && (
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleChangerStatut(t, 'EN_COURS')}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Démarrer Ménage</span>
                    </button>
                  )}

                  {isEnCours && (
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleChangerStatut(t, 'A_CONTROLER')}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Terminé $\rightarrow$ Contrôle</span>
                    </button>
                  )}

                  {isAControler && (
                    <button
                      type="button"
                      disabled={processing}
                      onClick={() => handleChangerStatut(t, 'PROPRE_DISPONIBLE')}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Valider & Libérer Chambre</span>
                    </button>
                  )}

                  {/* Bouton Signaler Panne / Maintenance */}
                  {!isPropre && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTask(t)
                        setShowAnomalieModal(true)
                      }}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl transition"
                      title="Signaler une panne constatée lors du ménage"
                    >
                      <Wrench className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ─── MODALE 1 : NOUVELLE TÂCHE DE MÉNAGE MANUELLE ─── */}
      {showNewTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowNewTaskModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              Programmer un Nettoyage de Chambre
            </h3>

            <form onSubmit={handleCreerTache} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Chambre à nettoyer *</label>
                <select
                  required
                  value={newTaskForm.chambre_numero}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, chambre_numero: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Sélectionner une chambre</option>
                  {chambres.map(c => (
                    <option key={c.id} value={c.numero_chambre}>
                      Ch. {c.numero_chambre} ({c.type_chambre} - Statut : {c.statut})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Agent d'étage assigné</label>
                <input
                  type="text"
                  value={newTaskForm.agent_nom}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, agent_nom: e.target.value }))}
                  placeholder="ex: Fatiha A. / Équipe Matin"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Degré de priorité</label>
                <select
                  value={newTaskForm.priorite}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, priorite: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="NORMALE">Normale (Recouche ou entretien régulier)</option>
                  <option value="URGENTE">Urgente (Départ client / Arrivée imminente)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Consignes spécifiques</label>
                <textarea
                  rows={2}
                  value={newTaskForm.observations}
                  onChange={(e) => setNewTaskForm(prev => ({ ...prev, observations: e.target.value }))}
                  placeholder="ex: Remplacement complet draps et serviettes, nettoyage vitre balcon..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowNewTaskModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={processing}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black transition flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  <span>Enregistrer Tâche</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALE 2 : SIGNALEMENT ANOMALIE VERS MAINTENANCE ─── */}
      {showAnomalieModal && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowAnomalieModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-amber-400" />
              Signaler un Incident — Chambre {selectedTask.chambre_numero}
            </h3>

            <p className="text-xs text-slate-400">
              Déclarez la panne constatée pendant le ménage. La chambre sera bloquée en maintenance technique.
            </p>

            <form onSubmit={handleDeclarerAnomalie} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Équipement en panne</label>
                <select
                  value={anomalieForm.equipement}
                  onChange={(e) => setAnomalieForm(prev => ({ ...prev, equipement: e.target.value }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="Climatiseur">Climatiseur (Ne refroidit pas / fuite d'eau)</option>
                  <option value="Plomberie">Plomberie (Fuite d'eau / évacuation bouchée)</option>
                  <option value="Chauffe-eau">Chauffe-eau (Pas d'eau chaude)</option>
                  <option value="Serrure">Serrure Électronique (Badge non reconnu)</option>
                  <option value="Téléviseur">Téléviseur / Câble / Décodeur</option>
                  <option value="Électricité">Électricité / Prises / Éclairage</option>
                  <option value="Mobilier">Mobilier / Literie endommagée</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Description détaillée</label>
                <textarea
                  rows={2}
                  value={anomalieForm.description}
                  onChange={(e) => setAnomalieForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Détails du problème constaté..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Niveau de gravité</label>
                <select
                  value={anomalieForm.urgence}
                  onChange={(e) => setAnomalieForm(prev => ({ ...prev, urgence: e.target.value as any }))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="URGENTE">Urgente (Bloque l'attribution de la chambre)</option>
                  <option value="MOYENNE">Moyenne (Réparation possible dans la journée)</option>
                  <option value="FAIBLE">Faible (Intervention mineure)</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAnomalieModal(false)}
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
                  <span>Transférer en Maintenance</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default HotelHousekeepingPage
