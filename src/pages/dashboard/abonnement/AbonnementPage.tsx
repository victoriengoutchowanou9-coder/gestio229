// =============================================================================
// GESTIO 229 SaaS — Mon Abonnement & Renouvellement
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import { CreditCard, CheckCircle, ShieldCheck, Clock, RefreshCw, Zap, ArrowRight } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import clsx from 'clsx'

const fmt = (n: number) => new Intl.NumberFormat('fr-BJ').format(Math.round(n)) + ' FCFA'

const PLANS = [
  {
    slug: 'solo',
    name: 'Plan Solo',
    price: 5000,
    period: '/ mois',
    features: ['1 Secteur d\'activité', 'Jusqu\'à 3 utilisateurs', 'Support standard', 'Module Caisse & Vente POS']
  },
  {
    slug: 'duo',
    name: 'Plan Duo Pro',
    price: 9000,
    period: '/ mois',
    popular: true,
    features: ['2 Secteurs d\'activité', 'Jusqu\'à 10 utilisateurs', 'Facturation certifiée e-MECeF', 'Comptabilité SYSCOHADA']
  },
  {
    slug: 'multiservices',
    name: 'Plan Multi-Activités',
    price: 15000,
    period: '/ mois',
    features: ['Tous les secteurs débloqués', 'Utilisateurs illimités', 'Hub consolidé temps-réel', 'Support prioritaire VIP']
  }
]

const AbonnementPage: React.FC = () => {
  const { company, refreshTenantContext } = useAuthStore()
  const { toast } = useUIStore()

  const [renewing, setRenewing] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState('duo')

  const status = company?.subscription_status || 'trial'
  const isTrial = status === 'trial'
  const isActive = status === 'active'

  const trialEnds = company?.trial_ends_at
    ? new Date(company.trial_ends_at).toLocaleDateString('fr-BJ')
    : 'Dans 30 jours'

  const handleRenew = async (planSlug: string) => {
    if (!company?.id) return
    setRenewing(true)
    try {
      // Simuler l'initiation FedaPay / MoMo et activer le statut
      const { error } = await supabase
        .from('companies')
        .update({
          subscription_status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', company.id)

      if (error) throw error

      toast.success('Abonnement renouvelé avec succès !', 'Votre licence GESTIO 229 est active.')
      await refreshTenantContext()
    } catch (err: any) {
      toast.error('Erreur de paiement', err.message)
    } finally {
      setRenewing(false)
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Mon Abonnement SaaS</h1>
        <p className="text-slate-500 text-sm mt-1">Gestion de licence, statut du compte et options de renouvellement</p>
      </div>

      {/* Bannière de Statut */}
      <div className={clsx(
        'rounded-3xl p-6 border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-6',
        isActive ? 'bg-emerald-50/70 border-emerald-200' : 'bg-amber-50/70 border-amber-200'
      )}>
        <div className="flex items-start gap-4">
          <div className={clsx(
            'w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0',
            isActive ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
          )}>
            {isActive ? <ShieldCheck className="w-6 h-6" /> : <Clock className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-800">
                {isActive ? 'Licence Entreprise Active' : 'Période d\'Essai Gratuit'}
              </h3>
              <span className={clsx(
                'text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider',
                isActive ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'
              )}>
                {status}
              </span>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              {isActive
                ? 'Votre accès à tous les modules opérationnels et la certification DGI est totalement opérationnel.'
                : `Votre période d'évaluation gratuite prend fin le ${trialEnds}.`}
            </p>
          </div>
        </div>

        <button
          onClick={() => handleRenew(selectedPlan)}
          disabled={renewing}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 shadow-md shadow-emerald-200 transition whitespace-nowrap"
        >
          <Zap className="w-4 h-4" />
          <span>{renewing ? 'Traitement...' : 'Renouveler maintenant'}</span>
        </button>
      </div>

      {/* Grille des offres */}
      <div>
        <h3 className="text-lg font-bold text-slate-800 mb-4">Formules d'Abonnement Disponibles (Bénin & UEMOA)</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <div
              key={plan.slug}
              className={clsx(
                'bg-white rounded-3xl border p-6 flex flex-col justify-between relative transition hover:shadow-lg',
                plan.popular ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'
              )}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                  Recommandé
                </span>
              )}

              <div>
                <h4 className="text-lg font-bold text-slate-800">{plan.name}</h4>
                <div className="flex items-baseline gap-1 my-4">
                  <span className="text-3xl font-black text-slate-800">{fmt(plan.price)}</span>
                  <span className="text-xs text-slate-400 font-medium">{plan.period}</span>
                </div>

                <ul className="space-y-3 mb-6">
                  {plan.features.map((feat, idx) => (
                    <li key={idx} className="flex items-center gap-2.5 text-xs text-slate-600">
                      <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => {
                  setSelectedPlan(plan.slug)
                  handleRenew(plan.slug)
                }}
                disabled={renewing}
                className={clsx(
                  'w-full py-3 rounded-xl font-bold text-sm transition flex items-center justify-center gap-2',
                  plan.popular
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                )}
              >
                <span>Choisir cette formule</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AbonnementPage
