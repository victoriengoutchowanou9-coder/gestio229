// =============================================================================
// GESTIO 229 SaaS — Header : Barre supérieure compacte & présentable
// Conforme CDC : h-14, thème dynamique Clair / Sombre, 3 actions alignées
// =============================================================================

import React, { useState, useEffect } from 'react'
import { useLocation, Link } from 'react-router-dom'
import { Menu, Bell, ArrowLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useUIStore } from '../../store/uiStore'
import { useTheme } from '../../context/ThemeContext'
import { getActiveSectorMeta } from '../../lib/sectorClient'
import { getCompanySubscriptionInfo } from '../../core/subscription/subscriptionEngine'
import { supabase } from '../../lib/supabase'

// Mapping route → titre de page
const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  'tableau-bord':  { title: 'Tableau de bord', subtitle: 'Aperçu du secteur en direct' },
  'vente-pos':     { title: 'Vente & POS', subtitle: 'Point de vente & encaissement' },
  'stocks':        { title: 'Stocks & Inventaire', subtitle: 'Gestion des dépôts & inventaires' },
  'caisse':        { title: 'Caisse', subtitle: 'Sessions & clôtures de caisse' },
  'tresorerie':    { title: 'Trésorerie', subtitle: 'Liquidités, banques & décaissements' },
  'clients':       { title: 'Clients & Créances', subtitle: 'Gestion des comptes clients' },
  'fournisseurs':  { title: 'Achats & Fournisseurs', subtitle: 'Bons de commande & réceptions' },
  'depenses':      { title: 'Dépenses', subtitle: 'Saisie et suivi des charges' },
  'reporting':     { title: 'Rapports & Analyses', subtitle: 'Indicateurs de performance' },
  'syscohada':     { title: 'Comptabilité SYSCOHADA', subtitle: 'Journal & grand livre' },
  'configuration': { title: 'Configuration', subtitle: 'Paramètres entreprise & fiscalité' },
  'journal-audit': { title: "Journal d'Audit", subtitle: 'Traçabilité des opérations' },
  'abonnement':    { title: 'Mon Abonnement', subtitle: 'Gestion de l\'offre' },
  'utilisateurs':  { title: 'Gestion des Utilisateurs', subtitle: 'Équipe, rôles & permissions' },
}

