// =============================================================================
// GESTIO 229 SaaS — Module Vente Rapide pour Imprimerie (Mode Simplifié)
// Interface tactile / mobile ultra-rapide : Prestation, Surface/Qté, Prix,
// Encaissement immédiat (Espèces, MoMo, Banque, Crédit), Reçu & Déduction Stock
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Printer, ShoppingCart, CheckCircle2, DollarSign, RefreshCw,
  User, Phone, Scissors, Layers, Check, ArrowRight, X, AlertTriangle
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { imprimerieService, PrestationImprimerie } from '../../../services/imprimerieService'

export const ImprimerieVenteRapidePage: React.FC = () => {
  const navigate = useNavigate()
  const { companyId, sectorSlug } = useTenant()
  const { user, company } = useAuthStore()
  const { toast } = useUIStore() as any

  const activeSector = sectorSlug || 'imprimerie'
  const prefix = `/app/${activeSector}`

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [prestations, setPrestations] = useState<PrestationImprimerie[]>([])
  const [selectedPrestation, setSelectedPrestation] = useState<PrestationImprimerie | null>(null)

  // Champs de la vente rapide
  const [quantite, setQuantite] = useState<number>(1)
  const [largeur, setLargeur] = useState<number>(1)
  const [hauteur, setHauteur] = useState<number>(1)
  const [prixVenteFinal, setPrixVenteFinal] = useState<number>(0)
  const [clientNom, setClientNom] = useState<string>('Client Comptoir')
  const [clientTel, setClientTel] = useState<string>('')
  const [modePaiement, setModePaiement] = useState<'especes' | 'momo_mtn' | 'momo_moov' | 'banque' | 'credit'>('especes')
  const [montantPaye, setMontantPaye] = useState<number>(0)

  // Reçu généré après validation
  const [recuSuccess, setRecuSuccess] = useState<{
    cmdNumero: string
    recuRef: string
    prestationNom: string
    total: number
    paye: number
    reste: number
  } | null>(null)

  const notify = (type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (typeof toast === 'function') toast(msg, type)
      else window.alert(msg)
    } catch {
      window.alert(msg)
    }
  }

  const loadPrestations = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const data = await imprimerieService.getPrestations(companyId, activeSector)
      setPrestations(data)
      if (data.length > 0) {
        setSelectedPrestation(data[0])
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadPrestations()
  }, [loadPrestations])

  // Recalcul automatique du prix lors du choix ou modification dimensions/qté
  useEffect(() => {
    if (!selectedPrestation) return
    let total = 0
    if (selectedPrestation.mode_calcul === 'm2') {
      const surface = (largeur || 1) * (hauteur || 1)
      total = Math.round(surface * (quantite || 1) * Number(selectedPrestation.prix_vente || 0))
    } else {
      total = Math.round((quantite || 1) * Number(selectedPrestation.prix_vente || 0))
    }
    setPrixVenteFinal(total)
    setMontantPaye(total)
  }, [selectedPrestation, quantite, largeur, hauteur])

  const surfaceTotale = (largeur || 1) * (hauteur || 1)
  const resteAPayer = Math.max(0, prixVenteFinal - montantPaye)

  const handleValiderVente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId || !selectedPrestation) return
    setSubmitting(true)

    try {
      const res = await imprimerieService.creerVenteRapide(
        companyId,
        activeSector,
        {
          prestation: selectedPrestation,
          quantite,
          largeur: selectedPrestation.mode_calcul === 'm2' ? largeur : undefined,
          hauteur: selectedPrestation.mode_calcul === 'm2' ? hauteur : undefined,
          prixVente: prixVenteFinal,
          clientNom: clientNom.trim() || 'Client Comptoir',
          clientTel: clientTel.trim() || undefined,
          modePaiement,
          montantPaye,
        },
        user
      )

      setRecuSuccess({
        cmdNumero: res.commande.numero_commande,
        recuRef: res.recuRef,
        prestationNom: selectedPrestation.nom,
        total: prixVenteFinal,
        paye: montantPaye,
        reste: resteAPayer,
      })

      notify('success', 'Vente comptoir enregistrée avec succès !')
    } catch (err: any) {
      notify('error', err.message || 'Erreur enregistrement vente.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetForNewSale = () => {
    setRecuSuccess(null)
    setClientNom('Client Comptoir')
    setClientTel('')
    setQuantite(1)
    setLargeur(1)
    setHauteur(1)
    if (selectedPrestation) {
      const total = Number(selectedPrestation.prix_vente || 0)
      setPrixVenteFinal(total)
      setMontantPaye(total)
    }
  }

  return (
    <div className="space-y-6 pb-16 animate-fadeIn max-w-4xl mx-auto">
      {/* ── Entête ── */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-pink-600" /> Vente Rapide & Comptoir Impression
          </h1>
          <p className="text-xs text-slate-500">
            Encaissement direct, déduction automatique des matières et impression de ticket reçu
          </p>
        </div>

        <button
          onClick={() => navigate(`${prefix}/devis`)}
          className="text-xs font-bold text-slate-600 hover:text-pink-600 hover:underline flex items-center gap-1"
        >
          Passer au Devis Détaillé <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── ÉCRAN DE SUCCÈS TICKET / REÇU ── */}
      {recuSuccess ? (
        <div className="bg-white rounded-3xl border border-emerald-200 shadow-lg p-6 space-y-5 animate-scaleUp text-center max-w-md mx-auto">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">Vente Encaissée avec Succès !</h3>
            <p className="text-xs text-slate-500">Reçu N° <span className="font-mono font-bold">{recuSuccess.recuRef}</span></p>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl text-left space-y-1.5 text-xs font-medium">
            <div className="flex justify-between">
              <span className="text-slate-500">N° Commande :</span>
              <span className="font-mono font-bold text-slate-900">{recuSuccess.cmdNumero}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Prestation :</span>
              <span className="font-bold text-slate-800">{recuSuccess.prestationNom}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Montant Total :</span>
              <span className="font-black text-slate-900">{recuSuccess.total.toLocaleString('fr-FR')} F</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Montant Encaissé :</span>
              <span className="font-bold text-emerald-700">{recuSuccess.paye.toLocaleString('fr-FR')} F</span>
            </div>
            <div className="flex justify-between border-t border-slate-200 pt-1 font-bold">
              <span className="text-slate-500">Reste dû (Créance) :</span>
              <span className={recuSuccess.reste > 0 ? 'text-amber-600 font-black' : 'text-slate-400'}>
                {recuSuccess.reste > 0 ? `${recuSuccess.reste.toLocaleString('fr-FR')} F` : '0 F (Soldé ✓)'}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Printer className="w-4 h-4" /> Imprimer Ticket Reçu
            </button>
            <button
              onClick={handleResetForNewSale}
              className="flex-1 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs transition"
            >
              Nouvelle Vente
            </button>
          </div>
        </div>
      ) : (
        /* ── FORMULAIRE VENTE COMPTOIR RAPIDE ── */
        <form onSubmit={handleValiderVente} className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 space-y-5">
          {/* 1. Choix de la Prestation */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 uppercase block">1. Sélectionner la Prestation *</label>
            {prestations.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Aucune prestation configurée.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto">
                {prestations.map((p) => {
                  const isSelected = selectedPrestation?.id === p.id
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelectedPrestation(p)}
                      className={`p-3 rounded-2xl border text-left cursor-pointer transition-all ${
                        isSelected
                          ? 'border-pink-600 bg-pink-50/70 shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-bold text-slate-900 text-xs block leading-tight truncate">{p.nom}</span>
                      <span className="text-[11px] font-black text-pink-700 block mt-1">
                        {p.prix_vente.toLocaleString('fr-FR')} F /{p.unite_facturation}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 2. Dimensions & Quantité */}
          {selectedPrestation && (
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-xs uppercase">
                  2. Détails & Dimensions ({selectedPrestation.mode_calcul === 'm2' ? 'Au m²' : 'À la pièce'})
                </span>
                <span className="text-xs font-bold text-slate-500">
                  Tarif unitaire : {selectedPrestation.prix_vente.toLocaleString('fr-FR')} F
                </span>
              </div>

              {selectedPrestation.mode_calcul === 'm2' ? (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Largeur (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0.1}
                      required
                      value={largeur}
                      onChange={(e) => setLargeur(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Hauteur (m)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0.1}
                      required
                      value={hauteur}
                      onChange={(e) => setHauteur(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Surface Totale</label>
                    <div className="px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-slate-800 text-center">
                      {surfaceTotale.toFixed(2)} m²
                    </div>
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Nombre d'Exemplaires</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={quantite}
                      onChange={(e) => setQuantite(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-center"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Quantité / Nombre de Pièces</label>
                    <input
                      type="number"
                      min={1}
                      required
                      value={quantite}
                      onChange={(e) => setQuantite(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Total Calculé Automatique</label>
                    <div className="px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-pink-700 text-base">
                      {prixVenteFinal.toLocaleString('fr-FR')} F
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3. Informations Client */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 uppercase block mb-1">Nom du Client</label>
              <input
                type="text"
                value={clientNom}
                onChange={(e) => setClientNom(e.target.value)}
                placeholder="Ex: Client Comptoir ou Société X"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-semibold"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 uppercase block mb-1">Téléphone</label>
              <input
                type="text"
                value={clientTel}
                onChange={(e) => setClientTel(e.target.value)}
                placeholder="Ex: +229 97 00 00 00"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          {/* 4. Encaissement & Règlement */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between font-bold">
              <span className="text-slate-800 uppercase">3. Règlement & Mode de Paiement</span>
              <span className="text-base font-black text-emerald-800">
                Total à payer : {prixVenteFinal.toLocaleString('fr-FR')} FCFA
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Mode de Paiement</label>
                <select
                  value={modePaiement}
                  onChange={(e) => setModePaiement(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold"
                >
                  <option value="especes">Espèces (Cash)</option>
                  <option value="momo_mtn">MTN Mobile Money</option>
                  <option value="momo_moov">Moov Money</option>
                  <option value="banque">Virement Bancaire</option>
                  <option value="credit">Vente à Crédit</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Montant Payé ce Jour (F)</label>
                <input
                  type="number"
                  min={0}
                  max={prixVenteFinal}
                  value={montantPaye}
                  onChange={(e) => setMontantPaye(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-emerald-700 text-sm"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Reste Dû (Créance)</label>
                <div className={`px-3 py-2 bg-white border rounded-xl font-black text-sm text-center ${
                  resteAPayer > 0 ? 'border-amber-300 text-amber-600' : 'border-slate-300 text-slate-400'
                }`}>
                  {resteAPayer > 0 ? `${resteAPayer.toLocaleString('fr-FR')} F` : '0 F (Soldé ✓)'}
                </div>
              </div>
            </div>
          </div>

          {/* Validation */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting || !selectedPrestation || prixVenteFinal <= 0}
              className="px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white font-black rounded-2xl text-sm shadow-md transition disabled:opacity-50 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              {submitting ? 'Validation en cours...' : `Valider la Vente (${prixVenteFinal.toLocaleString('fr-FR')} F)`}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default ImprimerieVenteRapidePage
