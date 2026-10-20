import React, { useState, useEffect } from 'react'
import {
  Ticket,
  Search,
  Printer,
  Calendar,
  Clock,
  User,
  CreditCard,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Bus,
  RefreshCw,
  QrCode,
  Undo2,
  XCircle
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportDepart,
  TransportLigne,
  TransportTicket
} from '../../../services/transportService'

export const TransportBilletteriePage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company
  const [searchParams] = useSearchParams()
  const paramDepartId = searchParams.get('departId')

  const [departs, setDeparts] = useState<TransportDepart[]>([])
  const [lignes, setLignes] = useState<TransportLigne[]>([])
  const [tickets, setTickets] = useState<TransportTicket[]>([])
  const [selectedDepart, setSelectedDepart] = useState<TransportDepart | null>(null)
  const [selectedLigne, setSelectedLigne] = useState<TransportLigne | null>(null)

  // Formulaire d'émission de billet
  const [formVente, setFormVente] = useState({
    arretDepart: '',
    arretArrivee: '',
    passagerNom: '',
    passagerTelephone: '',
    passagerPieceId: '',
    siegeNumero: 1,
    tarif: 0,
    modePaiement: 'ESPECES' as TransportTicket['mode_paiement'],
    estReservationSeule: false,
  })

  // Ticket émis à imprimer
  const [ticketImprime, setTicketImprime] = useState<TransportTicket | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [loading, setLoading] = useState(true)

  // Annulation / remboursement
  const [ticketToCancel, setTicketToCancel] = useState<TransportTicket | null>(null)
  const [motifCancel, setMotifCancel] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [allDeparts, allLignes, allTickets] = await Promise.all([
        transportService.fetchTransportDeparts(companyId),
        transportService.fetchTransportLignes(companyId),
        transportService.fetchTransportTickets(companyId)
      ])
      setDeparts(allDeparts)
      setLignes(allLignes)
      setTickets(allTickets)

      // Sélection initiale
      let targetDepart = allDeparts[0] || null
      if (paramDepartId) {
        const found = allDeparts.find(d => d.id === paramDepartId)
        if (found) targetDepart = found
      }
      setSelectedDepart(targetDepart)

      if (targetDepart) {
        const lig = allLignes.find(l => l.id === targetDepart.ligne_id) || null
        setSelectedLigne(lig)
        if (lig && lig.arrêts.length >= 2) {
          setFormVente(prev => ({
            ...prev,
            arretDepart: lig.arrêts[0].nom,
            arretArrivee: lig.arrêts[lig.arrêts.length - 1].nom,
            tarif: targetDepart.prix_base,
            siegeNumero: trouverPremierSiegeLibre(targetDepart)
          }))
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const trouverPremierSiegeLibre = (depart: TransportDepart): number => {
    for (let i = 1; i <= depart.capacite_totale; i++) {
      if (!depart.sieges_occupes.includes(i)) return i
    }
    return 1
  }

  useEffect(() => {
    loadData()
  }, [companyId, paramDepartId])

  const handleSelectDepart = (depart: TransportDepart) => {
    setSelectedDepart(depart)
    const lig = lignes.find(l => l.id === depart.ligne_id) || null
    setSelectedLigne(lig)

    if (lig && lig.arrêts.length >= 2) {
      const arrDep = lig.arrêts[0]
      const arrArr = lig.arrêts[lig.arrêts.length - 1]
      const tarifTroncon = transportService.calculerTarifTrajet(lig, arrDep.id, arrArr.id, depart.prix_base)

      setFormVente(prev => ({
        ...prev,
        arretDepart: arrDep.nom,
        arretArrivee: arrArr.nom,
        tarif: tarifTroncon,
        siegeNumero: trouverPremierSiegeLibre(depart)
      }))
    }
  }

  const handleChangerArrets = (arretDepNom: string, arretArrNom: string) => {
    setFormVente(prev => ({ ...prev, arretDepart: arretDepNom, arretArrivee: arretArrNom }))

    if (selectedLigne && selectedDepart) {
      const arrDepObj = selectedLigne.arrêts.find(a => a.nom === arretDepNom)
      const arrArrObj = selectedLigne.arrêts.find(a => a.nom === arretArrNom)

      if (arrDepObj && arrArrObj) {
        const tarif = transportService.calculerTarifTrajet(selectedLigne, arrDepObj.id, arrArrObj.id, selectedDepart.prix_base)
        setFormVente(prev => ({ ...prev, tarif }))
      }
    }
  }

  const handleEmettreTicket = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDepart) return
    setErrorMessage('')
    setSuccessMessage('')

    try {
      const res = await transportService.emettreTicketBus(companyId, {
        departId: selectedDepart.id,
        arretDepart: formVente.arretDepart,
        arretArrivee: formVente.arretArrivee,
        passagerNom: formVente.passagerNom,
        passagerTelephone: formVente.passagerTelephone,
        passagerPieceId: formVente.passagerPieceId,
        siegeNumero: Number(formVente.siegeNumero),
        tarif: Number(formVente.tarif),
        modePaiement: formVente.modePaiement,
        estReservationSeule: formVente.estReservationSeule,
      })

      if (!res.success || !res.ticket) {
        setErrorMessage(res.error || 'Erreur lors de la vente du billet.')
        return
      }

      setTicketImprime(res.ticket)
      setSuccessMessage(`Ticket émis avec succès (N° ${res.ticket.numero_ticket})`)
      setFormVente(prev => ({
        ...prev,
        passagerNom: '',
        passagerTelephone: '',
        passagerPieceId: '',
      }))

      await loadData()
    } catch (err: any) {
      setErrorMessage(err.message || 'Erreur inattendue')
    }
  }

  const handleAnnulerRembourser = async (action: 'ANNULER' | 'REMBOURSER') => {
    if (!ticketToCancel) return
    try {
      const res = await transportService.annulerRembourserTicket(companyId, ticketToCancel.id, action, motifCancel)
      if (!res.success) {
        alert(res.error || 'Erreur opération')
        return
      }
      setTicketToCancel(null)
      setMotifCancel('')
      await loadData()
    } catch (e) {
      alert('Erreur action ticket')
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Billetterie Bus & Vente au Guichet
              </h1>
              <p className="text-sm text-slate-400">
                Émission instantanée de billets, choix des sièges, calcul tarifaire et encaissement en caisse
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Grille Principale : Choix Départ, Formulaire Vente & Plan de Sièges ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne gauche : Sélection du départ actif */}
        <div className="lg:col-span-4 space-y-4">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" /> Départs Disponibles
          </h2>

          <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
            {departs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs bg-slate-900 rounded-2xl border border-slate-800">
                Aucun départ programmé.
              </div>
            ) : (
              departs.map(dep => {
                const isSelected = selectedDepart?.id === dep.id
                return (
                  <div
                    key={dep.id}
                    onClick={() => handleSelectDepart(dep)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-600/10 border-blue-500 shadow-sm'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-blue-400">
                        {dep.heure_depart}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                        dep.places_restantes === 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
                      }`}>
                        {dep.places_restantes} pl. libres
                      </span>
                    </div>

                    <h3 className="font-bold text-sm text-white mt-2">{dep.ligne_nom}</h3>

                    <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                      <span>{dep.date_depart}</span>
                      <span>Bus : {dep.bus_immatriculation}</span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* Colonne centrale & droite : Formulaire d'émission & Sièges */}
        <div className="lg:col-span-8 space-y-6">
          {selectedDepart ? (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
                <div>
                  <h3 className="font-bold text-lg text-white">{selectedDepart.ligne_nom}</h3>
                  <p className="text-xs text-slate-400">
                    Départ à <strong className="text-blue-400 font-mono">{selectedDepart.heure_depart}</strong> le {selectedDepart.date_depart} • Bus : {selectedDepart.bus_immatriculation}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400">Places vendues :</span>
                  <div className="text-base font-black text-emerald-400">
                    {selectedDepart.places_vendues} / {selectedDepart.capacite_totale}
                  </div>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{successMessage}</span>
                </div>
              )}

              <form onSubmit={handleEmettreTicket} className="space-y-4">
                {/* Arrêts Montée & Descente */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-300 font-medium">Arrêt de Montée *</label>
                    <select
                      value={formVente.arretDepart}
                      onChange={e => handleChangerArrets(e.target.value, formVente.arretArrivee)}
                      className="w-full mt-1 p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white"
                    >
                      {selectedLigne?.arrêts.map(a => (
                        <option key={a.id} value={a.nom}>{a.nom} ({a.ville})</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 font-medium">Arrêt de Descente *</label>
                    <select
                      value={formVente.arretArrivee}
                      onChange={e => handleChangerArrets(formVente.arretDepart, e.target.value)}
                      className="w-full mt-1 p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white"
                    >
                      {selectedLigne?.arrêts.map(a => (
                        <option key={a.id} value={a.nom}>{a.nom} ({a.ville})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Données Passager */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-xs text-slate-300 font-medium">Nom complet du passager *</label>
                    <input
                      type="text"
                      required
                      placeholder="ex: KOFFI Sylvain"
                      value={formVente.passagerNom}
                      onChange={e => setFormVente({ ...formVente, passagerNom: e.target.value })}
                      className="w-full mt-1 p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 font-medium">Téléphone *</label>
                    <input
                      type="tel"
                      required
                      placeholder="ex: +229 97 00 00 00"
                      value={formVente.passagerTelephone}
                      onChange={e => setFormVente({ ...formVente, passagerTelephone: e.target.value })}
                      className="w-full mt-1 p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 font-medium">N° Pièce / CNI (Facultatif)</label>
                    <input
                      type="text"
                      placeholder="CNI, Passeport, CIP"
                      value={formVente.passagerPieceId}
                      onChange={e => setFormVente({ ...formVente, passagerPieceId: e.target.value })}
                      className="w-full mt-1 p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white"
                    />
                  </div>
                </div>

                {/* Plan de Sièges Visuel & Sélection Numéro */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-slate-300 font-medium">Sélection du Siège dans le bus</label>
                    <span className="text-[11px] text-slate-400">
                      Siège choisi : <strong className="text-blue-400 font-bold">N° {formVente.siegeNumero}</strong>
                    </span>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 max-h-48 overflow-y-auto">
                    <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                      {Array.from({ length: selectedDepart.capacite_totale }, (_, i) => i + 1).map(num => {
                        const isOccupe = selectedDepart.sieges_occupes.includes(num)
                        const isChosen = formVente.siegeNumero === num

                        return (
                          <button
                            key={num}
                            type="button"
                            disabled={isOccupe}
                            onClick={() => setFormVente({ ...formVente, siegeNumero: num })}
                            className={`p-2 rounded-lg text-xs font-bold transition flex flex-col items-center justify-center ${
                              isOccupe
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30 cursor-not-allowed'
                                : isChosen
                                ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                                : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-slate-600'
                            }`}
                          >
                            <span>{num}</span>
                            <span className="text-[9px] font-normal opacity-70">
                              {isOccupe ? 'Pris' : isChosen ? 'Choisi' : 'Libre'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Tarif & Mode de Paiement */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                  <div>
                    <label className="text-xs text-slate-300 font-medium">Tarif Billet (FCFA) *</label>
                    <input
                      type="number"
                      required
                      step={500}
                      value={formVente.tarif}
                      onChange={e => setFormVente({ ...formVente, tarif: Number(e.target.value) })}
                      className="w-full mt-1 p-2.5 text-base font-bold bg-slate-950 border border-slate-800 rounded-xl text-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 font-medium">Mode de Paiement *</label>
                    <select
                      value={formVente.modePaiement}
                      onChange={e => setFormVente({ ...formVente, modePaiement: e.target.value as any })}
                      className="w-full mt-1 p-2.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white"
                    >
                      <option value="ESPECES">Espèces (Guichet)</option>
                      <option value="MOBILE_MONEY">Mobile Money (MTN / Moov / Celtiis)</option>
                      <option value="CARTE">Carte Bancaire</option>
                      <option value="CREANCE">Facture Entreprise / Crédit</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-slate-300 font-medium">Type d'opération</label>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        id="checkResa"
                        checked={formVente.estReservationSeule}
                        onChange={e => setFormVente({ ...formVente, estReservationSeule: e.target.checked })}
                        className="rounded border-slate-700 text-blue-600 focus:ring-0"
                      />
                      <label htmlFor="checkResa" className="text-xs text-slate-300 cursor-pointer">
                        Réservation seule (Paiement ultérieur)
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-3 font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2"
                  >
                    <Ticket className="w-4 h-4" />
                    Valider & Imprimer le Ticket
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500 text-sm bg-slate-900 rounded-2xl border border-slate-800">
              Veuillez sélectionner un départ pour commencer l'émission de billets.
            </div>
          )}
        </div>
      </div>

      {/* ── Aperçu du Ticket Imprimable / Reçu ── */}
      {ticketImprime && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
              <CheckCircle2 className="w-5 h-5" />
              Ticket Émis — Prêt pour Impression & Embarquement
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow transition"
            >
              <Printer className="w-4 h-4" /> Imprimer le Ticket
            </button>
          </div>

          {/* Ticket visuel format ticket thermique / voucher */}
          <div className="max-w-md mx-auto p-6 rounded-2xl bg-white text-slate-900 shadow-2xl font-mono text-xs space-y-3 border border-slate-300">
            <div className="text-center border-b border-slate-300 pb-2">
              <h4 className="font-black text-sm uppercase tracking-wider">{tenant?.name || 'COMPAGNIE DE TRANSPORT GESTIO229'}</h4>
              <p className="text-[10px] text-slate-600">Billet de Transport Voyageur Officiel</p>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>TICKET N° :</span>
              <strong className="font-black text-slate-900">{ticketImprime.numero_ticket}</strong>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>LIGNE :</span>
              <strong>{ticketImprime.ligne_nom}</strong>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>TRAJET :</span>
              <strong>{ticketImprime.arret_depart} ➔ {ticketImprime.arret_arrivee}</strong>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>DATE & HEURE :</span>
              <strong>{ticketImprime.date_voyage} à {ticketImprime.heure_depart}</strong>
            </div>

            <div className="flex justify-between text-[11px] bg-slate-100 p-2 rounded">
              <span>SIÈGE ATTRIBUÉ :</span>
              <strong className="text-sm font-black text-blue-600">N° {ticketImprime.siege_numero || 'Libre'}</strong>
            </div>

            <div className="flex justify-between text-[11px]">
              <span>PASSAGER :</span>
              <strong>{ticketImprime.passager_nom} ({ticketImprime.passager_telephone})</strong>
            </div>

            <div className="flex justify-between text-sm font-black border-t border-b border-slate-300 py-2">
              <span>MONTANT PAYÉ :</span>
              <span>{ticketImprime.tarif.toLocaleString('fr-FR')} FCFA</span>
            </div>

            <div className="text-center pt-2">
              <div className="inline-block p-2 bg-slate-100 rounded-lg border border-slate-300">
                <QrCode className="w-16 h-16 text-slate-900 mx-auto" />
                <span className="text-[9px] text-slate-600 font-mono block mt-1">{ticketImprime.qr_token.slice(0, 20)}...</span>
              </div>
              <p className="text-[9px] text-slate-500 mt-2">
                Billet strictement personnel. À présenter au contrôleur avant l'accès au bus.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Historique des Billets Récents ── */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <h3 className="font-bold text-base text-white">Tickets et Billets Émis Récemment</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-800">
                <th className="pb-3 font-semibold">N° Billet</th>
                <th className="pb-3 font-semibold">Passager</th>
                <th className="pb-3 font-semibold">Ligne & Trajet</th>
                <th className="pb-3 font-semibold">Date / Heure</th>
                <th className="pb-3 font-semibold">Siège</th>
                <th className="pb-3 font-semibold">Tarif</th>
                <th className="pb-3 font-semibold">Statut</th>
                <th className="pb-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-500">
                    Aucun billet émis.
                  </td>
                </tr>
              ) : (
                tickets.map(tkt => (
                  <tr key={tkt.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 font-mono font-bold text-blue-400">{tkt.numero_ticket}</td>
                    <td className="py-3 font-medium text-white">{tkt.passager_nom} ({tkt.passager_telephone})</td>
                    <td className="py-3 text-slate-300">{tkt.arret_depart} ➔ {tkt.arret_arrivee}</td>
                    <td className="py-3 text-slate-400">{tkt.date_voyage} {tkt.heure_depart}</td>
                    <td className="py-3 font-bold text-slate-200">N° {tkt.siege_numero || 'Libre'}</td>
                    <td className="py-3 font-bold text-emerald-400">{tkt.tarif.toLocaleString('fr-FR')} F</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        tkt.statut === 'UTILISE' ? 'bg-blue-500/20 text-blue-400' :
                        tkt.statut === 'PAYE' ? 'bg-emerald-500/20 text-emerald-400' :
                        tkt.statut === 'RESERVE' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-rose-500/20 text-rose-400'
                      }`}>
                        {tkt.statut}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      {tkt.statut !== 'UTILISE' && tkt.statut !== 'ANNULE' && tkt.statut !== 'REMBOURSE' && (
                        <button
                          onClick={() => setTicketToCancel(tkt)}
                          className="px-2.5 py-1 text-xs text-rose-400 hover:bg-rose-500/10 rounded border border-rose-500/20 transition"
                        >
                          Annuler / Rembourser
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

      {/* ── Modale Annulation / Remboursement ── */}
      {ticketToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-800 p-6 space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-rose-400" />
              Annulation ou Remboursement de Billet
            </h3>

            <p className="text-xs text-slate-300">
              Passager : <strong>{ticketToCancel.passager_nom}</strong> • Billet N° <strong>{ticketToCancel.numero_ticket}</strong> ({ticketToCancel.tarif.toLocaleString('fr-FR')} FCFA)
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Motif de l'annulation *</label>
                <textarea
                  value={motifCancel}
                  onChange={e => setMotifCancel(e.target.value)}
                  placeholder="ex: Client a raté le départ, empêchement personnel..."
                  className="w-full mt-1 p-2 bg-slate-950 border border-slate-800 rounded-lg text-white h-20"
                />
              </div>

              <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setTicketToCancel(null)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-800 rounded-lg"
                >
                  Fermer
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAnnulerRembourser('ANNULER')}
                    className="px-3 py-2 text-xs font-semibold text-white bg-slate-700 hover:bg-slate-600 rounded-lg"
                  >
                    Annuler sans frais
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAnnulerRembourser('REMBOURSER')}
                    className="px-3 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow"
                  >
                    Rembourser en Caisse
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TransportBilletteriePage
