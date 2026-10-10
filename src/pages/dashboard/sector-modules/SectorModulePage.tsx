// =============================================================================
// GESTIO 229 — Page générique des modules spécifiques par secteur
// Isolation stricte : chaque requête filtre company_id + sector_slug (URL)
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Plus, RefreshCw, Pencil, Trash2, X, Search, AlertTriangle, Database } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { MODULE_CONFIGS, FieldDef, fmtMoney, generateRef } from './moduleConfigs'
import { TableMissingVerifier } from './TableMissingVerifier'

const TONE_CARD: Record<string, string> = {
  emerald: 'text-emerald-700', rose: 'text-rose-600', amber: 'text-amber-600', indigo: 'text-indigo-700', slate: 'text-slate-900',
}
const TONE_ROW: Record<string, string> = {
  emerald: 'bg-emerald-50/50', rose: 'bg-rose-50/70', amber: 'bg-amber-50/70',
}
const TONE_BTN: Record<string, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
  rose: 'bg-rose-100 text-rose-800 hover:bg-rose-200',
  amber: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
  indigo: 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200',
}
const STATUS_COLORS: Record<string, string> = {
  ACTIF: 'bg-emerald-100 text-emerald-800', ACTIVE: 'bg-emerald-100 text-emerald-800', LIBRE: 'bg-emerald-100 text-emerald-800',
  OK: 'bg-emerald-100 text-emerald-800', SERVIE: 'bg-emerald-100 text-emerald-800', PAYEE: 'bg-emerald-100 text-emerald-800',
  TERMINE: 'bg-emerald-100 text-emerald-800', VERIFIE: 'bg-emerald-100 text-emerald-800', LIVRE: 'bg-emerald-100 text-emerald-800',
  REMBOURSE: 'bg-emerald-100 text-emerald-800', DISPONIBLE: 'bg-emerald-100 text-emerald-800', PRET: 'bg-emerald-100 text-emerald-800',
  CONFIRME: 'bg-blue-100 text-blue-800', EMISE: 'bg-blue-100 text-blue-800', RESERVEE: 'bg-blue-100 text-blue-800', RESERVE: 'bg-blue-100 text-blue-800',
  EN_COURS: 'bg-indigo-100 text-indigo-800', EN_PRODUCTION: 'bg-indigo-100 text-indigo-800', EN_REPARATION: 'bg-indigo-100 text-indigo-800',
  EN_PREPARATION: 'bg-indigo-100 text-indigo-800', BAT_ENVOYE: 'bg-indigo-100 text-indigo-800', BAT_VALIDE: 'bg-indigo-100 text-indigo-800', RECU: 'bg-indigo-100 text-indigo-800', FACTURE: 'bg-emerald-100 text-emerald-800',
  EN_ATTENTE: 'bg-amber-100 text-amber-800', A_NETTOYER: 'bg-amber-100 text-amber-800', ALERTE: 'bg-amber-100 text-amber-800',
  MAINTENANCE: 'bg-amber-100 text-amber-800', PARTIELLE: 'bg-amber-100 text-amber-800', ATTENTE_PIECES: 'bg-amber-100 text-amber-800',
  DIAGNOSTIC: 'bg-amber-100 text-amber-800', DEVIS: 'bg-amber-100 text-amber-800', A_VENIR: 'bg-amber-100 text-amber-800', PAUSE: 'bg-amber-100 text-amber-800', LOUE: 'bg-amber-100 text-amber-800',
  OCCUPEE: 'bg-rose-100 text-rose-800', OCCUPE: 'bg-rose-100 text-rose-800', EN_RETARD: 'bg-rose-100 text-rose-800', PANNE: 'bg-rose-100 text-rose-800',
  EXPIREE: 'bg-rose-100 text-rose-800', EXPIRE: 'bg-rose-100 text-rose-800', ANNULE: 'bg-slate-200 text-slate-700', RESILIE: 'bg-slate-200 text-slate-700',
  SUSPENDU: 'bg-slate-200 text-slate-700', FERME: 'bg-slate-200 text-slate-700', INACTIF: 'bg-slate-200 text-slate-700', SORTI: 'bg-slate-200 text-slate-700', DIPLOME: 'bg-blue-100 text-blue-800',
}

const isMissingTable = (err: any) => {
  const code = String(err?.code || '')
  const msg = String(err?.message || '')
  return code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || /does not exist|could not find the table|schema cache/i.test(msg)
}

const resolveDefault = (f: FieldDef) => (typeof f.default === 'function' ? f.default() : f.default ?? (f.type === 'boolean' ? false : ''))

const displayValue = (f: FieldDef, v: any) => {
  if (v === null || v === undefined || v === '') return '—'
  if (f.type === 'boolean') return v ? 'Oui' : 'Non'
  if (f.money) return fmtMoney(Number(v))
  if (f.type === 'number') return Number(v).toLocaleString('fr-FR', { maximumFractionDigits: 3 })
  if (f.type === 'date') return new Date(String(v).length <= 10 ? v + 'T00:00:00' : v).toLocaleDateString('fr-FR')
  if (f.type === 'time') return String(v).slice(0, 5)
  return String(v).replace(/_/g, ' ')
}

