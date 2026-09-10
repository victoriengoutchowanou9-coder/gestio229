'use client';

import React, { useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { BonCommande, BcLigne } from '../types';

interface ReceiveBcDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bc: BonCommande;
  onConfirmReception: (
    bcId: string,
    lignesRecues: { produit_id: string; code_produit: string; qte_recue: number; ucd: string }[],
    signatureMagasinierBase64: string,
    magasinierName: string
  ) => Promise<void> | void;
}

export const ReceiveBcDialog: React.FC<ReceiveBcDialogProps> = ({
  isOpen,
  onClose,
  bc,
  onConfirmReception,
}) => {
  const sigPadRef = useRef<SignatureCanvas>(null);
  const [magasinierName, setMagasinierName] = useState('Responsable Magasin');
  const [quantitesRecues, setQuantitesRecues] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    bc.lignes.forEach((l) => {
      init[l.produit_id] = l.qte_commande; // Par défaut, quantité reçue = quantité commandée
    });
    return init;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleQtyChange = (produitId: string, val: string) => {
    const num = parseFloat(val) || 0;
    setQuantitesRecues((prev) => ({
      ...prev,
      [produitId]: num >= 0 ? num : 0,
    }));
  };

  const handleClearSignature = () => {
    sigPadRef.current?.clear();
  };

  const handleSubmit = async () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      alert('Veuillez apposer la signature du Magasinier avant de valider la réception.');
      return;
    }

    const signatureBase64 = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');

    const payloadLignes = bc.lignes.map((l) => ({
      produit_id: l.produit_id,
      code_produit: l.code_produit,
      qte_recue: quantitesRecues[l.produit_id] ?? l.qte_commande,
      ucd: l.ucd,
    }));

    try {
      setIsSubmitting(true);
      await onConfirmReception(bc.id, payloadLignes, signatureBase64, magasinierName);
      onClose();
    } catch (err: any) {
      alert('Erreur lors de la réception : ' + (err.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="bg-emerald-900 text-white p-5 flex items-center justify-between border-b border-emerald-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center font-bold shadow-lg shadow-emerald-600/30">
              📦
            </div>
            <div>
              <h2 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
                Réception Marchandise - BC N° {bc.reference}
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Règle B.1 : Entrée Stock en UCD
                </span>
              </h2>
              <p className="text-xs text-emerald-200/80">
                Fournisseur : <strong>{bc.fournisseur_nom}</strong> | Date de commande : {bc.date_commande}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-300 hover:text-white text-lg font-bold p-1 leading-none rounded-lg hover:bg-emerald-800 transition"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs">
          {/* Tableau de contrôle des réceptions */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-black text-slate-800 uppercase tracking-wide">
                Contrôle physique des quantités livrées (en UCD) :
              </span>
              <span className="text-[11px] text-slate-500">
                Ajustez les quantités reçues en cas de livraison partielle ou d'avarie
              </span>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-28 font-mono">Code</th>
                    <th className="p-3">Désignation Produit</th>
                    <th className="p-3 text-center w-36">Unité Achat</th>
                    <th className="p-3 text-center w-36">Qté Commandée</th>
                    <th className="p-3 text-center w-44 bg-emerald-50 text-emerald-950 font-black">
                      Input Qté Reçue (UCD)
                    </th>
                    <th className="p-3 text-center w-32">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bc.lignes.map((ligne) => {
                    const qteRecue = quantitesRecues[ligne.produit_id] ?? ligne.qte_commande;
                    const ecart = qteRecue - ligne.qte_commande;

                    return (
                      <tr key={ligne.produit_id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-slate-800">
                          {ligne.code_produit}
                        </td>
                        <td className="p-3 font-bold text-slate-900">
                          {ligne.nom_produit}
                        </td>
                        <td className="p-3 text-center font-semibold text-slate-700">
                          {ligne.ucd}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-800">
                          {ligne.qte_commande} {ligne.ucd}
                        </td>
                        <td className="p-3 text-center bg-emerald-50/50">
                          <div className="flex items-center justify-center space-x-1">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={qteRecue}
                              onChange={(e) =>
                                handleQtyChange(ligne.produit_id, e.target.value)
                              }
                              className="w-24 p-1.5 text-center font-mono font-black border border-emerald-300 rounded-lg bg-white text-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                            />
                            <span className="text-[10px] font-bold text-emerald-800">
                              {ligne.ucd}
                            </span>
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono text-xs font-bold">
                          {ecart === 0 ? (
                            <span className="text-emerald-600">✓ Conforme</span>
                          ) : ecart > 0 ? (
                            <span className="text-blue-600">+{ecart}</span>
                          ) : (
                            <span className="text-rose-600">{ecart} (Manquant)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Zone de signature du Magasinier */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="font-black text-slate-800 uppercase tracking-wide block">
                  Signature Électronique du Magasinier (Réceptionnaire) :
                </label>
                <p className="text-[11px] text-slate-500">
                  Valide la prise en charge physique et l'intégration immédiate dans le Stock Magasin (en UCD).
                </p>
              </div>
              <button
                type="button"
                onClick={handleClearSignature}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline"
              >
                Effacer signature
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nom du Magasinier
                </label>
                <input
                  type="text"
                  value={magasinierName}
                  onChange={(e) => setMagasinierName(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-300 rounded-xl font-semibold text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="mt-4 p-3 bg-emerald-100/60 rounded-xl border border-emerald-300 text-[11px] text-emerald-950">
                  <strong className="block mb-1">⚡ RÈGLE CRITIQUE B.1 :</strong>
                  À la signature, la procédure Supabase exécutera un <strong>UPSERT</strong> dans <code>stock_magasin</code> :
                  <br />
                  <code>stock_ucd = stock_ucd + qte_recue</code>
                </div>
              </div>

              <div className="sm:col-span-2 border-2 border-dashed border-emerald-300 rounded-2xl bg-white overflow-hidden shadow-inner">
                <SignatureCanvas
                  ref={sigPadRef}
                  canvasProps={{
                    className: 'w-full h-36 bg-white cursor-crosshair',
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-100 border-t border-slate-200 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition"
          >
            <span>{isSubmitting ? 'Mise à jour du Stock...' : '✓ Signer Réception & Intégrer au Stock (UCD)'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
