'use client';

import React, { useState, useEffect } from 'react';
import { CreateBcDialog } from './components/CreateBcDialog';
import { SignaturePadModal } from './components/SignaturePadModal';
import { ReceiveBcDialog } from './components/ReceiveBcDialog';
import { BcPrintDocument } from './components/BcPrintDocument';
import { BonCommande, Fournisseur, Produit, RoleSignature, StatutBC } from './types';
import { pdf } from '@react-pdf/renderer';

// Données initiales de démonstration (conformes à l'écosystème GESTIO 229)
const INITIAL_FOURNISSEURS: Fournisseur[] = [
  { id: 'f1', code: 'FOURN-001', name: 'IMPORT-EXPORT BÉNIN SÀRL', phone: '+229 97 88 77 66' },
  { id: 'f2', code: 'FOURN-002', name: 'GRANDS MOULINS DU BÉNIN SA', phone: '+229 21 30 40 50' },
  { id: 'f3', code: 'FOURN-003', name: 'BRASSERIES DU BÉNIN (SOBEBRA)', phone: '+229 21 33 11 22' },
];

const INITIAL_PRODUITS: Produit[] = [
  {
    id: 'p1',
    code: 'ART-001',
    name: 'Tilapia Frais de Grand-Popo (Carton 20kg)',
    category: 'Poissonnerie & Vivres',
    ucd: 'Carton',
    uv: 'Kg',
    coef: 20,
    stockMagasin: 45,
    stockVente: 120,
    priceAchatUcd: 28000,
    priceVenteUcd: 32000,
    priceVenteUv: 1800,
  },
  {
    id: 'p2',
    code: 'ART-002',
    name: 'Riz Parfumé Super Maman 25kg',
    category: 'Céréales & Épicerie',
    ucd: 'Sac',
    uv: 'Kg',
    coef: 25,
    stockMagasin: 60,
    stockVente: 150,
    priceAchatUcd: 18500,
    priceVenteUcd: 20500,
    priceVenteUv: 900,
  },
  {
    id: 'p3',
    code: 'ART-003',
    name: 'Huile Végétale Raffinée Oléo (Bidon 20L)',
    category: 'Huiles & Condiments',
    ucd: 'Bidon',
    uv: 'Litre',
    coef: 20,
    stockMagasin: 30,
    stockVente: 50,
    priceAchatUcd: 21000,
    priceVenteUcd: 23500,
    priceVenteUv: 1250,
  },
  {
    id: 'p4',
    code: 'ART-004',
    name: 'Sucre Roux Pur Canne SOSUCO (Sac 50kg)',
    category: 'Céréales & Épicerie',
    ucd: 'Sac',
    uv: 'Kg',
    coef: 50,
    stockMagasin: 25,
    stockVente: 80,
    priceAchatUcd: 34000,
    priceVenteUcd: 37500,
    priceVenteUv: 850,
  },
];

const INITIAL_BON_COMMANDES: BonCommande[] = [
  {
    id: 'bc-001',
    reference: 'BC-2026-001',
    fournisseur_id: 'f1',
    fournisseur_nom: 'IMPORT-EXPORT BÉNIN SÀRL',
    date_commande: '2026-09-08',
    date_livraison_prevue: '2026-09-12',
    statut: 'Validé',
    total_ttc: 560000,
    created_at: '2026-09-08T10:00:00Z',
    lignes: [
      {
        produit_id: 'p1',
        code_produit: 'ART-001',
        nom_produit: 'Tilapia Frais de Grand-Popo (Carton 20kg)',
        ucd: 'Carton',
        stock_actuel_ucd: 45,
        qte_commande: 20,
        qte_recue: 0,
        pu_ttc: 28000,
        total_ligne: 560000,
      },
    ],
    signatures: {
      gestionnaire: {
        bc_id: 'bc-001',
        role: 'gestionnaire',
        signer_name: 'Bernard SOSSOU (Gestionnaire)',
        signature_image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        date_signature: '2026-09-08T11:00:00Z',
      },
      directeur: {
        bc_id: 'bc-001',
        role: 'directeur',
        signer_name: 'Dr. Kolade AKIN (Directeur)',
        signature_image_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        date_signature: '2026-09-08T14:30:00Z',
      },
    },
  },
];

