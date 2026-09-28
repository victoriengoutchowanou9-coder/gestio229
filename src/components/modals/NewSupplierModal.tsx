// =============================================================================
// GESTIO 229 SaaS — Modale Nouveau Fournisseur (Structure Réelle Supabase)
// Enregistrement complet : Raison sociale, IFU, Téléphone, Adresse, Contact, etc.
// Conforme au schéma de la table "suppliers" de Supabase
// =============================================================================

import React, { useState, useEffect } from 'react'
import {
  Truck, X, Building2, Phone, Mail, MapPin, User,
  FileText, Calendar, DollarSign, Check, AlertCircle, Loader2
} from 'lucide-react'
import ModalPortal from './ModalPortal'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'

interface NewSupplierModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (supplier: any) => void
  nextSupplierIndex?: number
}

const BENIN_CITIES = [
  'Cotonou',
  'Porto-Novo',
  'Abomey-Calavi',
  'Parakou',
  'Bohicon',
  'Ouidah',
  'Natitingou',
  'Djougou',
  'Lokossa',
  'Kandi',
  'Malanville',
  'Allada',
  'Pobè',
  'Autre'
]

export const NewSupplierModal: React.FC<NewSupplierModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  nextSupplierIndex = 1
}) => {
  const { company } = useAuthStore()
  const { toast } = useUIStore()

  const defaultCode = `FOURN-${String(nextSupplierIndex).padStart(3, '0')}`

  const [form, setForm] = useState({
    code: defaultCode,
    company_name: '',
    contact_person: '',
    ifu_number: '',
    phone: '',
    email: '',
    address: '',
    city: 'Cotonou',
    country: 'Bénin',
    payment_terms_days: 30,
    current_payable: 0,
    is_active: true
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Réinitialisation du code automatique à l'ouverture
  useEffect(() => {
    if (isOpen) {
      setForm({
        code: `FOURN-${String(nextSupplierIndex).padStart(3, '0')}`,
        company_name: '',
        contact_person: '',
        ifu_number: '',
        phone: '',
        email: '',
        address: '',
        city: 'Cotonou',
        country: 'Bénin',
        payment_terms_days: 30,
        current_payable: 0,
        is_active: true
      })
      setErrors({})
      setIsSubmitting(false)
    }
  }, [isOpen, nextSupplierIndex])

  const validate = () => {
    const errs: { [key: string]: string } = {}
    if (!form.company_name.trim()) {
      errs.company_name = 'La raison sociale ou nom du fournisseur est obligatoire'
    }
    if (!form.phone.trim()) {
      errs.phone = 'Le numéro de téléphone est obligatoire'
    }
    if (form.ifu_number.trim() && !/^\d{10,14}$/.test(form.ifu_number.trim())) {
      errs.ifu_number = "L'IFU doit contenir entre 10 et 14 chiffres (13 au Bénin)"
    }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      errs.email = "L'adresse email n'est pas valide"
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    if (!company?.id) {
      toast.error('Erreur', 'Aucune entreprise active détectée.')
      return
    }

    setIsSubmitting(true)
    try {
      // Préparation du payload avec la structure exacte de la table "suppliers" dans Supabase
      const payload = {
        company_id: company.id,
        code: form.code.trim().toUpperCase() || defaultCode,
        company_name: form.company_name.trim(),
        contact_person: form.contact_person.trim() || null,
        ifu_number: form.ifu_number.trim() || null,
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        city: form.city.trim() || 'Cotonou',
        country: form.country.trim() || 'Bénin',
        payment_terms_days: Math.max(0, parseInt(String(form.payment_terms_days), 10) || 0),
        current_payable: Math.max(0, parseFloat(String(form.current_payable)) || 0),
        is_active: form.is_active
      }

      const { data, error } = await supabase
        .from('suppliers')
        .insert(payload)
        .select()
        .single()

      if (error) throw error

      toast.success(
        'Fournisseur Enregistré !',
        `Le fournisseur "${data.company_name}" (${data.code}) a été enregistré avec succès.`
      )

      if (onSuccess) {
        onSuccess(data)
      }
      onClose()
    } catch (err: any) {
      console.error('Erreur insertion fournisseur Supabase :', err)
      toast.error(
        'Erreur enregistrement fournisseur',
        err.message || 'Impossible d’enregistrer le fournisseur dans Supabase.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalPortal isOpen={isOpen} onClose={onClose} id="modal-portal-new-supplier" zIndex={60}>
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150 text-slate-800 dark:text-slate-100">
        {/* En-tête */}
        <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-5 flex items-center justify-between border-b border-indigo-700/50">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-white shadow-inner">
              <Truck className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base text-white tracking-tight">
                  Nouveau Fournisseur
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-400/20 text-indigo-200 border border-indigo-300/30">
                  Supabase
                </span>
              </div>
              <p className="text-xs text-indigo-200/80">
                Enregistrement dans le répertoire Achats & Fournisseurs de Gestio 229
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-indigo-200 hover:text-white hover:bg-white/10 rounded-xl p-1.5 transition"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Section 1 : Identification Entreprise / Fournisseur */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
              <Building2 className="w-4 h-4" />
              <span>Identification de l'Établissement</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Raison Sociale / Nom du Fournisseur <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: CIMBÉNIN SA, SOBEBRA, ETS ALHOUDA..."
                  value={form.company_name}
                  onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-xl border text-xs transition bg-white dark:bg-slate-900 ${
                    errors.company_name
                      ? 'border-rose-400 focus:ring-rose-400'
                      : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-500 focus:border-indigo-500'
                  }`}
                />
                {errors.company_name && (
                  <p className="text-rose-500 text-[10px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.company_name}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Code Référence
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-mono font-bold bg-white dark:bg-slate-900 uppercase focus:ring-indigo-500"
                  placeholder="FOURN-001"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Numéro IFU (Bénin / UEMOA)
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    maxLength={14}
                    placeholder="Ex: 3201888999000 (13 chiffres)"
                    value={form.ifu_number}
                    onChange={(e) => setForm({ ...form, ifu_number: e.target.value.replace(/\s+/g, '') })}
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-mono bg-white dark:bg-slate-900 ${
                      errors.ifu_number
                        ? 'border-rose-400 focus:ring-rose-400'
                        : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-500'
                    }`}
                  />
                </div>
                {errors.ifu_number ? (
                  <p className="text-rose-500 text-[10px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.ifu_number}
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 mt-1">Identifiant Fiscal Unique pour la conformité DGI</p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Personne à contacter (Interlocuteur)
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    placeholder="Ex: M. SOSSOU Bernard (Dir. Commercial)"
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-900 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 : Coordonnées Directes */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
              <Phone className="w-4 h-4" />
              <span>Contact & Communication</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Téléphone Principal <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    placeholder="+229 97 00 00 00 / 21 30 00 00"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs font-mono bg-white dark:bg-slate-900 ${
                      errors.phone
                        ? 'border-rose-400 focus:ring-rose-400'
                        : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-500'
                    }`}
                  />
                </div>
                {errors.phone && (
                  <p className="text-rose-500 text-[10px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.phone}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Adresse E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    placeholder="contact@fournisseur.bj"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs bg-white dark:bg-slate-900 ${
                      errors.email
                        ? 'border-rose-400 focus:ring-rose-400'
                        : 'border-slate-300 dark:border-slate-600 focus:ring-indigo-500'
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="text-rose-500 text-[10px] mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {errors.email}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Section 3 : Localisation Géographique */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
              <MapPin className="w-4 h-4" />
              <span>Localisation Géographique</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Ville
                </label>
                <select
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-900 focus:ring-indigo-500"
                >
                  {BENIN_CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Pays
                </label>
                <input
                  type="text"
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-900 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Statut du Compte
                </label>
                <select
                  value={form.is_active ? 'true' : 'false'}
                  onChange={(e) => setForm({ ...form, is_active: e.target.value === 'true' })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-900 focus:ring-indigo-500"
                >
                  <option value="true">Actif (Opérationnel)</option>
                  <option value="false">Inactif (Suspendu)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Adresse Complète / Siège Social
              </label>
              <textarea
                rows={2}
                placeholder="Ex: Zone Industrielle d'Akpakpa, Rue 412, Cotonou..."
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs bg-white dark:bg-slate-900 focus:ring-indigo-500 resize-none"
              />
            </div>
          </div>

          {/* Section 4 : Modalités Financières & Conditions Commerciales */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-wider text-[11px]">
              <DollarSign className="w-4 h-4" />
              <span>Modalités Commerciales & Dettes</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Délai de Paiement Accordé (Jours)
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={form.payment_terms_days}
                    onChange={(e) => setForm({ ...form, payment_terms_days: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-mono bg-white dark:bg-slate-900 focus:ring-indigo-500"
                    placeholder="30"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Ex: 0 (comptant), 15, 30 ou 60 jours</p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-200 mb-1">
                  Solde Initial Dû / Dette Antérieure (FCFA)
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={form.current_payable}
                    onChange={(e) => setForm({ ...form, current_payable: Math.max(0, parseFloat(e.target.value) || 0) })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-mono font-bold text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-900 focus:ring-indigo-500"
                    placeholder="0"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Dette existante à reporter dans le suivi des créances</p>
              </div>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-2 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enregistrement Supabase...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Enregistrer le Fournisseur
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

export default NewSupplierModal
