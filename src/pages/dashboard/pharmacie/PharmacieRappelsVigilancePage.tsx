// =============================================================================
// GESTIO 229 — RETRAITS, RAPPELS DE LOTS & PHARMACOVIGILANCE
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  ShieldAlert,
  Search,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Ban,
  Building2,
  FileText,
  User,
  ExternalLink,
  Layers,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieRappelAlerte,
  PharmacieLot,
  PharmacieProduit,
} from '../../../services/pharmacieService'

export default function PharmacieRappelsVigilancePage() {
  const { currentCompany, currentProfile } = useTenant()
  const companyId = currentCompany?.id || 'demo-company-pharma'
  const userName = currentProfile?.full_name || 'Pharmacien Titulaire'

  const [rappels, setRappels] = useState<PharmacieRappelAlerte[]>([])
  const [lots, setLots] = useState<PharmacieLot[]>([])
  const [produits, setProduits] = useState<PharmacieProduit[]>([])
  const [loading, setLoading] = useState(true)

  // Modal Nouvelle Déclaration de Rappel / Alerte
  const [modalOpen, setModalOpen] = useState(false)
  const [nouveauRappel, setNouveauRappel] = useState<Partial<PharmacieRappelAlerte>>({
    titre: '',
    origine_alerte: 'ABMED',
    emetteur_nom: 'Agence Béninoise du Médicament (ABMed)',
    numero_lot: '',
    motif_rappel: '',
    gravite: 'MAJEURE_NIVEAU_2',
    mesures_prises: 'Blocage conservatoire immédiat en rayon et en réserve.',
  })

  const [selectedLot, setSelectedLot] = useState<PharmacieLot | null>(null)
  const [saveLoading, setSaveLoading] = useState(false)
  const [messageAction, setMessageAction] = useState('')

  const chargerDonnees = async () => {
    try {
      setLoading(true)
      const [r, l, p] = await Promise.all([
        pharmacieService.getRappelsAlertes(companyId),
        pharmacieService.getLots(companyId),
        pharmacieService.getProduits(companyId),
      ])
      setRappels(r)
      setLots(l)
      setProduits(p)
    } catch (err) {
      console.error('Erreur chargement rappels vigilance:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerDonnees()
  }, [companyId])

  const handleSelectLot = (lotId: string) => {
    const lot = lots.find((l) => l.id === lotId)
    if (lot) {
      setSelectedLot(lot)
      setNouveauRappel({
        ...nouveauRappel,
        lot_id: lot.id,
        numero_lot: lot.numero_lot,
        produit_id: lot.produit_id,
        produit_nom: lot.produit_nom,
      })
    }
  }

  const handleDeclarerRappel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nouveauRappel.numero_lot || !nouveauRappel.motif_rappel || !nouveauRappel.produit_nom) {
      alert('Veuillez renseigner le numéro de lot, le produit et le motif du rappel.')
      return
    }

    try {
      setSaveLoading(true)
      await pharmacieService.declarerRappelOuIncident(
        companyId,
        {
          titre: nouveauRappel.titre || `Rappel Lot ${nouveauRappel.numero_lot}`,
          origine_alerte: nouveauRappel.origine_alerte || 'ABMED',
          emetteur_nom: nouveauRappel.emetteur_nom || 'Autorité Sanitaire',
          date_alerte: new Date().toISOString().slice(0, 10),
          produit_id: nouveauRappel.produit_id || '',
          produit_nom: nouveauRappel.produit_nom || 'Médicament',
          lot_id: nouveauRappel.lot_id,
          numero_lot: nouveauRappel.numero_lot,
          motif_rappel: nouveauRappel.motif_rappel,
          gravite: nouveauRappel.gravite || 'MAJEURE_NIVEAU_2',
          mesures_prises: nouveauRappel.mesures_prises || 'Lot bloqué pour délivrance.',
          statut: 'EN_COURS',
          responsable_nom: userName,
        },
        userName
      )

      setModalOpen(false)
      setMessageAction(`Rappel sanitaire enregistré. Le lot ${nouveauRappel.numero_lot} a été immédiatement bloqué en stock.`)
      setTimeout(() => setMessageAction(''), 5000)
      chargerDonnees()
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la déclaration du rappel')
    } finally {
      setSaveLoading(false)
    }
  }

  const getGraviteBadge = (gravite: string) => {
    switch (gravite) {
      case 'CRITIQUE_NIVEAU_1':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white animate-pulse">Critique Niveau 1 (Retrait Immédiat)</span>
      case 'MAJEURE_NIVEAU_2':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-slate-950">Majeure Niveau 2</span>
      case 'MINEURE_NIVEAU_3':
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-700">Mineure Niveau 3</span>
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
            <ShieldAlert className="w-4 h-4" /> Qualité Officinale & Sécurité Sanitaire des Médicaments
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Retraits, Rappels de Lots & Pharmacovigilance
          </h1>
          <p className="text-sm text-slate-500">
            Traçabilité des alertes sanitaires (ABMed, grossistes, laboratoires), blocage automatique de délivrance et suivi des retours fournisseurs.
          </p>
        </div>

        <button
          onClick={() => {
            setNouveauRappel({
              titre: '',
              origine_alerte: 'ABMED',
              emetteur_nom: 'Agence Béninoise du Médicament (ABMed)',
              numero_lot: '',
              motif_rappel: '',
              gravite: 'MAJEURE_NIVEAU_2',
              mesures_prises: 'Blocage conservatoire immédiat en rayon et en réserve.',
            })
            setSelectedLot(null)
            setModalOpen(true)
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow transition"
        >
          <Plus className="w-4 h-4" /> Déclarer un Rappel de Lot / Incident
        </button>
      </div>

      {messageAction && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {messageAction}
        </div>
      )}

      {/* Rappel des principes de pharmacovigilance */}
      <div className="p-4 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/80 dark:border-amber-800/40 rounded-xl flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <div className="font-bold">Protocole de Sécurité Sanitaire GESTIO229 :</div>
          <div>
            Toute déclaration de rappel enregistrée bloque immédiatement et irrévocablement la vente du lot concerné au comptoir (POS). Les quantités encore présentes en stock ainsi que les historiques de délivrance passés sont calculés en temps réel pour faciliter la notification des patients et le retour au laboratoire ou grossiste-répartiteur.
          </div>
        </div>
      </div>

      {/* Liste des Rappels Enregistrés */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-800 dark:text-slate-200 flex items-center justify-between">
          <span>Historique des Rappels & Incidents Notifiés</span>
          <span className="text-xs text-slate-500 font-normal">{rappels.length} alerte(s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3">Réf Alerte & Date</th>
                <th className="px-4 py-3">Origine & Émetteur</th>
                <th className="px-4 py-3">Produit & N° Lot</th>
                <th className="px-4 py-3">Niveau Gravité</th>
                <th className="px-4 py-3 text-center">Quantités Bloquées / Vendues</th>
                <th className="px-4 py-3">Statut Traitement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Chargement des alertes sanitaires...
                  </td>
                </tr>
              ) : rappels.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                    Aucun rappel de lot ou incident sanitaire enregistré. Tout le stock est conforme.
                  </td>
                </tr>
              ) : (
                rappels.map((rap) => (
                  <tr key={rap.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        {rap.reference_alerte}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{rap.date_alerte}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">{rap.emetteur_nom}</div>
                      <div className="text-xs text-slate-500">Source: {rap.origine_alerte}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">{rap.produit_nom}</div>
                      <div className="text-xs font-mono font-bold text-rose-700 dark:text-rose-300">
                        Lot : {rap.numero_lot}
                      </div>
                      <div className="text-[11px] text-slate-500 italic mt-0.5">
                        {rap.motif_rappel}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      {getGraviteBadge(rap.gravite)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        <span className="text-rose-600">{rap.quantite_stock_actuel_bloquee} boîtes bloquées</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {rap.quantite_deja_vendue_historique} boîtes déjà délivrées
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        rap.statut === 'EN_COURS'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {rap.statut === 'EN_COURS' ? 'En cours de retrait' : 'Clôturé / Retourné'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Saisie Rappel */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700">
            <h2 className="text-lg font-bold text-rose-600 mb-1 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              Déclarer un Rappel de Lot Officiel
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Sélectionnez le lot concerné. La validation bloquera automatiquement toute délivrance de ce lot.
            </p>

            <form onSubmit={handleDeclarerRappel} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Origine de l'Alerte *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={nouveauRappel.origine_alerte}
                    onChange={(e) => setNouveauRappel({ ...nouveauRappel, origine_alerte: e.target.value as any })}
                    className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  >
                    <option value="ABMED">Autorité (ABMed)</option>
                    <option value="LABORATOIRE">Laboratoire Fabricant</option>
                    <option value="GROSSISTE">Grossiste-Répartiteur</option>
                    <option value="SIGNALEMENT_INTERNE">Signalement Interne</option>
                  </select>

                  <input
                    type="text"
                    required
                    placeholder="Nom de l'émetteur (ex: ABMed, Sanofi...)"
                    value={nouveauRappel.emetteur_nom || ''}
                    onChange={(e) => setNouveauRappel({ ...nouveauRappel, emetteur_nom: e.target.value })}
                    className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Choisir le Lot en Stock à Bloquer *
                </label>
                <select
                  required
                  value={nouveauRappel.lot_id || ''}
                  onChange={(e) => handleSelectLot(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-mono"
                >
                  <option value="">Sélectionner un lot en stock...</option>
                  {lots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.produit_nom} — Lot : {l.numero_lot} (Exp: {l.date_peremption}, Stock: {l.quantite_actuelle})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Niveau de Gravité
                </label>
                <select
                  value={nouveauRappel.gravite}
                  onChange={(e) => setNouveauRappel({ ...nouveauRappel, gravite: e.target.value as any })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                >
                  <option value="CRITIQUE_NIVEAU_1">Critique Niveau 1 (Retrait Immédiat, Danger Vital)</option>
                  <option value="MAJEURE_NIVEAU_2">Majeure Niveau 2 (Défaut de fabrication, rappel sous 48h)</option>
                  <option value="MINEURE_NIVEAU_3">Mineure Niveau 3 (Défaut mineur d'emballage)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Motif du Rappel Sanitaire *
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Ex: Suspicion de contamination microbiologique, impureté nitrosamine, défaut d'étiquetage..."
                  value={nouveauRappel.motif_rappel || ''}
                  onChange={(e) => setNouveauRappel({ ...nouveauRappel, motif_rappel: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Mesures Immédiates Prises
                </label>
                <input
                  type="text"
                  placeholder="Ex: Isolement dans la zone quarantaine, contact des patients traités..."
                  value={nouveauRappel.mesures_prises || ''}
                  onChange={(e) => setNouveauRappel({ ...nouveauRappel, mesures_prises: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-5 py-2 text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow"
                >
                  {saveLoading ? 'Enregistrement...' : 'Valider & Bloquer le Lot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
