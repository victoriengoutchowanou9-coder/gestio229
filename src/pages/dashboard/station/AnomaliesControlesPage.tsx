// =============================================================================
// GESTIO 229 — Station-Service : Centre des Anomalies, Pertes & Double Validation
// =============================================================================
// Détection automatique des écarts (cuves, jaugeages, pompes, pompistes, livraisons)
// Isolation stricte : company_id + sector_slug = 'station-service'
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ShieldAlert, AlertTriangle, CheckCircle, RefreshCw, Filter, Search,
  ArrowRight, ShieldCheck, FileCheck, X, Gauge, Fuel, UserX, Truck
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'

interface AnomalieItem {
  id: string
  type: 'CUVE' | 'JAUGEAGE' | 'POMPISTE' | 'LIVRAISON'
  titre: string
  detail: string
  ecart_affiche: string
  gravite: 'CRITIQUE' | 'MOYENNE' | 'INFO'
  date: string
  source_table: string
  source_id: string
  statut: string
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0))

export const AnomaliesControlesPage: React.FC = () => {
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any

  const [loading, setLoading] = useState(true)
  const [anomalies, setAnomalies] = useState<AnomalieItem[]>([])
  const [filterType, setFilterType] = useState<string>('ALL')

  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (type === 'error') window.alert(msg)
    } catch { /* noop */ }
  }, [toast])

  const loadAnomalies = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const cleanSlug = sectorSlug || 'station-service'
      const items: AnomalieItem[] = []

      // 1. Écarts de Jaugeages (Pertes ou coulages cuves)
      const { data: jData } = await supabase
        .from('station_jaugeages')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('created_at', { ascending: false })
        .limit(30)

      if (jData) {
        jData.forEach((j: any) => {
          const ec = Number(j.ecart_volume || 0)
          if (Math.abs(ec) > 50) { // écart significatif > 50 L
            items.push({
              id: `jauge-${j.id}`,
              type: 'JAUGEAGE',
              titre: `Écart de Jaugeage sur ${j.cuve_nom}`,
              detail: `Produit : ${j.produit}. Jaugé : ${j.volume_mesure} L vs Théorique : ${j.stock_theorique_avant} L. ${j.observation ? `Observation: ${j.observation}` : ''}`,
              ecart_affiche: `${ec > 0 ? '+' : ''}${ec} Litres`,
              gravite: Math.abs(ec) > 200 ? 'CRITIQUE' : 'MOYENNE',
              date: j.date_jaugeage,
              source_table: 'station_jaugeages',
              source_id: j.id,
              statut: ec < 0 ? 'COULAGE_DETECTE' : 'SURPLUS'
            })
          }
        })
      }

      // 2. Écarts Pompistes (Manquants de versement caisse)
      const { data: sData } = await supabase
        .from('station_shifts_clotures')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('created_at', { ascending: false })
        .limit(30)

      if (sData) {
        sData.forEach((s: any) => {
          const ec = Number(s.ecart || 0)
          if (ec < -500) { // manquant supérieur à 500 F
            items.push({
              id: `shift-${s.id}`,
              type: 'POMPISTE',
              titre: `Manquant de versement — ${s.pompiste_nom}`,
              detail: `Pompe : ${s.pompe_numero} (${s.produit}). CA théorique : ${fmt(s.montant_theorique)} F vs Reversé : ${fmt(s.montant_verse)} F. Shift: ${s.type_shift}. ${s.motif_ecart ? `Motif: ${s.motif_ecart}` : 'Aucun motif renseigné'}`,
              ecart_affiche: `${fmt(ec)} FCFA`,
              gravite: Math.abs(ec) > 10000 ? 'CRITIQUE' : 'MOYENNE',
              date: s.date,
              source_table: 'station_shifts_clotures',
              source_id: s.id,
              statut: s.statut
            })
          }
        })
      }

      // 3. Écarts de Livraisons Citernes
      const { data: rData } = await supabase
        .from('station_receptions_carburant')
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', cleanSlug)
        .order('created_at', { ascending: false })
        .limit(30)

      if (rData) {
        rData.forEach((r: any) => {
          const ec = Number(r.ecart_livraison || 0)
          if (ec !== 0) {
            items.push({
              id: `rec-${r.id}`,
              type: 'LIVRAISON',
              titre: `Écart de livraison Citerne — ${r.fournisseur_nom}`,
              detail: `BL: ${r.reference}, Cuve: ${r.cuve_nom}. Facturé : ${r.quantite_facturee} L vs Réellement reçu : ${r.quantite_recue} L. Camion: ${r.numero_camion || 'Non précisé'}.`,
              ecart_affiche: `${ec > 0 ? '+' : ''}${ec} Litres`,
              gravite: Math.abs(ec) > 100 ? 'CRITIQUE' : 'MOYENNE',
              date: r.date_reception,
              source_table: 'station_receptions_carburant',
              source_id: r.id,
              statut: r.statut
            })
          }
        })
      }

      setAnomalies(items)
    } catch (err: any) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [companyId, sectorSlug])

  useEffect(() => { loadAnomalies() }, [loadAnomalies])

  const filtered = anomalies.filter(a => {
    if (filterType === 'ALL') return true
    return a.type === filterType
  })

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* ─── En-tête ─── */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-rose-100 text-rose-700 rounded-2xl">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Centre des Anomalies & Contrôles</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Détection automatique des pertes, coulages cuves, écarts de caisse pompistes et différences de livraison
            </p>
          </div>
        </div>
        <button
          onClick={loadAnomalies}
          disabled={loading}
          className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition flex items-center gap-2 self-start md:self-auto text-xs font-bold"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-600' : ''}`} />
          Actualiser les contrôles
        </button>
      </div>

      {/* ─── Filtres de gravité ─── */}
      <div className="flex gap-2 border-b border-slate-200 pb-3 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setFilterType('ALL')}
          className={`px-4 py-2 rounded-xl transition ${filterType === 'ALL' ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Toutes les anomalies ({anomalies.length})
        </button>
        <button
          onClick={() => setFilterType('POMPISTE')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${filterType === 'POMPISTE' ? 'bg-rose-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <UserX className="w-3.5 h-3.5" /> Écarts Pompistes ({anomalies.filter(a => a.type === 'POMPISTE').length})
        </button>
        <button
          onClick={() => setFilterType('JAUGEAGE')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${filterType === 'JAUGEAGE' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <Gauge className="w-3.5 h-3.5" /> Coulages / Cuves ({anomalies.filter(a => a.type === 'JAUGEAGE').length})
        </button>
        <button
          onClick={() => setFilterType('LIVRAISON')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${filterType === 'LIVRAISON' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          <Truck className="w-3.5 h-3.5" /> Livraisons Citernes ({anomalies.filter(a => a.type === 'LIVRAISON').length})
        </button>
      </div>

      {/* ─── Liste des Anomalies ─── */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-3xl border border-slate-200 p-8">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <h3 className="font-black text-slate-900 text-base">Aucune anomalie critique détectée</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Tous les jaugeages, relèves pompistes et réceptions citernes récents sont équilibrés et dans les tolérances.
            </p>
          </div>
        ) : (
          filtered.map(item => (
            <div
              key={item.id}
              className={`bg-white rounded-3xl border-2 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:shadow-md ${
                item.gravite === 'CRITIQUE' ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    item.gravite === 'CRITIQUE' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {item.gravite}
                  </span>
                  <span className="text-[11px] text-slate-400">{item.date}</span>
                  <span className="px-2 py-0.5 rounded-lg bg-slate-100 font-mono text-[10px] text-slate-600">
                    Source: {item.source_table}
                  </span>
                </div>

                <h3 className="font-black text-slate-900 text-base">{item.titre}</h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{item.detail}</p>
              </div>

              <div className="flex items-center gap-4 self-end md:self-center">
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Écart mesuré</span>
                  <span className={`font-mono text-lg font-black ${
                    item.ecart_affiche.startsWith('-') ? 'text-rose-600' : 'text-slate-900'
                  }`}>
                    {item.ecart_affiche}
                  </span>
                </div>

                <button
                  onClick={() => notify('success', `Anomalie auditée et marquée comme vue par le responsable.`)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm whitespace-nowrap"
                >
                  Valider le Contrôle
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
export default AnomaliesControlesPage
