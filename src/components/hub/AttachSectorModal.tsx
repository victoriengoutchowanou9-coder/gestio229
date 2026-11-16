// =============================================================================
// GESTIO 229 SaaS — Modal Rattachement / Création de Secteur sur un Site
// =============================================================================

import React, { useState } from 'react';
import { X, Layers, Plus, ArrowRightLeft, Building2, CheckCircle, Sparkles } from 'lucide-react';
import { CompanySite } from '../../services/multisiteService';

interface AttachSectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetSite: CompanySite | null;
  allActivities: any[];
  onAttachExistingSector: (activityId: string) => Promise<void>;
  onCreateNewSector: () => void;
  darkMode: boolean;
}

export const AttachSectorModal: React.FC<AttachSectorModalProps> = ({
  isOpen,
  onClose,
  targetSite,
  allActivities,
  onAttachExistingSector,
  onCreateNewSector,
  darkMode,
}) => {
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !targetSite) return null;

  // Secteurs qui ne sont PAS encore rattachés à ce site
  const otherActivities = allActivities.filter((act) => {
    const sId = act.settings?.site_id || act.site_id;
    if (sId) return sId !== targetSite.id;
    return !targetSite.is_main;
  });

  const handleAttach = async () => {
    if (!selectedActivityId) {
      setError('Veuillez sélectionner un secteur à rattacher.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onAttachExistingSector(selectedActivityId);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Erreur lors du rattachement.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden transition-all ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-slate-50'}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Layers size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">
                Ajouter un Secteur au Site
              </h3>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Rattacher un secteur existant ou créer une nouvelle activité sur <strong className="text-emerald-500">{targetSite.name}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Option 1 : Rattacher un secteur existant */}
          <div className={`p-4 rounded-xl border space-y-3 ${
            darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-500">
              <ArrowRightLeft size={14} />
              <span>Option 1 : Rattacher un secteur existant</span>
            </div>

            {otherActivities.length === 0 ? (
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Tous vos secteurs d'activité actuels sont déjà rattachés à ce site.
              </p>
            ) : (
              <div className="space-y-2">
                <select
                  value={selectedActivityId}
                  onChange={(e) => setSelectedActivityId(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
                    darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
                  }`}
                >
                  <option value="">-- Choisir une activité existante --</option>
                  {otherActivities.map((act) => (
                    <option key={act.id} value={act.id}>
                      {act.name} ({act.sectorLabel || act.sectorSlug}) — actuel : {act.location || 'Non assigné'}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAttach}
                  disabled={loading || !selectedActivityId}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle size={14} />
                  <span>{loading ? 'Rattachement en cours...' : 'Rattacher à ce site'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Option 2 : Créer un nouveau secteur depuis le catalogue */}
          <div className={`p-4 rounded-xl border space-y-3 ${
            darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400">
              <Sparkles size={14} />
              <span>Option 2 : Créer un nouveau secteur d'activité</span>
            </div>
            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Choisissez une nouvelle activité parmi les 15 secteurs spécialisés de GESTIO 229 (Quincaillerie, Poissonnerie, Restaurant, Pharmacie, etc.) pour ce site.
            </p>

            <button
              type="button"
              onClick={() => {
                onClose();
                onCreateNewSector();
              }}
              className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/20"
            >
              <Plus size={14} />
              <span>Ouvrir le catalogue et créer</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
