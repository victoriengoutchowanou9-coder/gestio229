// =============================================================================
// GESTIO 229 SaaS — RegisterSiteModal : Ajout & Modification de Site d'Exploitation
// =============================================================================

import React, { useState, useEffect } from 'react';
import { Building2, MapPin, AlignLeft, X, Check, AlertCircle } from 'lucide-react';

export interface RegisterSiteData {
  id?: string;
  name: string;
  city: string;
  address?: string;
  is_main?: boolean;
}

interface RegisterSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: RegisterSiteData) => void;
  initialData?: RegisterSiteData | null;
  defaultCity?: string;
}

const BENIN_CITIES = [
  'Cotonou', 'Porto-Novo', 'Parakou', 'Abomey-Calavi', 'Djougou',
  'Bohicon', 'Natitingou', 'Ouidah', 'Abomey', 'Lokossa', 'Kandi', 'Malanville', 'Autre'
];

export const RegisterSiteModal: React.FC<RegisterSiteModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
  defaultCity = 'Cotonou',
}) => {
  const [name, setName] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setCity(initialData.city || defaultCity);
      setAddress(initialData.address || '');
    } else {
      setName('');
      setCity(defaultCity);
      setAddress('');
    }
    setError(null);
  }, [initialData, defaultCity, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Le nom du site d\'exploitation est obligatoire.');
      return;
    }
    if (!city.trim()) {
      setError('La ville ou localisation du site est obligatoire.');
      return;
    }

    onSave({
      id: initialData?.id,
      name: name.trim(),
      city: city.trim(),
      address: address.trim(),
      is_main: initialData?.is_main,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        {/* En-tête */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600/20 to-teal-600/10 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {initialData ? 'Modifier le site d\'exploitation' : 'Créer un site d\'exploitation'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Point de vente, boutique, agence ou dépôt
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Nom du site <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder="Ex: Siège Principal, Agence Calavi, Dépôt Akpakpa..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Ville ou localisation <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <select
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setError(null);
                }}
                className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {BENIN_CITIES.map((c) => (
                  <option key={c} value={c} className="bg-slate-900">
                    {c} (Bénin)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Adresse ou description <span className="text-slate-500 text-[10px]">(facultatif)</span>
            </label>
            <div className="relative">
              <AlignLeft className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Akpakpa PK3, Rue 102, Quartier Titirou..."
                className="w-full pl-9 pr-3 py-2 bg-slate-800/80 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              {initialData ? 'Enregistrer les modifications' : 'Ajouter le site'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
