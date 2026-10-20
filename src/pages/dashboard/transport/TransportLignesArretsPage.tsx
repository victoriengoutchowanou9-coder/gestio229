import React, { useState, useEffect } from 'react'
import {
  MapPin,
  Plus,
  Trash2,
  Edit2,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Clock,
  Compass,
  DollarSign
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportLigne,
  TransportArret
} from '../../../services/transportService'

export const TransportLignesArretsPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company

  const [lignes, setLignes] = useState<TransportLigne[]>([])
  const [selectedLigne, setSelectedLigne] = useState<TransportLigne | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Modale d'ajout/édition de ligne
  const [showModalLigne, setShowModalLigne] = useState(false)
  const [formLigne, setFormLigne] = useState<{
    id?: string
    code_ligne: string
    nom_ligne: string
    ville_origine: string
    ville_destination: string
    distance_km: number
    duree_estimee_minutes: number
    description?: string
  }>({
    code_ligne: '',
    nom_ligne: '',
    ville_origine: '',
    ville_destination: '',
    distance_km: 100,
    duree_estimee_minutes: 120,
    description: '',
  })

  // Modale d'ajout d'arrêt
  const [showModalArret, setShowModalArret] = useState(false)
  const [formArret, setFormArret] = useState<{
    nom: string
    ville: string
    adresse?: string
    duree_depuis_depart_min: number
  }>({
    nom: '',
    ville: '',
    adresse: '',
    duree_depuis_depart_min: 30,
  })

  // Modale de modification tarif tronçon
  const [showModalTarif, setShowModalTarif] = useState(false)
  const [formTarif, setFormTarif] = useState<{
    arretDepartId: string
    arretArriveeId: string
    montant: number
  }>({
    arretDepartId: '',
    arretArriveeId: '',
    montant: 3000,
  })

  const loadLignes = async () => {
    setLoading(true)
    try {
      const data = await transportService.fetchTransportLignes(companyId)
      setLignes(data)
      if (data.length > 0 && !selectedLigne) {
        setSelectedLigne(data[0])
      } else if (selectedLigne) {
        const found = data.find(l => l.id === selectedLigne.id)
        if (found) setSelectedLigne(found)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadLignes()
  }, [companyId])

  const handleSaveLigne = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const saved = await transportService.saveTransportLigne(companyId, formLigne)
      setShowModalLigne(false)
      await loadLignes()
      setSelectedLigne(saved)
    } catch (e) {
      alert('Erreur enregistrement ligne')
    }
  }

  const handleAddArret = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLigne) return

    const newOrder = selectedLigne.arrêts.length + 1
    const newArret: TransportArret = {
      id: `arr-${Date.now()}`,
      ordre: newOrder,
      nom: formArret.nom,
      ville: formArret.ville,
      adresse: formArret.adresse,
      duree_depuis_depart_min: Number(formArret.duree_depuis_depart_min) || 0,
      est_actif: true,
    }

    const updatedArrets = [...selectedLigne.arrêts, newArret]
    const saved = await transportService.saveTransportLigne(companyId, {
      ...selectedLigne,
      arrêts: updatedArrets
    })

    setSelectedLigne(saved)
    setShowModalArret(false)
    setFormArret({ nom: '', ville: '', adresse: '', duree_depuis_depart_min: 30 })
    await loadLignes()
  }

  const handleSaveTarifTroncon = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedLigne) return

    const key = `${formTarif.arretDepartId}_${formTarif.arretArriveeId}`
    const updatedGrille = {
      ...selectedLigne.grille_tarifs,
      [key]: Number(formTarif.montant) || 0
    }

    const saved = await transportService.saveTransportLigne(companyId, {
      ...selectedLigne,
      grille_tarifs: updatedGrille
    })

    setSelectedLigne(saved)
    setShowModalTarif(false)
    await loadLignes()
  }

  const handleDeleteArret = async (arretId: string) => {
    if (!selectedLigne) return
    if (!confirm('Supprimer cet arrêt de l\'itinéraire ?')) return

    const updated = selectedLigne.arrêts.filter(a => a.id !== arretId).map((a, idx) => ({
      ...a,
      ordre: idx + 1
    }))

    const saved = await transportService.saveTransportLigne(companyId, {
      ...selectedLigne,
      arrêts: updated
    })
    setSelectedLigne(saved)
    await loadLignes()
  }

  const filteredLignes = lignes.filter(l =>
    l.nom_ligne.toLowerCase().includes(search.toLowerCase()) ||
    l.code_ligne.toLowerCase().includes(search.toLowerCase()) ||
    l.ville_origine.toLowerCase().includes(search.toLowerCase()) ||
    l.ville_destination.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Compass className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Réseau, Lignes & Arrêts
              </h1>
              <p className="text-sm text-slate-400">
                Itinéraires, arrêts intermédiaires, horaires de passage et grille tarifaire par tronçon
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setFormLigne({
              code_ligne: `L-LIG-${Math.floor(100 + Math.random() * 900)}`,
              nom_ligne: '',
              ville_origine: '',
              ville_destination: '',
              distance_km: 150,
              duree_estimee_minutes: 180,
              description: '',
            })
            setShowModalLigne(true)
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-lg shadow-blue-600/20 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Ligne de Bus
        </button>
      </div>

      {/* ── Deux colonnes : Liste des lignes & Détails avec arrêts et tarifs ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne gauche : Sélecteur de Ligne */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Filtrer lignes, villes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-900 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
            {filteredLignes.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-900/50 rounded-2xl border border-slate-800">
                Aucune ligne trouvée.
              </div>
            ) : (
              filteredLignes.map(lig => {
                const isSelected = selectedLigne?.id === lig.id
                return (
                  <div
                    key={lig.id}
                    onClick={() => setSelectedLigne(lig)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-600/10 border-blue-500/50 shadow-sm'
                        : 'bg-slate-900/80 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-blue-400">
                        {lig.code_ligne}
                      </span>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {lig.arrêts.length} arrêts
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-white mt-2">
                      {lig.nom_ligne}
                    </h3>

                    <div className="flex items-center gap-2 mt-2 text-xs text-slate-400">
                      <span>{lig.ville_origine}</span>
                      <ArrowRight className="w-3 h-3 text-slate-500" />
                      <span>{lig.ville_destination}</span>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{lig.distance_km} km</span>
                      <span>~ {Math.floor(lig.duree_estimee_minutes / 60)}h{lig.duree_estimee_minutes % 60 > 0 ? `${lig.duree_estimee_minutes % 60}m` : ''}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Colonne droite : Détails de la ligne sélectionnée */}
        <div className="lg:col-span-8 space-y-6">
          {selectedLigne ? (
            <div className="space-y-6">
              {/* Carte résumé ligne */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 font-mono text-xs font-bold rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      {selectedLigne.code_ligne}
                    </span>
                    <h2 className="text-xl font-bold text-white">{selectedLigne.nom_ligne}</h2>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedLigne.description || `Liaison interurbaine entre ${selectedLigne.ville_origine} et ${selectedLigne.ville_destination}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFormLigne({
                        id: selectedLigne.id,
                        code_ligne: selectedLigne.code_ligne,
                        nom_ligne: selectedLigne.nom_ligne,
                        ville_origine: selectedLigne.ville_origine,
                        ville_destination: selectedLigne.ville_destination,
                        distance_km: selectedLigne.distance_km,
                        duree_estimee_minutes: selectedLigne.duree_estimee_minutes,
                        description: selectedLigne.description || '',
                      })
                      setShowModalLigne(true)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Modifier
                  </button>
                </div>
              </div>

              {/* Arrêts intermédiaires séquencés */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <h3 className="font-bold text-base text-white">Arrêts de l'Itinéraire (Ordre de passage)</h3>
                  </div>
                  <button
                    onClick={() => setShowModalArret(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Ajouter un Arrêt
                  </button>
                </div>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
                  {selectedLigne.arrêts.map((arr, index) => {
                    const isFirst = index === 0
                    const isLast = index === selectedLigne.arrêts.length - 1

                    return (
                      <div key={arr.id} className="relative flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800/80">
                        {/* Point rond sur la ligne temporelle */}
                        <div className={`absolute -left-[27px] w-4 h-4 rounded-full border-2 ${
                          isFirst ? 'bg-emerald-500 border-slate-950' :
                          isLast ? 'bg-rose-500 border-slate-950' :
                          'bg-blue-500 border-slate-950'
                        }`} />

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">#{arr.ordre}</span>
                            <span className="font-bold text-sm text-white">{arr.nom}</span>
                            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                              {arr.ville}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-3 mt-1">
                            <span><Clock className="w-3 h-3 inline mr-1 text-slate-500" /> +{arr.duree_depuis_depart_min} min du départ</span>
                            {arr.adresse && <span>Adresse : {arr.adresse}</span>}
                          </div>
                        </div>

                        {!isFirst && !isLast && (
                          <button
                            onClick={() => handleDeleteArret(arr.id)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                            title="Supprimer l'arrêt"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Grille des Tarifs par Tronçon (Arrêt départ -> Arrêt arrivée) */}
              <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <h3 className="font-bold text-base text-white">Tarifs configurés par Tronçon</h3>
                  </div>
                  <button
                    onClick={() => {
                      if (selectedLigne.arrêts.length >= 2) {
                        setFormTarif({
                          arretDepartId: selectedLigne.arrêts[0].id,
                          arretArriveeId: selectedLigne.arrêts[selectedLigne.arrêts.length - 1].id,
                          montant: 5000
                        })
                        setShowModalTarif(true)
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition"
                  >
                    <Plus className="w-3.5 h-3.5" /> Définir Tarif Tronçon
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(selectedLigne.grille_tarifs || {}).map(([key, prix]) => {
                    const [depId, arrId] = key.split('_')
                    const depObj = selectedLigne.arrêts.find(a => a.id === depId)
                    const arrObj = selectedLigne.arrêts.find(a => a.id === arrId)

                    return (
                      <div key={key} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold text-white">
                            {depObj ? depObj.nom : 'Arrêt'} ➔ {arrObj ? arrObj.nom : 'Arrêt'}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {depObj?.ville} vers {arrObj?.ville}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-black text-emerald-400 text-sm">
                            {Number(prix).toLocaleString('fr-FR')} F
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 text-sm bg-slate-900 rounded-2xl border border-slate-800">
              Sélectionnez une ligne pour consulter ses arrêts et sa grille tarifaire.
            </div>
          )}
        </div>
      </div>

      {/* ── Modale Ligne ── */}
      {showModalLigne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">
              {formLigne.id ? 'Modifier la Ligne' : 'Créer une Ligne de Bus'}
            </h3>
            <form onSubmit={handleSaveLigne} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Code Ligne *</label>
                  <input
                    type="text"
                    required
                    value={formLigne.code_ligne}
                    onChange={e => setFormLigne({ ...formLigne, code_ligne: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Nom commercial *</label>
                  <input
                    type="text"
                    required
                    placeholder="ex: Cotonou - Parakou Express"
                    value={formLigne.nom_ligne}
                    onChange={e => setFormLigne({ ...formLigne, nom_ligne: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Ville Départ *</label>
                  <input
                    type="text"
                    required
                    value={formLigne.ville_origine}
                    onChange={e => setFormLigne({ ...formLigne, ville_origine: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Ville Arrivée *</label>
                  <input
                    type="text"
                    required
                    value={formLigne.ville_destination}
                    onChange={e => setFormLigne({ ...formLigne, ville_destination: e.target.value })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-300 font-medium">Distance (km)</label>
                  <input
                    type="number"
                    value={formLigne.distance_km}
                    onChange={e => setFormLigne({ ...formLigne, distance_km: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Durée estimée (minutes)</label>
                  <input
                    type="number"
                    value={formLigne.duree_estimee_minutes}
                    onChange={e => setFormLigne({ ...formLigne, duree_estimee_minutes: Number(e.target.value) })}
                    className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Notes & Itinéraire</label>
                <textarea
                  value={formLigne.description}
                  onChange={e => setFormLigne({ ...formLigne, description: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white h-20"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalLigne(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Arrêt ── */}
      {showModalArret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Ajouter un Arrêt / Escale</h3>
            <form onSubmit={handleAddArret} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Nom de l'arrêt / Gare *</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Halte Dassa Carrefour"
                  value={formArret.nom}
                  onChange={e => setFormArret({ ...formArret, nom: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium">Commune / Ville *</label>
                <input
                  type="text"
                  required
                  placeholder="ex: Dassa-Zoumè"
                  value={formArret.ville}
                  onChange={e => setFormArret({ ...formArret, ville: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium">Temps de trajet depuis le départ (minutes)</label>
                <input
                  type="number"
                  value={formArret.duree_depuis_depart_min}
                  onChange={e => setFormArret({ ...formArret, duree_depuis_depart_min: Number(e.target.value) })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium">Adresse / Repère</label>
                <input
                  type="text"
                  placeholder="ex: Face Station Bénin Pétro"
                  value={formArret.adresse}
                  onChange={e => setFormArret({ ...formArret, adresse: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalArret(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg"
                >
                  Ajouter l'Arrêt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modale Tarif Tronçon ── */}
      {showModalTarif && selectedLigne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white">Tarif d'un Tronçon</h3>
            <form onSubmit={handleSaveTarifTroncon} className="space-y-4 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Arrêt de Montée *</label>
                <select
                  value={formTarif.arretDepartId}
                  onChange={e => setFormTarif({ ...formTarif, arretDepartId: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  {selectedLigne.arrêts.map(a => (
                    <option key={a.id} value={a.id}>{a.nom} ({a.ville})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Arrêt de Descente *</label>
                <select
                  value={formTarif.arretArriveeId}
                  onChange={e => setFormTarif({ ...formTarif, arretArriveeId: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white"
                >
                  {selectedLigne.arrêts.map(a => (
                    <option key={a.id} value={a.id}>{a.nom} ({a.ville})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-300 font-medium">Prix du Billet (FCFA) *</label>
                <input
                  type="number"
                  required
                  step={500}
                  value={formTarif.montant}
                  onChange={e => setFormTarif({ ...formTarif, montant: Number(e.target.value) })}
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-base font-bold text-emerald-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModalTarif(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-amber-600 hover:bg-amber-500 rounded-lg"
                >
                  Valider le Tarif
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportLignesArretsPage
