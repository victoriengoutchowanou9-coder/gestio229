// =============================================================================
// GESTIO 229 ADMIN — Gestion des Entreprises (Super Admin)
// Liste complète, recherche par nom/ID, filtres, blocage, déblocage, suppression
// =============================================================================

import React, { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAdminCompanies } from '../../hooks/useAdminData'
import {
  Search, Eye, RefreshCw, Building2,
  CheckCircle2, Clock, XCircle, AlertOctagon,
  Lock, Unlock, Trash2, RotateCcw, Copy, Check,
  ShieldAlert, AlertTriangle, X, User, ChevronDown
} from 'lucide-react'

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function getStatusBadge(status: string, createdAt: string, is_active?: boolean) {
  const now = new Date()
  const created = new Date(createdAt)
  const trialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
  const isTrialExpired = status === 'trial' && now > trialEnd

  if (status === 'deleted') {
    return { label: 'SUPPRIMÉ', color: 'bg-red-950/60 text-red-400 border-red-800', icon: '🗑️', desc: 'Supprimé logiquement' }
  }

  if (status === 'suspended' || is_active === false) {
    return { label: 'SUSPENDU', color: 'bg-amber-950/60 text-amber-400 border-amber-800', icon: '🔒', desc: 'Accès bloqué' }
  }

  if (isTrialExpired || status === 'expired') {
    return { label: 'EXPIRÉ', color: 'bg-rose-950/60 text-rose-400 border-rose-800', icon: '🔴', desc: 'Essai terminé' }
  }

  switch (status) {
    case 'active':
      return { label: 'ACTIF', color: 'bg-emerald-950/60 text-emerald-400 border-emerald-800', icon: '🟢', desc: 'Accès opérationnel' }
    case 'trial': {
      const daysLeft = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      return { label: `ESSAI (${daysLeft}j)`, color: 'bg-orange-950/60 text-orange-400 border-orange-800', icon: '🟠', desc: 'Période d\'essai' }
    }
    default:
      return { label: (status || 'INCONNU').toUpperCase(), color: 'bg-slate-800 text-slate-400 border-slate-700', icon: '⚪', desc: 'Statut' }
  }
}

function getSectors(company: any): string[] {
  const sects = company.selected_sectors || company.sectors || []
  if (Array.isArray(sects)) return sects.map((s: string) => s.replace(/^sec-/, '').toLowerCase())
  if (company.active_sector) return [company.active_sector.replace(/^sec-/, '').toLowerCase()]
  return []
}

