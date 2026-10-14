import React, { useState, useEffect } from 'react'
import {
  DollarSign,
  TrendingUp,
  PieChart,
  Truck,
  Wrench,
  Fuel,
  HardHat,
  AlertCircle,
  FileSpreadsheet,
  Printer,
  Calendar,
  Layers,
  Building2,
  ChevronRight
} from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { useTenant } from '../../../../hooks/useTenant'
import type { BtpMateriel, BtpChantier, BtpOrdreMaintenance, BtpCarburantPlein } from '../../../../services/garageService'

export default function BtpCoutRevientPage() {
  const { companyId } = useTenant()

  const [materiels, setMateriels] = useState<BtpMateriel[]>([])
  const [chantiers, setChantiers] = useState<BtpChantier[]>([])
  const [maintenances, setMaintenances] = useState<BtpOrdreMaintenance[]>([])
  const [pleins, setPleins] = useState<BtpCarburantPlein[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'PARC' | 'CHANTIERS'>('PARC')
  const [selectedChantierId, setSelectedChantierId] = useState<string>('TOUS')

  useEffect(() => {
    if (companyId) {
      loadData()
    }
  }, [companyId])

  const loadData = async () => {
    try {
      setLoading(true)
      const [resMat, resChant, resMaint, resCarb] = await Promise.all([
        supabase
          .from('btp_materiels')
          .select('*')
          .eq('company_id', companyId)
          .order('code_materiel', { ascending: true }),
        supabase
          .from('btp_chantiers')
          .select('*')
          .eq('company_id', companyId)
          .order('nom_chantier', { ascending: true }),
        supabase
          .from('btp_ordres_maintenance')
          .select('*')
          .eq('company_id', companyId),
        supabase
          .from('btp_carburant_pleins')
          .select('*')
          .eq('company_id', companyId)
      ])

      if (resMat.data) setMateriels(resMat.data)
      if (resChant.data) setChantiers(resChant.data)
      if (resMaint.data) setMaintenances(resMaint.data)
      if (resCarb.data) setPleins(resCarb.data)
    } catch (err) {
      console.error('Erreur chargement coûts de revient BTP:', err)
    } finally {
      setLoading(false)
    }
  }

  // Calculs globaux TCO
  const totalCoutAcquisition = materiels.reduce((acc, m) => acc + (Number(m.cout_acquisition) || 0), 0)
  
  const totalCoutMaintenance = maintenances.reduce((acc, om) => acc + (Number(om.cout_total) || 0), 0)
    + materiels.reduce((acc, m) => acc + (Number(m.cout_cumule_maintenance) || 0), 0)

  const totalCoutCarburant = pleins.reduce((acc, p) => acc + (Number(p.montant_total) || 0), 0)
    + materiels.reduce((acc, m) => acc + (Number(m.cout_cumule_carburant) || 0), 0)

  const totalTcoExploitation = totalCoutMaintenance + totalCoutCarburant
  const totalHeuresMoteur = materiels.reduce((acc, m) => acc + (Number(m.compteur_heures_actuel) || 0), 0)
  const coutMoyenHoraireFlotte = totalHeuresMoteur > 0 ? Math.round(totalTcoExploitation / totalHeuresMoteur) : 0

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 mb-2">
            <DollarSign className="w-3.5 h-3.5" />
            Rentabilité & Analyse Financière
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            Coûts de Revient & TCO Parc Matériel
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Analyse détaillée du coût total de possession (TCO), coût horaire de fonctionnement et rentabilité par chantier
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50"
          >
            <Printer className="w-4 h-4 text-gray-500" />
            Imprimer le rapport
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Valeur Acquisition Flotte
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-gray-900 dark:text-white">
              {totalCoutAcquisition.toLocaleString()} <span className="text-xs font-normal text-gray-500">FCFA</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">{materiels.length} engins & équipements</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Dépenses Maintenance
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
              {totalCoutMaintenance.toLocaleString()} <span className="text-xs font-normal text-gray-500">FCFA</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Pièces, main d'œuvre & concessionnaires</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Consommation Carburant
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center">
              <Fuel className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
              {totalCoutCarburant.toLocaleString()} <span className="text-xs font-normal text-gray-500">FCFA</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Gasoil & lubrifiants consommés</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              Coût Moyen / Heure Moteur
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {coutMoyenHoraireFlotte.toLocaleString()} <span className="text-xs font-normal text-gray-500">FCFA / h</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Sur {totalHeuresMoteur.toLocaleString()} h effectives</p>
          </div>
        </div>
      </div>

      {/* Onglets : Coût par Matériel vs Coût par Chantier */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 gap-6">
        <button
          onClick={() => setActiveTab('PARC')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'PARC'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Truck className="w-4 h-4" />
          Analyse Coût de Revient par Matériel (TCO Machine)
        </button>

        <button
          onClick={() => setActiveTab('CHANTIERS')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'CHANTIERS'
              ? 'border-amber-600 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <HardHat className="w-4 h-4" />
          Rentabilité & Coûts Engins par Chantier BTP
        </button>
      </div>

      {/* Contenu Onglet 1 : Par Matériel */}
      {activeTab === 'PARC' && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 dark:text-white">
              Décomposition des Coûts par Engin BTP
            </h2>
            <span className="text-xs text-gray-500">
              Coût de revient = Carburant + Maintenance / Heures moteur
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 text-xs uppercase font-medium">
                <tr>
                  <th className="px-4 py-3">Code / Engin</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3 text-right">Acquisition</th>
                  <th className="px-4 py-3 text-right">Heures Moteur</th>
                  <th className="px-4 py-3 text-right">Maintenance</th>
                  <th className="px-4 py-3 text-right">Carburant</th>
                  <th className="px-4 py-3 text-right">Coût Exploitation</th>
                  <th className="px-4 py-3 text-right">Coût / Heure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {materiels.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-gray-500">
                      Aucun engin enregistré dans le parc.
                    </td>
                  </tr>
                ) : (
                  materiels.map(mat => {
                    // Coût maintenance engin
                    const maintEngin = maintenances
                      .filter(m => m.materiel_id === mat.id)
                      .reduce((acc, m) => acc + (Number(m.cout_total) || 0), 0)
                      + (Number(mat.cout_cumule_maintenance) || 0)

                    // Coût carburant engin
                    const carbEngin = pleins
                      .filter(p => p.materiel_id === mat.id)
                      .reduce((acc, p) => acc + (Number(p.montant_total) || 0), 0)
                      + (Number(mat.cout_cumule_carburant) || 0)

                    const totalExploitation = maintEngin + carbEngin
                    const heures = Number(mat.compteur_heures_actuel) || 0
                    const coutHoraire = heures > 0 ? Math.round(totalExploitation / heures) : 0

                    return (
                      <tr key={mat.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-750">
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {mat.code_materiel}
                          </div>
                          <div className="text-xs text-gray-500">
                            {mat.marque} {mat.modele} {mat.immatriculation ? `• ${mat.immatriculation}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-gray-600 dark:text-gray-300">
                          {mat.categorie}
                        </td>
                        <td className="px-4 py-3.5 text-right font-medium text-gray-700 dark:text-gray-300">
                          {Number(mat.cout_acquisition || 0).toLocaleString()} F
                        </td>
                        <td className="px-4 py-3.5 text-right font-semibold text-gray-900 dark:text-white">
                          {heures.toLocaleString()} h
                        </td>
                        <td className="px-4 py-3.5 text-right text-amber-600 font-semibold">
                          {maintEngin.toLocaleString()} F
                        </td>
                        <td className="px-4 py-3.5 text-right text-purple-600 font-semibold">
                          {carbEngin.toLocaleString()} F
                        </td>
                        <td className="px-4 py-3.5 text-right font-bold text-gray-900 dark:text-white">
                          {totalExploitation.toLocaleString()} F
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                              coutHoraire > 15000
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            }`}
                          >
                            {coutHoraire.toLocaleString()} F/h
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Contenu Onglet 2 : Par Chantier BTP */}
      {activeTab === 'CHANTIERS' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {chantiers.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-white dark:bg-gray-800 rounded-xl border">
                <HardHat className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                <p className="font-semibold text-gray-900 dark:text-white">Aucun chantier créé</p>
                <p className="text-xs text-gray-500 mt-1">Créez des chantiers pour imputer les coûts des matériels et carburant.</p>
              </div>
            ) : (
              chantiers.map(chantier => {
                const coutMat = Number(chantier.cout_materiel_cumule || 0)
                const coutCarb = Number(chantier.cout_carburant_cumule || 0)
                const coutMaint = Number(chantier.cout_maintenance_cumule || 0)
                const coutTotalChantier = coutMat + coutCarb + coutMaint
                const budget = Number(chantier.budget_previsionnel || 0)
                const pctBudget = budget > 0 ? Math.round((coutTotalChantier / budget) * 100) : 0

                return (
                  <div
                    key={chantier.id}
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm space-y-4"
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                          {chantier.code_chantier}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            chantier.statut === 'EN_COURS'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {chantier.statut}
                        </span>
                      </div>
                      <h3 className="font-bold text-gray-900 dark:text-white text-base">
                        {chantier.nom_chantier}
                      </h3>
                      <p className="text-xs text-gray-500">Client: {chantier.client_nom} • {chantier.ville}</p>
                    </div>

                    {/* Jauge Budget consommée */}
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-500">Consommation du budget :</span>
                        <span className="font-bold text-gray-900 dark:text-white">
                          {pctBudget}% ({coutTotalChantier.toLocaleString()} F)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 h-2.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            pctBudget > 90 ? 'bg-red-500' : pctBudget > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(pctBudget, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                        <span>Engagé: {coutTotalChantier.toLocaleString()} F</span>
                        <span>Budget: {budget.toLocaleString()} F</span>
                      </div>
                    </div>

                    {/* Décomposition Coûts Chantier */}
                    <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-1.5 text-xs">
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span className="flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-blue-500" /> Coût Matériel Interne :
                        </span>
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {coutMat.toLocaleString()} F
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span className="flex items-center gap-1.5">
                          <Fuel className="w-3.5 h-3.5 text-purple-500" /> Carburant consommé :
                        </span>
                        <span className="font-semibold text-purple-600">
                          {coutCarb.toLocaleString()} F
                        </span>
                      </div>
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span className="flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5 text-amber-500" /> Maintenance sur site :
                        </span>
                        <span className="font-semibold text-amber-600">
                          {coutMaint.toLocaleString()} F
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
