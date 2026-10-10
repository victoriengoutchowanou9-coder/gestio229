// =============================================================================
// GESTIO 229 SaaS — Configuration des Thèmes & Couleurs par Secteur
// Permet d'adapter l'identité visuelle (boutons, badges, onglets, accents)
// selon le secteur d'activité actif (ex: Vert pour Centre d'Impression & Sérigraphie)
// =============================================================================

export interface SecteurThemeClasses {
  primaryButton: string
  primaryButtonOutline: string
  secondaryButton: string
  tabActive: string
  badge: string
  filterActive: string
  icon: string
  textPrimary: string
  textLight: string
  borderAccent: string
  cardHoverBorder: string
  boxAccent: string
  shadow: string
}

export function isImpressionSecteur(slugOrName?: string | null): boolean {
  if (!slugOrName) return false
  const s = slugOrName.toLowerCase().trim()
  return (
    s === 'imprimerie' ||
    s === 'impression' ||
    s === 'centre_impression_serigraphie' ||
    s === 'imprimerie_serigraphie' ||
    s.includes('impression') ||
    s.includes('imprimerie') ||
    s.includes('sérigraphie') ||
    s.includes('serigraphie')
  )
}

export function getSecteurTheme(slugOrName?: string | null): SecteurThemeClasses {
  if (isImpressionSecteur(slugOrName)) {
    return {
      primaryButton: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs',
      primaryButtonOutline: 'border border-emerald-600 text-emerald-700 hover:bg-emerald-50',
      secondaryButton: 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100',
      tabActive: 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-t-xl',
      badge: 'bg-emerald-100 text-emerald-800',
      filterActive: 'bg-emerald-600 text-white shadow-xs',
      icon: 'text-emerald-600',
      textPrimary: 'text-emerald-700 dark:text-emerald-400',
      textLight: 'text-emerald-200',
      borderAccent: 'border-emerald-500',
      cardHoverBorder: 'hover:border-emerald-400',
      boxAccent: 'bg-emerald-900 text-white',
      shadow: 'shadow-emerald-600/20'
    }
  }

  // Thème standard / violet par défaut
  return {
    primaryButton: 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs',
    primaryButtonOutline: 'border border-purple-600 text-purple-700 hover:bg-purple-50',
    secondaryButton: 'bg-purple-50 text-purple-800 hover:bg-purple-100',
    tabActive: 'border-purple-600 text-purple-700 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20 rounded-t-xl',
    badge: 'bg-purple-100 text-purple-800',
    filterActive: 'bg-purple-600 text-white shadow-xs',
    icon: 'text-purple-600',
    textPrimary: 'text-purple-700 dark:text-purple-400',
    textLight: 'text-purple-200',
    borderAccent: 'border-purple-500',
    cardHoverBorder: 'hover:border-purple-400',
    boxAccent: 'bg-purple-900 text-white',
    shadow: 'shadow-purple-600/20'
  }
}