const Header: React.FC = () => {
  const location = useLocation()
  const company = useAuthStore((s) => s.company)
  const user = useAuthStore((s) => s.user)
  const notifications = useUIStore((s) => s.notifications)
  const toggleMobileSidebar = useUIStore((s) => s.toggleMobileSidebar)
  const { toggle, isClair } = useTheme()
  const sectorMeta = getActiveSectorMeta()

  // Calcul jours d'essai restants
  const [joursRestants, setJoursRestants] = useState<number | null>(null)
  const [isTrial, setIsTrial] = useState<boolean>(true)

  useEffect(() => {
    let isMounted = true
    const fetchSubscription = async () => {
      const companyId = company?.id
      if (companyId) {
        try {
          const { data: sub } = await supabase
            .from('subscriptions')
            .select('fin_essai, status')
            .eq('company_id', companyId)
            .maybeSingle()
          
          if (!isMounted) return

          if (sub?.fin_essai) {
            const diff = Math.ceil((new Date(sub.fin_essai).getTime() - Date.now()) / 86400000)
            setJoursRestants(Math.max(0, diff))
            setIsTrial(sub.status !== 'active')
            return
          }
        } catch (_) {}
      }

      if (isMounted) {
        const info = getCompanySubscriptionInfo(company)
        setJoursRestants(info.daysRemaining ?? 14)
        setIsTrial(!info.isActive)
      }
    }

    fetchSubscription()
    return () => { isMounted = false }
  }, [company?.id, company?.subscription_status, company?.created_at])

  // Extraire le module actif depuis la route
  const parts = location.pathname.split('/')
  const activeRoute = parts[parts.length - 1] || 'tableau-bord'
  const pageInfo = PAGE_TITLES[activeRoute] ?? { title: 'Tableau de bord' }

  // Rendu badge essai avec couleurs d'alerte conformes
  const renderTrialBadge = () => {
    if (!isTrial) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-emerald-500 bg-emerald-500/10 px-2.5 py-1.5 rounded-full border border-emerald-500/20 shrink-0 font-bold">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
          <span>Actif</span>
        </div>
      )
    }

    const j = joursRestants !== null ? joursRestants : 14
    let colorClasses = 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
    let dotClasses = 'bg-emerald-500'

    if (j <= 3) {
      colorClasses = 'text-red-500 bg-red-500/15 border-red-500/30 animate-pulse'
      dotClasses = 'bg-red-500 animate-ping'
    } else if (j <= 7) {
      colorClasses = 'text-orange-500 bg-orange-500/10 border-orange-500/20'
      dotClasses = 'bg-orange-500 animate-pulse'
    }

    return (
      <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border shrink-0 font-bold ${colorClasses}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotClasses}`}></span>
        <span>Essai • J-{j}</span>
      </div>
    )
  }

  return (
    <header 
      style={{
        background: 'var(--bg-header)',
        borderColor: 'var(--border)',
        color: 'var(--text-main)'
      }}
      className="flex items-center justify-between px-3 sm:px-4 py-2 border-b h-14 sticky top-0 z-50 shrink-0 w-full select-none transition-colors duration-200"
    >
      {/* ── GAUCHE : Burger mobile + Retour HUB + Breadcrumb ── */}
      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
        {/* Burger mobile */}
        <button
          onClick={toggleMobileSidebar}
          style={{ color: 'var(--text-muted)' }}
          className="lg:hidden p-1.5 rounded-lg hover:opacity-80 transition shrink-0"
          title="Menu latéral"
        >
          <Menu className="w-4 h-4" />
        </button>

        {/* Bouton Retour au HUB */}
        {(!user || user.role === 'administrateur' || user.role === 'super_admin') && (
          <Link
            to="/hub"
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-full text-xs sm:text-sm font-semibold flex items-center gap-1 transition shadow-sm shrink-0"
            title="Revenir au HUB multi-secteurs de GESTIO 229"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">← Retour au HUB</span>
            <span className="sm:hidden">HUB</span>
          </Link>
        )}

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm truncate" style={{ color: 'var(--text-secondary)' }}>
          <span className="font-semibold truncate max-w-[120px] sm:max-w-[180px]" style={{ color: 'var(--text-main)' }}>
            {company?.name || 'STE GESTIO SARL'}
          </span>
          <span className="opacity-40">›</span>
          <span className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 text-xs font-semibold whitespace-nowrap flex items-center gap-1 shrink-0">
            <span>{sectorMeta.emoji || '🏢'}</span>
            <span className="truncate max-w-[140px] sm:max-w-[200px]">{sectorMeta.name || 'Quincaillerie & Matériaux'}</span>
          </span>
          <span className="opacity-40 hidden md:inline">›</span>
          <span className="font-medium truncate hidden md:inline" style={{ color: 'var(--text-main)' }}>
            {pageInfo.title}
          </span>
        </div>
      </div>

      {/* ── DROITE : LES 3 SUR MÊME LIGNE OBLIGATOIRE (pr-36 sur desktop pour réserver coin bande verte) ── */}
      <div className="flex items-center gap-2 sm:gap-3 flex-nowrap shrink-0 lg:pr-36">
        {/* 1. Theme Switch */}
        <button
          onClick={toggle}
          title={isClair ? "Basculer en mode Sombre" : "Basculer en mode Clair"}
          style={{
            background: isClair ? '#0B1E3C' : 'rgba(255, 255, 255, 0.08)',
            color: isClair ? '#FFFFFF' : '#FDBA74',
            borderColor: 'var(--border)'
          }}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition font-bold shrink-0 shadow-sm"
        >
          <span>{isClair ? '🌙' : '☀️'}</span>
          <span className="hidden xs:inline">{isClair ? 'Sombre' : 'Clair'}</span>
        </button>

        {/* 2. Essai + jours restants */}
        {renderTrialBadge()}

        {/* 3. Cloche */}
        <button
          style={{
            background: isClair ? 'rgba(11, 30, 60, 0.05)' : 'rgba(255, 255, 255, 0.06)',
            borderColor: 'var(--border)',
            color: 'var(--text-main)'
          }}
          className="relative p-2 rounded-full border transition shrink-0"
          title="Notifications"
        >
          <Bell className="w-3.5 h-3.5" />
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
          )}
        </button>
      </div>
    </header>
  )
}

export default Header
