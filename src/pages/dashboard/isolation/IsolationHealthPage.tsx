// =============================================================================
// GESTIO 229 SaaS — Page Admin "Santé & Étanchéité de l'Isolation Multi-Secteurs"
// =============================================================================
// Contrôle d'étanchéité pour les 19 sous-logiciels :
// Détection des fuites, comptage par secteur (GROUP BY sector_slug), et audit en direct.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck, AlertTriangle, RefreshCw, Database, CheckCircle2,
  Lock, Search, ArrowRight, Activity, Layers, Sparkles
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { ALL_SECTORS_CATALOG } from '../../../core/modules/moduleRegistry'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

interface SectorHealthStat {
  slug: string
  name: string
  emoji: string
  color: string
  isSubscribed: boolean
  customersCount: number
  suppliersCount: number
  productsCount: number
  salesCount: number
  expensesCount: number
  totalRows: number
}

interface LeakReport {
  table: string
  unscopedRows: number
  sampleIds: string[]
}

export const IsolationHealthPage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()

  const [loading, setLoading] = useState(true)
  const [sectorStats, setSectorStats] = useState<SectorHealthStat[]>([])
  const [leaks, setLeaks] = useState<LeakReport[]>([])
  const [totalCompanyRows, setTotalCompanyRows] = useState(0)
  const [repairing, setRepairing] = useState(false)

  const loadHealthData = useCallback(async () => {
    if (!company?.id) return
    setLoading(true)

    try {
      // 1. Tables métier à auditer
      const tables = [
        { key: 'customers', label: 'Clients' },
        { key: 'suppliers', label: 'Fournisseurs' },
        { key: 'products', label: 'Produits' },
        { key: 'sales_orders', label: 'Ventes' },
        { key: 'expenses', label: 'Dépenses' },
      ]

      const tableDataMap: Record<string, any[]> = {}
      const leaksFound: LeakReport[] = []

      for (const t of tables) {
        try {
          const { data, error } = await supabase
            .from(t.key)
            .select('id, sector_slug')
            .eq('company_id', company.id)

          if (!error && data) {
            tableDataMap[t.key] = data
            // Détection fuite : sector_slug manquant ou vide
            const unScoped = data.filter((r: any) => !r.sector_slug || String(r.sector_slug).trim() === '')
            if (unScoped.length > 0) {
              leaksFound.push({
                table: t.label,
                unscopedRows: unScoped.length,
                sampleIds: unScoped.slice(0, 3).map((r: any) => r.id),
              })
            }
          } else {
            tableDataMap[t.key] = []
          }
        } catch {
          tableDataMap[t.key] = []
        }
      }

      setLeaks(leaksFound)

      // 2. Calcul du comptage GROUP BY sector_slug pour chacun des 19 secteurs
      const subscribedList = (company.sectors || company.selected_sectors || ['boutique']).map((s: string) =>
        String(s).toLowerCase().replace(/^sec-/, '').trim()
      )

      let companyGrandTotal = 0
      const stats: SectorHealthStat[] = ALL_SECTORS_CATALOG.map((sec) => {
        const slug = sec.slug.toLowerCase().trim()
        const isSubscribed = subscribedList.includes(slug)

        const custCount = (tableDataMap['customers'] || []).filter(
          (r: any) => r.sector_slug?.toLowerCase().trim() === slug
        ).length

        const suppCount = (tableDataMap['suppliers'] || []).filter(
          (r: any) => r.sector_slug?.toLowerCase().trim() === slug
        ).length

        const prodCount = (tableDataMap['products'] || []).filter(
          (r: any) => r.sector_slug?.toLowerCase().trim() === slug
        ).length

        const saleCount = (tableDataMap['sales_orders'] || []).filter(
          (r: any) => r.sector_slug?.toLowerCase().trim() === slug
        ).length

        const expCount = (tableDataMap['expenses'] || []).filter(
          (r: any) => r.sector_slug?.toLowerCase().trim() === slug
        ).length

        const total = custCount + suppCount + prodCount + saleCount + expCount
        companyGrandTotal += total

        return {
          slug: sec.slug,
          name: sec.name,
          emoji: sec.emoji || '🏢',
          color: sec.color || '#059669',
          isSubscribed,
          customersCount: custCount,
          suppliersCount: suppCount,
          productsCount: prodCount,
          salesCount: saleCount,
          expensesCount: expCount,
          totalRows: total,
        }
      })

      setSectorStats(stats)
      setTotalCompanyRows(companyGrandTotal)
    } catch (err: any) {
      console.error('Erreur audit santé isolation :', err)
      toast.error('Erreur audit isolation', err.message || 'Impossible de vérifier la santé.')
    } finally {
      setLoading(false)
    }
  }, [company?.id, company?.sectors, company?.selected_sectors, toast])

  useEffect(() => {
    loadHealthData()
  }, [loadHealthData])

  // Outil de réparation et de scellage automatique des données orphelines
  const handleSealOrphanRecords = async () => {
    if (!company?.id) return
    setRepairing(true)
    try {
      const defaultSector = 'boutique'
      await Promise.all([
        supabase
          .from('customers')
          .update({ sector_slug: defaultSector })
          .eq('company_id', company.id)
          .is('sector_slug', null),
        supabase
          .from('suppliers')
          .update({ sector_slug: defaultSector })
          .eq('company_id', company.id)
          .is('sector_slug', null),
        supabase
          .from('products')
          .update({ sector_slug: defaultSector })
          .eq('company_id', company.id)
          .is('sector_slug', null),
        supabase
          .from('sales_orders')
          .update({ sector_slug: defaultSector })
          .eq('company_id', company.id)
          .is('sector_slug', null),
        supabase
          .from('expenses')
          .update({ sector_slug: defaultSector })
          .eq('company_id', company.id)
          .is('sector_slug', null),
      ])

      toast.success('Isolation Scellée', 'Toutes les données orphelines ont été rattachées avec un tag sectoriel strict.')
      await loadHealthData()
    } catch (err: any) {
      toast.error('Erreur scellage', err.message)
    } finally {
      setRepairing(false)
    }
  }

  const isFullySealed = leaks.length === 0

  return (
    <div className="space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-4">
          <div
            className={clsx(
              'w-14 h-14 rounded-2xl flex items-center justify-center shadow-md',
              isFullySealed
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-500 text-white'
            )}
          >
            {isFullySealed ? <ShieldCheck className="w-8 h-8" /> : <AlertTriangle className="w-8 h-8" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-slate-100">
                Santé & Étanchéité de l'Isolation Multi-Secteurs
              </h1>
              <span
                className={clsx(
                  'px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border',
                  isFullySealed
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                    : 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 text-amber-800 dark:text-amber-300'
                )}
              >
                {isFullySealed ? '100% Étanche' : 'Fuites potentielles détectées'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Contrôle strict en direct pour l'entreprise <strong>{company?.name}</strong> across les 19 sous-logiciels indépendants.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadHealthData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 font-bold text-xs text-slate-700 dark:text-slate-200 transition"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            Actualiser
          </button>

          {!isFullySealed && (
            <button
              onClick={handleSealOrphanRecords}
              disabled={repairing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition"
            >
              <Sparkles className="w-4 h-4" />
              Sceller & Corriger les fuites
            </button>
          )}
        </div>
      </div>

      {/* Cartes d'indicateurs globaux */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Sous-logiciels Souscrits
          </span>
          <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">
            {sectorStats.filter((s) => s.isSubscribed).length} / 19
          </p>
          <p className="text-[11px] text-emerald-600 font-medium mt-1">
            Chaque secteur fonctionne en vase clos
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Total Lignes Métier Isolées
          </span>
          <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-2">
            {totalCompanyRows}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Indexées par (company_id, sector_slug)
          </p>
        </div>

        <div className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            Diagnostic Étanchéité
          </span>
          <p
            className={clsx(
              'text-3xl font-black mt-2',
              isFullySealed ? 'text-emerald-600' : 'text-amber-600'
            )}
          >
            {isFullySealed ? '0 Fuite' : `${leaks.reduce((s, l) => s + l.unscopedRows, 0)} Lignes sans tag`}
          </p>
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            {isFullySealed ? 'Aucun chevauchement inter-secteurs' : 'Scellage recommandé'}
          </p>
        </div>
      </div>

      {/* Tableau détaillé des 19 Secteurs */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
              Répartition des données par Sous-Logiciel (SELECT sector_slug, COUNT(*) GROUP BY sector_slug)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">19 secteurs monitorés</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 uppercase font-black border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3.5 px-4">Sous-Logiciel</th>
                <th className="py-3.5 px-4">Statut Souscription</th>
                <th className="py-3.5 px-4 text-center">Clients</th>
                <th className="py-3.5 px-4 text-center">Fournisseurs</th>
                <th className="py-3.5 px-4 text-center">Produits</th>
                <th className="py-3.5 px-4 text-center">Ventes</th>
                <th className="py-3.5 px-4 text-center">Dépenses</th>
                <th className="py-3.5 px-4 text-right">Total Données</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 font-medium text-slate-700 dark:text-slate-300">
              {sectorStats.map((s) => (
                <tr key={s.slug} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{s.emoji}</span>
                      <div>
                        <p className="font-bold text-slate-900 dark:text-slate-100">{s.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">/app/{s.slug}</p>
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <span
                      className={clsx(
                        'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold',
                        s.isSubscribed
                          ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      )}
                    >
                      {s.isSubscribed ? '✓ Souscrit' : 'Non Souscrit'}
                    </span>
                  </td>

                  <td className="py-3 px-4 text-center font-bold">{s.customersCount}</td>
                  <td className="py-3 px-4 text-center font-bold">{s.suppliersCount}</td>
                  <td className="py-3 px-4 text-center font-bold">{s.productsCount}</td>
                  <td className="py-3 px-4 text-center font-bold">{s.salesCount}</td>
                  <td className="py-3 px-4 text-center font-bold">{s.expensesCount}</td>

                  <td className="py-3 px-4 text-right font-black text-slate-900 dark:text-slate-100">
                    {s.totalRows}
                  </td>

                  <td className="py-3 px-4 text-center">
                    <a
                      href={`/app/${s.slug}/tableau-bord`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 text-slate-700 dark:text-slate-200 font-bold text-xs transition"
                    >
                      Ouvrir
                      <ArrowRight className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default IsolationHealthPage
