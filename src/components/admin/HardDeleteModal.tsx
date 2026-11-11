// =============================================================================
// GESTIO 229 ADMIN — Modal de Suppression Définitive (Hard Delete)
// Réservé exclusivement au Super Administrateur / Concepteur officiel
// Double confirmation explicite :
//  - Étape 1 : Alerte irréversibilité et détail exhaustif des données détruites
//  - Étape 2 : Saisie stricte du nom exact de l'entreprise + case à cocher
// =============================================================================

import React, { useState } from 'react'
import { AlertOctagon, Trash2, X, ShieldAlert, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface HardDeleteModalProps {
  company: {
    id: string
    name: string
    subscription_status?: string
    email?: string
    responsible_name?: string
  }
  onClose: () => void
  onConfirm: (confirmName: string, reason: string) => Promise<void>
}

export const HardDeleteModal: React.FC<HardDeleteModalProps> = ({
  company,
  onClose,
  onConfirm,
}) => {
  const [step, setStep] = useState<1 | 2>(1)
  const [confirmName, setConfirmName] = useState('')
  const [reason, setReason] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isNameMatching = confirmName.trim().toLowerCase() === company.name.trim().toLowerCase()
  const canSubmit = step === 2 && isNameMatching && acknowledged && reason.trim().length >= 5

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    setError('')
    try {
      await onConfirm(confirmName.trim(), reason.trim())
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la suppression définitive.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border-2 border-red-700/80 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-white">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-red-800/60 pb-3">
          <div className="flex items-center gap-2.5 text-red-400 font-bold text-lg">
            <div className="w-9 h-9 rounded-xl bg-red-950/80 border border-red-700 flex items-center justify-center text-red-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-red-300 uppercase tracking-wide">
                Suppression Définitive
              </h3>
              <p className="text-[11px] text-red-400/80 font-normal">
                Entreprise suspendue : « {company.name} »
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Indicateur de progression double confirmation */}
        <div className="flex items-center gap-2 text-xs">
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 1 ? 'bg-red-500' : 'bg-slate-800'}`} />
          <div className={`flex-1 h-1.5 rounded-full transition-colors ${step >= 2 ? 'bg-red-600' : 'bg-slate-800'}`} />
          <span className="text-[11px] font-bold text-slate-400">Étape {step}/2</span>
        </div>

        {/* ÉTAPE 1 : Confirmation préliminaire et inventaire des destructions */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="bg-red-950/60 border border-red-800 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center gap-2 text-red-300 font-bold text-xs uppercase tracking-wider">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span>Attention : Opération Destructive & Irréversible</span>
              </div>
              <p className="text-[11px] text-red-200/90 leading-relaxed">
                Cette action va <strong>supprimer définitivement et physiquement</strong> de la base Supabase toutes les données appartenant exclusivement à cette entreprise.
              </p>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs text-slate-300">
              <p className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>Seront définitivement supprimés :</span>
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-400 pl-1">
                <li>Le compte de l'entreprise et ses identifiants.</li>
                <li>Tous les comptes utilisateurs et identifiants dans <strong>Supabase Auth</strong>.</li>
                <li>Tous les secteurs d'activités et configurations associées.</li>
                <li>L'historique complet des abonnements.</li>
                <li>Le catalogue produits, stocks, lots et inventaires.</li>
                <li>L'historique des ventes, factures d'avoirs et commandes.</li>
                <li>Les opérations de caisse, mouvements, clôtures et trésorerie.</li>
                <li>Les dépenses, fournisseurs et fiches clients.</li>
                <li>Tous les fichiers et pièces jointes stockés dans Supabase Storage.</li>
              </ul>
              <div className="bg-emerald-950/30 border border-emerald-800/40 p-2 rounded-lg text-[10px] text-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Cloisonnement garanti : Aucune autre entreprise de la plateforme ne sera affectée.</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 rounded-xl text-xs font-semibold transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition shadow-lg shadow-red-950/40 flex items-center justify-center gap-1.5"
              >
                <span>Continuer vers confirmation</span>
                <span>→</span>
              </button>
            </div>
          </div>
        )}

        {/* ÉTAPE 2 : Seconde confirmation explicite (Nom exact + motif + case à cocher) */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-red-950/40 border border-red-700/80 rounded-xl p-3.5 space-y-2">
              <label className="block text-xs font-bold text-red-300">
                1. Saisissez le nom exact de l'entreprise pour confirmer :
              </label>
              <p className="text-[11px] text-slate-400">
                Veuillez taper exactement : <strong className="text-white font-mono bg-slate-800 px-1.5 py-0.5 rounded">{company.name}</strong>
              </p>
              <input
                type="text"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={company.name}
                autoFocus
                className="w-full bg-slate-950 border border-red-700 rounded-lg p-2.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500 font-bold"
                required
              />
              {confirmName.trim().length > 0 && !isNameMatching && (
                <p className="text-[10px] text-rose-400 font-semibold">
                  ⚠️ Le nom saisi ne correspond pas exactement au nom de l'entreprise.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-300">
                2. Motif justificatif légal de suppression définitive :
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Demande de suppression RGPD formulée par le client, compte de test obsolète, cessation définitive..."
                rows={2}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                required
              />
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer bg-slate-950/60 p-3 rounded-xl border border-red-900/60">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 rounded text-red-600 focus:ring-red-500 bg-slate-900 border-slate-700"
              />
              <span className="text-[11px] text-slate-300 select-none">
                Je confirme avoir vérifié que cette entreprise est <strong>suspendue</strong> et j'assume l'irréversibilité de sa suppression définitive dans Supabase.
              </span>
            </label>

            {error && (
              <div className="bg-red-950 border border-red-800 text-red-200 text-xs p-3 rounded-xl">
                {error}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={loading}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 py-2.5 px-4 rounded-xl text-xs font-semibold transition"
              >
                Retour
              </button>
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-xl shadow-red-950/60 cursor-pointer disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Suppression définitive en cours...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Supprimer définitivement</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
export default HardDeleteModal
