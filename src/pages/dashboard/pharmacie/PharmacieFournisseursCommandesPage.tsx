// =============================================================================
// GESTIO 229 — FOURNISSEURS, GROSSISTES & COMMANDES PHARMACEUTIQUES
// =============================================================================
import React, { useState, useEffect } from 'react'
import {
  Truck,
  Building2,
  Search,
  Plus,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Package,
  Layers,
  ArrowRight,
  Inbox,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieProduit,
  PharmacieLot,
  PharmacieGrossiste,
  PharmacieCommandeGrossiste,
} from '../../../services/pharmacieService'

export default function PharmacieFournisseursCommandesPage() {
  const { currentCompany } = useTenant()
  const companyId = currentCompany?.id || ''

  const [activeTab, setActiveTab] = useState<'COMMANDES' | 'GROSSISTES'>('COMMANDES')
  const [produits, setProduits] = useState<PharmacieProduit[]>([])
  const [grossistes, setGrossistes] = useState<PharmacieGrossiste[]>([])
  const [commandes, setCommandes] = useState<PharmacieCommandeGrossiste[]>([])
  const [loading, setLoading] = useState(true)

  // Modal Nouveau Grossiste
  const [modalGrossisteOpen, setModalGrossisteOpen] = useState(false)
  const [nouveauGrossiste, setNouveauGrossiste] = useState<Partial<PharmacieGrossiste>>({
    nom: '',
    code: '',
    contact: '',
    telephone: '',
    email: '',
    adresse: '',
    delai_livraison_moyen: '',
  })

  // Modal Nouvelle Commande
  const [modalCmdOpen, setModalCmdOpen] = useState(false)
  const [selectedGrossiste, setSelectedGrossiste] = useState('')
  const [cmdLignes, setCmdLignes] = useState<{ produitId: string; produitNom: string; qte: number; prixAchat: number }[]>([])
  const [prodSelectId, setProdSelectId] = useState('')
  const [prodSelectQte, setProdSelectQte] = useState(10)

  // Modal Réception de Commande
  const [receptionModalOpen, setReceptionModalOpen] = useState(false)
  const [activeCmdToReceive, setActiveCmdToReceive] = useState<PharmacieCommandeGrossiste | null>(null)
  const [receptionLots, setReceptionLots] = useState<{ [key: string]: { numLot: string; dateExp: string } }>({})

  const [messageAction, setMessageAction] = useState('')

  const chargerDonnees = async () => {
    if (!companyId) return
    try {
      setLoading(true)
      const [p, g, c] = await Promise.all([
        pharmacieService.getProduits(companyId),
        pharmacieService.getGrossistes(companyId),
        pharmacieService.getCommandes(companyId),
      ])
      setProduits(p)
      setGrossistes(g)
      setCommandes(c)
      if (p.length > 0 && !prodSelectId) setProdSelectId(p[0].id)
      if (g.length > 0 && !selectedGrossiste) setSelectedGrossiste(g[0].nom)
    } catch (err) {
      console.error('Erreur chargement données fournisseurs pharmacie:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerDonnees()
  }, [companyId])

  const handleAjouterLigneCmd = () => {
    const prod = produits.find((p) => p.id === prodSelectId)
    if (!prod) return

    setCmdLignes([
      ...cmdLignes,
      {
        produitId: prod.id,
        produitNom: prod.nom_commercial,
        qte: prodSelectQte,
        prixAchat: prod.prix_achat_ht,
      },
    ])
  }

  const handleCreerCommande = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    if (!selectedGrossiste) {
      alert('Veuillez sélectionner un grossiste-répartiteur.')
      return
    }
    if (cmdLignes.length === 0) {
      alert('Veuillez ajouter au moins un produit à commander.')
      return
    }

    const total = cmdLignes.reduce((sum, l) => sum + l.qte * l.prixAchat, 0)
    try {
      const newCmd = await pharmacieService.saveCommande(companyId, {
        reference_commande: `CMD-PH-${Date.now().toString().slice(-6)}`,
        fournisseur_nom: selectedGrossiste,
        date_commande: new Date().toISOString().slice(0, 10),
        date_livraison_estimee: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        lignes: cmdLignes.map((l) => ({
          produit_nom: l.produitNom,
          quantite_commandee: l.qte,
          quantite_recue: 0,
          prix_achat_prevu: l.prixAchat,
        })),
        montant_total_estime: total,
        statut: 'COMMANDEE',
      })

      setCommandes([newCmd, ...commandes])
      setModalCmdOpen(false)
      setCmdLignes([])
      setMessageAction('Commande fournisseur émise et enregistrée avec succès.')
      setTimeout(() => setMessageAction(''), 4000)
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la création de la commande')
    }
  }

  const handleSaveGrossiste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return
    if (!nouveauGrossiste.nom?.trim()) {
      alert('Le nom du grossiste est obligatoire.')
      return
    }

    try {
      const saved = await pharmacieService.saveGrossiste(companyId, nouveauGrossiste)
      setGrossistes([...grossistes, saved])
      if (!selectedGrossiste) setSelectedGrossiste(saved.nom)
      setModalGrossisteOpen(false)
      setNouveauGrossiste({
        nom: '',
        code: '',
        contact: '',
        telephone: '',
        email: '',
        adresse: '',
        delai_livraison_moyen: '',
      })
      setMessageAction(`Fournisseur ${saved.nom} enregistré avec succès.`)
      setTimeout(() => setMessageAction(''), 4000)
    } catch (err: any) {
      alert(err.message || 'Erreur lors de l’enregistrement du grossiste')
    }
  }

  const handleOuvrirReception = (cmd: PharmacieCommandeGrossiste) => {
    setActiveCmdToReceive(cmd)
    const initialLots: { [key: string]: { numLot: string; dateExp: string } } = {}
    cmd.lignes.forEach((l, idx) => {
      initialLots[idx] = {
        numLot: '',
        dateExp: '',
      }
    })
    setReceptionLots(initialLots)
    setReceptionModalOpen(true)
  }

  const handleValiderReceptionReelle = async () => {
    if (!activeCmdToReceive || !companyId) return

    for (let i = 0; i < activeCmdToReceive.lignes.length; i++) {
      const lotInfo = receptionLots[i]
      if (!lotInfo?.numLot?.trim() || !lotInfo?.dateExp?.trim()) {
        alert('Veuillez renseigner le numéro de lot et la date de péremption pour chaque produit réceptionné.')
        return
      }
    }

    try {
      // Pour chaque ligne, créer le lot dans les stocks réels
      for (let i = 0; i < activeCmdToReceive.lignes.length; i++) {
        const l = activeCmdToReceive.lignes[i]
        const lotInfo = receptionLots[i]
        const prod = produits.find((p) => p.nom_commercial === l.produit_nom)

        await pharmacieService.saveLot(companyId, {
          produit_id: prod?.id,
          produit_nom: l.produit_nom,
          numero_lot: lotInfo.numLot.trim().toUpperCase(),
          date_peremption: lotInfo.dateExp,
          quantite_initiale: l.quantite_commandee,
          quantite_actuelle: l.quantite_commandee,
          fournisseur_nom: activeCmdToReceive.fournisseur_nom,
          prix_achat_unitaire: l.prix_achat_prevu,
          numero_bon_reception: activeCmdToReceive.reference_commande,
          statut: 'DISPONIBLE',
        })
      }

      // Mettre à jour le statut de la commande
      const updatedCmd: PharmacieCommandeGrossiste = {
        ...activeCmdToReceive,
        statut: 'LIVREE_RECEPTIONNEE',
        lignes: activeCmdToReceive.lignes.map((lg) => ({ ...lg, quantite_recue: lg.quantite_commandee })),
      }
      await pharmacieService.saveCommande(companyId, updatedCmd)

      setCommandes(commandes.map((c) => (c.id === updatedCmd.id ? updatedCmd : c)))
      setReceptionModalOpen(false)
      setMessageAction(
        `Réception validée : les lots et dates de péremption réels ont été intégrés aux stocks de l'officine.`
      )
      setTimeout(() => setMessageAction(''), 5000)
    } catch (err: any) {
      alert(err.message || 'Erreur lors de la réception')
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString('fr-FR')

  if (!companyId) {
    return (
      <div className="p-8 text-center text-slate-500">
        Chargement du contexte officinal...
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
            <Truck className="w-4 h-4" /> Chaîne d'Approvisionnement Médicale & Grossistes-Répartiteurs
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Achats, Commandes & Réception de Lots
          </h1>
          <p className="text-sm text-slate-500">
            Gestion des commandes aux grossistes répartiteurs et contrôle strict des lots et DLC à la réception.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setModalGrossisteOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 font-bold rounded-xl border border-slate-300 dark:border-slate-600 transition text-xs"
          >
            <Building2 className="w-4 h-4 text-teal-600" /> Nouveau Fournisseur
          </button>
          <button
            onClick={() => {
              if (grossistes.length === 0) {
                alert('Veuillez d’abord enregistrer au moins un grossiste-répartiteur.')
                setModalGrossisteOpen(true)
                return
              }
              if (produits.length === 0) {
                alert('Veuillez d’abord enregistrer des produits dans votre catalogue pharmaceutique.')
                return
              }
              setModalCmdOpen(true)
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl shadow transition text-xs"
          >
            <Plus className="w-4 h-4" /> Passer une Commande Grossiste
          </button>
        </div>
      </div>

      {messageAction && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          {messageAction}
        </div>
      )}

      {/* Onglets */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 gap-6">
        <button
          onClick={() => setActiveTab('COMMANDES')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'COMMANDES'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4" />
          Bons de Commande & Réceptions ({commandes.length})
        </button>

        <button
          onClick={() => setActiveTab('GROSSISTES')}
          className={`pb-3 text-sm font-bold flex items-center gap-2 border-b-2 transition ${
            activeTab === 'GROSSISTES'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Grossistes Répartiteurs ({grossistes.length})
        </button>
      </div>

      {/* Onglet 1 : Commandes & Réceptions */}
      {activeTab === 'COMMANDES' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          {commandes.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                Aucune commande fournisseur enregistrée
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Vous n'avez pas encore passé de commande grossiste. Cliquez ci-dessous pour émettre votre première commande et réceptionner vos lots en stock.
              </p>
              <button
                onClick={() => {
                  if (grossistes.length === 0) {
                    alert('Veuillez d’abord enregistrer un grossiste-répartiteur.')
                    setModalGrossisteOpen(true)
                    return
                  }
                  if (produits.length === 0) {
                    alert('Veuillez d’abord enregistrer des produits dans votre catalogue pharmaceutique.')
                    return
                  }
                  setModalCmdOpen(true)
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Passer une Commande
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3">Réf Commande & Date</th>
                    <th className="px-4 py-3">Fournisseur / Grossiste</th>
                    <th className="px-4 py-3">Articles Commandés</th>
                    <th className="px-4 py-3 text-right">Montant Estimé</th>
                    <th className="px-4 py-3">Statut Réception</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {commandes.map((cmd) => (
                    <tr key={cmd.id} className="hover:bg-slate-50 dark:hover:bg-slate-750 transition">
                      <td className="px-4 py-3">
                        <div className="font-mono font-bold text-teal-600">{cmd.reference_commande}</div>
                        <div className="text-xs text-slate-400 mt-0.5">Émise le {cmd.date_commande}</div>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                        {cmd.fournisseur_nom}
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-xs space-y-0.5">
                          {cmd.lignes.map((l, i) => (
                            <div key={i} className="text-slate-700 dark:text-slate-300">
                              <span className="font-bold">{l.produit_nom}</span> : {l.quantite_commandee} btes
                              {l.quantite_recue > 0 && (
                                <span className="text-emerald-600 ml-1 font-semibold">
                                  (Reçu {l.quantite_recue})
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                        {fmt(cmd.montant_total_estime)} FCFA
                      </td>

                      <td className="px-4 py-3">
                        {cmd.statut === 'LIVREE_RECEPTIONNEE' ? (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 w-fit">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Réceptionné & Intégré Stock
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1 w-fit">
                            <Clock className="w-3.5 h-3.5" /> En attente de livraison
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {cmd.statut !== 'LIVREE_RECEPTIONNEE' && (
                          <button
                            onClick={() => handleOuvrirReception(cmd)}
                            className="px-3 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow"
                          >
                            Réceptionner Lots
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Onglet 2 : Fiches Grossistes */}
      {activeTab === 'GROSSISTES' && (
        <div>
          {grossistes.length === 0 ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-12 text-center space-y-3">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                Aucun grossiste-répartiteur enregistré
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Enregistrez vos fournisseurs pharmaceutiques réels pour émettre des bons de commande et approvisionner votre officine.
              </p>
              <button
                onClick={() => setModalGrossisteOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-lg text-xs shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Ajouter un Fournisseur
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {grossistes.map((g) => (
                <div
                  key={g.id}
                  className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-teal-600 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded">
                      {g.code}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">Partenaire Officine</span>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{g.nom}</h3>
                    {g.adresse && <p className="text-xs text-slate-500 mt-0.5">{g.adresse}</p>}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-700 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {g.telephone && (
                      <div>
                        Téléphone : <span className="font-semibold text-slate-900 dark:text-white">{g.telephone}</span>
                      </div>
                    )}
                    {g.email && (
                      <div>
                        Email : <span className="font-semibold text-slate-900 dark:text-white">{g.email}</span>
                      </div>
                    )}
                    {g.delai_livraison_moyen && (
                      <div>
                        Délai moyen : <span className="font-bold text-teal-600">{g.delai_livraison_moyen}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Nouveau Grossiste */}
      {modalGrossisteOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h2 className="text-lg font-bold text-teal-600 flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Nouveau Fournisseur / Grossiste-Répartiteur
            </h2>

            <form onSubmit={handleSaveGrossiste} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nom du Fournisseur / Grossiste *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: UBIPHARM Bénin, CAME, Grossiste Local..."
                  value={nouveauGrossiste.nom || ''}
                  onChange={(e) => setNouveauGrossiste({ ...nouveauGrossiste, nom: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Code / Identifiant
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: GROSS-01"
                    value={nouveauGrossiste.code || ''}
                    onChange={(e) => setNouveauGrossiste({ ...nouveauGrossiste, code: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Délai Moyen Livraison
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 2h à 4h, 24h..."
                    value={nouveauGrossiste.delai_livraison_moyen || ''}
                    onChange={(e) => setNouveauGrossiste({ ...nouveauGrossiste, delai_livraison_moyen: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    placeholder="+229 ..."
                    value={nouveauGrossiste.telephone || ''}
                    onChange={(e) => setNouveauGrossiste({ ...nouveauGrossiste, telephone: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="contact@..."
                    value={nouveauGrossiste.email || ''}
                    onChange={(e) => setNouveauGrossiste({ ...nouveauGrossiste, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Adresse / Localisation
                </label>
                <input
                  type="text"
                  placeholder="Ex: Cotonou, Akpakpa..."
                  value={nouveauGrossiste.adresse || ''}
                  onChange={(e) => setNouveauGrossiste({ ...nouveauGrossiste, adresse: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalGrossisteOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Saisie Commande */}
      {modalCmdOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <h2 className="text-lg font-bold text-teal-600 flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Émettre un Bon de Commande Grossiste
            </h2>

            <form onSubmit={handleCreerCommande} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Grossiste-Répartiteur *
                </label>
                <select
                  value={selectedGrossiste}
                  onChange={(e) => setSelectedGrossiste(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-medium"
                >
                  {grossistes.map((g) => (
                    <option key={g.id} value={g.nom}>
                      {g.nom} {g.delai_livraison_moyen ? `(${g.delai_livraison_moyen})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sélection d'articles */}
              <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ajouter un Médicament :
                </div>

                <div className="flex gap-2">
                  <select
                    value={prodSelectId}
                    onChange={(e) => setProdSelectId(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 rounded-lg"
                  >
                    {produits.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom_commercial} (Achat: {fmt(p.prix_achat_ht)} F)
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={prodSelectQte}
                    onChange={(e) => setProdSelectQte(Number(e.target.value))}
                    className="w-16 px-2 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 rounded-lg text-center font-bold"
                  />

                  <button
                    type="button"
                    onClick={handleAjouterLigneCmd}
                    className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-bold"
                  >
                    + Ajouter
                  </button>
                </div>

                {cmdLignes.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-slate-200 text-xs">
                    {cmdLignes.map((l, i) => (
                      <div key={i} className="flex justify-between items-center bg-white dark:bg-slate-800 p-2 rounded border border-slate-200">
                        <span>{l.produitNom} × {l.qte}</span>
                        <span className="font-mono font-bold">{fmt(l.qte * l.prixAchat)} F</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setModalCmdOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow"
                >
                  Valider et Émettre la Commande
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Réception de Lots */}
      {receptionModalOpen && activeCmdToReceive && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-teal-600 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Contrôle Réception — {activeCmdToReceive.reference_commande}
              </h2>
              <p className="text-xs text-slate-500">
                Saisissez les numéros de lots réels et dates de péremption figurant sur les conditionnements livrés par {activeCmdToReceive.fournisseur_nom}.
              </p>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {activeCmdToReceive.lignes.map((ligne, idx) => (
                <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 rounded-xl space-y-2 text-xs">
                  <div className="font-bold text-slate-900 dark:text-white flex justify-between">
                    <span>{ligne.produit_nom}</span>
                    <span className="text-teal-600">Qté livrée : {ligne.quantite_commandee} btes</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">N° Lot Fabricant Réel *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: LOT-2026-X1"
                        value={receptionLots[idx]?.numLot || ''}
                        onChange={(e) =>
                          setReceptionLots({
                            ...receptionLots,
                            [idx]: { ...receptionLots[idx], numLot: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 rounded font-mono font-bold uppercase"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-0.5">Date Péremption Réelle (DLC) *</label>
                      <input
                        type="date"
                        required
                        value={receptionLots[idx]?.dateExp || ''}
                        onChange={(e) =>
                          setReceptionLots({
                            ...receptionLots,
                            [idx]: { ...receptionLots[idx], dateExp: e.target.value },
                          })
                        }
                        className="w-full px-2.5 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 rounded font-bold"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setReceptionModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleValiderReceptionReelle}
                className="px-5 py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white rounded-lg shadow"
              >
                Valider Entrée en Stock FEFO
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