export const SectorModulePage: React.FC<{ moduleId: string }> = ({ moduleId }) => {
  const config = MODULE_CONFIGS[moduleId]
  const { companyId, sectorSlug } = useTenant()
  const { toast } = useUIStore() as any

  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  const notify = useCallback((type: 'success' | 'error', msg: string) => {
    try {
      if (toast?.[type]) toast[type](msg)
      else if (typeof toast === 'function') toast(msg, type)
      else if (type === 'error') window.alert(msg)
    } catch { /* noop */ }
  }, [toast])

  // ─── Chargement isolé company_id + sector_slug ───────────────────────────
  const load = useCallback(async () => {
    if (!config || !companyId || !sectorSlug) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from(config.table)
        .select('*')
        .eq('company_id', companyId)
        .eq('sector_slug', sectorSlug)
        .order(config.orderBy || 'created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      setRows(data || [])
      setTableMissing((wasMissing) => {
        if (wasMissing) {
          notify('success', 'Module activé avec succès !')
        }
        return false
      })
    } catch (err: any) {
      console.error(`[${config.table}]`, err)
      if (isMissingTable(err)) setTableMissing(true)
      else notify('error', `Erreur de chargement : ${err?.message || err}`)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [config, companyId, sectorSlug, notify])

  useEffect(() => { load() }, [load])

  // ─── Formulaire ─────────────────────────────────────────────────────────
  const openCreate = () => {
    const init: Record<string, any> = {}
    config.fields.forEach((f) => { init[f.key] = resolveDefault(f) })
    if (config.refPrefix) {
      const refKey = config.fields.find((f) => ['reference', 'numero_membre', 'code_grille'].includes(f.key))?.key
      if (refKey) init[refKey] = generateRef(config.refPrefix)
    }
    setForm(init)
    setEditing(null)
    setModalOpen(true)
  }

  const openEdit = (row: any) => {
    const init: Record<string, any> = {}
    config.fields.forEach((f) => {
      let v = row[f.key]
      if (f.type === 'date' && v) v = String(v).slice(0, 10)
      if (f.type === 'time' && v) v = String(v).slice(0, 5)
      init[f.key] = v ?? (f.type === 'boolean' ? false : '')
    })
    setForm(init)
    setEditing(row)
    setModalOpen(true)
  }

  const normalize = (raw: Record<string, any>) => {
    const out: Record<string, any> = {}
    config.fields.forEach((f) => {
      if (!(f.key in raw)) return
      let v = raw[f.key]
      if (f.type === 'number') v = v === '' || v === null || v === undefined ? null : Number(v)
      else if (f.type === 'boolean') v = Boolean(v)
      else if (typeof v === 'string') v = v.trim() === '' ? null : v.trim()
      out[f.key] = v
    })
    return out
  }

  const handleSave = async () => {
    for (const f of config.fields) {
      if (f.required && (form[f.key] === '' || form[f.key] === null || form[f.key] === undefined)) {
        notify('error', `Le champ « ${f.label} » est obligatoire.`)
        return
      }
    }
    setSaving(true)
    try {
      let payload: any = normalize(config.compute ? config.compute({ ...form }) : form)
      if (editing) {
        payload = { ...payload }
        const { error } = await supabase
          .from(config.table)
          .update(payload)
          .eq('id', editing.id)
          .eq('company_id', companyId)
          .eq('sector_slug', sectorSlug)
        if (error) throw error
        notify('success', 'Modification enregistrée')
      } else {
        const { error } = await supabase
          .from(config.table)
          .insert({ ...payload, company_id: companyId, sector_slug: sectorSlug })
        if (error) throw error
        notify('success', 'Enregistrement créé')
      }
      setModalOpen(false)
      await load()
    } catch (err: any) {
      console.error(err)
      if (isMissingTable(err)) setTableMissing(true)
      notify('error', `Échec de l'enregistrement : ${err?.message || err}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (row: any) => {
    if (!window.confirm('Supprimer définitivement cet enregistrement ?')) return
    const { error } = await supabase
      .from(config.table)
      .delete()
      .eq('id', row.id)
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
    if (error) return notify('error', `Suppression impossible : ${error.message}`)
    notify('success', 'Supprimé')
    load()
  }

  const runAction = async (row: any, apply: (r: any) => any) => {
    const patch = apply(row)
    if (!patch) return
    const { error } = await supabase
      .from(config.table)
      .update(patch)
      .eq('id', row.id)
      .eq('company_id', companyId)
      .eq('sector_slug', sectorSlug)
    if (error) return notify('error', `Action impossible : ${error.message}`)
    notify('success', 'Mise à jour effectuée')
    load()
  }

  // ─── Filtrage ───────────────────────────────────────────────────────────
  const tableFields = useMemo(() => (config ? config.fields.filter((f) => !f.hideInTable) : []), [config])
  const statusField = config?.statusKey ? config.fields.find((f) => f.key === config.statusKey) : undefined

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter && config?.statusKey && r[config.statusKey] !== statusFilter) return false
      if (!q) return true
      return config.fields.some((f) => String(r[f.key] ?? '').toLowerCase().includes(q))
    })
  }, [rows, search, statusFilter, config])

  if (!config) {
    return <div className="p-10 text-center text-slate-500">Module « {moduleId} » non configuré.</div>
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{config.title}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{config.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition" title="Actualiser">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
          <button onClick={openCreate} disabled={tableMissing} className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-sm">
            <Plus className="w-4 h-4" /> Ajouter
          </button>
        </div>
      </div>

      {tableMissing && (
        <TableMissingVerifier
          tableName={config.table}
          moduleTitle={config.title}
          sectorSlug={sectorSlug || 'global'}
          fields={config.fields}
          onRetry={load}
          isRetrying={loading}
        />
      )}

      {/* Cartes indicateurs */}
      {config.cards && config.cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {config.cards.map((c) => (
            <div key={c.label} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{c.label}</p>
              <p className={`text-xl font-black font-mono mt-2 ${TONE_CARD[c.tone || 'slate']}`}>{loading ? '…' : c.value(rows)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Liste */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher…" className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>
          {statusField?.options && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setStatusFilter('')} className={`px-3 py-1 rounded-full text-[11px] font-bold ${!statusFilter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>Tous ({rows.length})</button>
              {statusField.options.filter(Boolean).map((o) => (
                <button key={o} onClick={() => setStatusFilter(o)} className={`px-3 py-1 rounded-full text-[11px] font-bold ${statusFilter === o ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>
                  {o.replace(/_/g, ' ')} ({rows.filter((r) => r[config.statusKey!] === o).length})
                </button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-slate-400 text-xs"><RefreshCw className="w-4 h-4 animate-spin text-emerald-600" /> Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <p className="text-sm font-bold text-slate-600">{rows.length === 0 ? 'Aucun enregistrement pour le moment' : 'Aucun résultat pour ce filtre'}</p>
            {rows.length === 0 && !tableMissing && (
              <button onClick={openCreate} className="text-emerald-600 text-sm font-bold hover:underline">+ Ajouter le premier</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-semibold">
                <tr>
                  {tableFields.map((f) => <th key={f.key} className={`p-3 whitespace-nowrap ${f.type === 'number' ? 'text-right' : ''}`}>{f.label}</th>)}
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((row) => {
                  const tone = config.rowTone?.(row)
                  return (
                    <tr key={row.id} className={`hover:bg-slate-50 transition ${tone ? TONE_ROW[tone] : ''}`}>
                      {tableFields.map((f) => (
                        <td key={f.key} className={`p-3 whitespace-nowrap ${f.type === 'number' ? 'text-right font-mono' : ''} ${f.key === config.fields[0].key ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                          {f.key === config.statusKey && row[f.key] ? (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[row[f.key]] || 'bg-slate-100 text-slate-700'}`}>{String(row[f.key]).replace(/_/g, ' ')}</span>
                          ) : displayValue(f, row[f.key])}
                        </td>
                      ))}
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {config.actions?.filter((a) => a.show(row)).map((a) => (
                            <button key={a.label} onClick={() => runAction(row, a.apply)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${TONE_BTN[a.tone || 'indigo']}`}>{a.label}</button>
                          ))}
                          <button onClick={() => openEdit(row)} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600" title="Modifier"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDelete(row)} className="p-1.5 rounded-lg hover:bg-rose-100 text-rose-600" title="Supprimer"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal ajout / édition */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => !saving && setModalOpen(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">{editing ? 'Modifier' : 'Nouveau'} — {config.title}</h2>
              <button onClick={() => setModalOpen(false)} className="p-2 rounded-xl hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
              {config.fields.map((f) => (
                <label key={f.key} className={`flex flex-col gap-1 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                  <span className="text-xs font-bold text-slate-600">{f.label}{f.required && <span className="text-rose-500"> *</span>}</span>
                  {f.type === 'select' ? (
                    <select value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      {!f.options?.includes('') && !f.default && <option value="">— Choisir —</option>}
                      {f.options?.map((o) => <option key={o} value={o}>{o ? o.replace(/_/g, ' ') : '—'}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={3} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  ) : f.type === 'boolean' ? (
                    <div className="flex items-center gap-2 py-2">
                      <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} className="w-4 h-4 accent-emerald-600" />
                      <span className="text-sm text-slate-600">{form[f.key] ? 'Oui' : 'Non'}</span>
                    </div>
                  ) : (
                    <input
                      type={f.type}
                      step={f.type === 'number' ? 'any' : undefined}
                      value={form[f.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  )}
                </label>
              ))}
              {config.compute && (
                <p className="sm:col-span-2 text-[11px] text-slate-500 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Les montants, soldes et statuts dérivés sont recalculés automatiquement à l'enregistrement.
                </p>
              )}
            </div>
            <div className="p-5 border-t border-slate-100 flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} disabled={saving} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50">Annuler</button>
              <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold flex items-center gap-2">
                {saving && <RefreshCw className="w-4 h-4 animate-spin" />} Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SectorModulePage
