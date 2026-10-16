// =============================================================================
// GESTIO 229 ADMIN — Fiche Détail d'une Entreprise + Réactivation Abonnement
// =============================================================================

import React, { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAdminCompanyDetail } from '../../hooks/useAdminData'
import { adminApiFetch } from '../../store/adminStore'
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, Calendar, CreditCard,
  Users, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle,
  Shield, History, ChevronDown, ChevronUp, Lock, Unlock, Trash2, RotateCcw, Copy, Check,
  AlertOctagon, ShieldAlert, Layers, Plus, Ban
} from 'lucide-react'

const ALL_AVAILABLE_SECTORS = [
  { id: 'commerce', label: 'Commerce Général & Boutiques' },
  { id: 'pharmacie', label: 'Pharmacies & Dépôts Pharmaceutiques' },
  { id: 'restaurant', label: 'Restauration, Bars & Fast-Foods' },
  { id: 'service', label: 'Prestations de Services & Agences' },
  { id: 'artisanat', label: 'Artisanat & Métiers de Production' },
  { id: 'transport', label: 'Transport, Logistique & Fret' },
  { id: 'sante', label: 'Cliniques & Centres de Santé' },
  { id: 'beaute', label: 'Salons de Coiffure & Instituts de Beauté' },
  { id: 'hotel', label: 'Hôtellerie & Hébergement' },
  { id: 'immobilier', label: 'Immobilier & Gestion Locative' },
  { id: 'agriculture', label: 'Agriculture & Élevage' },
  { id: 'evenementiel', label: 'Événementiel & Célébrations' },
  { id: 'btp', label: 'BTP & Matériaux de Construction' },
  { id: 'education', label: 'Écoles, Universités & Formations' },
]

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatFCFA(n: number = 0): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' FCFA'
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'active': return 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
    case 'trial': return 'bg-orange-900/40 text-orange-400 border-orange-700'
    case 'expired': return 'bg-red-900/40 text-red-400 border-red-700'
    case 'suspended': return 'bg-slate-800 text-slate-400 border-slate-600'
    default: return 'bg-slate-800 text-slate-400 border-slate-600'
  }
}

function getStatusEmoji(status: string) {
  switch (status) {
    case 'active': return '🟢'
    case 'trial': return '🟠'
    case 'expired': return '🔴'
    case 'suspended': return '⚫'
    default: return '❓'
  }
}

// ─── Formulaire de Réactivation ────────────────────────────────────────────
interface ReactivationFormProps {
  company: any
  onSuccess: () => void
  onCancel: () => void
}

const DURATIONS = [
  { value: 1, label: '1 mois' },
  { value: 3, label: '3 mois' },
  { value: 6, label: '6 mois' },
  { value: 12, label: '12 mois' },
  { value: 0, label: 'Durée personnalisée' },
]

const PLANS = [
  { value: 'starter', label: 'Starter — 5 000 FCFA', price: 5000 },
  { value: 'entreprise', label: 'Entreprise — 10 000 FCFA', price: 10000 },
  { value: 'duo', label: '2 Activités — 15 000 FCFA', price: 15000 },
  { value: 'trio', label: '3 Activités — 25 000 FCFA', price: 25000 },
]

const PAYMENT_METHODS = ['Espèces', 'Mobile Money', 'Virement bancaire', 'Carte bancaire', 'Autre']

