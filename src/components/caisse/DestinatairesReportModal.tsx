// =============================================================================
// GESTIO 229 SaaS — Configuration Destinataires Rapport de Caisse (Admin)
// Gestion des emails, diagnostic de canal et test en direct (HTTPS / SMTP)
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Mail,
  UserPlus,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  X,
  Send,
  AlertCircle,
  Check,
  Zap,
  Globe,
  ChevronDown,
  ChevronUp,
  History,
  Info
} from 'lucide-react'
import { ModalPortal } from '../modals/ModalPortal'
import { showConfirm } from '../modals/CustomModalGestio'
import {
  DestinataireRapport,
  EmailDeliveryItem,
  ActiveProviderStatus,
  getDestinatairesRapport,
  ajouterDestinataireRapport,
  modifierDestinataireRapport,
  supprimerDestinataireRapport,
  getActiveEmailProvider,
  testEmailConnection,
  getEmailDeliveryHistory
} from '../../services/destinatairesReportService'

interface DestinatairesReportModalProps {
  isOpen: boolean
  onClose: () => void
  companyId: string
  isAdmin: boolean
}

export const DestinatairesReportModal: React.FC<DestinatairesReportModalProps> = ({
  isOpen,
  onClose,
  companyId,
  isAdmin
}) => {
  const [destinataires, setDestinataires] = useState<DestinataireRapport[]>([])
  const [loading, setLoading] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [nomInput, setNomInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Fournisseur email actif détecté sur le serveur
  const [providerStatus, setProviderStatus] = useState<ActiveProviderStatus | null>(null)

  // États pour le Test Email
  const [testEmailInput, setTestEmailInput] = useState('victoriengoutchowanou2024@gmail.com')
  const [testingEmail, setTestingEmail] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
    diagnostic?: string
    providerLabel?: string
  } | null>(null)

  // Historique des envois récents
  const [deliveryLogs, setDeliveryLogs] = useState<EmailDeliveryItem[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const [list, pStatus] = await Promise.all([
        getDestinatairesRapport(companyId),
        getActiveEmailProvider()
      ])
      setDestinataires(list)
      setProviderStatus(pStatus)
    } finally {
      setLoading(false)
    }
  }

  const loadLogs = async () => {
    setLoadingLogs(true)
    try {
      const logs = await getEmailDeliveryHistory(companyId)
      setDeliveryLogs(logs)
    } finally {
      setLoadingLogs(false)
    }
  }

  useEffect(() => {
    if (isOpen && companyId) {
      loadData()
      setErrorMessage(null)
      setSuccessMessage(null)
      setTestResult(null)
      setShowLogs(false)
    }
  }, [isOpen, companyId])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!emailInput.trim() || !emailInput.includes('@')) {
      setErrorMessage('Veuillez saisir une adresse email valide.')
      return
    }

    setSubmitting(true)
    try {
      const res = await ajouterDestinataireRapport(companyId, emailInput, nomInput, true)
      if (res.success) {
        setEmailInput('')
        setNomInput('')
        setSuccessMessage(`Destinataire ${res.destinataire?.email} ajouté avec succès.`)
        await loadData()
      } else {
        setErrorMessage(res.error || 'Impossible d\'ajouter ce destinataire.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleToggleActif = async (dest: DestinataireRapport) => {
    await modifierDestinataireRapport(companyId, dest.id, { actif: !dest.actif })
    await loadData()
  }

  const handleDelete = async (id: string) => {
    const ok = await showConfirm('Voulez-vous vraiment retirer cette adresse de la liste des destinataires ?', 'Retirer destinataire')
    if (ok) {
      await supprimerDestinataireRapport(companyId, id)
      await loadData()
    }
  }

  // ─── Test direct et réel de la chaîne d'envoi d'emails ──────────────────────
  const handleTestEmail = async () => {
    const target = testEmailInput.trim()
    if (!target || !target.includes('@')) {
      setTestResult({
        success: false,
        message: 'Veuillez saisir une adresse email de test valide.',
        diagnostic: 'Le format de l\'adresse email spécifiée n\'est pas reconnu.'
      })
      return
    }

    setTestingEmail(true)
    setTestResult(null)

    try {
      const res = await testEmailConnection(target)
      setTestResult({
        success: res.success,
        message: res.message,
        diagnostic: res.diagnostic,
        providerLabel: res.providerLabel
      })
      if (showLogs) {
        await loadLogs()
      }
    } finally {
      setTestingEmail(false)
    }
  }

  if (!isAdmin) return null

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-destinataires-report">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-xl w-full border border-slate-200 max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex justify-between items-start pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <Mail className="w-5 h-5" />
              </span>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Destinataires du Rapport de Caisse
                </h3>
                <p className="text-xs text-slate-500">
                  Envoi automatique dès confirmation de clôture &amp; transmission manuelle du PDF
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
            title="Fermer la fenêtre"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Badge & Canal actif */}
        <div className="my-3 space-y-2">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Accès réservé aux <strong>Administrateurs &amp; Dirigeants</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 font-bold px-2.5 py-1 rounded-xl">
              <Clock className="w-3.5 h-3.5" />
              <span>Déclenchement : Clôture</span>
            </div>
          </div>

          {/* Détection du fournisseur serveur */}
          {providerStatus && (
            <div className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between border ${
              providerStatus.provider === 'unconfigured'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            }`}>
              <div className="flex items-center gap-2">
                {providerStatus.isHttps ? (
                  <Globe className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <div>
                  <span className="font-bold">Canal actif : </span>
                  <span>{providerStatus.label}</span>
                </div>
              </div>
              <span className="text-[10px] font-mono opacity-80">{providerStatus.isHttps ? 'HTTPS 443' : 'SMTP'}</span>
            </div>
          )}
        </div>

        {/* Messages */}
        {errorMessage && (
          <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="mb-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Formulaire d'ajout de destinataire */}
        <form onSubmit={handleAdd} className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 mb-3">
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
            Ajouter un destinataire officiel
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="Nom (ex: Directeur, Comptable...)"
              value={nomInput}
              onChange={(e) => setNomInput(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <input
              type="email"
              required
              placeholder="Adresse email (ex: direction@gestio229.com)"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
          <div className="mt-2.5 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-200 transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              {submitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Enregistrement...
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" /> Enregistrer ce destinataire
                </>
              )}
            </button>
          </div>
        </form>

        {/* Liste des Destinataires */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[130px] max-h-[190px]">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1 mb-1">
            <span>Destinataires enregistrés ({destinataires.length})</span>
            {loading && <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />}
          </div>

          {destinataires.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
              <Mail className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
              <p className="font-semibold text-slate-600">Aucun destinataire configuré</p>
              <p className="mt-0.5">Ajoutez ci-dessus les emails officiels recevant le rapport de clôture.</p>
            </div>
          ) : (
            destinataires.map((dest) => (
              <div
                key={dest.id}
                className={`p-2.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                  dest.actif
                    ? 'bg-white border-slate-200 shadow-sm'
                    : 'bg-slate-50 border-slate-200 opacity-60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-900 truncate">
                      {dest.nom || 'Destinataire'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        dest.actif
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {dest.actif ? 'Actif' : 'Désactivé'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono truncate">{dest.email}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActif(dest)}
                    className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer ${
                      dest.actif
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                    }`}
                    title={dest.actif ? 'Désactiver temporairement' : 'Activer les envois'}
                  >
                    {dest.actif ? (
                      <>
                        <XCircle className="w-3.5 h-3.5 text-slate-500" />
                        <span className="hidden sm:inline">Désactiver</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="hidden sm:inline">Activer</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(dest.id)}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer"
                    title="Supprimer ce destinataire"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── Section Outil de Test Email Réel ── */}
        <div className="mt-3 p-3.5 bg-slate-900 text-white rounded-2xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-400">
              <Zap className="w-3.5 h-3.5" />
              Tester l'envoi d'email en direct
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {providerStatus?.isHttps ? 'API HTTPS (443)' : 'SMTP Direct'}
            </span>
          </div>

          <div className="flex gap-2">
            <input
              type="email"
              value={testEmailInput}
              onChange={(e) => setTestEmailInput(e.target.value)}
              placeholder="Adresse email de réception du test..."
              className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              type="button"
              onClick={handleTestEmail}
              disabled={testingEmail}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
              title="Envoyer un email test certifié"
            >
              {testingEmail ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Envoi en cours...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Tester l'envoi
                </>
              )}
            </button>
          </div>

          {/* Résultat réel certifié */}
          {testResult && (
            <div
              className={`p-2.5 rounded-xl text-xs flex flex-col gap-1.5 ${
                testResult.success
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-200 border border-rose-500/30'
              }`}
            >
              <div className="flex items-start gap-2">
                {testResult.success ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 break-words">
                  <p className="font-bold text-[12px]">{testResult.message}</p>
                  {testResult.providerLabel && (
                    <p className="text-[10px] opacity-80 mt-0.5 font-mono">
                      Canal validé : {testResult.providerLabel}
                    </p>
                  )}
                </div>
              </div>

              {testResult.diagnostic && !testResult.success && (
                <div className="p-2 bg-black/40 rounded-lg text-[11px] text-slate-300 border border-white/10 mt-1">
                  <div className="flex items-center gap-1 font-bold text-amber-400 mb-0.5">
                    <Info className="w-3 h-3" />
                    <span>Analyse technique :</span>
                  </div>
                  <p className="leading-relaxed">{testResult.diagnostic}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Section Historique des Envois Récents (Traçabilité) ── */}
        <div className="mt-3 border-t border-slate-100 pt-2.5">
          <button
            type="button"
            onClick={() => {
              if (!showLogs) loadLogs()
              setShowLogs(!showLogs)
            }}
            className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-slate-900 transition py-1"
          >
            <span className="flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-indigo-600" />
              Historique des envois récents &amp; statut
            </span>
            {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showLogs && (
            <div className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-2xl max-h-[140px] overflow-y-auto space-y-1.5 text-xs">
              {loadingLogs ? (
                <div className="text-center py-3 text-slate-400 flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Chargement de l'historique...
                </div>
              ) : deliveryLogs.length === 0 ? (
                <div className="text-center py-3 text-slate-400">
                  Aucun historique d'envoi récent enregistré.
                </div>
              ) : (
                deliveryLogs.map((log) => (
                  <div key={log.id} className="p-2 bg-white rounded-xl border border-slate-100 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          log.status === 'envoye'
                            ? 'bg-emerald-100 text-emerald-800'
                            : log.status === 'en_attente' || log.status === 'demande'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {log.status === 'envoye' ? 'Envoyé' : log.status === 'echec' ? 'Échec' : 'En attente'}
                        </span>
                        <span className="font-mono text-[11px] text-slate-800 truncate">{log.recipient_email}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{new Date(log.created_at).toLocaleString('fr-BJ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        <span>•</span>
                        <span>{log.provider}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 mt-2 flex items-center justify-between">
          <p className="text-[11px] text-slate-400">
            {destinataires.filter((d) => d.actif).length} destinataire(s) actif(s) sur {destinataires.length}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            Fermer
          </button>
        </div>
      </div>
    </ModalPortal>
  )
}
