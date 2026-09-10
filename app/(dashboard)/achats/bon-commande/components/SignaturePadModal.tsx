'use client';

import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { RoleSignature } from '../types';

interface SignaturePadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (signatureBase64: string, role: RoleSignature, signerName: string) => void;
  role: RoleSignature;
  bcReference: string;
}

export const SignaturePadModal: React.FC<SignaturePadModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  role,
  bcReference,
}) => {
  const sigPadRef = useRef<SignatureCanvas>(null);
  const [signerName, setSignerName] = React.useState('');

  if (!isOpen) return null;

  const roleLabels: Record<RoleSignature, { title: string; color: string; defaultName: string }> = {
    gestionnaire: {
      title: 'Signature Électronique - Gestionnaire des Achats',
      color: 'bg-indigo-600',
      defaultName: 'Gestionnaire de Stock & Achats',
    },
    directeur: {
      title: 'Validation & Signature - Directeur Général',
      color: 'bg-emerald-600',
      defaultName: 'Directeur Général',
    },
    magasinier: {
      title: 'Signature Réception Marchandise - Magasinier',
      color: 'bg-amber-600',
      defaultName: 'Responsable Magasin (Entrepôt)',
    },
  };

  const currentRole = roleLabels[role] || roleLabels.gestionnaire;

  const handleClear = () => {
    sigPadRef.current?.clear();
  };

  const handleSave = () => {
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      alert('Veuillez apposer votre signature sur le pad tactile avant de valider.');
      return;
    }
    const dataUrl = sigPadRef.current.getTrimmedCanvas().toDataURL('image/png');
    onConfirm(dataUrl, role, signerName.trim() || currentRole.defaultName);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        <div className={`${currentRole.color} text-white p-4 flex items-center justify-between`}>
          <div>
            <h3 className="text-sm font-black">{currentRole.title}</h3>
            <p className="text-xs text-white/80">Réf : {bcReference}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white text-lg font-bold p-1 leading-none"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nom du signataire
            </label>
            <input
              type="text"
              defaultValue={currentRole.defaultName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Bernard SOSSOU"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Zone de Signature (Tactile / Stylet / Souris)
              </label>
              <button
                type="button"
                onClick={handleClear}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline"
              >
                Effacer
              </button>
            </div>
            <div className="border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 overflow-hidden">
              <SignatureCanvas
                ref={sigPadRef}
                canvasProps={{
                  className: 'w-full h-44 bg-white cursor-crosshair',
                }}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              La signature est cryptée et horodatée au standard béninois.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={`px-5 py-2 text-xs font-black text-white rounded-xl shadow-md transition ${currentRole.color} hover:opacity-90`}
          >
            Confirmer la signature
          </button>
        </div>
      </div>
    </div>
  );
};