export default function BonCommandePage() {
  const [bcs, setBcs] = useState<BonCommande[]>(INITIAL_BON_COMMANDES);
  const [produits, setProduits] = useState<Produit[]>(INITIAL_PRODUITS);
  const [fournisseurs] = useState<Fournisseur[]>(INITIAL_FOURNISSEURS);

  // Modales
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [signatureModalConfig, setSignatureModalConfig] = useState<{
    isOpen: boolean;
    bc: BonCommande | null;
    role: RoleSignature;
  }>({
    isOpen: false,
    bc: null,
    role: 'gestionnaire',
  });
  const [receiveBcModalConfig, setReceiveBcModalConfig] = useState<{
    isOpen: boolean;
    bc: BonCommande | null;
  }>({
    isOpen: false,
    bc: null,
  });

  // Filtres
  const [filterStatut, setFilterStatut] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Sauvegarde d'un nouveau Bon de Commande
  const handleSaveNewBc = (newBcData: Omit<BonCommande, 'id' | 'created_at' | 'signatures'>) => {
    const newBc: BonCommande = {
      ...newBcData,
      id: 'bc-' + Date.now(),
      created_at: new Date().toISOString(),
      signatures: {},
    };

    setBcs((prev) => [newBc, ...prev]);
    alert(
      `BON DE COMMANDE ${newBc.reference} CRÉÉ AVEC SUCCÈS !\n\nStatut initial : "En attente Signature Gestionnaire".\nConformément au workflow, le Gestionnaire doit à présent apposer son visa numérique.`
    );
  };

  // 2. Gestion des Signatures (Gestionnaire -> Directeur)
  const handleOpenSignature = (bc: BonCommande, role: RoleSignature) => {
    setSignatureModalConfig({
      isOpen: true,
      bc,
      role,
    });
  };

  const handleConfirmSignature = (
    signatureBase64: string,
    role: RoleSignature,
    signerName: string
  ) => {
    if (!signatureModalConfig.bc) return;
    const targetBcId = signatureModalConfig.bc.id;

    setBcs((prev) =>
      prev.map((item) => {
        if (item.id !== targetBcId) return item;

        const updatedSignatures = {
          ...item.signatures,
          [role]: {
            bc_id: item.id,
            role,
            signer_name: signerName,
            signature_image_base64: signatureBase64,
            date_signature: new Date().toISOString(),
          },
        };

        let nextStatut: StatutBC = item.statut;
        if (role === 'gestionnaire') {
          nextStatut = 'En attente Signature Directeur';
        } else if (role === 'directeur') {
          nextStatut = 'Validé';
        }

        return {
          ...item,
          signatures: updatedSignatures,
          statut: nextStatut,
        };
      })
    );

    const nextMsg =
      role === 'gestionnaire'
        ? 'Signature Gestionnaire enregistrée ! Le BC passe au statut "En attente Signature Directeur".'
        : 'Signature Directeur validée ! Le BC est désormais "Validé" et prêt pour impression PDF et réception.';
    alert(nextMsg);
  };

  // 3. Impression PDF avec @react-pdf/renderer
  const handlePrintPdf = async (bc: BonCommande) => {
    try {
      const blob = await pdf(<BcPrintDocument bc={bc} />).toBlob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank');
      if (!win) {
        // Si popup bloquée, télécharger directement
        const a = document.createElement('a');
        a.href = url;
        a.download = `${bc.reference}_GESTIO229.pdf`;
        a.click();
      }
    } catch (err: any) {
      console.error('Erreur génération PDF:', err);
      alert("Erreur lors de la création du PDF : " + (err.message || err));
    }
  };

  // 4. Réception Marchandise & RPC Supabase (MAJ Stock Magasin en UCD)
  const handleOpenReceive = (bc: BonCommande) => {
    setReceiveBcModalConfig({
      isOpen: true,
      bc,
    });
  };

  const handleConfirmReception = async (
    bcId: string,
    lignesRecues: { produit_id: string; code_produit: string; qte_recue: number; ucd: string }[],
    signatureMagasinierBase64: string,
    magasinierName: string
  ) => {
    // 1. Simulation / Appel de la procédure stockée RPC Supabase
    try {
      /* 
      // Code Supabase réel prêt à l'emploi :
      const { data, error } = await supabase.rpc('receptionner_bc_maj_stock', {
        p_bc_id: bcId,
        p_magasinier_name: magasinierName,
        p_signature_base64: signatureMagasinierBase64,
        p_lignes_recues: lignesRecues
      });
      if (error) throw error;
      */

      // 2. Mise à jour réactive du state local (Stock Magasin en UCD selon Règle B.1)
      setProduits((prevProds) =>
        prevProds.map((prod) => {
          const rec = lignesRecues.find((l) => l.produit_id === prod.id);
          if (rec && rec.qte_recue > 0) {
            return {
              ...prod,
              stockMagasin: Math.round((prod.stockMagasin + rec.qte_recue) * 100) / 100,
            };
          }
          return prod;
        })
      );

      // 3. Mise à jour du BC (Statut Réceptionné + Signature Magasinier)
      setBcs((prevBcs) =>
        prevBcs.map((b) => {
          if (b.id !== bcId) return b;
          return {
            ...b,
            statut: 'Réceptionné' as StatutBC,
            lignes: b.lignes.map((l) => {
              const rec = lignesRecues.find((x) => x.produit_id === l.produit_id);
              return {
                ...l,
                qte_recue: rec ? rec.qte_recue : l.qte_commande,
              };
            }),
            signatures: {
              ...b.signatures,
              magasinier: {
                bc_id: b.id,
                role: 'magasinier',
                signer_name: magasinierName,
                signature_image_base64: signatureMagasinierBase64,
                date_signature: new Date().toISOString(),
              },
            },
          };
        })
      );

      alert(
        `RÉCEPTION VALIDÉE (RÈGLE B.1) !\n\n- Bon de Commande : ${bcId}\n- Magasinier : ${magasinierName}\n- Stock Magasin incrémenté en UCD avec succès.\n- Statut mis à jour : "Réceptionné".`
      );
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  const filteredBcs = bcs.filter((b) => {
    const matchStatus = filterStatut === 'all' || b.statut === filterStatut;
    const matchQuery =
      b.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.fournisseur_nom.toLowerCase().includes(searchQuery.toLowerCase());
    return matchStatus && matchQuery;
  });

  const formatFcfa = (val: number) => {
    return new Intl.NumberFormat('fr-FR').format(Math.round(val)) + ' FCFA';
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
              Module Achats & Fournisseurs
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
              Règle B.1 : Commandes & Réceptions en UCD
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">
            Bons de Commande Fournisseur (BC Pro)
          </h1>
          <p className="text-xs text-slate-500">
            Workflow complet : Saisie multi-articles en UCD $\rightarrow$ Double Signature Électronique $\rightarrow$ Réception & MAJ automatique du Stock Magasin.
          </p>
        </div>

        {/* BOUTON CRÉER UN BON DE COMMANDE AMÉLIORÉ */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsCreateOpen(true)}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-2xl text-xs font-black shadow-lg shadow-indigo-600/30 flex items-center space-x-2 transition"
          >
            <span className="text-base">🛒</span>
            <span>+ Créer un Bon de Commande</span>
          </button>
        </div>
      </div>

      {/* Barre de filtres et recherche */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <label className="font-bold text-slate-600">Statut :</label>
          <select
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
            className="p-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="En attente Signature Gestionnaire">En attente Signature Gestionnaire</option>
            <option value="En attente Signature Directeur">En attente Signature Directeur</option>
            <option value="Validé">Validé (Prêt réception / impression)</option>
            <option value="Réceptionné">Réceptionné (En Magasin)</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Rechercher référence, fournisseur..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Table des Bons de Commande */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="font-black text-slate-800 text-xs uppercase tracking-wide">
            Historique des Bons de Commande ({filteredBcs.length})
          </span>
          <span className="text-[11px] text-slate-500">
            Traçabilité horodatée et contrôles anti-fraude DGI
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3.5 font-mono">Référence</th>
                <th className="p-3.5">Date</th>
                <th className="p-3.5">Fournisseur</th>
                <th className="p-3.5 text-center">Articles (UCD)</th>
                <th className="p-3.5 text-right">Total TTC</th>
                <th className="p-3.5 text-center">Circuit Signatures</th>
                <th className="p-3.5 text-center">Statut</th>
                <th className="p-3.5 text-center w-56">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBcs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400 font-medium">
                    Aucun Bon de Commande trouvé. Cliquez sur <strong>"+ Créer un Bon de Commande"</strong> pour débuter.
                  </td>
                </tr>
              ) : (
                filteredBcs.map((bc) => {
                  const hasGestSig = !!bc.signatures.gestionnaire;
                  const hasDirSig = !!bc.signatures.directeur;
                  const hasMagSig = !!bc.signatures.magasinier;

                  return (
                    <tr key={bc.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3.5 font-mono font-bold text-indigo-900">
                        {bc.reference}
                      </td>
                      <td className="p-3.5 font-mono text-slate-600">
                        {bc.date_commande}
                      </td>
                      <td className="p-3.5 font-bold text-slate-900">
                        {bc.fournisseur_nom}
                      </td>
                      <td className="p-3.5 text-center">
                        <span className="font-mono font-bold bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-lg">
                          {bc.lignes.reduce((sum, l) => sum + l.qte_commande, 0)}{' '}
                          {bc.lignes[0]?.ucd || 'UCD'}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          {bc.lignes.length} réf(s)
                        </span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-black text-slate-900">
                        {formatFcfa(bc.total_ttc)}
                      </td>

                      {/* État des signatures */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center space-x-1 text-[10px] font-bold">
                          <span
                            title={
                              hasGestSig
                                ? `Signé par ${bc.signatures.gestionnaire?.signer_name}`
                                : 'Non signé'
                            }
                            className={`px-2 py-0.5 rounded ${
                              hasGestSig
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {hasGestSig ? '✓ Gest.' : '○ Gest.'}
                          </span>
                          <span
                            title={
                              hasDirSig
                                ? `Signé par ${bc.signatures.directeur?.signer_name}`
                                : 'Non signé'
                            }
                            className={`px-2 py-0.5 rounded ${
                              hasDirSig
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {hasDirSig ? '✓ Dir.' : '○ Dir.'}
                          </span>
                          <span
                            title={
                              hasMagSig
                                ? `Réceptionné par ${bc.signatures.magasinier?.signer_name}`
                                : 'Non réceptionné'
                            }
                            className={`px-2 py-0.5 rounded ${
                              hasMagSig
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-400'
                            }`}
                          >
                            {hasMagSig ? '✓ Mag.' : '○ Mag.'}
                          </span>
                        </div>
                      </td>

                      {/* Badge Statut */}
                      <td className="p-3.5 text-center">
                        {bc.statut === 'En attente Signature Gestionnaire' && (
                          <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full text-[10px] font-black">
                            ⏳ Attente Gestionnaire
                          </span>
                        )}
                        {bc.statut === 'En attente Signature Directeur' && (
                          <span className="bg-purple-100 text-purple-800 border border-purple-200 px-2.5 py-1 rounded-full text-[10px] font-black">
                            ⏳ Attente Directeur
                          </span>
                        )}
                        {bc.statut === 'Validé' && (
                          <span className="bg-blue-100 text-blue-800 border border-blue-200 px-2.5 py-1 rounded-full text-[10px] font-black">
                            ✓ Validé (À réceptionner)
                          </span>
                        )}
                        {bc.statut === 'Réceptionné' && (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-black">
                            📦 Réceptionné en Stock
                          </span>
                        )}
                      </td>

                      {/* Colonne Actions contextuelles */}
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {/* 1. Rôle Gestionnaire */}
                          {bc.statut === 'En attente Signature Gestionnaire' && (
                            <button
                              onClick={() => handleOpenSignature(bc, 'gestionnaire')}
                              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black shadow-sm flex items-center space-x-1 transition"
                            >
                              <span>✍️</span>
                              <span>Signer (Gest.)</span>
                            </button>
                          )}

                          {/* 2. Rôle Directeur */}
                          {bc.statut === 'En attente Signature Directeur' && (
                            <button
                              onClick={() => handleOpenSignature(bc, 'directeur')}
                              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-[10px] font-black shadow-sm flex items-center space-x-1 transition"
                            >
                              <span>✍️</span>
                              <span>Signer (Directeur)</span>
                            </button>
                          )}

                          {/* 3. Statut Validé : Bouton Imprimer PDF + Bouton Réceptionner */}
                          {(bc.statut === 'Validé' || bc.statut === 'Réceptionné') && (
                            <button
                              onClick={() => handlePrintPdf(bc)}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-[10px] font-bold flex items-center space-x-1 transition"
                              title="Générer PDF officiel (@react-pdf/renderer)"
                            >
                              <span>📄</span>
                              <span>PDF</span>
                            </button>
                          )}

                          {bc.statut === 'Validé' && (
                            <button
                              onClick={() => handleOpenReceive(bc)}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black shadow-sm flex items-center space-x-1 transition"
                            >
                              <span>📦</span>
                              <span>Réceptionner</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale de création Pro */}
      <CreateBcDialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        fournisseurs={fournisseurs}
        produits={produits}
        onSave={handleSaveNewBc}
        existingBcCount={bcs.length}
      />

      {/* Modale de signature tactile */}
      {signatureModalConfig.bc && (
        <SignaturePadModal
          isOpen={signatureModalConfig.isOpen}
          onClose={() =>
            setSignatureModalConfig({ isOpen: false, bc: null, role: 'gestionnaire' })
          }
          role={signatureModalConfig.role}
          bcReference={signatureModalConfig.bc.reference}
          onConfirm={handleConfirmSignature}
        />
      )}

      {/* Modale de réception de marchandise */}
      {receiveBcModalConfig.bc && (
        <ReceiveBcDialog
          isOpen={receiveBcModalConfig.isOpen}
          onClose={() => setReceiveBcModalConfig({ isOpen: false, bc: null })}
          bc={receiveBcModalConfig.bc}
          onConfirmReception={handleConfirmReception}
        />
      )}
    </div>
  );
}
