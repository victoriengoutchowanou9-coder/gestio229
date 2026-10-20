// =============================================================================
// GESTIO 229 — VENTE AU COMPTOIR & DÉLIVRANCE PHARMACEUTIQUE (POS)
// =============================================================================
import React, { useState, useEffect, useRef } from 'react'
import {
  ShoppingCart,
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  FileText,
  CreditCard,
  Wallet,
  Smartphone,
  Printer,
  CheckCircle2,
  Pill,
  Clock,
  ShieldCheck,
  User,
  Building,
  ThermometerSnowflake,
  X,
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  pharmacieService,
  PharmacieProduit,
  PharmacieLot,
  LigneVentePharmacie,
  PharmacieOrdonnance,
  PharmacieVente,
} from '../../../services/pharmacieService'

export default function PharmacieVenteComptoirPage() {
  const { currentCompany, currentProfile } = useTenant()
  const companyId = currentCompany?.id || ''
  const userName = currentProfile?.full_name || 'Pharmacien / Caissier'

  const [produits, setProduits] = useState<PharmacieProduit[]>([])
  const [allLots, setAllLots] = useState<PharmacieLot[]>([])
  const [ordonnances, setOrdonnances] = useState<PharmacieOrdonnance[]>([])
  const [loading, setLoading] = useState(true)

  // Recherche produit
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduit, setSelectedProduit] = useState<PharmacieProduit | null>(null)
  const [eligibleLots, setEligibleLots] = useState<PharmacieLot[]>([])
  const [selectedLotId, setSelectedLotId] = useState<string>('')
  const [quantiteInput, setQuantiteInput] = useState<number>(1)

  // Panier de vente
  const [panier, setPanier] = useState<LigneVentePharmacie[]>([])

  // Paramètres client & Tiers-Payant
  const [clientNom, setClientNom] = useState('')
  const [estTiersPayant, setEstTiersPayant] = useState(false)
  const [assureurNom, setAssureurNom] = useState('')
  const [tauxPriseEnCharge, setTauxPriseEnCharge] = useState<number>(80) // 80% par défaut
  const [selectedOrdonnanceId, setSelectedOrdonnanceId] = useState<string>('')

  // Règlements
  const [modeReglement, setModeReglement] = useState<'ESPECES' | 'MOMO' | 'CARTE' | 'VIREMENT'>('ESPECES')
  const [montantRecuInput, setMontantRecuInput] = useState<string>('')

  // Modal ticket finalisé
  const [ticketFinalise, setTicketFinalise] = useState<PharmacieVente | null>(null)
  const [validating, setValidating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const searchInputRef = useRef<HTMLInputElement>(null)

  const chargerReferentiel = async () => {
    try {
      setLoading(true)
      const [prods, lots, ords] = await Promise.all([
        pharmacieService.getProduits(companyId),
        pharmacieService.getLots(companyId),
        pharmacieService.getOrdonnances(companyId),
      ])
      setProduits(prods.filter((p) => p.est_actif))
      setAllLots(lots)
      setOrdonnances(ords.filter((o) => o.statut === 'EN_ATTENTE' || o.statut === 'PARTIELLE'))
    } catch (err) {
      console.error('Erreur chargement POS pharmacie:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    chargerReferentiel()
  }, [companyId])

  // Quand un produit est sélectionné, récupérer ses lots disponibles FEFO
  useEffect(() => {
    if (!selectedProduit) {
      setEligibleLots([])
      setSelectedLotId('')
      return
    }

    const todayStr = new Date().toISOString().slice(0, 10)
    const dispoLots = allLots
      .filter(
        (l) =>
          l.produit_id === selectedProduit.id &&
          l.statut === 'DISPONIBLE' &&
          l.quantite_actuelle > 0 &&
          l.date_peremption >= todayStr
      )
      .sort((a, b) => a.date_peremption.localeCompare(b.date_peremption))

    setEligibleLots(dispoLots)
    if (dispoLots.length > 0) {
      setSelectedLotId(dispoLots[0].id) // Proposer automatiquement le plus proche en péremption (FEFO)
    } else {
      setSelectedLotId('')
    }
    setQuantiteInput(1)
  }, [selectedProduit, allLots])

  // Suggestions de recherche
  const produitsSuggestions = searchQuery.trim()
    ? produits.filter(
        (p) =>
          p.nom_commercial.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.dci.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (p.code_cip_acl || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : []

  const handleAjouterAuPanier = () => {
    if (!selectedProduit) return
    if (!selectedLotId) {
      alert('Aucun lot conforme disponible pour ce produit (rupture ou lots périmés).')
      return
    }

    const lotChoisi = eligibleLots.find((l) => l.id === selectedLotId)
    if (!lotChoisi) return

    if (quantiteInput <= 0) {
      alert('La quantité doit être supérieure à 0.')
      return
    }

    if (quantiteInput > lotChoisi.quantite_actuelle) {
      alert(`Stock insuffisant sur le lot ${lotChoisi.numero_lot} (Disponible : ${lotChoisi.quantite_actuelle}).`)
      return
    }

    // Vérification ordonnance
    if (selectedProduit.necessite_ordonnance && !selectedOrdonnanceId) {
      const confirmSansOrd = window.confirm(
        `ATTENTION PHARMACEUTIQUE :\nLe médicament "${selectedProduit.nom_commercial}" (${selectedProduit.classe_tableau}) exige une ordonnance médicale.\n\nSouhaitez-vous continuer sans associer formellement d'ordonnance ?`
      )
      if (!confirmSansOrd) return
    }

    const ligne: LigneVentePharmacie = {
      produit_id: selectedProduit.id,
      lot_id: lotChoisi.id,
      numero_lot: lotChoisi.numero_lot,
      nom_commercial: selectedProduit.nom_commercial,
      dci: selectedProduit.dci,
      forme: selectedProduit.forme_galenique,
      dosage: selectedProduit.dosage,
      date_peremption: lotChoisi.date_peremption,
      quantite: quantiteInput,
      prix_unitaire: selectedProduit.prix_vente_ttc,
      total_ligne: quantiteInput * selectedProduit.prix_vente_ttc,
      necessite_ordonnance: selectedProduit.necessite_ordonnance,
    }

    // Vérifier si même lot déjà dans panier
    const existingIdx = panier.findIndex((p) => p.lot_id === lotChoisi.id)
    if (existingIdx >= 0) {
      const newPanier = [...panier]
      const totalQte = newPanier[existingIdx].quantite + quantiteInput
      if (totalQte > lotChoisi.quantite_actuelle) {
        alert(`Quantité totale demandée (${totalQte}) dépasse le stock du lot (${lotChoisi.quantite_actuelle}).`)
        return
      }
      newPanier[existingIdx].quantite = totalQte
      newPanier[existingIdx].total_ligne = totalQte * newPanier[existingIdx].prix_unitaire
      setPanier(newPanier)
    } else {
      setPanier([...panier, ligne])
    }

    // Reset sélection
    setSelectedProduit(null)
    setSearchQuery('')
    if (searchInputRef.current) searchInputRef.current.focus()
  }

  const handleSupprimerLigne = (lotId: string) => {
    setPanier(panier.filter((l) => l.lot_id !== lotId))
  }

  // Calculs totaux
  const montantTotalBrut = panier.reduce((acc, l) => acc + l.total_ligne, 0)
  const partAssurance = estTiersPayant ? Math.round((montantTotalBrut * tauxPriseEnCharge) / 100) : 0
  const partPatient = montantTotalBrut - partAssurance

  const montantRecuNum = Number(montantRecuInput) || partPatient
  const monnaieRendue = Math.max(0, montantRecuNum - partPatient)

  const handleValiderDélivrance = async () => {
    if (panier.length === 0) {
      alert('Le panier de vente est vide.')
      return
    }

    try {
      setValidating(true)
      setErrorMsg('')

      const selOrd = ordonnances.find((o) => o.id === selectedOrdonnanceId)

      const vente = await pharmacieService.enregistrerVenteComptoir(
        companyId,
        {
          company_id: companyId,
          vendeur_id: currentProfile?.id || 'usr-default',
          vendeur_nom: userName,
          client_nom: clientNom.trim() || (estTiersPayant ? 'Assuré Tiers-Payant' : 'Patient Comptoir'),
          est_tiers_payant: estTiersPayant,
          assureur_nom: estTiersPayant ? assureurNom : undefined,
          taux_prise_en_charge: estTiersPayant ? tauxPriseEnCharge : 0,
          part_assurance: partAssurance,
          part_patient: partPatient,
          ordonnance_id: selectedOrdonnanceId || undefined,
          numero_ordonnance: selOrd?.numero_ordonnance,
          prescripteur_nom: selOrd?.prescripteur_nom,
          lignes: panier,
          montant_total_brut: montantTotalBrut,
          remise_globale: 0,
          montant_net_ttc: montantTotalBrut,
          montant_encaisse: montantRecuNum,
          monnaie_rendue: monnaieRendue,
          mode_reglement: modeReglement,
        },
        userName
      )

      setTicketFinalise(vente)
      setPanier([])
      setClientNom('')
      setSelectedOrdonnanceId('')
      setMontantRecuInput('')
      chargerReferentiel()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la délivrance')
    } finally {
      setValidating(false)
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString('fr-FR')

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            <ShoppingCart className="w-4 h-4" /> Caisse & Délivrance Sécurisée
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-1">
            Vente au Comptoir Pharmacie
          </h1>
          <p className="text-sm text-slate-500">
            Délivrance avec déstockage FEFO automatique, gestion du tiers-payant / mutuelle et contrôle des ordonnances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-medium border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-emerald-600" /> Opérateur : {userName}
          </span>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Disposition principale : Recherche & Choix (Gauche) | Panier & Encaissement (Droite) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne Gauche : Sélection Produits & Lots (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Recherche Spécialité / DCI / CIP */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm relative">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase">
              Rechercher Médicament ou Dispositif Médical
            </label>
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-3 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                autoFocus
                placeholder="Tapez le nom, la DCI (ex: Paracétamol) ou scannez le CIP..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Liste déroulante des suggestions */}
            {produitsSuggestions.length > 0 && !selectedProduit && (
              <div className="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-40 max-h-72 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                {produitsSuggestions.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => {
                      setSelectedProduit(prod)
                      setSearchQuery(prod.nom_commercial)
                    }}
                    className="p-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer flex items-center justify-between text-sm transition"
                  >
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {prod.nom_commercial}
                        {prod.conditions_conservation === 'FROID_2_8' && (
                          <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold flex items-center gap-0.5">
                            <ThermometerSnowflake className="w-3 h-3" /> 2-8°C
                          </span>
                        )}
                        {prod.necessite_ordonnance && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                            Ordonnance
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        DCI: <span className="font-semibold text-emerald-700 dark:text-emerald-400">{prod.dci}</span> • {prod.forme_galenique} {prod.dosage}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {fmt(prod.prix_vente_ttc)} F
                      </div>
                      <div className="text-[11px] text-slate-400">{prod.conditionnement}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fiche de sélection du lot FEFO pour le produit sélectionné */}
          {selectedProduit && (
            <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <Pill className="w-4 h-4 text-emerald-600" />
                    {selectedProduit.nom_commercial}
                  </h3>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    DCI: <span className="font-semibold">{selectedProduit.dci}</span> • {selectedProduit.forme_galenique} {selectedProduit.dosage}
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedProduit(null)
                    setSearchQuery('')
                  }}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Sélection du lot FEFO */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" />
                  Lot Déstocké (Priorité FEFO Date Péremption) :
                </label>

                {eligibleLots.length === 0 ? (
                  <div className="p-3 bg-rose-100/70 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 rounded-lg text-xs font-semibold">
                    Rupture de stock : Aucun lot disponible et non périmé pour ce produit.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {eligibleLots.map((lot, idx) => (
                      <div
                        key={lot.id}
                        onClick={() => setSelectedLotId(lot.id)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer transition flex items-center justify-between ${
                          selectedLotId === lot.id
                            ? 'bg-white dark:bg-slate-900 border-emerald-500 shadow-sm ring-2 ring-emerald-500'
                            : 'bg-white/60 dark:bg-slate-900/40 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div>
                          <div className="font-mono font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            Lot: {lot.numero_lot}
                            {idx === 0 && (
                              <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 py-0.2 rounded font-extrabold uppercase">
                                FEFO 1er
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Exp: <span className="font-semibold text-slate-700 dark:text-slate-300">{lot.date_peremption}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {lot.quantite_actuelle} en stock
                          </div>
                          <div className="text-[10px] text-slate-400">{lot.depot_nom}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantité & Bouton Ajout */}
              {eligibleLots.length > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="w-32">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Quantité (Boîtes)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantiteInput}
                      onChange={(e) => setQuantiteInput(Math.max(1, Number(e.target.value)))}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-center"
                    />
                  </div>

                  <div className="flex-1 self-end">
                    <button
                      type="button"
                      onClick={handleAjouterAuPanier}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold rounded-lg shadow transition flex items-center justify-center gap-2 text-sm"
                    >
                      <Plus className="w-4 h-4" /> Ajouter à la Délivrance (
                      {fmt(quantiteInput * selectedProduit.prix_vente_ttc)} F)
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Raccordement Ordonnance & Patient */}
          <div className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-600" />
              Patient & Ordonnance (Optionnel ou Réglementaire)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Nom du Patient</label>
                <input
                  type="text"
                  placeholder="Ex: M. Mensah Dossou..."
                  value={clientNom}
                  onChange={(e) => setClientNom(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Rattacher une Ordonnance</label>
                <select
                  value={selectedOrdonnanceId}
                  onChange={(e) => {
                    setSelectedOrdonnanceId(e.target.value)
                    const o = ordonnances.find((x) => x.id === e.target.value)
                    if (o && !clientNom) setClientNom(o.patient_nom)
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                >
                  <option value="">Aucune ordonnance (Vente directe / OTC)</option>
                  {ordonnances.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero_ordonnance} — {o.patient_nom} ({o.prescripteur_nom})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tiers-Payant / Assurance */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-800 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={estTiersPayant}
                  onChange={(e) => setEstTiersPayant(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                />
                <span>Prise en charge Tiers-Payant / Mutuelle Santé</span>
              </label>

              {estTiersPayant && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={assureurNom}
                    onChange={(e) => setAssureurNom(e.target.value)}
                    placeholder="Assureur (ex: Mutuelle, NSIA, SANLAM...)"
                    className="px-2.5 py-1 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg"
                  />
                  <select
                    value={tauxPriseEnCharge}
                    onChange={(e) => setTauxPriseEnCharge(Number(e.target.value))}
                    className="px-2 py-1 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-bold"
                  >
                    <option value="100">100%</option>
                    <option value="90">90%</option>
                    <option value="80">80%</option>
                    <option value="75">75%</option>
                    <option value="70">70%</option>
                    <option value="50">50%</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne Droite : Panier & Encaissement Caisse (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-md space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                Lignes de Délivrance ({panier.length})
              </h2>
              {panier.length > 0 && (
                <button
                  onClick={() => setPanier([])}
                  className="text-xs text-rose-600 hover:text-rose-700 font-medium"
                >
                  Vider
                </button>
              )}
            </div>

            {/* Liste des articles du panier */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {panier.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">
                  Le panier est vide. Utilisez la recherche à gauche pour ajouter des médicaments.
                </div>
              ) : (
                panier.map((ligne) => (
                  <div
                    key={ligne.lot_id}
                    className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-white">
                        {ligne.nom_commercial}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Lot : <span className="font-mono font-semibold">{ligne.numero_lot}</span> (Exp: {ligne.date_peremption})
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400">
                        {ligne.quantite} × {fmt(ligne.prix_unitaire)} F
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="font-mono font-black text-slate-900 dark:text-white text-sm">
                        {fmt(ligne.total_ligne)} F
                      </div>
                      <button
                        onClick={() => handleSupprimerLigne(ligne.lot_id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Décompte Financier */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Total Médicaments TTC</span>
                <span className="font-mono font-semibold">{fmt(montantTotalBrut)} FCFA</span>
              </div>

              {estTiersPayant && (
                <>
                  <div className="flex justify-between text-blue-600 dark:text-blue-400 font-medium">
                    <span>Part Assurance ({tauxPriseEnCharge}%)</span>
                    <span className="font-mono">- {fmt(partAssurance)} FCFA</span>
                  </div>
                  <div className="flex justify-between text-slate-900 dark:text-white font-bold">
                    <span>Ticket Modérateur Patient</span>
                    <span className="font-mono">{fmt(partPatient)} FCFA</span>
                  </div>
                </>
              )}

              <div className="flex justify-between text-base font-black text-emerald-700 dark:text-emerald-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>NET À ENCAISSER</span>
                <span className="font-mono text-xl">{fmt(partPatient)} FCFA</span>
              </div>
            </div>

            {/* Mode de Règlement & Monnaie */}
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Moyen de Paiement Caisse
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'ESPECES', label: 'Espèces', icon: Wallet },
                    { id: 'MOMO', label: 'MoMo', icon: Smartphone },
                    { id: 'CARTE', label: 'Carte', icon: CreditCard },
                    { id: 'VIREMENT', label: 'Virement', icon: Building },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setModeReglement(m.id as any)}
                      className={`py-2 text-xs font-bold rounded-lg border flex flex-col items-center justify-center gap-1 transition ${
                        modeReglement === m.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <m.icon className="w-3.5 h-3.5" />
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {modeReglement === 'ESPECES' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Montant Reçu (F)</label>
                    <input
                      type="number"
                      placeholder={String(partPatient)}
                      value={montantRecuInput}
                      onChange={(e) => setMontantRecuInput(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Monnaie à Rendre</label>
                    <div className="px-3 py-1.5 text-xs bg-slate-100 dark:bg-slate-900/50 rounded-lg font-mono font-bold text-emerald-600">
                      {fmt(monnaieRendue)} FCFA
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bouton de Validation Officinale */}
            <button
              type="button"
              disabled={panier.length === 0 || validating}
              onClick={handleValiderDélivrance}
              className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 disabled:opacity-50 text-white font-extrabold rounded-xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
            >
              <CheckCircle2 className="w-5 h-5" />
              {validating ? 'Validation de délivrance...' : 'Valider & Délivrer (Encaisser)'}
            </button>
          </div>
        </div>
      </div>

      {/* Modal Reçu de Délivrance Finalisé */}
      {ticketFinalise && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-4">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Délivrance Validée & Encaissée
              </h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                Réf: {ticketFinalise.reference_ticket}
              </p>
            </div>

            {/* Détails du Reçu Thermique / Ticket Officine */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl space-y-2 text-xs font-mono">
              <div className="text-center font-bold pb-2 border-b border-dashed border-slate-200">
                GESTIO229 — PHARMACIE & DÉPÔT MÉDICAL
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(ticketFinalise.date_vente).toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex justify-between">
                <span>Patient:</span>
                <span className="font-bold">{ticketFinalise.client_nom}</span>
              </div>
              {ticketFinalise.numero_ordonnance && (
                <div className="flex justify-between text-blue-600">
                  <span>Ord. N°:</span>
                  <span>{ticketFinalise.numero_ordonnance}</span>
                </div>
              )}

              <div className="pt-2 border-t border-dashed border-slate-200 space-y-1">
                {ticketFinalise.lignes.map((l, i) => (
                  <div key={i} className="flex justify-between">
                    <span>
                      {l.nom_commercial} (Lot:{l.numero_lot}) ×{l.quantite}
                    </span>
                    <span>{fmt(l.total_ligne)} F</span>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-dashed border-slate-200 space-y-1 font-bold">
                <div className="flex justify-between">
                  <span>Total Brut:</span>
                  <span>{fmt(ticketFinalise.montant_total_brut)} F</span>
                </div>
                {ticketFinalise.part_assurance > 0 && (
                  <div className="flex justify-between text-blue-600 font-normal">
                    <span>Tiers-Payant Assur.:</span>
                    <span>- {fmt(ticketFinalise.part_assurance)} F</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-emerald-600 font-black">
                  <span>Encaissé Caisse:</span>
                  <span>{fmt(ticketFinalise.part_patient)} F</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> Imprimer Ticket / Reçu
              </button>
              <button
                onClick={() => setTicketFinalise(null)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs"
              >
                Nouvelle Vente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
