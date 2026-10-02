// =============================================================================
// GESTIO 229 ERP — Générateur d'Architecture Modulaire pour les 19 Secteurs
// =============================================================================

import fs from 'fs';
import path from 'path';

const ALL_19_SECTORS = [
  { slug: 'boutique', name: 'Boutique & Magasin', emoji: '🏪', color: '#3b82f6', category: 'Commerce Détail' },
  { slug: 'poissonnerie', name: 'Poissonnerie & Produits Frais', emoji: '🐟', color: '#06b6d4', category: 'Alimentation & Frais' },
  { slug: 'quincaillerie', name: 'Quincaillerie & Matériaux', emoji: '🔨', color: '#f59e0b', category: 'BTP & Construction' },
  { slug: 'supermarche', name: 'Supermarché & Supérette', emoji: '🛒', color: '#10b981', category: 'Grande Distribution' },
  { slug: 'pharmacie', name: 'Pharmacie & Dépôt Médical', emoji: '💊', color: '#8b5cf6', category: 'Santé' },
  { slug: 'restaurant', name: 'Bar, Restaurant, Maquis & Fast Food', emoji: '🍽️', color: '#ef4444', category: 'Restauration' },
  { slug: 'brasserie', name: 'Brasserie & Dépôt de Boissons', emoji: '🍾', color: '#eab308', category: 'Boissons' },
  { slug: 'microfinance', name: 'Microfinance & Tontine', emoji: '🏦', color: '#14b8a6', category: 'Services Financiers' },
  { slug: 'imprimerie', name: 'Imprimerie & Sérigraphie', emoji: '🖨️', color: '#ec4899', category: 'Industrie Graphique' },
  { slug: 'boulangerie', name: 'Boulangerie & Pâtisserie', emoji: '🥐', color: '#d97706', category: 'Artisanat Alimentaire' },
  { slug: 'cosmetiques', name: 'Cosmétiques & Salons de Beauté', emoji: '✨', color: '#f43f5e', category: 'Beauté & Bien-être' },
  { slug: 'mercerie', name: 'Mercerie & Couture', emoji: '✂️', color: '#db2777', category: 'Mode & Couture' },
  { slug: 'garage', name: 'Atelier, Garage & Mécanique', emoji: '🚗', color: '#64748b', category: 'Automobile' },
  { slug: 'hotel', name: 'Hôtel, Résidence & Auberge', emoji: '🏨', color: '#6366f1', category: 'Hôtellerie' },
  { slug: 'ecole', name: 'École & Centre de Formation', emoji: '🎓', color: '#84cc16', category: 'Éducation' },
  { slug: 'immobilier', name: 'Gestion Locative & Immobilier', emoji: '🏠', color: '#a855f7', category: 'Immobilier' },
  { slug: 'agrobusiness', name: 'Agro-Business & Élevage', emoji: '🌱', color: '#22c55e', category: 'Agriculture & Élevage' },
  { slug: 'station-service', name: 'Station-Service & Hydrocarbures', emoji: '⛽', color: '#f97316', category: 'Énergie & Carburants' },
  { slug: 'transport', name: 'Transport & Logistique', emoji: '🚚', color: '#2563eb', category: 'Transport & Logistique' }
];

const MODULE_PAGES = [
  { folder: 'Dashboard', exportName: 'Dashboard', source: '../../../../pages/dashboard/DashboardPage' },
  { folder: 'Vente', exportName: 'POSPage', source: '../../../../pages/dashboard/vente-pos/POSPage' },
  { folder: 'Stocks', exportName: 'StocksPage', source: '../../../../pages/dashboard/stocks/StocksPage' },
  { folder: 'Caisse', exportName: 'CaissePage', source: '../../../../pages/dashboard/caisse/CaissePage' },
  { folder: 'Tresorerie', exportName: 'TresoreriePage', source: '../../../../pages/dashboard/tresorerie/TresoreriePage' },
  { folder: 'Clients', exportName: 'ClientsPage', source: '../../../../pages/dashboard/clients/ClientsPage' },
  { folder: 'Fournisseurs', exportName: 'FournisseursPage', source: '../../../../pages/dashboard/fournisseurs/FournisseursPage' },
  { folder: 'Depenses', exportName: 'DepensesPage', source: '../../../../pages/dashboard/depenses/DepensesPage' },
  { folder: 'Reporting', exportName: 'ReportingPage', source: '../../../../pages/dashboard/reporting/ReportingPage' }
];

const BASE_DIR = path.resolve('src/modules/sectors');

for (const sec of ALL_19_SECTORS) {
  const secDir = path.join(BASE_DIR, sec.slug);
  if (!fs.existsSync(secDir)) {
    fs.mkdirSync(secDir, { recursive: true });
  }

  // Create subfolders for each module
  for (const mod of MODULE_PAGES) {
    const modDir = path.join(secDir, mod.folder);
    if (!fs.existsSync(modDir)) {
      fs.mkdirSync(modDir, { recursive: true });
    }

    const indexFile = path.join(modDir, 'index.tsx');
    if (!fs.existsSync(indexFile)) {
      const fileContent = `// =============================================================================
// GESTIO 229 SaaS — Sous-Logiciel: ${sec.name} (${sec.slug})
// Module Métier Isolé: ${mod.folder}
// =============================================================================
// Silo étanche : ce code source est dédié au secteur ${sec.slug}.
// Il peut évoluer indépendamment de tous les autres secteurs.
// Clé d'isolation obligatoire : (company_id + sector_slug='${sec.slug}')
// =============================================================================

export { default, ${mod.exportName} } from '${mod.source}'
`;
      fs.writeFileSync(indexFile, fileContent, 'utf-8');
    }
  }

  // Create sector index manifest
  const secIndexFile = path.join(secDir, 'index.ts');
  if (!fs.existsSync(secIndexFile)) {
    const manifestContent = `// =============================================================================
// GESTIO 229 SaaS — Sous-Logiciel Dédié: ${sec.name}
// =============================================================================

export const SECTOR_MANIFEST = {
  slug: '${sec.slug}',
  name: '${sec.name}',
  emoji: '${sec.emoji}',
  color: '${sec.color}',
  category: '${sec.category}',
  modules: [
    'Dashboard',
    'Vente',
    'Stocks',
    'Caisse',
    'Tresorerie',
    'Clients',
    'Fournisseurs',
    'Depenses',
    'Reporting'
  ]
}

export { default as Dashboard } from './Dashboard'
export { default as Vente } from './Vente'
export { default as Stocks } from './Stocks'
export { default as Caisse } from './Caisse'
export { default as Tresorerie } from './Tresorerie'
export { default as Clients } from './Clients'
export { default as Fournisseurs } from './Fournisseurs'
export { default as Depenses } from './Depenses'
export { default as Reporting } from './Reporting'

export default SECTOR_MANIFEST
`;
    fs.writeFileSync(secIndexFile, manifestContent, 'utf-8');
  }
}

console.log(`[OK] 19 sous-logiciels générés avec succès dans src/modules/sectors/`);
