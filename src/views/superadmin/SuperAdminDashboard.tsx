import React, { useState } from 'react';
import {
  Building2,
  CreditCard,
  Plus,
  Search,
  Check,
  X,
  PlusCircle,
  TrendingUp,
  Settings,
  Phone,
  Mail,
  Shield,
  Layers,
  Calendar,
  Filter
} from 'lucide-react';

export interface SaaSCompany {
  id: string;
  name: string;
  ifu: string;
  responsible: string;
  phone: string;
  email: string;
  plan: 'trial' | 'solo' | 'duo' | 'multiservices' | 'enterprise';
  status: 'trial' | 'active' | 'grace_period' | 'readonly' | 'suspended';
  activeSectors: string[];
  mrr: number;
  trialEndsAt?: string;
  createdAt: string;
}

export interface DynamicSector {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  commonModules: string[];
  specificModules: string[];
  isActive: boolean;
}

export const SuperAdminDashboard: React.FC = () => {
  // Onglet actif dans le panel Super-Admin
  const [activeTab, setActiveTab] = useState<'tenants' | 'subscriptions' | 'sectors'>('tenants');
  const [searchTerm, setSearchTerm] = useState('');

  // 1. ENTREPRISES SAAS RÉFÉRENCÉES
  const [companies, setCompanies] = useState<SaaSCompany[]>([
    {
      id: 'c1',
      name: 'Quincaillerie Centrale Dantokpa SARL',
      ifu: '3202612345678',
      responsible: 'Marc Agossou',
      phone: '+229 01 97 12 34 56',
      email: 'contact@quincaillerie-dantokpa.bj',
      plan: 'solo',
      status: 'active',
      activeSectors: ['quincaillerie'],
      mrr: 15000,
      createdAt: '2026-08-10'
    },
    {
      id: 'c2',
      name: 'Pharmacie de la Paix & Bien-Être',
      ifu: '3202698765432',
      responsible: 'Dr. Estelle Dossou',
      phone: '+229 01 95 44 33 22',
      email: 'officine@pharmaciedelapaix.bj',
      plan: 'solo',
      status: 'trial',
      activeSectors: ['pharmacie'],
      mrr: 0,
      trialEndsAt: '2026-10-05',
      createdAt: '2026-09-05'
    },
    {
      id: 'c3',
      name: 'Complexe Multiservices Le Carrefour',
      ifu: '3202655555555',
      responsible: 'Jean-Paul Houndé',
      phone: '+229 01 96 88 77 66',
      email: 'direction@groupe-carrefour.bj',
      plan: 'multiservices',
      status: 'active',
      activeSectors: ['quincaillerie', 'station', 'location'],
      mrr: 45000,
      createdAt: '2026-07-15'
    },
    {
      id: 'c4',
      name: 'Imprimerie Moderne du Littoral',
      ifu: '3202633333333',
      responsible: 'Alain Tossou',
      phone: '+229 01 62 11 22 33',
      email: 'littoral.print@gmail.com',
      plan: 'solo',
      status: 'suspended',
      activeSectors: ['impression'],
      mrr: 15000,
      createdAt: '2026-06-01'
    }
  ]);

  // 2. CATALOGUE DYNAMIQUE DES SECTEURS
  const [sectors, setSectors] = useState<DynamicSector[]>([
    {
      id: 'sec-quincaillerie',
      slug: 'quincaillerie',
      name: 'Quincaillerie & Matériaux',
      description: 'Ventes en gros et détail, ciment, fer, gestion double stock magasin/comptoir',
      icon: 'Store',
      color: '#3B82F6',
      commonModules: ['ventes', 'stock', 'finances', 'clients', 'fournisseurs', 'depenses', 'rapports', 'audit'],
      specificModules: ['tarifs_gros_detail', 'devis_btp'],
      isActive: true
    },
    {
      id: 'sec-pharmacie',
      slug: 'pharmacie',
      name: 'Pharmacie & Parapharmacie',
      description: 'Médicaments, suivi DLUO péremption, alertes de lot et ordonnances',
      icon: 'HeartPulse',
      color: '#10B981',
      commonModules: ['ventes', 'stock', 'finances', 'clients', 'fournisseurs', 'depenses', 'rapports', 'audit'],
      specificModules: ['gestion_lots_peremption', 'ordonnances_medicales', 'alerte_dluo'],
      isActive: true
    },
    {
      id: 'sec-station',
      slug: 'station',
      name: 'Station-Service',
      description: 'Gestion des cuves, jauges, index pompes et encaissements pompistes',
      icon: 'Fuel',
      color: '#F59E0B',
      commonModules: ['ventes', 'stock', 'finances', 'depenses', 'rapports', 'audit'],
      specificModules: ['pompes_cuves', 'index_carburant', 'cloture_poste'],
      isActive: true
    },
    {
      id: 'sec-location',
      slug: 'location',
      name: 'Gestion de Location & Baux',
      description: 'Immeubles, appartements, contrats de bail, cautions et quittances',
      icon: 'Building',
      color: '#8B5CF6',
      commonModules: ['finances', 'clients', 'depenses', 'rapports', 'audit'],
      specificModules: ['contrats_baux', 'quittances_loyer', 'charges_reparations'],
      isActive: true
    }
  ]);

  // Modal Nouvelle Entreprise
  const [showAddCompanyModal, setShowAddCompanyModal] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({
    name: '',
    ifu: '',
    responsible: '',
    phone: '',
    email: '',
    plan: 'solo' as SaaSCompany['plan'],
    selectedSectors: ['quincaillerie']
  });

  // Modal Nouveau Secteur Dynamique
  const [showAddSectorModal, setShowAddSectorModal] = useState(false);
  const [newSectorForm, setNewSectorForm] = useState({
    name: '',
    slug: '',
    description: '',
    color: '#059669',
    commonModules: ['ventes', 'stock', 'finances', 'clients', 'depenses', 'audit'],
    specificModules: [] as string[]
  });

  // KPI CALCULÉS SUPER-ADMIN
  const totalMrr = companies.filter(c => c.status === 'active').reduce((acc, c) => acc + c.mrr, 0);
  const totalArr = totalMrr * 12;
  const activeTenantsCount = companies.filter(c => c.status === 'active').length;
  const trialTenantsCount = companies.filter(c => c.status === 'trial').length;

  // Filtrage des entreprises
  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.ifu.includes(searchTerm) ||
    c.responsible.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Bascule du statut d'une entreprise (Actif <-> Suspendu)
  const toggleCompanyStatus = (companyId: string) => {
    setCompanies(prev => prev.map(c => {
      if (c.id !== companyId) return c;
      const nextStatus = c.status === 'active' ? 'suspended' : 'active';
      return { ...c, status: nextStatus };
    }));
  };

  // Bascule d'un secteur pour une entreprise
  const toggleCompanySector = (companyId: string, sectorSlug: string) => {
    setCompanies(prev => prev.map(c => {
      if (c.id !== companyId) return c;
      const exists = c.activeSectors.includes(sectorSlug);
      const updatedSectors = exists
        ? (c.activeSectors.length > 1 ? c.activeSectors.filter(s => s !== sectorSlug) : c.activeSectors)
        : [...c.activeSectors, sectorSlug];

      const newPlan = updatedSectors.length > 1 ? 'multiservices' : 'solo';
      return { ...c, activeSectors: updatedSectors, plan: newPlan };
    }));
  };

  // Création d'une nouvelle entreprise
  const handleCreateCompany = (e: React.FormEvent) => {
    e.preventDefault();
    const newComp: SaaSCompany = {
      id: 'c_' + Date.now(),
      name: newCompanyForm.name,
      ifu: newCompanyForm.ifu,
      responsible: newCompanyForm.responsible,
      phone: newCompanyForm.phone,
      email: newCompanyForm.email,
      plan: newCompanyForm.selectedSectors.length > 1 ? 'multiservices' : 'solo',
      status: 'trial',
      activeSectors: newCompanyForm.selectedSectors,
      mrr: newCompanyForm.selectedSectors.length > 1 ? 45000 : 15000,
      createdAt: new Date().toISOString().split('T')[0]
    };
    setCompanies([newComp, ...companies]);
    setShowAddCompanyModal(false);
    alert(`Entreprise "${newCompanyForm.name}" créée avec succès en période d'essai 30 jours !`);
  };

  // Création d'un nouveau secteur dynamique
  const handleCreateSector = (e: React.FormEvent) => {
    e.preventDefault();
    const newSec: DynamicSector = {
      id: 'sec_' + Date.now(),
      slug: newSectorForm.slug.toLowerCase().trim().replace(/[^a-z0-9]/g, '_'),
      name: newSectorForm.name,
      description: newSectorForm.description,
      icon: 'Store',
      color: newSectorForm.color,
      commonModules: newSectorForm.commonModules,
      specificModules: newSectorForm.specificModules,
      isActive: true
    };
    setSectors([...sectors, newSec]);
    setShowAddSectorModal(false);
    alert(`Secteur "${newSectorForm.name}" créé et publié immédiatement sur la plateforme !`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 sm:p-6 lg:p-8">
      {/* Top Header Super-Admin */}
      <div className="max-w-7xl mx-auto mb-8 pb-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-500/20 text-purple-400 border border-purple-500/30">
              PANEL SUPER-ADMIN GESTIO 229
            </span>
            <span className="text-xs text-slate-400 font-mono">Administration Centrale SaaS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mt-2 tracking-tight">
            Supervision & Gestion des Tenants
          </h1>
        </div>

        {/* Navigation Onglets */}
        <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center self-start md:self-auto">
          <button
            onClick={() => setActiveTab('tenants')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'tenants' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Entreprises ({companies.length})
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'subscriptions' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Abonnements & MRR
          </button>
          <button
            onClick={() => setActiveTab('sectors')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'sectors' ? 'bg-purple-600 text-white shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            Moteur de Secteurs ({sectors.length})
          </button>
        </div>
      </div>

      {/* KPI GLOBAUX SAAS */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">MRR (Revenu Récurrent Mensuel)</div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-2 font-mono">
            {totalMrr.toLocaleString('fr-FR')} <span className="text-xs">FCFA</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">ARR projeté : {(totalArr / 1000000).toFixed(2)}M FCFA</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entreprises Actives Payantes</div>
          <div className="text-2xl sm:text-3xl font-black text-white mt-2 font-mono">
            {activeTenantsCount} <span className="text-xs text-emerald-400 font-semibold">clients</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Sur {companies.length} comptes créés</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">En Période d'Essai (Trial 30j)</div>
          <div className="text-2xl sm:text-3xl font-black text-amber-400 mt-2 font-mono">
            {trialTenantsCount} <span className="text-xs text-amber-400 font-semibold">prospects</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Conversion moyenne : 42%</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Catalogue Secteurs</div>
          <div className="text-2xl sm:text-3xl font-black text-blue-400 mt-2 font-mono">
            {sectors.length} <span className="text-xs text-blue-400 font-semibold">métiers</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Configurables sans redéploiement</div>
        </div>
      </div>

      {/* ONGLET 1 : GESTION DES ENTREPRISES */}
      {activeTab === 'tenants' && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-3 text-slate-500" size={16} />
              <input
                type="text"
                placeholder="Rechercher par nom, IFU ou responsable..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 pl-9 pr-4 py-2 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>

            <button
              onClick={() => setShowAddCompanyModal(true)}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg"
            >
              <Plus size={16} />
              <span>Créer une Entreprise</span>
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/70 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                  <tr>
                    <th className="p-4">Entreprise & Contact</th>
                    <th className="p-4">N° IFU Bénin</th>
                    <th className="p-4">Plan & Statut</th>
                    <th className="p-4">Secteurs Débloqués</th>
                    <th className="p-4 text-right">Cotisation MRR</th>
                    <th className="p-4 text-center">Action Compte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredCompanies.map((comp) => {
                    const isSuspended = comp.status === 'suspended';
                    return (
                      <tr key={comp.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="p-4">
                          <div className="font-bold text-white text-base">{comp.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                            <span>{comp.responsible}</span>
                            <span>•</span>
                            <span className="font-mono">{comp.phone}</span>
                          </div>
                        </td>
                        <td className="p-4 font-mono text-xs text-slate-300 font-bold">
                          {comp.ifu}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-500/20 text-blue-400 uppercase">
                              {comp.plan}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              comp.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                              comp.status === 'trial' ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {comp.status === 'trial' ? 'Essai 30j' : comp.status}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex gap-1.5 flex-wrap">
                            {sectors.map((sec) => {
                              const isEnabled = comp.activeSectors.includes(sec.slug);
                              return (
                                <button
                                  key={sec.slug}
                                  onClick={() => toggleCompanySector(comp.id, sec.slug)}
                                  title={`Cliquer pour activer/désactiver ${sec.name}`}
                                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                                    isEnabled
                                      ? 'bg-emerald-600 text-white shadow-sm'
                                      : 'bg-slate-800/80 text-slate-500 hover:text-slate-300'
                                  }`}
                                >
                                  {sec.name.split(' ')[0]} {isEnabled ? '✓' : '+'}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-4 text-right font-mono font-bold text-emerald-400">
                          {comp.mrr.toLocaleString('fr-FR')} F
                        </td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => toggleCompanyStatus(comp.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              isSuspended
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white border border-rose-500/30'
                            }`}
                          >
                            {isSuspended ? 'Réactiver' : 'Suspendre'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 2 : ABONNEMENTS & TRANSACTIONS */}
      {activeTab === 'subscriptions' && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <CreditCard className="text-emerald-400" />
              <span>Grille des Tarifs & Abonnements GESTIO 229</span>
            </h2>
            <p className="text-xs text-slate-400 mb-6">Paramétrage des forfaits facturés aux entreprises clientes.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                <span className="text-xs font-bold uppercase text-blue-400">Plan Solo</span>
                <div className="text-3xl font-black mt-2">15 000 <span className="text-xs font-normal">FCFA/mois</span></div>
                <p className="text-xs text-slate-400 mt-2">1 secteur d'activité, 3 utilisateurs, Facturation & Stocks inclus.</p>
              </div>

              <div className="bg-slate-950 border border-emerald-500/40 p-5 rounded-xl relative">
                <span className="absolute top-4 right-4 bg-emerald-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full uppercase">
                  Populaire
                </span>
                <span className="text-xs font-bold uppercase text-emerald-400">Plan Multiservices</span>
                <div className="text-3xl font-black mt-2 text-emerald-300">45 000 <span className="text-xs font-normal">FCFA/mois</span></div>
                <p className="text-xs text-slate-400 mt-2">Jusqu'à 5 secteurs d'activité, Hub consolidé, Multi-caisses & Banques.</p>
              </div>

              <div className="bg-slate-950 border border-slate-800 p-5 rounded-xl">
                <span className="text-xs font-bold uppercase text-purple-400">Plan Entreprise</span>
                <div className="text-3xl font-black mt-2">80 000 <span className="text-xs font-normal">FCFA/mois</span></div>
                <p className="text-xs text-slate-400 mt-2">Secteurs illimités, support prioritaire 24/7, multi-points de vente réseau.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 3 : MOTEUR DYNAMIQUE DE SECTEURS */}
      {activeTab === 'sectors' && (
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Layers className="text-purple-400" />
                <span>Créateur & Configurateur de Secteurs d'Activité</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Créez une nouvelle catégorie de commerce en cochant simplement les modules souhaités.
              </p>
            </div>
            <button
              onClick={() => setShowAddSectorModal(true)}
              className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 font-bold rounded-xl text-sm flex items-center gap-2 transition-all shadow-lg"
            >
              <PlusCircle size={16} />
              <span>Nouveau Secteur</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sectors.map((sec) => (
              <div key={sec.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-base shadow" style={{ backgroundColor: sec.color }}>
                      {sec.name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">{sec.name}</h3>
                      <span className="text-xs font-mono text-slate-400">slug: {sec.slug}</span>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2.5 py-1 rounded-full font-semibold">
                    Actif
                  </span>
                </div>

                <p className="text-xs text-slate-400 mt-2 mb-4">{sec.description}</p>

                <div className="space-y-2">
                  <div className="text-xs font-bold text-slate-300">Modules Communs Activés :</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sec.commonModules.map(m => (
                      <span key={m} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[11px] rounded">
                        {m}
                      </span>
                    ))}
                  </div>

                  {sec.specificModules.length > 0 && (
                    <>
                      <div className="text-xs font-bold text-purple-400 mt-3">Modules Spécifiques Métier :</div>
                      <div className="flex flex-wrap gap-1.5">
                        {sec.specificModules.map(m => (
                          <span key={m} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[11px] font-medium rounded border border-purple-500/30">
                            ★ {m}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL CRÉATION ENTREPRISE */}
      {showAddCompanyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Ajouter une Nouvelle Entreprise Tenant</h3>
              <button onClick={() => setShowAddCompanyModal(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Raison Sociale / Nom Entreprise *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Comptoir Béninois de Distribution"
                  value={newCompanyForm.name}
                  onChange={e => setNewCompanyForm({ ...newCompanyForm, name: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">N° IFU Bénin (13 chiffres) *</label>
                  <input
                    type="text"
                    required
                    maxLength={13}
                    placeholder="3202600000000"
                    value={newCompanyForm.ifu}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, ifu: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Nom du Responsable *</label>
                  <input
                    type="text"
                    required
                    placeholder="Nom & Prénoms"
                    value={newCompanyForm.responsible}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, responsible: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Téléphone Bénin *</label>
                  <input
                    type="text"
                    required
                    placeholder="+229 01 97 00 00 00"
                    value={newCompanyForm.phone}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, phone: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-400 block mb-1">Email Professionnel *</label>
                  <input
                    type="email"
                    required
                    placeholder="directeur@domaine.bj"
                    value={newCompanyForm.email}
                    onChange={e => setNewCompanyForm({ ...newCompanyForm, email: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddCompanyModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold"
                >
                  Créer et Activer Essai
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CRÉATION SECTEUR DYNAMIQUE */}
      {showAddSectorModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Créer un Nouveau Secteur Métier</h3>
              <button onClick={() => setShowAddSectorModal(false)} className="text-slate-400 hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSector} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Nom du Secteur *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Salon de Coiffure & Esthétique"
                  value={newSectorForm.name}
                  onChange={e => {
                    const val = e.target.value;
                    setNewSectorForm({
                      ...newSectorForm,
                      name: val,
                      slug: val.toLowerCase().trim().replace(/[^a-z0-9]/g, '_')
                    });
                  }}
                  className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Identifiant Slug (auto-généré)</label>
                <input
                  type="text"
                  readOnly
                  value={newSectorForm.slug}
                  className="w-full bg-slate-800/60 border border-slate-700 px-3 py-2 rounded-xl text-xs text-slate-400 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Précisez les spécificités de cette activité..."
                  value={newSectorForm.description}
                  onChange={e => setNewSectorForm({ ...newSectorForm, description: e.target.value })}
                  className="w-full bg-slate-800 border border-slate-700 px-3 py-2 rounded-xl text-sm text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddSectorModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold"
                >
                  Publier le Secteur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
