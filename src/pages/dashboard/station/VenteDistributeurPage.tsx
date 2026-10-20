// =============================================================================
// GESTIO 229 — SECTEUR STATION-SERVICE & HYDROCARBURES
// MODULE 1 : VENTE DISTRIBUTEUR DE CARBURANTS (Essence Super, Gasoil, Pétrole)
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Fuel, Gauge, User, Zap, Droplet, Car, Check, RefreshCw,
  Printer, ArrowRight, ShoppingCart, AlertTriangle, CheckCircle2,
  Wallet, Smartphone, CreditCard, Landmark, DollarSign, X
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import { supabase } from '../../../lib/supabase'
import { enregistrerMouvementCaisse, checkSectorCaisseStatus } from '../../../services/caisseSectorService'
import {
  DEFAULT_STATION_FUELS,
  FuelPumpItem,
  calculateAmountFromVolume,
  calculateVolumeFromAmount
} from '../../../utils/stationFuelHelper'
import clsx from 'clsx'

export const VenteDistributeurPage: React.FC = () => {
  const navigate = useNavigate()
  const { companyId, sectorSlug, currentSectorSlug, company, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const cleanSectorSlug = (currentSectorSlug || sectorSlug || 'station-service')
    .toLowerCase()
    .trim()
    .replace(/^sec-/, '')

  // Données de configuration station
  const [pistolets, setPistolets] = useState<FuelPumpItem[]>([])
  const [pompistes, setPompistes] = useState<any[]>([])
  const [cuves, setCuves] = useState<any[]>([])
  const [flotteVehicules, setFlotteVehicules] = useState<any[]>([])
  const [activeCaisse, setActiveCaisse] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [processing, setProcessing] = useState<boolean>(false)

  // Sélections de vente
  const [selectedPistoletId, setSelectedPistoletId] = useState<string>('')
  const [selectedPompisteId, setSelectedPompisteId] = useState<string>('')
  const [selectedVehiculeId, setSelectedVehiculeId] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'MOMO' | 'CARD' | 'TRANSFER' | 'CREDIT'>('CASH')

  // Calculateur Montant / Volume (Valeur initiale strictement à 0)
  const [calcMode, setCalcMode] = useState<'montant' | 'volume'>('montant')
  const [inputMontant, setInputMontant] = useState<string>('0')
  const [inputVolume, setInputVolume] = useState<string>('0.00')

  // Reçu / Ticket après validation
  const [lastTicket, setLastTicket] = useState<any>(null)
  const [showTicketModal, setShowTicketModal] = useState<boolean>(false)

  // Chargement des données de la station
  const loadStationData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // 1. État de la caisse
      const caisseStatus = await checkSectorCaisseStatus(companyId, cleanSectorSlug)
      setActiveCaisse(caisseStatus?.session || null)

      // 2. Cuves réelles (seules sources valides de stock de carburant)
      const { data: cuveData } = await supabaseTenant('station_cuves')
        .select('*')
        .order('nom')
      
      const activeCuves = (cuveData || []).filter((c: any) => !c.statut || c.statut === 'ACTIF')
      setCuves(activeCuves)

      // 3. Pompes / Pistolets
      const { data: pistData } = await supabaseTenant('station_pistolets')
        .select('*')
        .order('numero_pompe')

      let effectivePistolets: FuelPumpItem[] = []

      if (pistData && pistData.length > 0) {
        effectivePistolets = pistData
          .filter((p: any) => !p.statut || p.statut === 'ACTIF' || p.statut === 'ACTIVE')
          .map((p: any) => {
            const linkedCuve = activeCuves.find((c: any) => 
              (p.cuve_id && c.id === p.cuve_id) || 
              (p.cuve_nom && c.nom?.toLowerCase() === p.cuve_nom?.toLowerCase()) ||
              (c.produit && p.produit && c.produit.toLowerCase() === p.produit.toLowerCase())
            )
            // Disponibilité strictement liée au stock réel de la cuve associée
            const realStock = linkedCuve ? Math.max(0, Number(linkedCuve.stock_actuel ?? linkedCuve.stock_theorique ?? 0)) : 0
            return {
              id: p.id,
              code_pistolet: p.code_pistolet || 'P01',
              numero_pompe: p.numero_pompe || 'Pompe 01',
              produit: p.produit || 'Essence Super',
              prix_actuel: Number(p.prix_actuel) || (p.produit?.toLowerCase().includes('gasoil') ? 700 : p.produit?.toLowerCase().includes('pétrole') ? 650 : 680),
              cuve_id: linkedCuve?.id || p.cuve_id || undefined,
              cuve_nom: linkedCuve?.nom || p.cuve_nom || undefined,
              stock_disponible: realStock,
              statut: p.statut || 'ACTIF',
            }
          })
      } else {
        // Recherche dans station_pompes si table alternative
        const { data: pompesData } = await supabaseTenant('station_pompes')
          .select('*')
          .order('numero_pompe')

        if (pompesData && pompesData.length > 0) {
          effectivePistolets = pompesData
            .filter((p: any) => !p.statut || p.statut === 'ACTIVE' || p.statut === 'ACTIF')
            .map((p: any) => {
              const linkedCuve = activeCuves.find((c: any) => 
                (p.cuve_id && c.id === p.cuve_id) || 
                (p.cuve_associee && c.nom?.toLowerCase() === p.cuve_associee?.toLowerCase()) ||
                (c.produit && p.type_carburant && c.produit.toLowerCase() === p.type_carburant.toLowerCase())
              )
              const realStock = linkedCuve ? Math.max(0, Number(linkedCuve.stock_actuel ?? linkedCuve.stock_theorique ?? 0)) : 0
              const typeCarb = p.type_carburant || 'Essence Super'
              return {
                id: p.id,
                code_pistolet: `P-${p.numero_pompe || '01'}`,
                numero_pompe: p.nom_pompe || p.numero_pompe || 'Pompe 01',
                produit: typeCarb,
                prix_actuel: Number(p.prix_litre) || (typeCarb.toLowerCase().includes('gasoil') ? 700 : typeCarb.toLowerCase().includes('pétrole') ? 650 : 680),
                cuve_id: linkedCuve?.id || p.cuve_id || undefined,
                cuve_nom: linkedCuve?.nom || p.cuve_associee || undefined,
                stock_disponible: realStock,
                statut: p.statut || 'ACTIVE',
              }
            })
        }
      }

      // Si aucune pompe configurée en base, afficher le référentiel des 3 carburants
      // MAIS leur disponibilité dépend STRICTEMENT des cuves réelles existantes (0 L si aucune cuve) !
      if (effectivePistolets.length === 0) {
        effectivePistolets = DEFAULT_STATION_FUELS.map(df => {
          const linkedCuve = activeCuves.find((c: any) => 
            c.produit?.toLowerCase()?.includes(df.produit.toLowerCase()) || 
            df.produit.toLowerCase().includes(c.produit?.toLowerCase())
          )
          const realStock = linkedCuve ? Math.max(0, Number(linkedCuve.stock_actuel ?? linkedCuve.stock_theorique ?? 0)) : 0
          return {
            ...df,
            statut: 'ACTIF',
            cuve_id: linkedCuve?.id || undefined,
            cuve_nom: linkedCuve?.nom || undefined,
            stock_disponible: realStock, // Strictement 0 L si aucune cuve enregistrée !
          }
        })
      }

      setPistolets(effectivePistolets)
      if (!selectedPistoletId && effectivePistolets.length > 0) {
        setSelectedPistoletId(effectivePistolets[0].id)
      }

      // 4. Pompistes actifs
      const { data: pompData } = await supabaseTenant('station_pompistes')
        .select('*')
        .eq('statut', 'ACTIF')
        .order('nom_complet')
      setPompistes(pompData || [])
      if (pompData && pompData.length > 0 && !selectedPompisteId) {
        setSelectedPompisteId(pompData[0].id)
      }

      // 5. Véhicules / Flottes
      const { data: vehData } = await supabaseTenant('station_vehicules_flotte')
        .select('*')
        .eq('statut', 'ACTIF')
        .order('immatriculation')
      setFlotteVehicules(vehData || [])

    } catch (err) {
      console.warn('[VenteDistributeur] Notice chargement station, utilisation des paramètres réels:', err)
      const fallbackPistolets = DEFAULT_STATION_FUELS.map(df => ({
        ...df,
        statut: 'ACTIF',
        stock_disponible: 0, // Strictement 0 en cas de fallback
      }))
      setPistolets(fallbackPistolets)
      if (!selectedPistoletId) setSelectedPistoletId(fallbackPistolets[0].id)
    } finally {
      setLoading(false)
    }
  }, [companyId, cleanSectorSlug, supabaseTenant, selectedPistoletId, selectedPompisteId])

  useEffect(() => {
    loadStationData()
  }, [loadStationData])

  // Pistolet / Carburant actuellement sélectionné
  const currentPistolet = useMemo(() => {
    return pistolets.find(p => p.id === selectedPistoletId) || pistolets[0] || {
      id: 'default',
      code_pistolet: 'P01-SUPER',
      numero_pompe: 'Pompe 01',
      produit: 'Essence Super',
      prix_actuel: 680,
      statut: 'ACTIF',
      stock_disponible: 0, // Strictement 0 si non défini
    }
  }, [pistolets, selectedPistoletId])

  const unitPrice = Number(currentPistolet?.prix_actuel) || 680

  // Synchronisation Montant <-> Volume (cohérence stricte prix / montant / volume)
  useEffect(() => {
    if (calcMode === 'montant') {
      const m = parseFloat(inputMontant) || 0
      if (unitPrice > 0 && m > 0) {
        const v = calculateVolumeFromAmount(m, unitPrice)
        setInputVolume(String(v))
      } else {
        setInputVolume('0.00')
      }
    } else {
      const v = parseFloat(inputVolume) || 0
      if (unitPrice > 0 && v > 0) {
        const m = calculateAmountFromVolume(v, unitPrice)
        setInputMontant(String(m))
      } else {
        setInputMontant('0')
      }
    }
  }, [calcMode, unitPrice])

  const handleMontantChange = (val: string) => {
    setInputMontant(val)
    const m = parseFloat(val) || 0
    if (unitPrice > 0 && m > 0) {
      const v = calculateVolumeFromAmount(m, unitPrice)
      setInputVolume(String(v))
    } else {
      setInputVolume('0.00')
    }
  }

  const handleVolumeChange = (val: string) => {
    setInputVolume(val)
    const v = parseFloat(val) || 0
    if (unitPrice > 0 && v > 0) {
      const m = calculateAmountFromVolume(v, unitPrice)
      setInputMontant(String(m))
    } else {
      setInputMontant('0')
    }
  }

  // Raccourcis rapides
  const quickAmounts = [1000, 2000, 5000, 10000, 15000, 20000, 50000]
  const quickVolumes = [2, 5, 10, 20, 30, 50]

  // Validation directe et autonome de la vente distributeur avec déstockage réel
  const handleValidateSale = async () => {
    const vol = parseFloat(inputVolume) || 0
    const mnt = parseFloat(inputMontant) || 0
    const stockDispo = Number(currentPistolet?.stock_disponible || 0)

    if (mnt <= 0 || vol <= 0) {
      toast.error('Montant requis', 'Veuillez saisir un montant ou un volume valide à distribuer (supérieur à 0).')
      return
    }

    // 1. Contrôle strict de disponibilité du carburant (pas de vente si 0 cuve ou stock vide)
    if (stockDispo <= 0) {
      toast.error(
        'Vente impossible : Stock épuisé',
        `Aucun carburant disponible en cuve pour ${currentPistolet.produit} (Disponibilité : 0 L). Veuillez approvisionner la cuve.`
      )
      return
    }

    // 2. Contrôle anti-stock négatif : volume demandé ne doit pas excéder le stock en cuve
    if (vol > stockDispo) {
      toast.error(
        'Stock insuffisant en cuve',
        `La quantité calculée (${vol} L) dépasse le stock disponible (${stockDispo} L). Vente bloquée pour préserver la cohérence des cuves.`
      )
      return
    }

    setProcessing(true)
    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const orderNumber = `CARB-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(Math.floor(1000 + Math.random() * 9000))}`

      const selectedPomp = pompistes.find(p => p.id === selectedPompisteId)
      const selectedVeh = flotteVehicules.find(v => v.id === selectedVehiculeId)
      const pompisteNom = selectedPomp?.nom_complet || 'Pompiste de Service'
      const clientNom = selectedVeh?.client_nom || (selectedVeh ? `Flotte ${selectedVeh.immatriculation}` : 'Client Comptoir')

      const saleNotes = `Vente Distributeur Carburant: ${vol}L de ${currentPistolet.produit} à la ${currentPistolet.numero_pompe} (${currentPistolet.code_pistolet}) - Pompiste: ${pompisteNom}${selectedVeh ? ` - Véhicule: ${selectedVeh.immatriculation}` : ''}`

      // Identifier la cuve raccordée pour déstockage
      const targetCuveId = currentPistolet.cuve_id || (cuves.find((c: any) => 
        c.produit?.toLowerCase() === currentPistolet.produit?.toLowerCase()
      )?.id)

      // Calcul du nouveau stock (garanti >= 0)
      const newStock = Math.max(0, Math.round((stockDispo - vol) * 100) / 100)

      // 1. Enregistrement dans sales_orders
      const salePayload: any = {
        company_id: companyId,
        sector_slug: cleanSectorSlug,
        order_number: orderNumber,
        customer_name: clientNom,
        order_type: 'carburant_distributeur',
        status: 'COMPLETED',
        total_amount: mnt,
        paid_amount: mnt,
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'CREDIT' ? 'PENDING' : 'PAID',
        notes: saleNotes,
        created_at: nowIso,
        updated_at: nowIso,
        metadata: {
          produit: currentPistolet.produit,
          numero_pompe: currentPistolet.numero_pompe,
          code_pistolet: currentPistolet.code_pistolet,
          prix_litre: unitPrice,
          volume_litres: vol,
          pompiste_id: selectedPompisteId || null,
          pompiste_nom: pompisteNom,
          immatriculation: selectedVeh?.immatriculation || null,
          cuve_id: targetCuveId || null,
          stock_avant: stockDispo,
          stock_apres: newStock,
        }
      }

      let insertedOrderId: string | null = null
      try {
        const { data: orderData, error: orderErr } = await supabase
          .from('sales_orders')
          .insert(salePayload)
          .select('id')
          .single()

        if (!orderErr && orderData) {
          insertedOrderId = orderData.id

          // 2. Ligne de commande correspondante
          await supabase.from('sales_order_items').insert({
            order_id: insertedOrderId,
            product_name: `${currentPistolet.produit} (${currentPistolet.numero_pompe})`,
            quantity: vol,
            unit_price: unitPrice,
            total_price: mnt,
            notes: `Volume: ${vol} Litres - Pistolet ${currentPistolet.code_pistolet}`
          })
        }
      } catch (orderEx) {
        console.warn('[VenteDistributeur] Notice insert sales_orders:', orderEx)
      }

      // 3. Décrémentation automatique du stock de la cuve & actualisation
      if (targetCuveId) {
        try {
          await supabase
            .from('station_cuves')
            .update({ 
              stock_actuel: newStock, 
              stock_theorique: newStock,
              updated_at: nowIso 
            })
            .eq('id', targetCuveId)
        } catch (cuveEx) {
          console.warn('[VenteDistributeur] Notice mise à jour cuve:', cuveEx)
        }
      }

      // Actualisation immédiate de l'état local (réactivité instantanée sans attendre le rechargement)
      if (targetCuveId) {
        setCuves(prev => prev.map(c => c.id === targetCuveId ? { ...c, stock_actuel: newStock, stock_theorique: newStock } : c))
      }
      setPistolets(prev => prev.map(p => 
        (p.id === currentPistolet.id || (targetCuveId && p.cuve_id === targetCuveId))
          ? { ...p, stock_disponible: newStock }
          : p
      ))

      // 4. Intégration en caisse (si espèces ou mobile money)
      if (paymentMethod === 'CASH' || paymentMethod === 'MOMO') {
        try {
          await enregistrerMouvementCaisse({
            company_id: companyId || '',
            sector_slug: cleanSectorSlug,
            caisse_id: activeCaisse?.caisse_id || activeCaisse?.id,
            caisse_session_id: activeCaisse?.id || null,
            type: 'vente_carburant',
            sens: 'entree',
            montant_especes: paymentMethod === 'CASH' ? mnt : 0,
            montant_momo: paymentMethod === 'MOMO' ? mnt : 0,
            source_module: 'vente_distributeur',
            source_id: insertedOrderId || orderNumber,
            libelle: `Vente Distributeur ${currentPistolet.produit} (${vol} L) - ${currentPistolet.numero_pompe}`
          })
        } catch (caisseEx) {
          console.warn('[VenteDistributeur] Notice enregistrement mouvement caisse:', caisseEx)
        }
      }

      // Préparation du reçu pour impression
      const ticketData = {
        orderNumber,
        date: now.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
        heure: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        stationNom: company?.name || 'STATION-SERVICE GESTIO229',
        telephone: company?.phone || '',
        ifu: company?.ifu || '',
        pompisteNom,
        pompe: currentPistolet.numero_pompe,
        pistolet: currentPistolet.code_pistolet,
        carburant: currentPistolet.produit,
        volume: vol,
        prixLitre: unitPrice,
        montantTotal: mnt,
        modePaiement: paymentMethod,
        vehicule: selectedVeh?.immatriculation || null,
        client: clientNom,
      }

      setLastTicket(ticketData)
      setShowTicketModal(true)

      toast.success(
        'Vente distributeur validée !',
        `${vol} L de ${currentPistolet.produit} (${formatFCFA(mnt)}) enregistrés. Stock cuve actualisé : ${newStock} L.`
      )

      // Recharger les données de cuves en tâche de fond pour synchronisation
      loadStationData()

    } catch (err: any) {
      console.error('[VenteDistributeur] Erreur validation vente:', err)
      toast.error('Erreur validation', err.message || 'Impossible d\'enregistrer la distribution.')
    } finally {
      setProcessing(false)
    }
  }

  // Réinitialisation rapide pour le client suivant (Montant remis à 0)
  const handleResetForNextClient = () => {
    setShowTicketModal(false)
    setCalcMode('montant')
    setInputMontant('0')
    setInputVolume('0.00')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-5 lg:p-6 space-y-5">
      {/* ─── BANDEAU SUPÉRIEUR & SÉLECTEUR DE MODULE STATION ─── */}
      <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20 font-black">
            <Fuel className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-white tracking-tight">
                Vente Distributeur de Carburant
              </h1>
              <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-0.5 rounded-full font-bold">
                Module 1 : Carburants
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Distribution exclusive Essence Super, Gasoil & Pétrole Lampant • Encaissement direct en piste
            </p>
          </div>
        </div>

        {/* ── Sélecteur / Switcher 1-clic entre Module 1 et Module 2 ── */}
        <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black bg-amber-500 text-slate-950 shadow-md transition"
          >
            <Fuel className="w-4 h-4" />
            <span>Vente Distributeur (Carburants)</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(`/app/${cleanSectorSlug}/vente-pos`)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Vente en Panier (Lubrifiants & Boutique)</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* ─── ÉTAT DE LA CAISSE STATION ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400">Session de caisse station :</span>
          {activeCaisse ? (
            <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-full font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Ouverte ({activeCaisse.caisse_nom || 'Caisse Piste'})
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2.5 py-1 rounded-full font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" />
              Aucune session active (Enregistrement en mode autonome)
            </span>
          )}
        </div>

        <button
          onClick={loadStationData}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
        >
          <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin')} />
          Actualiser les pompes & cuves
        </button>
      </div>

      {/* ─── CORPS PRINCIPAL : PISTOLETS & CALCULATEUR D'ENCAISSEMENT ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* COLONNE GAUCHE (7 cols) : Sélection Carburant, Pompe, Pompiste & Flotte */}
        <div className="lg:col-span-7 space-y-4">
          {/* 1. CARBURANTS & PISTOLETS */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Droplet className="w-4 h-4 text-amber-400" />
                Carburants en Pompe
              </h2>
              <span className="text-xs text-slate-400">
                {pistolets.length} distributeur{pistolets.length > 1 ? 's' : ''} actif{pistolets.length > 1 ? 's' : ''}
              </span>
            </div>

            {/* Alerte informative si aucune cuve n'est encore enregistrée */}
            {cuves.length === 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-rose-300">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>
                    <strong>Aucune cuve enregistrée :</strong> La disponibilité réelle est de <strong>0 L</strong>. Veuillez d'abord créer vos cuves et jauges dans la gestion technique.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/app/${cleanSectorSlug}/pompes-cuves`)}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-[11px] whitespace-nowrap transition self-start sm:self-auto"
                >
                  Gérer les cuves
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {pistolets.map((p) => {
                const isSelected = p.id === selectedPistoletId
                const isSuper = p.produit?.toLowerCase().includes('essence') || p.produit?.toLowerCase().includes('super')
                const isGasoil = p.produit?.toLowerCase().includes('gasoil') || p.produit?.toLowerCase().includes('diesel')

                const badgeColor = isSuper
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                  : isGasoil
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-400'

                const stockNum = Number(p.stock_disponible || 0)

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedPistoletId(p.id)
                      const pPrice = Number(p.prix_actuel) || 680
                      if (calcMode === 'montant') {
                        const m = parseFloat(inputMontant) || 0
                        setInputVolume(m > 0 && pPrice > 0 ? String(calculateVolumeFromAmount(m, pPrice)) : '0.00')
                      } else {
                        const v = parseFloat(inputVolume) || 0
                        setInputMontant(v > 0 && pPrice > 0 ? String(calculateAmountFromVolume(v, pPrice)) : '0')
                      }
                    }}
                    className={clsx(
                      'p-4 rounded-2xl text-left border transition relative flex flex-col justify-between group',
                      isSelected
                        ? 'bg-amber-500/15 border-amber-400 ring-2 ring-amber-400/30 shadow-lg shadow-amber-500/10'
                        : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full border', badgeColor)}>
                        {p.code_pistolet || 'PISTOLET'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        {p.numero_pompe || 'P01'}
                      </span>
                    </div>

                    <div>
                      <div className="font-black text-sm text-white group-hover:text-amber-300 transition">
                        {p.produit}
                      </div>
                      <div className="text-amber-400 text-base font-black font-mono mt-1">
                        {formatFCFA(Number(p.prix_actuel) || 680)} <span className="text-xs text-slate-400 font-normal">/ L</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">Disponibilité :</span>
                      <span className={clsx(
                        'font-bold font-mono',
                        stockNum <= 0
                          ? 'text-rose-400'
                          : stockNum <= 500
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      )}>
                        {stockNum <= 0
                          ? (cuves.length === 0 ? '0 L (Aucune cuve)' : '0 L (Épuisé)')
                          : `${stockNum.toLocaleString('fr-FR')} L`}
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 2. POMPISTE EN PISTE & VÉHICULE FLOTTE */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
            <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" />
              Affectation Piste & Véhicule
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" /> Pompiste responsable
                </label>
                <select
                  value={selectedPompisteId}
                  onChange={(e) => setSelectedPompisteId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 font-medium"
                >
                  <option value="">Sélectionner un pompiste</option>
                  {pompistes.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.nom_complet} ({p.matricule || 'Piste'})
                    </option>
                  ))}
                  {pompistes.length === 0 && (
                    <option value="service">Pompiste de Service (Défaut)</option>
                  )}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-1.5">
                  <Car className="w-3.5 h-3.5 text-amber-400" /> Véhicule / Flotte (Optionnel)
                </label>
                <select
                  value={selectedVehiculeId}
                  onChange={(e) => setSelectedVehiculeId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-400 font-medium"
                >
                  <option value="">Client Comptoir Standard</option>
                  {flotteVehicules.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.immatriculation} — {v.client_nom}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* COLONNE DROITE (5 cols) : Double mode de calcul, Mode Paiement & Encaissement */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
            {/* Mode de saisie : Montant vs Volume */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-2xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setCalcMode('montant')}
                  className={clsx(
                    'px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5',
                    calcMode === 'montant'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  <Zap className="w-3.5 h-3.5" /> Par Montant (FCFA)
                </button>
                <button
                  type="button"
                  onClick={() => setCalcMode('volume')}
                  className={clsx(
                    'px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5',
                    calcMode === 'volume'
                      ? 'bg-amber-500 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-white'
                  )}
                >
                  <Gauge className="w-3.5 h-3.5" /> Par Volume (Litres)
                </button>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Tarif en vigueur</span>
                <span className="text-xs font-black font-mono text-amber-400">
                  {formatFCFA(unitPrice)}/L
                </span>
              </div>
            </div>

            {/* Champs de Saisie Synchronisés avec fond gris distinct indiquant le champ à renseigner */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Montant FCFA */}
              <div className={clsx(
                'p-3.5 rounded-2xl border transition',
                calcMode === 'montant'
                  ? 'bg-slate-900 border-amber-500/70 ring-2 ring-amber-500/20'
                  : 'bg-slate-900/60 border-slate-800'
              )}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-black text-amber-400 uppercase tracking-wider block">
                    Montant à Servir
                  </label>
                  <span className="text-[10px] text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md font-semibold">
                    Champ à renseigner
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={inputMontant}
                    onFocus={(e) => {
                      setCalcMode('montant')
                      if (e.target.value === '0') {
                        e.target.select()
                      }
                    }}
                    onChange={(e) => handleMontantChange(e.target.value)}
                    className="w-full bg-slate-800 hover:bg-slate-750 border-2 border-slate-600 focus:border-amber-400 focus:bg-slate-700/90 text-white rounded-xl px-3.5 py-2.5 text-2xl font-black font-mono transition focus:outline-none placeholder-slate-400 shadow-inner"
                    placeholder="0"
                  />
                  <span className="absolute right-3.5 top-3.5 text-xs font-black text-slate-300 tracking-wider">
                    FCFA
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Valeur initiale 0 • Saisissez le montant ou cliquez un raccourci
                </p>
              </div>

              {/* Volume Litres */}
              <div className={clsx(
                'p-3.5 rounded-2xl border transition',
                calcMode === 'volume'
                  ? 'bg-slate-900 border-amber-500/70 ring-2 ring-amber-500/20'
                  : 'bg-slate-900/60 border-slate-800'
              )}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-black text-amber-400 uppercase tracking-wider block">
                    Volume Équivalent
                  </label>
                  <span className="text-[10px] text-slate-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-md font-semibold">
                    {calcMode === 'volume' ? 'Champ à renseigner' : 'Calcul automatique'}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={inputVolume}
                    onFocus={(e) => {
                      setCalcMode('volume')
                      if (e.target.value === '0' || e.target.value === '0.00') {
                        e.target.select()
                      }
                    }}
                    onChange={(e) => handleVolumeChange(e.target.value)}
                    className="w-full bg-slate-800 hover:bg-slate-750 border-2 border-slate-600 focus:border-amber-400 focus:bg-slate-700/90 text-white rounded-xl px-3.5 py-2.5 text-2xl font-black font-mono transition focus:outline-none placeholder-slate-400 shadow-inner"
                    placeholder="0.00"
                  />
                  <span className="absolute right-3.5 top-3.5 text-xs font-black text-slate-300 tracking-wider">
                    Litres
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Calculé sur base de {formatFCFA(unitPrice)}/L
                </p>
              </div>
            </div>

            {/* Raccourcis Rapides */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-400 block font-semibold">
                Raccourcis rapides {calcMode === 'montant' ? 'montant' : 'volume'} :
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {calcMode === 'montant' ? (
                  quickAmounts.map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleMontantChange(String(amt))}
                      className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-mono font-bold transition hover:border-amber-400/50"
                    >
                      {formatFCFA(amt)}
                    </button>
                  ))
                ) : (
                  quickVolumes.map(vol => (
                    <button
                      key={vol}
                      type="button"
                      onClick={() => handleVolumeChange(String(vol))}
                      className="px-3 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-mono font-bold transition hover:border-amber-400/50"
                    >
                      {vol} L
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Récapitulatif Visuel de la Vente Carburant & Contrôle Cuve */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Carburant sélectionné :</span>
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Droplet className="w-3.5 h-3.5 text-amber-400" />
                  {currentPistolet.produit}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Pompe & Pistolet :</span>
                <span className="font-mono text-slate-300">{currentPistolet.numero_pompe} ({currentPistolet.code_pistolet})</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Cuve rattachée :</span>
                <span className={clsx('font-medium', currentPistolet.cuve_nom ? 'text-slate-200' : 'text-amber-400')}>
                  {currentPistolet.cuve_nom || (cuves.length === 0 ? 'Aucune cuve enregistrée' : 'Non raccordée')}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Stock cuve disponible :</span>
                <span className={clsx(
                  'font-mono font-bold',
                  (currentPistolet.stock_disponible || 0) <= 0 ? 'text-rose-400' : 'text-emerald-400'
                )}>
                  {((currentPistolet.stock_disponible || 0)).toLocaleString('fr-FR')} L
                </span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Volume calculé :</span>
                <span className="font-mono font-black text-amber-400 text-sm">
                  {parseFloat(inputVolume) > 0 ? `${(parseFloat(inputVolume) || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} L` : '0.00 L'}
                </span>
              </div>

              {/* Alertes visuelles de stock */}
              {(currentPistolet.stock_disponible || 0) <= 0 && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 flex items-center gap-2 text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>
                    {cuves.length === 0
                      ? 'Aucune cuve enregistrée en base. Disponibilité réelle 0 L.'
                      : 'Stock de la cuve épuisé (0 L). Distribution bloquée.'}
                  </span>
                </div>
              )}

              {(currentPistolet.stock_disponible || 0) > 0 && (parseFloat(inputVolume) || 0) > (currentPistolet.stock_disponible || 0) && (
                <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 flex items-center gap-2 text-rose-300 text-xs">
                  <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                  <span>
                    Volume demandé ({inputVolume} L) supérieur au stock disponible ({currentPistolet.stock_disponible} L).
                  </span>
                </div>
              )}

              <div className="border-t border-slate-800 pt-2 flex justify-between items-baseline">
                <span className="text-xs font-bold text-slate-300 uppercase">Total à encaisser :</span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {formatFCFA(parseFloat(inputMontant) || 0)}
                </span>
              </div>
            </div>

            {/* Choix du mode de paiement */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Mode de Paiement
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  { id: 'CASH', label: 'Espèces', icon: Wallet },
                  { id: 'MOMO', label: 'MoMo', icon: Smartphone },
                  { id: 'CARD', label: 'Carte', icon: CreditCard },
                  { id: 'TRANSFER', label: 'Virement', icon: Landmark },
                  { id: 'CREDIT', label: 'Crédit/Flotte', icon: DollarSign },
                ].map(m => {
                  const Icon = m.icon
                  const isSel = paymentMethod === m.id
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={clsx(
                        'py-2 px-1 rounded-xl text-center border transition flex flex-col items-center justify-center gap-1',
                        isSel
                          ? 'bg-amber-500 text-slate-950 font-black border-amber-400 shadow-sm'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span className="text-[10px] truncate max-w-full">{m.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Bouton de Validation & Clôture de la Vente Distributeur avec protection stock */}
            {(() => {
              const mntVal = parseFloat(inputMontant) || 0
              const volVal = parseFloat(inputVolume) || 0
              const currentStockVal = Number(currentPistolet?.stock_disponible || 0)
              const isStockEmpty = currentStockVal <= 0
              const isStockExceeded = volVal > currentStockVal
              const isZero = mntVal <= 0 || volVal <= 0
              const isBlocked = processing || isZero || isStockEmpty || isStockExceeded

              return (
                <button
                  type="button"
                  disabled={isBlocked}
                  onClick={handleValidateSale}
                  className={clsx(
                    'w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 shadow-xl transition',
                    isBlocked
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/80'
                      : 'bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 shadow-amber-500/20'
                  )}
                >
                  {processing ? (
                    <>
                      <RefreshCw className="w-5 h-5 animate-spin" />
                      <span>Validation & Enregistrement...</span>
                    </>
                  ) : isStockEmpty ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                      <span>Stock Cuve Épuisé (0 L) — Vente Bloquée</span>
                    </>
                  ) : isStockExceeded ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                      <span>Volume supérieur au stock disponible ({currentStockVal} L)</span>
                    </>
                  ) : isZero ? (
                    <>
                      <Zap className="w-5 h-5 text-slate-500" />
                      <span>Saisir le montant à servir</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      <span>Valider l'Encaissement & Imprimer le Reçu</span>
                    </>
                  )}
                </button>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ─── MODAL TICKET / REÇU DE CARBURANT ─── */}
      {showTicketModal && lastTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => setShowTicketModal(false)}
              className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-white bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Reçu stylisé Ticket de Station */}
            <div id="fuel-ticket-receipt" className="bg-white text-slate-950 rounded-2xl p-5 shadow-inner font-mono text-xs space-y-3">
              <div className="text-center border-b border-dashed border-slate-300 pb-3">
                <div className="font-black text-sm uppercase tracking-wide text-slate-900">
                  {lastTicket.stationNom}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5">
                  GESTIO229 • SECTEUR STATION-SERVICE
                </div>
                {lastTicket.ifu && (
                  <div className="text-[10px] text-slate-500">IFU : {lastTicket.ifu}</div>
                )}
                <div className="text-[10px] text-slate-500 mt-1">
                  Reçu N° {lastTicket.orderNumber}
                </div>
                <div className="text-[10px] text-slate-500">
                  {lastTicket.date} à {lastTicket.heure}
                </div>
              </div>

              <div className="space-y-1 py-1 border-b border-dashed border-slate-300 pb-2">
                <div className="flex justify-between">
                  <span className="text-slate-600">Pompiste :</span>
                  <span className="font-bold">{lastTicket.pompisteNom}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Pompe :</span>
                  <span>{lastTicket.pompe}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Pistolet :</span>
                  <span>{lastTicket.pistolet}</span>
                </div>
                {lastTicket.vehicule && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Véhicule :</span>
                    <span className="font-bold">{lastTicket.vehicule}</span>
                  </div>
                )}
              </div>

              {/* Ligne de carburant */}
              <div className="py-2 border-b border-dashed border-slate-300 space-y-1">
                <div className="font-bold text-slate-900 text-sm">
                  {lastTicket.carburant}
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>{lastTicket.volume} L x {formatFCFA(lastTicket.prixLitre)}</span>
                  <span className="font-bold text-slate-950">{formatFCFA(lastTicket.montantTotal)}</span>
                </div>
              </div>

              {/* Total & Paiement */}
              <div className="space-y-1 pt-1">
                <div className="flex justify-between text-sm font-black">
                  <span>TOTAL TTC :</span>
                  <span className="text-slate-950">{formatFCFA(lastTicket.montantTotal)}</span>
                </div>
                <div className="flex justify-between text-[11px] text-slate-600">
                  <span>Mode paiement :</span>
                  <span className="font-bold">{lastTicket.modePaiement}</span>
                </div>
              </div>

              <div className="text-center pt-2 text-[10px] text-slate-500 border-t border-dashed border-slate-300">
                Merci pour votre confiance ! Bonne route avec GESTIO229.
              </div>
            </div>

            {/* Actions du Ticket */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <Printer className="w-4 h-4" />
                Imprimer le reçu
              </button>

              <button
                type="button"
                onClick={handleResetForNextClient}
                className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/20"
              >
                <Check className="w-4 h-4" />
                Nouveau Client
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VenteDistributeurPage
