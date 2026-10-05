import React, { useState, useEffect, useCallback } from 'react'
import { Fuel, Gauge, User, Zap, Droplet, Car, Check, ArrowRight, RefreshCw } from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

interface StationFuelDispenserProps {
  onAddToCart: (item: {
    product: any
    qty: number
    unitPrice: number
    discount: number
  }) => void
}

export const StationFuelDispenser: React.FC<StationFuelDispenserProps> = ({ onAddToCart }) => {
  const { companyId, sectorSlug, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [pistolets, setPistolets] = useState<any[]>([])
  const [pompistes, setPompistes] = useState<any[]>([])
  const [cuves, setCuves] = useState<any[]>([])
  const [flotteVehicules, setFlotteVehicules] = useState<any[]>([])

  const [selectedPistoletId, setSelectedPistoletId] = useState<string>('')
  const [selectedPompisteId, setSelectedPompisteId] = useState<string>('')
  const [selectedVehiculeId, setSelectedVehiculeId] = useState<string>('')

  // Mode de saisie : 'montant' ou 'volume'
  const [calcMode, setCalcMode] = useState<'montant' | 'volume'>('montant')
  const [inputMontant, setInputMontant] = useState<string>('10000')
  const [inputVolume, setInputVolume] = useState<string>('')
  const [loading, setLoading] = useState(true)

  // Produits carburant par défaut si les tables sont encore vierges
  const defaultPistolets = [
    { id: 'pist-super', code_pistolet: 'P01-SUPER', numero_pompe: 'Pompe 01', produit: 'Essence Super', prix_actuel: 680 },
    { id: 'pist-gasoil', code_pistolet: 'P02-GASOIL', numero_pompe: 'Pompe 01', produit: 'Gasoil', prix_actuel: 700 },
    { id: 'pist-petrole', code_pistolet: 'P03-PETROLE', numero_pompe: 'Pompe 02', produit: 'Pétrole Lampant', prix_actuel: 650 },
  ]

  const loadStationData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      // 1. Pistolets
      const { data: pistData } = await supabaseTenant('station_pistolets')
        .select('*')
        .eq('statut', 'ACTIF')
        .order('numero_pompe')
      
      const effectivePistolets = (pistData && pistData.length > 0) ? pistData : defaultPistolets
      setPistolets(effectivePistolets)
      if (!selectedPistoletId && effectivePistolets.length > 0) {
        setSelectedPistoletId(effectivePistolets[0].id)
      }

      // 2. Pompistes
      const { data: pompData } = await supabaseTenant('station_pompistes')
        .select('*')
        .eq('statut', 'ACTIF')
        .order('nom_complet')
      setPompistes(pompData || [])
      if (pompData && pompData.length > 0 && !selectedPompisteId) {
        setSelectedPompisteId(pompData[0].id)
      }

      // 3. Cuves
      const { data: cuveData } = await supabaseTenant('station_cuves')
        .select('*')
        .eq('statut', 'ACTIF')
      setCuves(cuveData || [])

      // 4. Véhicules Flottes
      const { data: vehData } = await supabaseTenant('station_vehicules_flotte')
        .select('*')
        .eq('statut', 'ACTIF')
        .order('immatriculation')
      setFlotteVehicules(vehData || [])

    } catch (err) {
      console.warn('[StationFuelDispenser] Utilisation des pistolets configurés par défaut:', err)
      setPistolets(defaultPistolets)
      if (!selectedPistoletId) setSelectedPistoletId(defaultPistolets[0].id)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadStationData()
  }, [loadStationData])

  const currentPistolet = pistolets.find(p => p.id === selectedPistoletId) || pistolets[0] || defaultPistolets[0]
  const unitPrice = Number(currentPistolet?.prix_actuel) || 680

  // Synchronisation Montant <-> Volume
  useEffect(() => {
    if (calcMode === 'montant') {
      const m = parseFloat(inputMontant) || 0
      if (unitPrice > 0) {
        const v = (m / unitPrice).toFixed(2)
        setInputVolume(v)
      } else {
        setInputVolume('0')
      }
    } else {
      const v = parseFloat(inputVolume) || 0
      const m = Math.round(v * unitPrice)
      setInputMontant(String(m))
    }
  }, [calcMode, unitPrice, inputMontant, inputVolume])

  const handleMontantChange = (val: string) => {
    setInputMontant(val)
    const m = parseFloat(val) || 0
    if (unitPrice > 0) {
      setInputVolume((m / unitPrice).toFixed(2))
    }
  }

  const handleVolumeChange = (val: string) => {
    setInputVolume(val)
    const v = parseFloat(val) || 0
    setInputMontant(String(Math.round(v * unitPrice)))
  }

  const handleAddFuelToCart = () => {
    const vol = parseFloat(inputVolume) || 0
    const mnt = parseFloat(inputMontant) || 0

    if (vol <= 0 || mnt <= 0) {
      toast.error('Quantité invalide', 'Veuillez saisir un volume ou montant valide.')
      return
    }

    const selectedPomp = pompistes.find(p => p.id === selectedPompisteId)
    const selectedVeh = flotteVehicules.find(v => v.id === selectedVehiculeId)

    const pompisteLabel = selectedPomp ? selectedPomp.nom_complet : 'Pompiste de Service'
    const vehiculeLabel = selectedVeh ? ` | Véhicule: ${selectedVeh.immatriculation}` : ''

    const fuelProduct = {
      id: `fuel-${currentPistolet.id || 'std'}-${Date.now()}`,
      code: currentPistolet.code_pistolet || 'CARB',
      name: `${currentPistolet.produit} (${currentPistolet.numero_pompe || 'Piste'} - ${pompisteLabel}${vehiculeLabel})`,
      unit: 'Litre',
      selling_price: unitPrice,
      cost_price: Math.round(unitPrice * 0.9),
      current_stock: 50000,
      stock_vente: 50000,
      is_taxable: false,
      category: { name: 'Carburants' },
      sector_meta: {
        type_carburant: currentPistolet.produit,
        pompe: currentPistolet.numero_pompe,
        pistolet_code: currentPistolet.code_pistolet,
        pompiste_id: selectedPompisteId,
        pompiste_nom: pompisteLabel,
        vehicule_immat: selectedVeh?.immatriculation,
        client_nom: selectedVeh?.client_nom,
      }
    }

    onAddToCart({
      product: fuelProduct,
      qty: vol,
      unitPrice: unitPrice,
      discount: 0
    })

    toast.success(
      'Distribution ajoutée',
      `${vol} L de ${currentPistolet.produit} (${formatFCFA(mnt)}) ajouté au ticket.`
    )
  }

  const quickAmounts = [2000, 5000, 10000, 15000, 20000, 50000]
  const quickVolumes = [5, 10, 20, 30, 40, 60]

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white rounded-3xl p-4 sm:p-5 shadow-lg border border-slate-700/60 mb-4 transition-all">
      {/* En-tête Express Station */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-slate-700/60 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Fuel className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white flex items-center gap-1.5">
                Distribution Carburant Express
              </h2>
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                Piste & Pompes
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Vente rapide au litre ou au montant • Conversion automatique temps réel
            </p>
          </div>
        </div>

        <button
          onClick={loadStationData}
          className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition"
          title="Actualiser les pompes & pistolets"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Grille de sélection & calcul */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Colonne 1 : Choix Pistolet / Carburant */}
        <div className="lg:col-span-5 space-y-3">
          <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Droplet className="w-3.5 h-3.5 text-amber-400" /> Carburant & Pistolet
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {pistolets.map((p) => {
              const isSelected = p.id === selectedPistoletId
              const isSuper = p.produit?.toLowerCase().includes('essence') || p.produit?.toLowerCase().includes('super')
              const isGasoil = p.produit?.toLowerCase().includes('gasoil') || p.produit?.toLowerCase().includes('diesel')

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedPistoletId(p.id)
                    const pPrice = Number(p.prix_actuel) || 680
                    if (calcMode === 'montant') {
                      const m = parseFloat(inputMontant) || 0
                      setInputVolume((m / pPrice).toFixed(2))
                    } else {
                      const v = parseFloat(inputVolume) || 0
                      setInputMontant(String(Math.round(v * pPrice)))
                    }
                  }}
                  className={clsx(
                    'p-3 rounded-2xl text-left border transition relative flex flex-col justify-between',
                    isSelected
                      ? 'bg-amber-500/20 border-amber-400 ring-2 ring-amber-400/30'
                      : 'bg-slate-800/80 border-slate-700 hover:border-slate-600'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={clsx(
                      'w-2.5 h-2.5 rounded-full',
                      isSuper ? 'bg-emerald-400' : isGasoil ? 'bg-blue-400' : 'bg-amber-400'
                    )} />
                    <span className="text-[10px] font-mono text-slate-400">
                      {p.numero_pompe || 'P01'}
                    </span>
                  </div>
                  <div className="font-black text-xs text-white truncate">{p.produit}</div>
                  <div className="text-amber-300 text-xs font-mono font-bold mt-1">
                    {formatFCFA(Number(p.prix_actuel) || 680)}/L
                  </div>
                </button>
              )
            })}
          </div>

          {/* Affectations : Pompiste & Flotte */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            <div>
              <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 mb-1">
                <User className="w-3 h-3 text-slate-400" /> Pompiste en piste
              </label>
              <select
                value={selectedPompisteId}
                onChange={(e) => setSelectedPompisteId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="">Sélectionner Pompiste</option>
                {pompistes.map(p => (
                  <option key={p.id} value={p.id}>{p.nom_complet} ({p.matricule})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-slate-400 flex items-center gap-1 mb-1">
                <Car className="w-3 h-3 text-slate-400" /> Véhicule / Flotte (opt.)
              </label>
              <select
                value={selectedVehiculeId}
                onChange={(e) => setSelectedVehiculeId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400"
              >
                <option value="">Client comptoir standard</option>
                {flotteVehicules.map(v => (
                  <option key={v.id} value={v.id}>{v.immatriculation} - {v.client_nom}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Colonne 2 : Double mode de calcul Montant / Volume */}
        <div className="lg:col-span-7 bg-slate-850/60 p-3 sm:p-4 rounded-2xl border border-slate-700/80 space-y-3">
          {/* Onglets sélecteur de mode */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                type="button"
                onClick={() => setCalcMode('montant')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5',
                  calcMode === 'montant'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Zap className="w-3.5 h-3.5" /> Par Montant (FCFA)
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('volume')}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5',
                  calcMode === 'volume'
                    ? 'bg-amber-500 text-slate-950 shadow-sm'
                    : 'text-slate-400 hover:text-white'
                )}
              >
                <Gauge className="w-3.5 h-3.5" /> Par Volume (Litres)
              </button>
            </div>

            <div className="text-right">
              <span className="text-[10px] text-slate-400">Prix unitaire</span>
              <p className="text-xs font-mono font-bold text-amber-300">{formatFCFA(unitPrice)} / L</p>
            </div>
          </div>

          {/* Champs de saisie côte à côte avec conversion */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            {/* Montant FCFA */}
            <div className={clsx(
              'p-3 rounded-2xl border transition',
              calcMode === 'montant'
                ? 'bg-amber-500/10 border-amber-500/50'
                : 'bg-slate-800/40 border-slate-700 opacity-80'
            )}>
              <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                Montant à Servir
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={inputMontant}
                  onFocus={() => setCalcMode('montant')}
                  onChange={(e) => handleMontantChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-lg font-black font-mono text-white focus:outline-none focus:border-amber-400"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                  FCFA
                </span>
              </div>
            </div>

            {/* Volume Litres */}
            <div className={clsx(
              'p-3 rounded-2xl border transition',
              calcMode === 'volume'
                ? 'bg-amber-500/10 border-amber-500/50'
                : 'bg-slate-800/40 border-slate-700 opacity-80'
            )}>
              <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block mb-1">
                Volume Équivalent
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={inputVolume}
                  onFocus={() => setCalcMode('volume')}
                  onChange={(e) => handleVolumeChange(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-lg font-black font-mono text-white focus:outline-none focus:border-amber-400"
                />
                <span className="absolute right-3 top-2.5 text-xs font-bold text-slate-400">
                  Litres
                </span>
              </div>
            </div>
          </div>

          {/* Raccourcis rapides */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] text-slate-400 mr-1">Raccourcis :</span>
            {calcMode === 'montant' ? (
              quickAmounts.map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => handleMontantChange(String(amt))}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-mono font-bold transition"
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
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-[10px] font-mono font-bold transition"
                >
                  {vol} L
                </button>
              ))
            )}
          </div>

          {/* Bouton d'injection dans le ticket */}
          <div className="pt-2">
            <button
              type="button"
              onClick={handleAddFuelToCart}
              className="w-full py-3 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-black rounded-2xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition"
            >
              <Check className="w-4 h-4" />
              Ajouter au Ticket : {inputVolume || 0} L de {currentPistolet.produit} ({formatFCFA(parseFloat(inputMontant) || 0)})
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
