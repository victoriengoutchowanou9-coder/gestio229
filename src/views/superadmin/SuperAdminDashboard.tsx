import React, { useState, useEffect, useCallback } from 'react';
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
  Filter,
  RefreshCw
} from 'lucide-react';
import { showSuccess, showError } from '../../components/modals/CustomModalGestio';
import { supabase } from '../../lib/supabase';
import { ALL_SECTORS_CATALOG } from '../../core/modules/moduleRegistry';

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

  // 1. ENTREPRISES SAAS RÉFÉRENCÉES (chargées depuis la base réelle - zéro mock)
  const [companies, setCompanies] = useState<SaaSCompany[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  // 2. CATALOGUE DYNAMIQUE DES SECTEURS (issu du registre officiel GESTIO 229)
  const [sectors, setSectors] = useState<DynamicSector[]>(() =>
    ALL_SECTORS_CATALOG.map((s) => ({
      id: `sec-${s.slug}`,
      slug: s.slug,
      name: s.name,
      description: s.description,
      icon: s.icon || 'Store',
      color: s.color || '#059669',
      commonModules: ['ventes', 'stock', 'finances', 'clients', 'fournisseurs', 'depenses', 'rapports', 'audit'],
      specificModules: [],
      isActive: true,
    }))
  );

  const loadRealCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[SuperAdminDashboard] Notice chargement companies:', error.message);
      } else if (data) {
        const mapped: SaaSCompany[] = data.map((c: any) => {
          const rawSectors = c.selected_sectors || c.sectors || (c.active_sector ? [c.active_sector] : []);
          const activeSectors = Array.isArray(rawSectors)
            ? rawSectors.map((s: string) => String(s).replace(/^sec-/, '').toLowerCase())
            : [];
          const status = c.subscription_status || 'trial';
          const plan = activeSectors.length > 1 ? 'multiservices' : 'solo';
          const mrr = status === 'active' ? (activeSectors.length > 1 ? 45000 : 15000) : 0;

          return {
            id: c.id,
            name: c.name || 'Entreprise sans nom',
            ifu: c.ifu || '—',
            responsible: c.responsible_name || '—',
            phone: c.phone || '—',
            email: c.email || '—',
            plan,
            status,
            activeSectors,
            mrr,
            createdAt: c.created_at ? c.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
          };
        });
        setCompanies(mapped);
      }
    } catch (err: any) {
      console.error('[SuperAdminDashboard] Erreur chargement companies:', err);
    } finally {
      setLoadingCompanies(false);
    }
  }, []);

  useEffect(() => {
    loadRealCompanies();
  }, [loadRealCompanies]);

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

  const [isSubmittingCompany, setIsSubmittingCompany] = useState(false);

  // Bascule du statut d'une entreprise (Actif <-> Suspendu) avec persistance DB
  const toggleCompanyStatus = async (companyId: string) => {
    const current = companies.find(c => c.id === companyId);
    if (!current) return;
    const nextStatus = current.status === 'active' ? 'suspended' : 'active';
    const isActive = nextStatus === 'active';
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          subscription_status: nextStatus,
          is_active: isActive,
          updated_at: new Date().toISOString()
        })
        .eq('id', companyId);

      if (error) throw error;
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, status: nextStatus } : c));
      showSuccess(`Statut mis à jour : ${nextStatus.toUpperCase()}`, 'Modification enregistrée');
    } catch (err: any) {
      showError(err.message || 'Erreur lors de la mise à jour du statut');
    }
  };

  // Bascule d'un secteur pour une entreprise avec persistance DB
  const toggleCompanySector = async (companyId: string, sectorSlug: string) => {
    const current = companies.find(c => c.id === companyId);
    if (!current) return;
    const exists = current.activeSectors.includes(sectorSlug);
    const updatedSectors = exists
      ? (current.activeSectors.length > 1 ? current.activeSectors.filter(s => s !== sectorSlug) : current.activeSectors)
      : [...current.activeSectors, sectorSlug];

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          selected_sectors: updatedSectors,
          sectors: updatedSectors,
          updated_at: new Date().toISOString()
        })
        .eq('id', companyId);

      if (error) throw error;
      const newPlan = updatedSectors.length > 1 ? 'multiservices' : 'solo';
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, activeSectors: updatedSectors, plan: newPlan } : c));
    } catch (err: any) {
      showError(err.message || 'Erreur lors de la mise à jour des secteurs');
    }
  };

  // Création d'une nouvelle entreprise avec persistance réelle en base
  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCompany) return;
    setIsSubmittingCompany(true);
    try {
      const payload: any = {
        name: newCompanyForm.name.trim(),
        ifu: newCompanyForm.ifu.trim(),
        responsible_name: newCompanyForm.responsible.trim(),
        phone: newCompanyForm.phone.trim(),
        email: newCompanyForm.email.trim(),
        subscription_status: 'trial',
        selected_sectors: newCompanyForm.selectedSectors,
        sectors: newCompanyForm.selectedSectors,
        active_sector: newCompanyForm.selectedSectors[0] || 'boutique',
        is_active: true,
      };

      const { error } = await supabase.from('companies').insert([payload]);
      if (error) throw error;

      await loadRealCompanies();
      setShowAddCompanyModal(false);
      showSuccess(`Entreprise "${newCompanyForm.name}" créée et enregistrée avec succès en base de données !`, 'Entreprise créée');
    } catch (err: any) {
      showError(err.message || 'Erreur lors de la création en base de données');
    } finally {
      setIsSubmittingCompany(false);
    }
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
    showSuccess(`Secteur "${newSectorForm.name}" créé et publié immédiatement sur la plateforme !`, 'Secteur créé');
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
            {trialTenantsCount} <span className="text-xs text-amber-400 font-semibold">entreprises</span>
          </div>
          <div className="text-xs text-slate-400 mt-1">Essais gratuits en cours</div>
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

            <div className="flex items-center gap-2">
              <button
                onClick={loadRealCompanies}
                disabled={loadingCompanies}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-white rounded-xl transition border border-slate-700"
                title="Actualiser les données"
              >
                <RefreshCw size={16} className={loadingCompanies ? 'animate-spin text-emerald-500' : ''} />
              </button>
              <button
                onClick={() => setShowAddCompanyModal(true)}
                className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                <Plus size={16} />
                <span>Créer une Entreprise</span>
              </button>
            </div>
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
                  {loadingCompanies ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        <div className="inline-flex items-center gap-2">
                          <RefreshCw size={16} className="animate-spin text-emerald-500" />
                          <span>Chargement des entreprises...</span>
                        </div>
                      </td>
                    </tr>
                  ) : filteredCompanies.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-500">
                        {searchTerm ? 'Aucune entreprise ne correspond à votre recherche.' : 'Aucune entreprise enregistrée dans la plateforme.'}
                      </td>
                    </tr>
                  ) : (
                    filteredCompanies.map((comp) => {
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
                  }))}
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
                  disabled={isSubmittingCompany}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  {isSubmittingCompany ? (
                    <>
                      <RefreshCw size={13} className="animate-spin" />
                      <span>Enregistrement...</span>
                    </>
                  ) : (
                    <span>Créer et Activer Essai</span>
                  )}
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
