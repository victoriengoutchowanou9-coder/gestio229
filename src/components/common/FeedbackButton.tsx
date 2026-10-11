// =============================================================================
// GESTIO 229 — Bouton "Avis & Suggestions" (interface client normale)
// Ce bouton est visible par toutes les entreprises connectées.
// L'association company_id/sector_slug est automatique.
// =============================================================================

import React, { useState } from 'react'
import { useAuthStore } from '../../store/authStore'
import { MessageSquare, X, Send, CheckCircle2 } from 'lucide-react'

const FEEDBACK_TYPES = [
  { value: 'avis', label: '⭐ Avis' },
  { value: 'suggestion', label: '💡 Suggestion' },
  { value: 'bug', label: '🐛 Problème / Bug' },
  { value: 'demande_fonctionnalite', label: '🚀 Demande de fonctionnalité' },
  { value: 'difficulte', label: '❓ Difficulté d\'utilisation' },
]

interface FeedbackButtonProps {
  sectorSlug?: string
}

const FeedbackButton: React.FC<FeedbackButtonProps> = ({ sectorSlug }) => {
  const { company, user } = useAuthStore()
  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState('suggestion')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  // Ne pas afficher si pas de session entreprise
  if (!company?.id) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!subject.trim() || !message.trim()) {
      setError('Veuillez remplir le sujet et le message.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: company.id,
          company_name: company.name,
          user_id: user?.id || null,
          user_name: user?.full_name || user?.email || '',
          user_email: user?.email || '',
          sector_slug: sectorSlug || company.active_sector || '',
          type,
          subject: subject.trim(),
          message: message.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess(true)
        setTimeout(() => {
          setIsOpen(false)
          setSuccess(false)
          setType('suggestion')
          setSubject('')
          setMessage('')
        }, 2500)
      } else {
        setError(data.error || 'Erreur lors de l\'envoi.')
      }
    } catch (e: any) {
      setError('Erreur réseau. Vérifiez votre connexion.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Bouton flottant ou inline */}
      <button
        onClick={() => { setIsOpen(true); setSuccess(false); setError('') }}
        className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1.5 rounded-xl text-sm font-medium transition border border-slate-600"
        title="Donner votre avis ou suggestion"
      >
        <MessageSquare className="w-4 h-4" />
        <span className="hidden sm:inline">Avis & Suggestions</span>
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setIsOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400" />
                <h3 className="text-white font-bold text-sm">Avis & Suggestions</h3>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contenu */}
            <div className="p-5">
              {success ? (
                <div className="text-center py-6">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
                  <p className="text-white font-bold">Merci pour votre retour !</p>
                  <p className="text-slate-400 text-sm mt-1">Votre message a bien été envoyé.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="bg-red-900/30 border border-red-700 rounded-xl px-3 py-2 text-red-300 text-xs">{error}</div>
                  )}

                  {/* Informations automatiques (non visibles par l'utilisateur) */}
                  {(company.name || sectorSlug) && (
                    <div className="bg-slate-800/60 rounded-xl px-3 py-2 text-xs text-slate-400 flex flex-wrap gap-2">
                      {company.name && <span>🏢 {company.name}</span>}
                      {sectorSlug && <span>📂 {sectorSlug.replace(/^sec-/, '')}</span>}
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">Type</label>
                    <div className="grid grid-cols-1 gap-1">
                      {FEEDBACK_TYPES.map(({ value, label }) => (
                        <label key={value} className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer border transition text-sm ${type === value ? 'bg-emerald-900/30 border-emerald-600 text-emerald-300' : 'border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                          <input type="radio" name="type" value={value} checked={type === value}
                            onChange={() => setType(value)} className="sr-only" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">Sujet</label>
                    <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required
                      placeholder="Résumé en quelques mots" maxLength={255}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-xs font-semibold mb-1">Message</label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} required
                      placeholder="Décrivez votre avis, problème ou suggestion en détail..." rows={4} maxLength={5000}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                  </div>

                  <button type="submit" disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white font-bold py-2.5 rounded-xl text-sm transition">
                    {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi...</> : <><Send className="w-4 h-4" /> Envoyer</>}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default FeedbackButton
