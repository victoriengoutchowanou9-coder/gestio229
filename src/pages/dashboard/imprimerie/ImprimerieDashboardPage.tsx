// =============================================================================
// GESTIO 229 SaaS — Tableau de Bord Spécifique Imprimerie & Sérigraphie
// Centre d'Impression Simplifié / Classique — KPI Métiers, Pipeline & Alertes
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Printer, TrendingUp, AlertTriangle, Clock, CheckCircle2,
  FileText, ShoppingBag, Layers, RefreshCw, Plus, ArrowRight,
  ShieldCheck, DollarSign, Wallet, Users, AlertOctagon, Sparkles, Sliders
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useAuthStore } from '../../../store/authStore'
import { imprimerieService, ImprimerieConfig, CommandeImprimerie, DevisImprimerie, MatierePremiere } from '../../../services/imprimerieService'
import { supabase } from '../../../lib/supabase'

export const ImprimerieDashboardPage: React.FC = () => {
  const navigate = useNavigate()
  const { companyId, sectorSlug } = useTenant()
  const { company } = useAuthStore()

  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<ImprimerieConfig | null>(null)
  const [commandes, setCommandes] = useState<CommandeImprimerie[]>([])
  const [devis, setDevis] = useState<DevisImprimerie[]>([])
  const [matieres, setMatieres] = useState<MatierePremiere[]>([])
  const [depensesMois, setDepensesMois] = useState<number>(0)

  const activeSector = sectorSlug || 'imprimerie'

  const loadData = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [cfg, cmds, devs, mats] = await Promise.all([
        imprimerieService.getConfig(companyId, activeSector),
        imprimerieService.getCommandes(companyId, activeSector),
        imprimerieService.getDevis(companyId, activeSector),
        imprimerieService.getMatieres(companyId, activeSector),
      ])
      setConfig(cfg)
      setCommandes(cmds)
      setDevis(devs)
      setMatieres(mats)

      // Récupérer les dépenses du mois
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const { data: exp } = await supabase
        .from('expenses')
        .select('amount')
        .eq('company_id', companyId)
        .gte('created_at', startOfMonth)

      const totalExp = (exp || []).reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0)
      setDepensesMois(totalExp)
    } catch (err) {
      console.error('Erreur chargement dashboard imprimerie:', err)
    } finally {
      setLoading(false)
    }
  }, [companyId, activeSector])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleMode = async () => {
    if (!config || !companyId) return
    const newMode = config.mode_gestion === 'classique' ? 'simplifie' : 'classique'
    try {
      await imprimerieService.saveConfig({
        ...config,
        mode_gestion: newMode,
      })
      setConfig((prev) => (prev ? { ...prev, mode_gestion: newMode } : null))
    } catch (e) {
      console.error('Erreur changement mode:', e)
    }
  }

  // Calcul des KPI métiers
  const todayStr = new Date().toISOString().split('T')[0]
  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

  const cmdsAujourdhui = commandes.filter((c) => c.date_commande === todayStr)
  const caJour = cmdsAujourdhui.reduce((acc, c) => acc + Number(c.total_ttc || 0), 0)

  const cmdsMois = commandes.filter((c) => {
    const d = new Date(c.date_commande)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  })
  const caMois = cmdsMois.reduce((acc, c) => acc + Number(c.total_ttc || 0), 0)
  const encaissementsMois = cmdsMois.reduce((acc, c) => acc + Number(c.montant_paye || 0), 0)
  const creancesTotal = commandes.reduce((acc, c) => acc + Number(c.solde_restant || 0), 0)
  const coutMatieresMois = cmdsMois.reduce((acc, c) => acc + Number(c.cout_matieres_reel || c.cout_matieres_prevu || 0), 0)
  const coutRevientMois = cmdsMois.reduce((acc, c) => acc + Number(c.cout_revient_total || 0), 0)
  const margeBruteMois = caMois - coutRevientMois
  const tauxMargeMois = caMois > 0 ? (margeBruteMois / caMois) * 100 : 0

  // Statuts Devis & Commandes
  const devisEnAttente = devis.filter((d) => d.statut === 'brouillon' || d.statut === 'envoye')
  const devisExpires = devis.filter((d) => d.statut !== 'transforme' && d.date_validite && d.date_validite < todayStr)

  const cmdsEnProduction = commandes.filter(
    (c) => ['a_concevoir', 'maquette_attente', 'maquette_validee', 'en_production', 'en_impression', 'en_finition'].includes(c.statut)
  )
  const cmdsTerminees = commandes.filter((c) => c.statut === 'termine' || c.statut === 'livre')

  // Pipeline Production
  const aConcevoir = commandes.filter((c) => c.statut === 'a_concevoir').length
  const aValider = commandes.filter((c) => c.statut === 'maquette_attente').length
  const enProduction = commandes.filter((c) => c.statut === 'en_production').length
  const enImpression = commandes.filter((c) => c.statut === 'en_impression').length
  const enFinition = commandes.filter((c) => c.statut === 'en_finition').length
  const enAttentePaiement = commandes.filter((c) => c.solde_restant > 0 && ['termine', 'livre'].includes(c.statut)).length
  const termines = commandes.filter((c) => c.statut === 'termine').length
  const livres = commandes.filter((c) => c.statut === 'livre').length

  // Alertes
  const matieresStockFaible = matieres.filter((m) => Number(m.stock_actuel) <= Number(m.stock_minimum))
  const cmdsUrgentes = commandes.filter((c) => c.priorite !== 'normale' && c.statut !== 'livre' && c.statut !== 'annule')
  const cmdsTermineesNonLivrees = commandes.filter((c) => c.statut === 'termine')
  const cmdsLivreesNonSoldees = commandes.filter((c) => c.statut === 'livre' && c.solde_restant > 0)

  const isSimplifie = config?.mode_gestion === 'simplifie'
  const prefix = `/app/${activeSector}`

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      {/* ── Entête & Sélecteur de Mode ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-pink-100 text-pink-700 rounded-2xl">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black text-slate-900 flex items-center gap-2">
                Centre d'Impression & Sérigraphie
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-pink-50 text-pink-700 border border-pink-200">
                  {isSimplifie ? 'Mode Simplifié' : 'Mode Classique Pro'}
                </span>
              </h1>
              <p className="text-xs text-slate-500">
                {company?.name || 'GESTIO 229'} — Suivi complet de la conception, tirage, matières & rentabilité
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={toggleMode}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
            title="Basculer entre le mode simplifié et classique"
          >
            <Sliders className="w-4 h-4 text-slate-600" />
            Mode : <span className="text-pink-600 uppercase font-black">{config?.mode_gestion || 'classique'}</span>
          </button>

          <button
            onClick={loadData}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
            title="Rafraîchir les données"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-pink-600' : ''}`} />
          </button>

          <button
            onClick={() => navigate(`${prefix}/devis`)}
            className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-xs shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            {isSimplifie ? 'Vente Rapide / Devis' : 'Nouveau Devis / Commande'}
          </button>
        </div>
      </div>

      {/* ── Chiffres Clés (KPI) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">CA du Jour</p>
          <p className="text-lg font-black text-slate-900 mt-1">{caJour.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{cmdsAujourdhui.length} commande(s)</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">CA du Mois</p>
          <p className="text-lg font-black text-emerald-700 mt-1">{caMois.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-emerald-600 mt-0.5">{cmdsMois.length} commande(s)</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Encaissements</p>
          <p className="text-lg font-black text-blue-700 mt-1">{encaissementsMois.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-blue-600 mt-0.5">En caisse / banques</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Créances Clients</p>
          <p className="text-lg font-black text-amber-600 mt-1">{creancesTotal.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-amber-600 mt-0.5">Soldes non réglés</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Coût Matières</p>
          <p className="text-lg font-black text-rose-600 mt-1">{coutMatieresMois.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-rose-500 mt-0.5">Consommation réelle</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Marge Brute</p>
          <p className="text-lg font-black text-emerald-600 mt-1">{margeBruteMois.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Taux : {tauxMargeMois.toFixed(1)}%</p>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Dépenses Exploitation</p>
          <p className="text-lg font-black text-slate-700 mt-1">{depensesMois.toLocaleString('fr-FR')} F</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Ce mois-ci</p>
        </div>
      </div>

      {/* ── Alertes Immédiates Métiers ── */}
      {(matieresStockFaible.length > 0 || cmdsUrgentes.length > 0 || devisExpires.length > 0 || cmdsTermineesNonLivrees.length > 0 || cmdsLivreesNonSoldees.length > 0) && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-4 space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-xs uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Alertes Opérationnelles Imprimerie ({matieresStockFaible.length + cmdsUrgentes.length + devisExpires.length + cmdsTermineesNonLivrees.length + cmdsLivreesNonSoldees.length})
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
            {matieresStockFaible.length > 0 && (
              <div
                onClick={() => navigate(`${prefix}/matieres`)}
                className="bg-white p-2.5 rounded-xl border border-amber-200 text-amber-800 cursor-pointer hover:bg-amber-50/50 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold block">{matieresStockFaible.length} matière(s) stock bas</span>
                  <span className="text-[10px] text-slate-500">Réapprovisionner</span>
                </div>
                <ArrowRight className="w-4 h-4 text-amber-500" />
              </div>
            )}

            {cmdsUrgentes.length > 0 && (
              <div
                onClick={() => navigate(`${prefix}/devis`)}
                className="bg-white p-2.5 rounded-xl border border-rose-200 text-rose-800 cursor-pointer hover:bg-rose-50/50 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold block">{cmdsUrgentes.length} commande(s) URGENTE(S)</span>
                  <span className="text-[10px] text-slate-500">Priorité atelier</span>
                </div>
                <ArrowRight className="w-4 h-4 text-rose-500" />
              </div>
            )}

            {devisExpires.length > 0 && (
              <div
                onClick={() => navigate(`${prefix}/devis`)}
                className="bg-white p-2.5 rounded-xl border border-slate-200 text-slate-800 cursor-pointer hover:bg-slate-50 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold block">{devisExpires.length} devis expiré(s)</span>
                  <span className="text-[10px] text-slate-500">Relancer les clients</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            )}

            {cmdsTermineesNonLivrees.length > 0 && (
              <div
                onClick={() => navigate(`${prefix}/devis`)}
                className="bg-white p-2.5 rounded-xl border border-blue-200 text-blue-800 cursor-pointer hover:bg-blue-50/50 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold block">{cmdsTermineesNonLivrees.length} prête(s) non livrée(s)</span>
                  <span className="text-[10px] text-slate-500">Avertir le client</span>
                </div>
                <ArrowRight className="w-4 h-4 text-blue-500" />
              </div>
            )}

            {cmdsLivreesNonSoldees.length > 0 && (
              <div
                onClick={() => navigate(`${prefix}/caisse`)}
                className="bg-white p-2.5 rounded-xl border border-purple-200 text-purple-800 cursor-pointer hover:bg-purple-50/50 transition flex items-center justify-between"
              >
                <div>
                  <span className="font-bold block">{cmdsLivreesNonSoldees.length} livrée(s) non soldée(s)</span>
                  <span className="text-[10px] text-slate-500">Encaisser le solde</span>
                </div>
                <ArrowRight className="w-4 h-4 text-purple-500" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Pipeline de Production Visuel ── */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-pink-600" /> Pipeline d'Atelier & Étapes de Production
            </h2>
            <p className="text-xs text-slate-500">
              Flux continu de la conception graphique jusqu'à la livraison et l'encaissement du solde
            </p>
          </div>
          <button
            onClick={() => navigate(`${prefix}/devis`)}
            className="text-xs font-bold text-pink-600 hover:text-pink-700 hover:underline flex items-center gap-1"
          >
            Voir l'atelier complet <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-center">
            <span className="text-[11px] font-bold text-slate-500 block uppercase">À concevoir</span>
            <span className="text-xl font-black text-slate-800 block mt-1">{aConcevoir}</span>
            <span className="text-[10px] text-slate-400">Graphiste</span>
          </div>

          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-center">
            <span className="text-[11px] font-bold text-amber-700 block uppercase">À valider</span>
            <span className="text-xl font-black text-amber-800 block mt-1">{aValider}</span>
            <span className="text-[10px] text-amber-600">B.A.T. Client</span>
          </div>

          <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-200 text-center">
            <span className="text-[11px] font-bold text-indigo-700 block uppercase">En production</span>
            <span className="text-xl font-black text-indigo-800 block mt-1">{enProduction}</span>
            <span className="text-[10px] text-indigo-600">Préparation</span>
          </div>

          <div className="p-3 bg-pink-50 rounded-2xl border border-pink-200 text-center">
            <span className="text-[11px] font-bold text-pink-700 block uppercase">En impression</span>
            <span className="text-xl font-black text-pink-800 block mt-1">{enImpression}</span>
            <span className="text-[10px] text-pink-600">Machines</span>
          </div>

          <div className="p-3 bg-purple-50 rounded-2xl border border-purple-200 text-center">
            <span className="text-[11px] font-bold text-purple-700 block uppercase">En finition</span>
            <span className="text-xl font-black text-purple-800 block mt-1">{enFinition}</span>
            <span className="text-[10px] text-purple-600">Découpe / Œillets</span>
          </div>

          <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-center">
            <span className="text-[11px] font-bold text-emerald-700 block uppercase">Terminé</span>
            <span className="text-xl font-black text-emerald-800 block mt-1">{termines}</span>
            <span className="text-[10px] text-emerald-600">Prêt à livrer</span>
          </div>

          <div className="p-3 bg-rose-50 rounded-2xl border border-rose-200 text-center">
            <span className="text-[11px] font-bold text-rose-700 block uppercase">Att. Paiement</span>
            <span className="text-xl font-black text-rose-800 block mt-1">{enAttentePaiement}</span>
            <span className="text-[10px] text-rose-600">Solde dû</span>
          </div>

          <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 text-center">
            <span className="text-[11px] font-bold text-blue-700 block uppercase">Livré</span>
            <span className="text-xl font-black text-blue-800 block mt-1">{livres}</span>
            <span className="text-[10px] text-blue-600">Clôturé</span>
          </div>
        </div>
      </div>

      {/* ── Dernières Commandes & Commandes Prioritaires ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-pink-600" /> Commandes Récentes en Atelier
            </h3>
            <button
              onClick={() => navigate(`${prefix}/devis`)}
              className="text-xs font-semibold text-pink-600 hover:underline"
            >
              Voir tout ({commandes.length})
            </button>
          </div>

          {commandes.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Aucune commande enregistrée pour le moment.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 text-xs">
              {commandes.slice(0, 6).map((cmd) => (
                <div key={cmd.id} className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-3 transition">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{cmd.numero_commande}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        cmd.priorite === 'tres_urgente'
                          ? 'bg-rose-100 text-rose-700'
                          : cmd.priorite === 'urgente'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {cmd.priorite}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-pink-50 text-pink-700">
                        {cmd.statut.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-800 truncate mt-1">{cmd.titre_travail}</p>
                    <p className="text-[11px] text-slate-400">Client : {cmd.client_nom} • Date : {cmd.date_commande}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-black text-slate-900 block">{cmd.total_ttc.toLocaleString('fr-FR')} F</span>
                    <span className={`text-[10px] font-bold block ${cmd.solde_restant > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {cmd.solde_restant > 0 ? `Reste : ${cmd.solde_restant.toLocaleString('fr-FR')} F` : 'Soldé ✓'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Stocks Matières Critiques & Raccourcis ── */}
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" /> Stocks Matières Clés
              </h3>
              <button
                onClick={() => navigate(`${prefix}/matieres`)}
                className="text-xs font-semibold text-emerald-600 hover:underline"
              >
                Gérer
              </button>
            </div>

            {matieres.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">Aucune matière première enregistrée.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {matieres.slice(0, 5).map((m) => {
                  const isLow = Number(m.stock_actuel) <= Number(m.stock_minimum)
                  return (
                    <div key={m.id} className="p-2.5 rounded-xl border border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-800 block truncate">{m.nom}</span>
                        <span className="text-[10px] text-slate-400">Unité : {m.unite}</span>
                      </div>
                      <div className="text-right">
                        <span className={`font-black block ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                          {m.stock_actuel} {m.unite}
                        </span>
                        {isLow && <span className="text-[9px] text-rose-600 font-bold block">Alerte Mini ({m.stock_minimum})</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="bg-gradient-to-br from-pink-600 to-rose-700 text-white p-5 rounded-3xl shadow-sm space-y-3">
            <h4 className="font-black text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> Espace Rentabilité Métier
            </h4>
            <p className="text-xs text-pink-100 leading-relaxed">
              Consultez les marges réelles déduites de vos consommations effectives, chutes et sous-traitances.
            </p>
            <button
              onClick={() => navigate(`${prefix}/reporting`)}
              className="w-full py-2 bg-white text-pink-700 hover:bg-pink-50 font-bold rounded-xl text-xs transition"
            >
              Rapport de rentabilité par prestation
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ImprimerieDashboardPage
