// =============================================================================
// GESTIO 229 SaaS — Configuration Destinataires Rapport de Caisse (Admin)
// Gestion des emails et outil de test Gmail SMTP en direct
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Mail,
  UserPlus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  RefreshCw,
  X,
  Send,
  AlertCircle,
  Check,
  Zap
} from 'lucide-react'
import { ModalPortal } from '../modals/ModalPortal'
import {
  DestinataireRapport,
  getDestinatairesRapport,
  ajouterDestinataireRapport,
  modifierDestinataireRapport,
  supprimerDestinataireRapport
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

  // États pour le Test Gmail SMTP
  const [testEmailInput, setTestEmailInput] = useState('victoriengoutchowanou9@gmail.com')
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const loadData = async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const list = await getDestinatairesRapport(companyId)
      setDestinataires(list)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && companyId) {
      loadData()
      setErrorMessage(null)
      setSuccessMessage(null)
      setTestResult(null)
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
    if (confirm('Voulez-vous vraiment retirer cette adresse de la liste des destinataires ?')) {
      await supprimerDestinataireRapport(companyId, id)
      await loadData()
    }
  }

  // ─── Test direct de la configuration Gmail SMTP ────────────────────────────
  const handleTestSmtp = async () => {
    const target = testEmailInput.trim()
    if (!target || !target.includes('@')) {
      setTestResult({ success: false, message: 'Veuillez saisir une adresse email de test valide.' })
      return
    }

    setTestingSmtp(true)
    setTestResult(null)

    try {
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testEmail: target })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        setTestResult({
          success: true,
          message: data.message || `Email de test envoyé avec succès à ${target} !`
        })
      } else {
        setTestResult({
          success: false,
          message: data.error || 'Échec du test de connexion Gmail SMTP.'
        })
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Erreur réseau lors de l\'appel de test SMTP.'
      })
    } finally {
      setTestingSmtp(false)
    }
  }

  if (!isAdmin) return null

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-destinataires-report">
      <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-xl w-full border border-slate-200 max-h-[92vh] flex flex-col">
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
                  Envoi immédiat dès la fermeture de la caisse et transmission manuelle du PDF (Gmail SMTP)
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Badge & Info */}
        <div className="my-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Accès sécurisé réservé aux <strong>Administrateurs & Dirigeants</strong></span>
          </div>
          <div className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 font-bold px-2.5 py-1 rounded-xl">
            <Clock className="w-3.5 h-3.5" />
            <span>Cron : 23h00</span>
          </div>
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
            <CheckCircle2 className="w-4 h-4 shrink-0" />
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
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[140px] max-h-[220px]">
          <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1 mb-1">
            <span>Destinataires enregistrés ({destinataires.length})</span>
            {loading && <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />}
          </div>

          {destinataires.length === 0 ? (
            <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
              <Mail className="w-7 h-7 mx-auto mb-1.5 opacity-40" />
              <p className="font-semibold text-slate-600">Aucun destinataire configuré</p>
              <p className="mt-0.5">Ajoutez ci-dessus les emails qui recevront le rapport quotidien.</p>
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
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
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

        {/* ── Section Outil de Test Gmail SMTP ── */}
        <div className="mt-3 p-3.5 bg-slate-900 text-white rounded-2xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold flex items-center gap-1.5 text-emerald-400">
              <Zap className="w-3.5 h-3.5" />
              Tester la configuration Gmail SMTP
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              smtp.gmail.com:587
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
              onClick={handleTestSmtp}
              disabled={testingSmtp}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer shrink-0"
              title="Envoyer un email test pour valider les paramètres SMTP Vercel"
            >
              {testingSmtp ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Test en cours...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Tester l'envoi
                </>
              )}
            </button>
          </div>

          {testResult && (
            <div
              className={`p-2 rounded-xl text-xs flex items-start gap-1.5 ${
                testResult.success
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}
            >
              {testResult.success ? (
                <Check className="w-4 h-4 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 break-words">
                <span>{testResult.message}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 mt-3 flex items-center justify-between">
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
