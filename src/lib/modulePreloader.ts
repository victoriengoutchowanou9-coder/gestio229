// =============================================================================
// GESTIO 229 SaaS — Preloader : Préchargement intelligent des modules en idle
// =============================================================================
// Utilise requestIdleCallback (ou fallback setTimeout) pour charger les chunks JS
// des modules les plus fréquents en arrière-plan sans bloquer le fil d'exécution.
// =============================================================================

export function preloadCommonModules(): void {
  const idleCallback =
    typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 1000)

  idleCallback(() => {
    // 1. Précharger POS / Vente
    import('../pages/dashboard/vente-pos/POSPage').catch(() => {})
    
    // 2. Précharger Caisse
    import('../pages/dashboard/caisse/CaissePage').catch(() => {})
    
    // 3. Précharger Stocks
    import('../pages/dashboard/stocks/StocksPage').catch(() => {})

    // 4. Précharger Clients & Dashboard
    setTimeout(() => {
      import('../pages/dashboard/clients/ClientsPage').catch(() => {})
      import('../pages/dashboard/DashboardPage').catch(() => {})
      import('../pages/dashboard/tresorerie/TresoreriePage').catch(() => {})
      import('../pages/dashboard/depenses/DepensesPage').catch(() => {})
    }, 1500)
  })
}
