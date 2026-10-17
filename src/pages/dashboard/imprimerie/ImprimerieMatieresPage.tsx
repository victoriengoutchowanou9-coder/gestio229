// =============================================================================
// GESTIO 229 SaaS — Sous-Logiciel : Impression & Sérigraphie
// Module Métier : Matières Premières & Consommables
// Reproduction intégrale et conforme du module Stock de la Quincaillerie
// =============================================================================
// RÈGLE ABSOLUE : Fonctionnement IDENTIQUE au module Stock de la Quincaillerie :
// - Double Stock (Magasin/Réserve UCD & Consommation/Atelier UV)
// - Moteur de conversion exact (ex: 1 Rouleau = 50 Mètres)
// - Formulaire complet de création (NewProductModal avec TVA, AIB, Décomposition HT, Lots)
// - Transferts bi-directionnels (unitaire et en masse)
// - Inventaire physique avec calcul automatique des écarts et historique inventory_sessions
// - Fiche journalière de stock avec filtres temporels
// - Fiche de stock imprimable & valorisation complète achat/vente
// - Isolation stricte (company_id + sector_slug = 'imprimerie')
// =============================================================================

import React from 'react'
import { StocksPage } from '../stocks/StocksPage'

export const ImprimerieMatieresPage: React.FC = () => {
  return (
    <StocksPage
      isMatieresModule={true}
      customTitle="Matières Premières & Consommables"
      customSubtitle="Double Stock (Magasin UCD & Consommation Atelier UV), Transferts, Inventaires avec écarts et Valorisation Achat/Vente"
    />
  )
}

export default ImprimerieMatieresPage
