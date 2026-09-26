// =============================================================================
// GESTIO 229 SaaS — ProfileModal : Consultation & Modification des Identifiants
// Permet à tout utilisateur (Admin ou Interne) de modifier son mot de passe
// et son identifiant de connexion.
// =============================================================================

import React, { useState } from 'react'
import { X, Lock, UserCheck, ShieldCheck, Building2, Check, AlertCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose }) => {
  const { user, company, updatePassword, updateUsername } = useAuthStore()
  const { toast } = useUIStore()

  const [activeTab, setActiveTab] = useState<'profile' | 'credentials'>('credentials')

  // États pour identifiant
  const [newUsername, setNewUsername] = useState(user?.username || '')
  const [savingUsername, setSavingUsername] = useState(false)
  const [usernameError, setUsernameError] = useState('')
  const [usernameSuccess, setUsernameSuccess] = useState('')

  // États pour mot de passe
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  if (!isOpen) return null

  const handleUpdateUsername = async (e: React.FormEvent) => {
    e.preventDefault()
    setUsernameError('')
    setUsernameSuccess('')

    if (!newUsername.trim()) {
      setUsernameError("Veuillez saisir un identifiant valide.")
      return
    }

    setSavingUsername(true)
    const res = await updateUsername(newUsername.trim())
    setSavingUsername(false)

    if (res.success) {
      setUsernameSuccess("Identifiant mis à jour avec succès !")
      toast.success("Identifiant modifié avec succès")
    } else {
      setUsernameError(res.error || "Erreur lors de la mise à jour de l'identifiant")
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 4) {
      setPasswordError("Le mot de passe doit comporter au moins 4 caractères.")
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Les deux mots de passe ne correspondent pas.")
      return
    }

    setSavingPassword(true)
    const res = await updatePassword(newPassword)
    setSavingPassword(false)

    if (res.success) {
      setPasswordSuccess("Mot de passe mis à jour avec succès !")
      setNewPassword('')
      setConfirmPassword('')
      toast.success("Mot de passe modifié avec succès")
    } else {
      setPasswordError(res.error || "Erreur lors de la modification du mot de passe")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        {/* En-tête */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold">
              {user?.full_name?.charAt(0)?.toUpperCase() ?? 'U'}
            </div>
            <div>
              <h3 className="font-bold text-base leading-snug">{user?.full_name ?? 'Mon Compte'}</h3>
              <p className="text-xs text-slate-400 capitalize">
                Rôle : <span className="text-emerald-400 font-semibold">{user?.role ?? 'Utilisateur'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-slate-100 bg-slate-50 px-6 pt-3 gap-4">
          <button
            onClick={() => setActiveTab('credentials')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'credentials'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Modifier mes identifiants</span>
          </button>
          <button
            onClick={() => setActiveTab('profile')}
            className={`pb-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Informations & Droits</span>
          </button>
        </div>

        {/* Corps */}
        <div className="p-6 overflow-y-auto space-y-6 max-h-[70vh]">
          {activeTab === 'credentials' ? (
            <>
              {/* Formulaire Changement d'identifiant */}
              <form onSubmit={handleUpdateUsername} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>Modifier mon Identifiant de connexion</span>
                </div>
                <div>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Nouvel identifiant (ex: caissier1)"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Cet identifiant est utilisé pour vous connecter avec votre mot de passe.
                  </p>
                </div>

                {usernameError && (
                  <p className="text-xs text-rose-600 font-semibold">{usernameError}</p>
                )}
                {usernameSuccess && (
                  <p className="text-xs text-emerald-600 font-semibold">{usernameSuccess}</p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={savingUsername || newUsername.trim() === user?.username}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition disabled:opacity-50"
                  >
                    {savingUsername ? 'Enregistrement...' : 'Enregistrer l’identifiant'}
                  </button>
                </div>
              </form>

              {/* Formulaire Changement de mot de passe */}
              <form onSubmit={handleUpdatePassword} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  <span>Modifier mon Mot de passe</span>
                </div>
                <div className="space-y-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nouveau mot de passe"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmer le nouveau mot de passe"
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {passwordError && (
                  <p className="text-xs text-rose-600 font-semibold">{passwordError}</p>
                )}
                {passwordSuccess && (
                  <p className="text-xs text-emerald-600 font-semibold">{passwordSuccess}</p>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={savingPassword || !newPassword}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-sm"
                  >
                    {savingPassword ? 'Modification...' : 'Modifier le mot de passe'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <Building2 className="w-4 h-4 text-emerald-600" />
                  <span>Entreprise rattachée</span>
                </div>
                <p className="text-sm font-bold text-slate-900">{company?.name ?? 'Non définie'}</p>
                <p className="text-xs text-slate-500">IFU : {company?.ifu_number || 'Non renseigné'}</p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/70 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Droits & Permissions actives</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Rôle : <strong>{user?.role}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>Statut : <strong>Actif</strong></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pied de modal */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