// ─── Modal de Confirmation : Bloquer l'Accès ─────────────────────────────────
interface BlockModalProps {
  company: any
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

const BlockModal: React.FC<BlockModalProps> = ({ company, onClose, onConfirm }) => {
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Veuillez préciser le motif du blocage.')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors du blocage.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
            <Lock className="w-5 h-5" />
            <span>Bloquer l'accès à l'entreprise</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-amber-200 text-xs leading-relaxed space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            Conséquences immédiates du blocage :
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-amber-300/90 pl-1">
            <li>L'entreprise et tous ses collaborateurs seront empêchés d'accéder à l'espace de travail.</li>
            <li>Leurs sessions seront invalidées lors des vérifications de sécurité.</li>
            <li><strong>Intégrité garantie :</strong> 100% de ses données (ventes, achats, comptabilité, stocks) sont intégralement conservées.</li>
            <li>Les autres entreprises de GESTIO229 continuent de fonctionner normalement.</li>
          </ul>
        </div>

        <div className="bg-slate-800/60 rounded-xl p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Entreprise :</span>
            <span className="text-white font-bold">{company.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Identifiant :</span>
            <span className="font-mono text-emerald-400 text-[11px]">{company.id}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-1">
              Motif du blocage <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Défaut de paiement d'abonnement, demande administrative du propriétaire, litige..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              required
            />
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs p-2.5 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-amber-900/30"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Blocage en cours...
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  Confirmer le blocage
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de Confirmation : Débloquer l'Accès ───────────────────────────────
interface UnblockModalProps {
  company: any
  onClose: () => void
  onConfirm: (reason?: string) => Promise<void>
}

const UnblockModal: React.FC<UnblockModalProps> = ({ company, onClose, onConfirm }) => {
  const [reason, setReason] = useState('Régularisation effectuée / Rétablissement d\'accès')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors du déblocage.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-lg">
            <Unlock className="w-5 h-5" />
            <span>Débloquer l'accès à l'entreprise</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-300 text-xs leading-relaxed">
          Le déblocage rétablira immédiatement l'accès à la plateforme pour l'ensemble des administrateurs et employés de l'entreprise <strong>{company.name}</strong>.
        </p>

        <div className="bg-slate-800/60 rounded-xl p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Entreprise :</span>
            <span className="text-white font-bold">{company.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Identifiant :</span>
            <span className="font-mono text-emerald-400 text-[11px]">{company.id}</span>
          </div>
          {company.suspension_reason && (
            <div className="pt-1 text-slate-400 border-t border-slate-700/50 mt-1">
              Motif initial de suspension : <span className="text-amber-300">{company.suspension_reason}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-1">
              Motif ou note de déblocage
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Paiement validé, réactivation manuelle..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs p-2.5 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Rétablissement en cours...
                </>
              ) : (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  Rétablir l'accès
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de Confirmation : Suppression Logique / Définitive ────────────────
interface DeleteModalProps {
  company: any
  onClose: () => void
  onSoftDelete: (reason: string) => Promise<void>
  onHardDelete: (confirmName: string, reason: string) => Promise<void>
}

const DeleteModal: React.FC<DeleteModalProps> = ({ company, onClose, onSoftDelete, onHardDelete }) => {
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [confirmHardName, setConfirmHardName] = useState('')
  const [isHardDelete, setIsHardDelete] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) {
      setError('Le motif de la suppression est obligatoire.')
      return
    }

    if (!isHardDelete && !confirmed) {
      setError('Veuillez cocher la case de confirmation.')
      return
    }

    if (isHardDelete && confirmHardName.trim().toLowerCase() !== company.name.trim().toLowerCase()) {
      setError(`Veuillez saisir exactement « ${company.name} » pour confirmer la suppression définitive.`)
      return
    }

    setLoading(true)
    setError('')
    try {
      if (isHardDelete) {
        await onHardDelete(confirmHardName.trim(), reason.trim())
      } else {
        await onSoftDelete(reason.trim())
      }
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-red-400 font-bold text-lg">
            <Trash2 className="w-5 h-5" />
            <span>Supprimer l'entreprise</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Explication suppression logique */}
        <div className="bg-blue-950/40 border border-blue-800/60 rounded-xl p-3 text-blue-200 text-xs leading-relaxed space-y-1">
          <p className="font-semibold text-blue-300">🛡️ Suppression Logique Sécurisée (Par défaut) :</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-200/90 pl-1">
            <li>L'entreprise passe au statut <strong>« Supprimé »</strong> et ses accès sont bloqués.</li>
            <li><strong>Conservation légale :</strong> Ses pièces comptables, factures, ventes et historiques sont préservés conformément au SYSCOHADA.</li>
            <li>Possibilité de <strong>restauration en un clic</strong> par le Super Admin à tout moment.</li>
          </ul>
        </div>

        <div className="bg-slate-800/60 rounded-xl p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Nom de l'entreprise :</span>
            <span className="text-white font-bold">{company.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Identifiant unique :</span>
            <span className="font-mono text-emerald-400 text-[11px]">{company.id}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-1">
              Motif de la suppression <span className="text-red-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cessation d'activité, demande de désinscription par le client, compte de test..."
              rows={2}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              required
            />
          </div>

          {!isHardDelete ? (
            <label className="flex items-start gap-2.5 cursor-pointer bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/60">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded text-red-600 focus:ring-red-500 bg-slate-900 border-slate-600"
              />
              <span className="text-slate-300 text-xs select-none">
                Je confirme la <strong>suppression logique</strong> de l'entreprise « {company.name} » ({company.id}).
              </span>
            </label>
          ) : (
            <div className="bg-red-950/40 border border-red-800 rounded-xl p-3 space-y-2">
              <p className="text-red-300 text-xs font-bold flex items-center gap-1.5">
                <AlertOctagon className="w-4 h-4 text-red-400" />
                Attention : Opération Irréversible !
              </p>
              <p className="text-red-200 text-[11px] leading-tight">
                Pour exécuter la suppression définitive de toutes les données liées exclusivement à cette entreprise, saisissez son nom exact ci-dessous :
              </p>
              <input
                type="text"
                value={confirmHardName}
                onChange={(e) => setConfirmHardName(e.target.value)}
                placeholder={company.name}
                className="w-full bg-slate-900 border border-red-700 rounded-lg p-2 text-white text-xs placeholder-slate-600 focus:ring-2 focus:ring-red-500 font-bold"
              />
            </div>
          )}

          {/* Option avancée dépliable */}
          <div className="border-t border-slate-800 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAdvanced(!showAdvanced)
                if (showAdvanced) setIsHardDelete(false)
              }}
              className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Options avancées (Suppression définitive)
            </button>

            {showAdvanced && (
              <div className="mt-2 pl-4 border-l-2 border-red-900/40">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-red-400">
                  <input
                    type="checkbox"
                    checked={isHardDelete}
                    onChange={(e) => setIsHardDelete(e.target.checked)}
                    className="rounded text-red-600 focus:ring-red-500"
                  />
                  Basculer en suppression définitive (Hard Delete)
                </label>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs p-2.5 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || (!isHardDelete && !confirmed)}
              className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-red-900/30"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  {isHardDelete ? 'Supprimer définitivement' : 'Confirmer la suppression'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal de Confirmation : Restauration ────────────────────────────────────
interface RestoreModalProps {
  company: any
  onClose: () => void
  onConfirm: (reason?: string) => Promise<void>
}

const RestoreModal: React.FC<RestoreModalProps> = ({ company, onClose, onConfirm }) => {
  const [reason, setReason] = useState('Restauration par le Super Administrateur')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await onConfirm(reason.trim())
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la restauration.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
            <RotateCcw className="w-5 h-5" />
            <span>Restaurer l'entreprise</span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-slate-300 text-xs leading-relaxed">
          Cette opération va rétablir l'entreprise <strong>{company.name}</strong>, réactiver ses accès et restaurer toutes ses données archivées.
        </p>

        <div className="bg-slate-800/60 rounded-xl p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">Entreprise :</span>
            <span className="text-white font-bold">{company.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Identifiant :</span>
            <span className="font-mono text-emerald-400 text-[11px]">{company.id}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-slate-300 text-xs font-semibold mb-1">
              Motif de restauration
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Demande de réouverture par le client..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          {error && (
            <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs p-2.5 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-cyan-900/30"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Restauration...
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurer l'entreprise
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Composant Principal : Gestion des Entreprises ───────────────────────────
const AdminCompanies: React.FC = () => {
  const [searchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') || 'all'
  const {
    companies,
    loading,
    error,
    reload,
    blockCompany,
    unblockCompany,
    softDeleteCompany,
    restoreCompany,
    hardDeleteCompany
  } = useAdminCompanies()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState(initialFilter)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Gestion des modals
  const [activeModal, setActiveModal] = useState<{
    type: 'block' | 'unblock' | 'delete' | 'restore' | null
    company: any | null
  }>({ type: null, company: null })

  // Notifications toast
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message })
    setTimeout(() => setNotification(null), 6000)
  }

  const handleCopyId = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(id)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filtrage
  const filtered = companies.filter((c) => {
    const q = search.toLowerCase().trim()
    const matchSearch =
      !q ||
      c.name?.toLowerCase().includes(q) ||
      c.id?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.ifu_number?.toLowerCase().includes(q) ||
      c.primaryAdmin?.name?.toLowerCase().includes(q) ||
      c.primaryAdmin?.email?.toLowerCase().includes(q)

    const s = c.subscription_status || 'trial'
    const isSuspended = s === 'suspended' || c.is_active === false
    const isDeleted = s === 'deleted'
    const now = new Date()
    const created = new Date(c.created_at)
    const trialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000)
    const isTrialExpired = s === 'trial' && now > trialEnd

    let matchStatus = true
    if (statusFilter === 'active') matchStatus = s === 'active' && !isSuspended && !isDeleted
    else if (statusFilter === 'trial') matchStatus = s === 'trial' && !isTrialExpired && !isSuspended && !isDeleted
    else if (statusFilter === 'suspended') matchStatus = isSuspended && !isDeleted
    else if (statusFilter === 'deleted') matchStatus = isDeleted
    else if (statusFilter === 'expired') matchStatus = (s === 'expired' || isTrialExpired) && !isDeleted

    return matchSearch && matchStatus
  })

  // Handlers pour les opérations
  const handleConfirmBlock = async (reason: string) => {
    if (!activeModal.company) return
    const comp = activeModal.company
    try {
      const res = await blockCompany(comp.id, reason)
      showNotification('success', res.message || `L'accès à l'entreprise ${comp.name} a été bloqué avec succès.`)
    } catch (err: any) {
      showNotification('error', err.message || 'Erreur lors du blocage.')
      throw err
    }
  }

  const handleConfirmUnblock = async (reason?: string) => {
    if (!activeModal.company) return
    const comp = activeModal.company
    try {
      const res = await unblockCompany(comp.id, reason)
      showNotification('success', res.message || `L'accès à l'entreprise ${comp.name} a été rétabli avec succès.`)
    } catch (err: any) {
      showNotification('error', err.message || 'Erreur lors du déblocage.')
      throw err
    }
  }

  const handleConfirmSoftDelete = async (reason: string) => {
    if (!activeModal.company) return
    const comp = activeModal.company
    try {
      const res = await softDeleteCompany(comp.id, reason)
      showNotification('success', res.message || `L'entreprise ${comp.name} a été supprimée logiquement.`)
    } catch (err: any) {
      showNotification('error', err.message || 'Erreur lors de la suppression logique.')
      throw err
    }
  }

  const handleConfirmHardDelete = async (confirmName: string, reason: string) => {
    if (!activeModal.company) return
    const comp = activeModal.company
    try {
      const res = await hardDeleteCompany(comp.id, confirmName, reason)
      showNotification('success', res.message || `L'entreprise ${comp.name} a été définitivement supprimée.`)
    } catch (err: any) {
      showNotification('error', err.message || 'Erreur lors de la suppression définitive.')
      throw err
    }
  }

  const handleConfirmRestore = async (reason?: string) => {
    if (!activeModal.company) return
    const comp = activeModal.company
    try {
      const res = await restoreCompany(comp.id, reason)
      showNotification('success', res.message || `L'entreprise ${comp.name} a été restaurée avec succès.`)
    } catch (err: any) {
      showNotification('error', err.message || 'Erreur lors de la restauration.')
      throw err
    }
  }

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-2xl border shadow-2xl flex items-start gap-3 transition-all animate-fadeIn ${
            notification.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-600 text-emerald-200'
              : 'bg-red-950/90 border-red-600 text-red-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertOctagon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <div className="text-xs font-semibold leading-relaxed flex-1">
            {notification.message}
          </div>
          <button onClick={() => setNotification(null)} className="text-slate-400 hover:text-white p-0.5">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-600/20 border border-emerald-500/40 rounded-xl flex items-center justify-center text-emerald-400">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-white text-2xl font-black tracking-tight">Gestion des entreprises</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                Contrôle d'accès, blocage, déblocage et suppression logique des comptes inscrits ({companies.length} au total)
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={reload}
          className="flex items-center gap-2 bg-slate-800 border border-slate-700 text-slate-300 px-4 py-2 rounded-xl text-xs font-semibold hover:bg-slate-700 hover:text-white transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Actualiser
        </button>
      </div>

      {/* Barre de Recherche et Filtres par Statut */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par nom d'entreprise, identifiant unique (UUID), email, responsable ou IFU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {[
            { key: 'all', label: 'Tous', count: companies.length },
            {
              key: 'active',
              label: '🟢 Actifs',
              count: companies.filter((c) => c.subscription_status === 'active' && c.is_active !== false).length
            },
            {
              key: 'trial',
              label: '🟠 En essai',
              count: companies.filter((c) => c.subscription_status === 'trial' && c.is_active !== false).length
            },
            {
              key: 'suspended',
              label: '🔒 Bloqués / Suspendus',
              count: companies.filter((c) => (c.subscription_status === 'suspended' || c.is_active === false) && c.subscription_status !== 'deleted').length
            },
            {
              key: 'deleted',
              label: '🗑️ Supprimés',
              count: companies.filter((c) => c.subscription_status === 'deleted').length
            },
          ].map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                statusFilter === key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${statusFilter === key ? 'bg-emerald-800/80 text-white' : 'bg-slate-800 text-slate-400'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Compteur filtré */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <p>{filtered.length} entreprise(s) affichée(s)</p>
        {search && (
          <button onClick={() => setSearch('')} className="text-emerald-400 hover:underline">
            Réinitialiser la recherche
          </button>
        )}
      </div>

      {/* Table principale */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-red-950/40 border border-red-800 rounded-2xl p-6 text-center text-red-300 text-sm">
          {error}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40">
                  <th className="text-slate-400 text-xs font-semibold px-4 py-3.5 whitespace-nowrap">Entreprise & ID unique</th>
                  <th className="text-slate-400 text-xs font-semibold px-4 py-3.5 whitespace-nowrap">Responsable Principal</th>
                  <th className="text-slate-400 text-xs font-semibold px-4 py-3.5 whitespace-nowrap">Secteurs d'activité</th>
                  <th className="text-slate-400 text-xs font-semibold px-4 py-3.5 whitespace-nowrap">Date création</th>
                  <th className="text-slate-400 text-xs font-semibold px-4 py-3.5 whitespace-nowrap">Statut actuel</th>
                  <th className="text-slate-400 text-xs font-semibold px-4 py-3.5 whitespace-nowrap text-center">Équipe</th>
                  <th className="text-slate-400 text-xs font-semibold px-4 py-3.5 whitespace-nowrap text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-slate-500 py-16 text-sm">
                      Aucune entreprise ne correspond à votre filtre.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const badge = getStatusBadge(c.subscription_status, c.created_at, c.is_active)
                    const sectors = getSectors(c)
                    const isSuspended = c.subscription_status === 'suspended' || c.is_active === false
                    const isDeleted = c.subscription_status === 'deleted'

                    return (
                      <tr
                        key={c.id}
                        className={`transition hover:bg-slate-800/40 ${
                          isDeleted ? 'bg-red-950/10 opacity-75' : isSuspended ? 'bg-amber-950/10' : ''
                        }`}
                      >
                        {/* 1. Nom & Identifiant Unique */}
                        <td className="px-4 py-3.5">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 bg-slate-800 border border-slate-700 rounded-xl flex items-center justify-center text-emerald-400 font-black text-sm flex-shrink-0 mt-0.5">
                              {c.name?.charAt(0)?.toUpperCase() || 'E'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white text-sm font-bold truncate max-w-[220px]" title={c.name}>
                                {c.name}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-[11px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded border border-slate-700/60">
                                  {c.id.slice(0, 8)}...{c.id.slice(-4)}
                                </span>
                                <button
                                  onClick={(e) => handleCopyId(c.id, e)}
                                  title="Copier l'identifiant unique complet (UUID)"
                                  className="text-slate-500 hover:text-emerald-400 transition"
                                >
                                  {copiedId === c.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                {c.city && <span className="text-slate-500 text-[11px]">· {c.city}</span>}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Responsable ou Administrateur Principal */}
                        <td className="px-4 py-3.5">
                          {c.primaryAdmin ? (
                            <div className="min-w-0 max-w-[200px]">
                              <p className="text-slate-200 text-xs font-semibold truncate flex items-center gap-1">
                                <User className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                {c.primaryAdmin.name || 'Admin'}
                              </p>
                              <p className="text-slate-500 text-[11px] truncate">{c.primaryAdmin.email}</p>
                            </div>
                          ) : (
                            <div className="min-w-0 max-w-[200px]">
                              <p className="text-slate-400 text-xs font-medium truncate">
                                {c.responsible_name || '—'}
                              </p>
                              {c.email && <p className="text-slate-500 text-[11px] truncate">{c.email}</p>}
                            </div>
                          )}
                        </td>

                        {/* 3. Activité ou Secteur d'Exploitation */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1 max-w-[160px]">
                            {sectors.length === 0 ? (
                              <span className="text-slate-600 text-xs">Standard</span>
                            ) : (
                              sectors.slice(0, 2).map((s) => (
                                <span
                                  key={s}
                                  className="bg-slate-800 border border-slate-700/80 text-slate-300 text-[10px] px-2 py-0.5 rounded-md font-medium capitalize"
                                >
                                  {s}
                                </span>
                              ))
                            )}
                            {sectors.length > 2 && (
                              <span className="bg-slate-800 text-slate-400 text-[10px] px-1.5 py-0.5 rounded-md">
                                +{sectors.length - 2}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. Date de Création du Compte */}
                        <td className="px-4 py-3.5 text-slate-400 text-xs whitespace-nowrap">
                          {formatDate(c.created_at)}
                        </td>

                        {/* 5. Statut Actuel */}
                        <td className="px-4 py-3.5">
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-lg border ${badge.color}`}
                            >
                              <span>{badge.icon}</span>
                              <span>{badge.label}</span>
                            </span>
                            {c.suspension_reason && (
                              <p className="text-slate-400 text-[10px] max-w-[170px] truncate" title={c.suspension_reason}>
                                Motif: {c.suspension_reason}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* 6. Utilisateurs */}
                        <td className="px-4 py-3.5 text-center text-slate-400 text-xs font-semibold">
                          {c.userCount || 0}
                        </td>

                        {/* 7. Actions Disponibles */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Bouton Voir les détails */}
                            <Link
                              to={`/admin/companies/${c.id}`}
                              className="inline-flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border border-slate-700/80"
                              title="Voir la fiche détaillée de l'entreprise"
                            >
                              <Eye className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Détails</span>
                            </Link>

                            {/* Bouton Bloquer / Débloquer l'accès */}
                            {!isDeleted && (
                              <>
                                {isSuspended ? (
                                  <button
                                    onClick={() => setActiveModal({ type: 'unblock', company: c })}
                                    className="inline-flex items-center gap-1 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                                    title="Débloquer et rétablir l'accès à l'entreprise"
                                  >
                                    <Unlock className="w-3.5 h-3.5" />
                                    <span>Débloquer</span>
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setActiveModal({ type: 'block', company: c })}
                                    className="inline-flex items-center gap-1 bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                                    title="Bloquer l'accès de tous les utilisateurs de cette entreprise"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    <span>Bloquer</span>
                                  </button>
                                )}
                              </>
                            )}

                            {/* Bouton Supprimer / Restaurer */}
                            {isDeleted ? (
                              <button
                                onClick={() => setActiveModal({ type: 'restore', company: c })}
                                className="inline-flex items-center gap-1 bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition"
                                title="Restaurer l'entreprise supprimée logiquement"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>Restaurer</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => setActiveModal({ type: 'delete', company: c })}
                                className="inline-flex items-center gap-1 bg-red-950/40 hover:bg-red-900/70 text-red-300 border border-red-800 px-2 py-1.5 rounded-lg text-xs font-semibold transition"
                                title="Supprimer l'entreprise (suppression logique protégée)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span className="sr-only sm:not-sr-only">Supprimer</span>
                              </button>
                            )}
                          </div>
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

      {/* Modals d'actions */}
      {activeModal.type === 'block' && activeModal.company && (
        <BlockModal
          company={activeModal.company}
          onClose={() => setActiveModal({ type: null, company: null })}
          onConfirm={handleConfirmBlock}
        />
      )}

      {activeModal.type === 'unblock' && activeModal.company && (
        <UnblockModal
          company={activeModal.company}
          onClose={() => setActiveModal({ type: null, company: null })}
          onConfirm={handleConfirmUnblock}
        />
      )}

      {activeModal.type === 'delete' && activeModal.company && (
        <DeleteModal
          company={activeModal.company}
          onClose={() => setActiveModal({ type: null, company: null })}
          onSoftDelete={handleConfirmSoftDelete}
          onHardDelete={handleConfirmHardDelete}
        />
      )}

      {activeModal.type === 'restore' && activeModal.company && (
        <RestoreModal
          company={activeModal.company}
          onClose={() => setActiveModal({ type: null, company: null })}
          onConfirm={handleConfirmRestore}
        />
      )}
    </div>
  )
}

export default AdminCompanies