const ReactivationForm: React.FC<ReactivationFormProps> = ({ company, onSuccess, onCancel }) => {
  const today = new Date().toISOString().split('T')[0]
  const [planSlug, setPlanSlug] = useState('entreprise')
  const [durationKey, setDurationKey] = useState(1)
  const [startedAt, setStartedAt] = useState(today)
  const [expiresAt, setExpiresAt] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1)
    return d.toISOString().split('T')[0]
  })
  const [amount, setAmount] = useState(10000)
  const [paymentMethod, setPaymentMethod] = useState('Espèces')
  const [paymentRef, setPaymentRef] = useState('')
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleDurationChange = (months: number) => {
    setDurationKey(months)
    if (months > 0) {
      const d = new Date(startedAt)
      d.setMonth(d.getMonth() + months)
      setExpiresAt(d.toISOString().split('T')[0])
    }
  }

  const handlePlanChange = (slug: string) => {
    setPlanSlug(slug)
    const p = PLANS.find((p) => p.value === slug)
    if (p) setAmount(p.price * Math.max(1, durationKey))
  }

  const handleStartChange = (date: string) => {
    setStartedAt(date)
    if (durationKey > 0) {
      const d = new Date(date)
      d.setMonth(d.getMonth() + durationKey)
      setExpiresAt(d.toISOString().split('T')[0])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!expiresAt) { setError('Date d\'expiration requise.'); return }
    if (!reason.trim()) { setError('Motif requis.'); return }

    setLoading(true)
    try {
      const selectedPlan = PLANS.find((p) => p.value === planSlug)
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reactivate',
          company_id: company.id,
          plan_slug: planSlug,
          plan_name: selectedPlan?.label.split('—')[0].trim() || 'Plan Entreprise',
          duration_months: durationKey || 1,
          started_at: new Date(startedAt).toISOString(),
          expires_at: new Date(expiresAt + 'T23:59:59').toISOString(),
          price_monthly: amount,
          payment_method: paymentMethod,
          payment_reference: paymentRef,
          reason: reason.trim(),
          comment: comment.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        onSuccess()
      } else {
        setError(data.error || 'Erreur lors de la réactivation.')
      }
    } catch (e: any) {
      setError(e.message || 'Erreur réseau.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-white font-bold text-lg flex items-center gap-2">
        <Shield className="w-5 h-5 text-emerald-400" />
        Réactivation manuelle — {company.name}
      </h3>

      <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 text-amber-300 text-xs">
        ⚠️ Cette action modifie <strong>uniquement</strong> l'abonnement de cette entreprise. 
        Elle ne modifie pas les règles générales ni les autres entreprises.
      </div>

      {error && <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-slate-400 text-xs font-semibold mb-1">Formule</label>
          <select value={planSlug} onChange={(e) => handlePlanChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {PLANS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 text-xs font-semibold mb-1">Durée</label>
          <select value={durationKey} onChange={(e) => handleDurationChange(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 text-xs font-semibold mb-1">Date de début</label>
          <input type="date" value={startedAt} onChange={(e) => handleStartChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div>
          <label className="block text-slate-400 text-xs font-semibold mb-1">Date d'expiration</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div>
          <label className="block text-slate-400 text-xs font-semibold mb-1">Montant (FCFA)</label>
          <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} min={0}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>

        <div>
          <label className="block text-slate-400 text-xs font-semibold mb-1">Moyen de paiement</label>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
            {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-slate-400 text-xs font-semibold mb-1">Référence de paiement</label>
        <input type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)}
          placeholder="N° reçu, transaction, etc."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <div>
        <label className="block text-slate-400 text-xs font-semibold mb-1">Motif <span className="text-red-400">*</span></label>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} required
          placeholder="Ex: Paiement reçu en espèces, régularisation, etc."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      <div>
        <label className="block text-slate-400 text-xs font-semibold mb-1">Commentaire administratif</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2}
          placeholder="Notes internes (non visibles par l'entreprise)"
          className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="flex-1 bg-slate-800 border border-slate-700 text-slate-300 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-700 transition">
          Annuler
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-center gap-2">
          {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Traitement...</> : '✅ Réactiver l\'abonnement'}
        </button>
      </div>
    </form>
  )
}

// ─── Page Principale ────────────────────────────────────────────────────────
const AdminCompanyDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAdminCompanyDetail(id || null)
  const [showReactivation, setShowReactivation] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showSecAudit, setShowSecAudit] = useState(false)
  const [selectedSectorToAdd, setSelectedSectorToAdd] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(false)

  const company = data?.company
  const users = data?.users || []
  const mainAdmin = users.find((u: any) => u.role === 'administrateur' || u.role === 'super_admin') || users[0]

  const handleReactivationSuccess = () => {
    setShowReactivation(false)
    setSuccessMsg('✅ Abonnement réactivé avec succès.')
    reload()
    setTimeout(() => setSuccessMsg(''), 5000)
  }

  const handleCopyId = () => {
    if (!company?.id) return
    navigator.clipboard?.writeText(company.id)
    setCopiedId(true)
    setTimeout(() => setCopiedId(false), 2000)
  }

  const handleFlagSuspicious = async () => {
    const reason = window.prompt(`Motif du signalement suspect pour « ${company.name} » :`, "Activité suspecte ou tentative de contournement")
    if (reason === null) return
    if (!reason.trim()) { alert("Le motif est obligatoire."); return }
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'flag_suspicious', company_id: company.id, reason: reason.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnflagSuspicious = async () => {
    const notes = window.prompt(`Note de validation manuelle pour « ${company.name} » :`, "Compte vérifié et validé par le Super Administrateur")
    if (notes === null) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'unflag_suspicious', company_id: company.id, notes: notes.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveSectorRequest = async (reqId: string, requestedSectors: string[]) => {
    const confirmApprove = window.confirm(`Approuver cette demande multisecteur et accorder l'accès aux secteurs : ${requestedSectors.join(', ')} ?`)
    if (!confirmApprove) return
    const notes = window.prompt("Conditions commerciales ou notes d'approbation :", "Accord commercial validé") || ""
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve_multisector_request', request_id: reqId, approved_sectors: requestedSectors, notes })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur lors de l\'approbation.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRejectSectorRequest = async (reqId: string) => {
    const notes = window.prompt("Motif du refus de la demande multisecteur :", "Critères d'accès multisecteur non remplis")
    if (notes === null) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'reject_multisector_request', request_id: reqId, notes: notes.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur lors du refus.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleAddSector = async (sectorSlug: string) => {
    if (!sectorSlug) return
    const currentList = Array.isArray(company.authorized_sectors) && company.authorized_sectors.length > 0
      ? company.authorized_sectors
      : (company.selected_sectors || [company.primary_sector || 'commerce'])
    if (currentList.includes(sectorSlug)) {
      alert("Ce secteur est déjà accordé.")
      return
    }
    const updated = [...currentList, sectorSlug]
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'manage_sectors', company_id: company.id, authorized_sectors: updated })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(`Secteur ${sectorSlug} accordé avec succès.`)
        setSelectedSectorToAdd('')
        reload()
      } else {
        setActionError(json.error || 'Erreur.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveSector = async (sectorSlug: string) => {
    const currentList = (company.authorized_sectors && company.authorized_sectors.length > 0)
      ? company.authorized_sectors
      : (company.selected_sectors || [company.primary_sector || 'commerce'])
    
    if (currentList.length <= 1) {
      alert("Impossible de retirer le seul secteur actif de l'entreprise.")
      return
    }

    if (!window.confirm(`Voulez-vous révoquer l'accès au secteur « ${sectorSlug} » ?`)) return

    const updated = currentList.filter((s: string) => s !== sectorSlug)
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'manage_sectors', company_id: company.id, authorized_sectors: updated })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(`Accès au secteur ${sectorSlug} révoqué.`)
        reload()
      } else {
        setActionError(json.error || 'Erreur.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBlock = async () => {
    const reason = window.prompt(`Motif du blocage de l'accès pour « ${company.name} » :`, "Défaut de paiement / suspension administrative")
    if (reason === null) return
    if (!reason.trim()) { alert("Le motif de blocage est obligatoire."); return }
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'block', company_id: company.id, reason: reason.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur lors du blocage.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUnblock = async () => {
    const reason = window.prompt(`Motif ou note de déblocage pour « ${company.name} » :`, "Régularisation effectuée / Rétablissement d'accès")
    if (reason === null) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'unblock', company_id: company.id, reason: reason.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur lors du déblocage.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSoftDelete = async () => {
    const reason = window.prompt(`ATTENTION : Suppression logique de « ${company.name} ».\n\nSes accès seront bloqués mais toutes ses données seront conservées.\n\nSaisissez le motif obligatoire :`)
    if (reason === null) return
    if (!reason.trim()) { alert("Le motif de la suppression est obligatoire."); return }
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete_soft', company_id: company.id, reason: reason.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur lors de la suppression logique.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRestore = async () => {
    const reason = window.prompt(`Restauration de l'entreprise « ${company.name} ».\n\nSes accès seront rétablis.\n\nMotif ou note :`, "Restauration par le Super Administrateur")
    if (reason === null) return
    setActionLoading(true)
    setActionError('')
    try {
      const res = await adminApiFetch('/api/admin-subscription', {
        method: 'POST',
        body: JSON.stringify({ action: 'restore', company_id: company.id, reason: reason.trim() })
      })
      const json = await res.json()
      if (json.success) {
        setSuccessMsg(json.message)
        reload()
      } else {
        setActionError(json.error || 'Erreur lors de la restauration.')
      }
    } catch (e: any) {
      setActionError(e.message || 'Erreur réseau.')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error || !company) return (
    <div className="text-center py-16">
      <p className="text-red-400 mb-4">{error || 'Entreprise introuvable.'}</p>
      <button onClick={() => navigate('/admin/companies')} className="text-slate-400 hover:text-white text-sm">← Retour</button>
    </div>
  )

  const isSuspended = company.subscription_status === 'suspended' || company.is_active === false
  const isDeleted = company.subscription_status === 'deleted'
  const statusBadge = isDeleted
    ? 'bg-red-950/60 text-red-400 border-red-800'
    : isSuspended
    ? 'bg-amber-950/60 text-amber-400 border-amber-800'
    : getStatusBadge(company.subscription_status)

  const sectors = (company.selected_sectors || company.sectors || []).map((s: string) => s.replace(/^sec-/, '').toLowerCase())

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Retour */}
      <Link to="/admin/companies" className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition">
        <ArrowLeft className="w-4 h-4" />
        Retour aux entreprises
      </Link>

      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-600 rounded-xl px-4 py-3 text-emerald-200 text-sm font-semibold animate-fadeIn">
          {successMsg}
        </div>
      )}

      {actionError && (
        <div className="bg-red-950/80 border border-red-600 rounded-xl px-4 py-3 text-red-200 text-sm font-semibold animate-fadeIn">
          {actionError}
        </div>
      )}

      {/* En-tête entreprise */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-emerald-900/40 border border-emerald-700/50 rounded-2xl flex items-center justify-center text-emerald-400 font-black text-2xl flex-shrink-0">
              {company.name?.charAt(0)?.toUpperCase() || 'E'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-white text-xl font-black">{company.name}</h1>
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-0.5 rounded-lg border ${statusBadge}`}>
                  {isDeleted ? '🗑️ SUPPRIMÉ' : isSuspended ? '🔒 SUSPENDU' : `${getStatusEmoji(company.subscription_status)} ${(company.subscription_status || 'trial').toUpperCase()}`}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5">{company.legal_form || 'SARL'} · {company.city || 'Bénin'}</p>
              <div className="flex items-center gap-1.5 mt-2">
                <span className="text-slate-500 text-xs">Identifiant unique :</span>
                <span className="font-mono text-emerald-400 text-xs bg-slate-800 px-2 py-0.5 rounded border border-slate-700/60">{company.id}</span>
                <button
                  onClick={handleCopyId}
                  className="text-slate-400 hover:text-white p-1 rounded transition"
                  title="Copier l'identifiant unique complet"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Boutons d'actions rapides */}
          <div className="flex flex-wrap items-center gap-2">
            {!isDeleted && (
              <>
                {company.is_suspicious ? (
                  <button
                    onClick={handleUnflagSuspicious}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 bg-emerald-900/60 hover:bg-emerald-800 border border-emerald-600 disabled:opacity-50 text-emerald-200 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                    LEVER SUSPECT
                  </button>
                ) : (
                  <button
                    onClick={handleFlagSuspicious}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 disabled:opacity-50 text-rose-300 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    <AlertOctagon className="w-3.5 h-3.5 text-rose-400" />
                    SIGNALER SUSPECT
                  </button>
                )}

                {isSuspended ? (
                  <button
                    onClick={handleUnblock}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    DÉBLOQUER L'ACCÈS
                  </button>
                ) : (
                  <button
                    onClick={handleBlock}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    BLOQUER L'ACCÈS
                  </button>
                )}
              </>
            )}

            {isDeleted ? (
              <button
                onClick={handleRestore}
                disabled={actionLoading}
                className="flex items-center gap-1.5 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                RESTAURER L'ENTREPRISE
              </button>
            ) : (
              <button
                onClick={handleSoftDelete}
                disabled={actionLoading}
                className="flex items-center gap-1.5 bg-red-950/60 hover:bg-red-900 border border-red-800 disabled:opacity-50 text-red-300 px-3 py-2 rounded-xl text-xs font-bold transition shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                SUPPRIMER
              </button>
            )}

            <button
              onClick={() => setShowReactivation(!showReactivation)}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              RÉACTIVER L'ABONNEMENT
            </button>
          </div>
        </div>

        {/* Alerte Compte Suspect */}
        {company.is_suspicious && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-start justify-between gap-3 bg-rose-950/30 p-4 rounded-xl border border-rose-800/60">
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold text-rose-300 text-sm">
                  ⚠️ Ce compte est signalé comme suspect (Vérification manuelle requise)
                </span>
                <p className="text-rose-200 mt-1">
                  Motif : {company.suspicious_reason || 'Signalement automatique ou signalement de sécurité'}
                </p>
                {company.suspicious_reviewed_at && (
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    Dernière revue : {formatDate(company.suspicious_reviewed_at)} par {company.suspicious_reviewed_by || 'Super Admin'}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={handleUnflagSuspicious}
              className="bg-emerald-700 hover:bg-emerald-600 text-white text-xs px-3 py-1.5 rounded-lg font-bold transition whitespace-nowrap shadow-sm"
            >
              Lever le signalement
            </button>
          </div>
        )}

        {/* Alerte si suspendu ou supprimé */}
        {(isSuspended || isDeleted) && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-start gap-3 bg-amber-950/20 p-3 rounded-xl border border-amber-800/40">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-amber-300">
                {isDeleted ? 'Cette entreprise est supprimée logiquement.' : 'L\'accès de cette entreprise est actuellement bloqué.'}
              </span>
              {company.suspension_reason && (
                <p className="text-slate-300 mt-0.5">Motif enregistré : {company.suspension_reason}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Formulaire de réactivation */}
      {showReactivation && (
        <div className="bg-slate-900 border border-emerald-800 rounded-2xl p-6">
          <ReactivationForm company={company} onSuccess={handleReactivationSuccess} onCancel={() => setShowReactivation(false)} />
        </div>
      )}

      {/* Demandes d'accès multisecteur (Niveau 3) */}
      {Array.isArray(data?.sectorRequests) && data.sectorRequests.length > 0 && (
        <div className="bg-slate-900 border border-amber-800/50 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Demandes d'accès multisecteur (Niveau 3)
              <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded-full border border-amber-500/40 font-bold">
                {data.sectorRequests.filter((r: any) => r.status === 'pending').length} en attente
              </span>
            </h3>
          </div>

          <div className="space-y-3">
            {data.sectorRequests.map((req: any) => {
              const isPending = req.status === 'pending'
              return (
                <div key={req.id} className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {req.requested_sectors?.map((s: string) => s.replace(/^sec-/, '').toUpperCase()).join(', ')}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                          req.status === 'approved' ? 'bg-emerald-950 text-emerald-400 border-emerald-700' :
                          req.status === 'rejected' ? 'bg-rose-950 text-rose-400 border-rose-700' :
                          'bg-amber-950 text-amber-400 border-amber-700'
                        }`}>
                          {req.status === 'pending' ? 'En attente' : req.status === 'approved' ? 'Approuvé' : 'Refusé'}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-1">
                        Demandeur : <strong className="text-slate-200">{req.contact_name}</strong> ({req.contact_phone} {req.contact_email ? `· ${req.contact_email}` : ''})
                      </p>
                      {req.business_case && (
                        <p className="text-slate-300 text-xs mt-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                          « {req.business_case} »
                        </p>
                      )}
                      <p className="text-slate-500 text-[11px] mt-1">
                        Soumis le : {formatDate(req.created_at)}
                        {req.reviewed_at && ` · Traité le ${formatDate(req.reviewed_at)} par ${req.reviewed_by || 'Super Admin'}`}
                      </p>
                    </div>

                    {isPending && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApproveSectorRequest(req.id, req.requested_sectors || [])}
                          disabled={actionLoading}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approuver
                        </button>
                        <button
                          onClick={() => handleRejectSectorRequest(req.id)}
                          disabled={actionLoading}
                          className="bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs px-3 py-2 rounded-xl font-bold transition flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Refuser
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Informations entreprise */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400" />
            Informations générales & Essai
          </h3>
          {[
            { label: 'Identifiant unique (ID)', value: company.id },
            {
              label: 'Secteur principal déclaré',
              value: (company.primary_sector || sectors[0] || 'Commerce').toUpperCase()
            },
            {
              label: 'Responsable principal',
              value: mainAdmin ? `${mainAdmin.full_name || mainAdmin.username || 'Admin'} (${mainAdmin.email})` : (company.responsible_name || '—')
            },
            { label: 'IFU', value: company.ifu_number },
            { label: 'RCCM', value: company.rccm_number },
            { label: 'Téléphone', value: company.phone },
            { label: 'Email', value: company.email },
            { label: 'Adresse', value: company.address ? `${company.address}, ${company.city}` : company.city },
            { label: 'Date d\'inscription', value: formatDateShort(company.created_at) },
            {
              label: 'Fin de période d\'essai (30 jours)',
              value: formatDateShort(company.trial_ends_at || (company.created_at ? new Date(new Date(company.created_at).getTime() + 30 * 86400000).toISOString() : null))
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between border-b border-slate-800 pb-2">
              <span className="text-slate-500 text-xs">{label}</span>
              <span className="text-slate-200 text-xs font-medium truncate max-w-[250px]">{value || '—'}</span>
            </div>
          ))}
        </div>

        {/* Abonnement */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-white font-bold flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            Abonnement & Licence
          </h3>
          {(data?.subscriptions || []).length === 0 ? (
            <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
              <p className="text-white text-sm font-semibold">Essai gratuit actif (Niveau 1)</p>
              <p className="text-slate-400 text-xs mt-1">
                L'entreprise bénéficie d'une période d'essai de 30 jours limitée au secteur principal déclaré ({company.primary_sector || 'commerce'}).
              </p>
            </div>
          ) : (data?.subscriptions || []).slice(0, 1).map((sub: any) => (
            <div key={sub.id} className="space-y-2">
              {[
                { label: 'Formule', value: sub.plan_name },
                { label: 'Statut', value: `${getStatusEmoji(sub.status)} ${sub.status?.toUpperCase()}` },
                { label: 'Début', value: formatDateShort(sub.started_at) },
                { label: 'Expiration', value: formatDateShort(sub.expires_at) },
                { label: 'Montant mensuel', value: sub.price_monthly ? formatFCFA(sub.price_monthly) : '5 000 FCFA' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-500 text-xs">{label}</span>
                  <span className="text-slate-200 text-xs font-medium">{value || '—'}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Secteurs autorisés & Modules */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-white font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              Secteurs d'activité autorisés & Attribution de droits
            </h3>
            <p className="text-slate-400 text-xs mt-0.5">
              Contrôlez les secteurs débloqués pour cette entreprise (Niveaux 1, 2 et 3).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedSectorToAdd}
              onChange={(e) => setSelectedSectorToAdd(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="">+ Choisir un secteur à accorder...</option>
              {ALL_AVAILABLE_SECTORS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() => handleAddSector(selectedSectorToAdd)}
              disabled={!selectedSectorToAdd || actionLoading}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded-xl font-bold transition flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Accorder
            </button>
          </div>
        </div>

        {sectors.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucun secteur identifié</p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {sectors.map((s: string) => {
              const isPrimary = (company.primary_sector || '').replace(/^sec-/, '').toLowerCase() === s
              return (
                <div
                  key={s}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold ${
                    isPrimary
                      ? 'bg-cyan-950/60 border-cyan-600/80 text-cyan-300'
                      : 'bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <span>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  {isPrimary && (
                    <span className="bg-cyan-800/80 text-[10px] text-cyan-100 px-1.5 py-0.5 rounded font-black uppercase">
                      Principal
                    </span>
                  )}
                  {!isPrimary && (
                    <button
                      onClick={() => handleRemoveSector(s)}
                      disabled={actionLoading}
                      title="Révoquer ce secteur"
                      className="text-slate-400 hover:text-rose-400 transition ml-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Utilisateurs */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-purple-400" />
          Utilisateurs ({(data?.users || []).length})
        </h3>
        <div className="space-y-2">
          {(data?.users || []).map((u: any) => (
            <div key={u.id} className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-2.5">
              <div>
                <p className="text-white text-sm font-semibold">{u.full_name || u.email}</p>
                <p className="text-slate-500 text-xs">{u.email}</p>
              </div>
              <div className="text-right">
                <span className="bg-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-lg font-medium capitalize">{u.role}</span>
                {u.last_login && <p className="text-slate-500 text-[11px] mt-0.5">Dernière connexion: {formatDate(u.last_login)}</p>}
              </div>
            </div>
          ))}
          {(data?.users || []).length === 0 && <p className="text-slate-500 text-sm">Aucun utilisateur</p>}
        </div>
      </div>

      {/* Journal de sécurité & audit intégrité */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <button onClick={() => setShowSecAudit(!showSecAudit)} className="w-full flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-400" />
            Journal de sécurité & Intégrité des accès ({(data?.securityLogs || []).length})
          </h3>
          {showSecAudit ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showSecAudit && (
          <div className="mt-4 overflow-x-auto">
            {(data?.securityLogs || []).length === 0 ? (
              <p className="text-slate-500 text-sm">Aucun événement de sécurité consigné pour cette entreprise.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs border-b border-slate-800">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Événement</th>
                    <th className="text-left py-2 pr-4">Sévérité</th>
                    <th className="text-left py-2">Détails</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.securityLogs || []).map((sec: any) => (
                    <tr key={sec.id} className="border-b border-slate-800/50">
                      <td className="py-2 pr-4 text-slate-400 text-xs whitespace-nowrap">{formatDate(sec.created_at)}</td>
                      <td className="py-2 pr-4 text-white text-xs font-semibold">{sec.event_type}</td>
                      <td className="py-2 pr-4 text-xs">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          sec.severity === 'critical' ? 'bg-red-950 text-red-400' :
                          sec.severity === 'warning' ? 'bg-amber-950 text-amber-400' :
                          'bg-blue-950 text-blue-400'
                        }`}>
                          {sec.severity}
                        </span>
                      </td>
                      <td className="py-2 text-slate-300 text-xs">{sec.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Historique abonnements */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <button onClick={() => setShowHistory(!showHistory)} className="w-full flex items-center justify-between">
          <h3 className="text-white font-bold flex items-center gap-2">
            <History className="w-4 h-4 text-yellow-400" />
            Historique des interventions ({(data?.subscriptionHistory || []).length})
          </h3>
          {showHistory ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>

        {showHistory && (
          <div className="mt-4 overflow-x-auto">
            {(data?.subscriptionHistory || []).length === 0 ? (
              <p className="text-slate-500 text-sm">Aucun historique</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-500 text-xs border-b border-slate-800">
                    <th className="text-left py-2 pr-4">Date</th>
                    <th className="text-left py-2 pr-4">Action</th>
                    <th className="text-left py-2 pr-4">Anc. expiration</th>
                    <th className="text-left py-2 pr-4">Nouv. expiration</th>
                    <th className="text-left py-2 pr-4">Montant</th>
                    <th className="text-left py-2">Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.subscriptionHistory || []).map((h: any) => (
                    <tr key={h.id} className="border-b border-slate-800/50">
                      <td className="py-2 pr-4 text-slate-400 text-xs whitespace-nowrap">{formatDateShort(h.created_at)}</td>
                      <td className="py-2 pr-4 text-white text-xs font-medium capitalize">{h.action?.replace(/_/g, ' ')}</td>
                      <td className="py-2 pr-4 text-slate-400 text-xs">{formatDateShort(h.old_expires_at)}</td>
                      <td className="py-2 pr-4 text-emerald-400 text-xs font-medium">{formatDateShort(h.new_expires_at)}</td>
                      <td className="py-2 pr-4 text-slate-300 text-xs">{h.amount ? formatFCFA(h.amount) : '—'}</td>
                      <td className="py-2 text-slate-400 text-xs">{h.performed_by || 'Super Admin'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminCompanyDetail
