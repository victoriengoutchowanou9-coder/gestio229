// =============================================================================
// GESTIO 229 — MULTI-DÉPÔTS, TRANSFERTS INTER-OFFICINE & INVENTAIRES PHYSIQUES
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  Sparkles,
  Building,
  ArrowRightLeft,
  ClipboardList,
  Search,
  Plus,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ThermometerSnowflake,
  PackageCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieDepot,
  PharmacieLot,
  PharmacieTransfertDepot,
  PharmacieInventairePhysique,
  LigneInventairePhysique,
} from '../../../services/pharmacieService'

export default function PharmacieInventairesTransfertsPage() {
  const { currentCompany, currentProfile } = useTenant()
  const companyId = currentCompany?.id || 'demo-company-pharma'
  const userName = currentProfile?.full_name || 'Pharmacien / Gestionnaire'

  const [activeTab, setActiveTab] = useState<'TRANSFERTS' | 'INVENTAIRES' | 'DEPOTS'>('TRANSFERTS')

  const [depots, setDepots] = useState<PharmacieDepot[]>([])
  const [lots, setLots] = useState<PharmacieLot[]>([])
  const [transferts, setTransferts] = useState<PharmacieTransfertDepot[]>([])
  const [inventaires, setInventaires] = useState<PharmacieInventairePhysique[]>([])
  const [loading, setLoading] = useState(true)

  // Modal Nouveau Transfert
  const [transfertModalOpen, setTransfertModalOpen] = useState(false)
  const [sourceDepotId, setSourceDepotId] = useState('')
  const [destDepotId, setDestDepotId] = useState('')
  const [transfertLotId, setTransfertLotId] = useState('')
  const [transfertQte, setTransfertQte] = useState(1)

  // Modal Inventaire
  const [inventaireModalOpen, setInventaireModalOpen] = useState(false)
  const [inventaireDepotId, setInventaireDepotId] = useState('')
  const [lignesInventaire, setLignesInventaire] = useState<LigneInventairePhysique[]>([])

  const [messageAction, setMessageAction] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const chargerDonnees = async () => {
    try {
      setLoading(true)
      const [d, l, t, inv] = await Promise.all([
        pharmacieService.getDepots(companyId),
        pharmacieService.getLots(companyId),
        pharmacieService.getTransferts(companyId),
        pharmacieService.getInventaires(companyId),
      ])
      setDepots(d)
      setLots(l)
      setTransferts(t)
      setInventaires(inv)
      if (d.length >= 2) {
        setSourceDepotId(d[1].id) // Réserve par défaut
        setDestDepotId(d[0].id) // Comptoir par défaut
        setInventaireDepotId(d[0].id)
      }
    } catch (err) {
      console.error('Erreur chargement inventaires & transferts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerDonnees()
  }, [companyId])

  // Lots disponibles dans le dépôt source sélectionné pour transfert
  const lotsDispoSource = lots.filter(
    (l) => l.depot_id === sourceDepotId && l.statut === 'DISPONIBLE' && l.quantite_actuelle > 0
  )

  const handleCreerTransfert = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sourceDepotId || !destDepotId || !transfertLotId) {
      alert('Veuillez renseigner le dépôt source, le dépôt de destination et le lot à transférer.')
      return
    }
    if (sourceDepotId === destDepotId) {
      alert('Le dépôt source et le dépôt de destination doivent être différents.')
      return
    }

    const lot = lots.find((l) => l.id === transfertLotId)
    if (!lot) return

    if (transfertQte <= 0 || transfertQte > lot.quantite_actuelle) {
      alert(`La quantité à transférer doit être comprise entre 1 et ${lot.quantite_actuelle}.`)
      return
    }

    try {
      setActionLoading(true)
      const srcDepot = depots.find((d) => d.id === sourceDepotId)
      const dstDepot = depots.find((d) => d.id === destDepotId)

      await pharmacieService.creerTransfert(companyId, {
        company_id: companyId,
        depot_source_id: sourceDepotId,
        depot_source_nom: srcDepot?.nom || 'Dépôt Source',
        depot_destination_id: destDepotId,
        depot_destination_nom: dstDepot?.nom || 'Dépôt Destination',
        expediteur_nom: userName,
        lignes: [
          {
            produit_id: lot.produit_id,
            produit_nom: lot.produit_nom,
            lot_id: lot.id,
            numero_lot: lot.numero_lot,
            date_peremption: lot.date_peremption,
            quantite: transfertQte,
          },
        ],
      })

      setTransfertModalOpen(false)
      setMessageAction('Bon de transfert créé. Cliquez sur « Valider Réception » une fois les produits livrés.')
      setTimeout(() => setMessageAction(''), 5000)
      chargerDonnees()
    } catch (err: any) {
      alert(err.message || 'Erreur lors du transfert')
    } finally {
      setActionLoading(false)
    }
  }

  const handleValiderReception = async (transfertId: string) => {
    try {
      setActionLoading(true)
      await pharmacieService.validerReceptionTransfert(companyId, transfertId, userName)
      setMessageAction('Transfert réceptionné avec succès : stocks mis à jour dans le dépôt de destination.')
      setTimeout(() => setMessageAction(''), 5000)
      chargerDonnees()
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la réception')
    } finally {
      setActionLoading(false)
    }
  }

  // Préparer les lignes d'inventaire physique pour le dépôt sélectionné
  const handleOuvrirInventaire = () => {
    const lotsDuDepot = lots.filter((l) => l.depot_id === inventaireDepotId)
    const prepLignes: LigneInventairePhysique[] = lotsDuDepot.map((l) => ({
      produit_id: l.produit_id,
      produit_nom: l.produit_nom,
      lot_id: l.id,
      numero_lot: l.numero_lot,
      emplacement: l.emplacement_rayon,
      date_peremption: l.date_peremption,
      stock_theorique: l.quantite_actuelle,
      stock_compte: l.quantite_actuelle,
      ecart_quantite: 0,
      prix_achat_unitaire: l.prix_achat_unitaire,
      valeur_ecart: 0,
    }))

    setLignesInventaire(prepLignes)
    setInventaireModalOpen(true)
  }

  const handleUpdateStockCompte = (idx: number, valeur: number) => {
    const updated = [...lignesInventaire]
    const ligne = updated[idx]
    ligne.stock_compte = Math.max(0, valeur)
    ligne.ecart_quantite = ligne.stock_compte - ligne.stock_theorique
    ligne.valeur_ecart = ligne.ecart_quantite * ligne.prix_achat_unitaire
    setLignesInventaire(updated)
  }

  const handleValiderInventairePhysique = async () => {
    if (lignesInventaire.length === 0) return
    try {
      setActionLoading(true)
      const dep = depots.find((d) => d.id === inventaireDepotId)
      await pharmacieService.validerInventaire(
        companyId,
        {
          company_id: companyId,
          depot_id: inventaireDepotId,
          depot_nom: dep?.nom || 'Dépôt',
          date_inventaire: new Date().toISOString().slice(0, 10),
          responsable_nom: userName,
          lignes: lignesInventaire,
          total_ecart_positif: 0,
          total_ecart_negatif: 0,
          valeur_nette_ecart: 0,
        },
        userName
      )

      setInventaireModalOpen(false)
      setMessageAction('Inventaire physique validé : ajustements de stocks enregistrés avec traçabilité.')
      setTimeout(() => setMessageAction(''), 5000)
      chargerDonnees()
    } catch (err: any) {
      alert(err.message || 'Erreur inventaire')
    } finally {
      setActionLoading(false)
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString('fr-FR')

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
            <Building className="w-4 h-4" /> Multi-Dépôts, Frigos & Contrôle d'Inventaire
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Transferts Inter-Dépôts & Inventaires Physiques
          </h1>
          <p className="text-sm text-slate-500">
            Mouvements entre la réserve centrale, le comptoir et l'armoire frigorifique 2-8°C, avec rapprochement d'inventaire et journal des écarts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'TRANSFERTS' && (
            <button
              onClick={() => setTransfertModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition"
            >
              <ArrowRightLeft className="w-4 h-4" /> Nouveau Transfert
            </button>
          )}
          {activeTab === 'INVENTAIRES' && (
            <button
              onClick={handleOuvrirInventaire}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl shadow transition"
            >
              <ClipboardList className="w-4 h-4" /> Lancer un Inventaire Physique
            </button>
          )}
        </div>
      </div>

      {messageAction && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {messageAction}
        </div>
      )}

      {/* Onglets de Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-6">
        <button
          onClick={() => setActiveTab('TRANSFERTS')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'TRANSFERTS'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Bons de Transferts ({transferts.length})
        </button>

        <button
          onClick={() => setActiveTab('INVENTAIRES')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'INVENTAIRES'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          Inventaires & Écarts ({inventaires.length})
        </button>

        <button
          onClick={() => setActiveTab('DEPOTS')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'DEPOTS'
              ? 'border-purple-600 text-purple-600 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building className="w-4 h-4" />
          Dépôts & Zones de Stockage ({depots.length})
        </button>
      </div>

      {/* Onglet 1 : Transferts Inter-Dépôts */}
      {activeTab === 'TRANSFERTS' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Réf Transfert & Date</th>
                  <th className="px-4 py-3">Origine &rarr; Destination</th>
                  <th className="px-4 py-3">Produits & Lots</th>
                  <th className="px-4 py-3">Émetteur / Récepteur</th>
                  <th className="px-4 py-3">Statut</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {transferts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Aucun transfert inter-dépôts enregistré. Cliquez sur « Nouveau Transfert » pour approvisionner le comptoir.
                    </td>
                  </tr>
                ) : (
                  transferts.map((trf) => (
                    <tr key={trf.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-purple-600">{trf.reference_transfert}</div>
                        <div className="text-xs text-slate-400">{new Date(trf.date_creation).toLocaleString('fr-FR')}</div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {trf.depot_source_nom}
                        </div>
                        <div className="text-xs text-purple-600 font-bold mt-0.5">
                          &rarr; {trf.depot_destination_nom}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs space-y-0.5">
                          {trf.lignes.map((l, i) => (
                            <div key={i} className="text-slate-700 dark:text-slate-300">
                              <span className="font-bold">{l.produit_nom}</span> (Lot:{l.numero_lot}) :{' '}
                              <span className="font-mono font-bold text-purple-600">{l.quantite} btes</span>
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs">
                        <div>Émis par : {trf.expediteur_nom}</div>
                        {trf.receptionnaire_nom && (
                          <div className="text-emerald-600 font-medium">Reçu par : {trf.receptionnaire_nom}</div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {trf.statut === 'RECEPTIONNE' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Réceptionné
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1 w-fit">
                            En Attente Réception
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {trf.statut !== 'RECEPTIONNE' && (
                          <button
                            onClick={() => handleValiderReception(trf.id)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow"
                          >
                            Valider Réception
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onglet 2 : Inventaires Physiques */}
      {activeTab === 'INVENTAIRES' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="px-4 py-3">Réf & Date Inventaire</th>
                  <th className="px-4 py-3">Dépôt Audité</th>
                  <th className="px-4 py-3">Responsable</th>
                  <th className="px-4 py-3 text-center">Lignes Comptées</th>
                  <th className="px-4 py-3 text-right">Écart Net Valeur</th>
                  <th className="px-4 py-3">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {inventaires.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      Aucun inventaire physique validé. Cliquez sur « Lancer un Inventaire » pour débuter le contrôle.
                    </td>
                  </tr>
                ) : (
                  inventaires.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-purple-600">{inv.reference_inventaire}</div>
                        <div className="text-xs text-slate-400">{inv.date_inventaire}</div>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {inv.depot_nom}
                      </td>

                      <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                        {inv.responsable_nom}
                      </td>

                      <td className="px-4 py-3 text-center font-bold">
                        {inv.lignes.length} lots
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold">
                        <span className={inv.valeur_nette_ecart < 0 ? 'text-rose-600' : 'text-emerald-600'}>
                          {inv.valeur_nette_ecart > 0 ? '+' : ''}
                          {fmt(inv.valeur_nette_ecart)} FCFA
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                          Ajusté en Stock
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Onglet 3 : Référentiel des Dépôts */}
      {activeTab === 'DEPOTS' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {depots.map((dep) => (
            <div
              key={dep.id}
              className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                  {dep.code}
                </span>
                {dep.type_depot === 'FRIGO' ? (
                  <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
                    <ThermometerSnowflake className="w-3.5 h-3.5" /> Frigo 2-8°C
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 font-medium">{dep.type_depot}</span>
                )}
              </div>

              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">{dep.nom}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Responsable : {dep.responsable_nom || 'Gestionnaire'}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex justify-between text-xs text-slate-500">
                <span>Lots hébergés :</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {lots.filter((l) => l.depot_id === dep.id).length}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Nouveau Transfert */}
      {transfertModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-purple-600 mb-1 flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Émettre un Bon de Transfert Inter-Dépôts
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Transférer des médicaments entre la réserve, le comptoir ou l'armoire frigorifique.
            </p>

            <form onSubmit={handleCreerTransfert} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dépôt Source (Départ) *
                  </label>
                  <select
                    value={sourceDepotId}
                    onChange={(e) => setSourceDepotId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-medium"
                  >
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Dépôt Destination (Arrivée) *
                  </label>
                  <select
                    value={destDepotId}
                    onChange={(e) => setDestDepotId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-medium"
                  >
                    {depots.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.nom}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Lot en Stock dans le Dépôt Source *
                </label>
                <select
                  required
                  value={transfertLotId}
                  onChange={(e) => setTransfertLotId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-mono"
                >
                  <option value="">Sélectionner le lot à déplacer...</option>
                  {lotsDispoSource.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.produit_nom} (Lot: {l.numero_lot}, Exp: {l.date_peremption}, Dispo: {l.quantite_actuelle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Quantité à Transférer (Boîtes) *
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={transfertQte}
                  onChange={(e) => setTransfertQte(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setTransfertModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2 text-sm font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow"
                >
                  Créer le Bon de Transfert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Inventaire Physique */}
      {inventaireModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 my-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-purple-600" />
                  Saisie d'Inventaire Physique — {depots.find((d) => d.id === inventaireDepotId)?.nom}
                </h3>
                <p className="text-xs text-slate-500">
                  Saisissez les quantités réellement comptées dans les tiroirs/rayons. Les écarts seront tracés et ajustés.
                </p>
              </div>
              <button onClick={() => setInventaireModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="p-2">Médicament & Lot</th>
                    <th className="p-2">Emplacement</th>
                    <th className="p-2 text-center">Stock Théorique</th>
                    <th className="p-2 text-center">Stock Compté Réel</th>
                    <th className="p-2 text-right">Écart Quantité</th>
                    <th className="p-2 text-right">Valeur Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {lignesInventaire.map((ligne, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-750">
                      <td className="p-2">
                        <div className="font-bold text-slate-900 dark:text-white">{ligne.produit_nom}</div>
                        <div className="font-mono text-slate-500">Lot: {ligne.numero_lot} (Exp: {ligne.date_peremption})</div>
                      </td>
                      <td className="p-2 text-slate-500">{ligne.emplacement || 'Rayon'}</td>
                      <td className="p-2 text-center font-bold">{ligne.stock_theorique}</td>
                      <td className="p-2 text-center">
                        <input
                          type="number"
                          min="0"
                          value={ligne.stock_compte}
                          onChange={(e) => handleUpdateStockCompte(idx, Number(e.target.value))}
                          className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-slate-300 rounded text-center font-bold"
                        />
                      </td>
                      <td className="p-2 text-right font-bold">
                        <span className={ligne.ecart_quantite < 0 ? 'text-rose-600' : ligne.ecart_quantite > 0 ? 'text-emerald-600' : 'text-slate-400'}>
                          {ligne.ecart_quantite > 0 ? `+${ligne.ecart_quantite}` : ligne.ecart_quantite}
                        </span>
                      </td>
                      <td className="p-2 text-right font-mono">
                        {fmt(ligne.valeur_ecart)} F
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-500">
                {lignesInventaire.filter((l) => l.ecart_quantite !== 0).length} lot(s) avec écart constaté.
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInventaireModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleValiderInventairePhysique}
                  className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow"
                >
                  Valider & Ajuster les Stocks
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
