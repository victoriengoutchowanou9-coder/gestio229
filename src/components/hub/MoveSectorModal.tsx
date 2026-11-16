// =============================================================================
// GESTIO 229 SaaS — Modal Déplacement de Secteur entre Sites d'Exploitation
// =============================================================================

import React, { useState } from 'react';
import { X, ArrowRightLeft, Building2, MapPin, AlertTriangle, CheckCircle, ShieldCheck } from 'lucide-react';
import { CompanySite } from '../../services/multisiteService';

interface MoveSectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sector: any | null;
  currentSite: CompanySite | null;
  availableSites: CompanySite[];
  onConfirmMove: (activityId: string, targetSite: CompanySite) => Promise<void>;
  darkMode: boolean;
}

export const MoveSectorModal: React.FC<MoveSectorModalProps> = ({
  isOpen,
  onClose,
  sector,
  currentSite,
  availableSites,
  onConfirmMove,
  darkMode,
}) => {
  const [targetSiteId, setTargetSiteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !sector) return null;

  const selectableSites = availableSites.filter((s) => s.id !== currentSite?.id);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSiteId) {
      setError('Veuillez sélectionner un site de destination.');
      return;
    }

    const targetSite = selectableSites.find((s) => s.id === targetSiteId);
    if (!targetSite) {
      setError('Site de destination introuvable.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await onConfirmMove(sector.id, targetSite);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue lors du déplacement.');
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
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-500">
              <ArrowRightLeft size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight">
                Déplacer le Secteur d'Activité
              </h3>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Transférer ce secteur vers un autre site d'exploitation
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
        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Secteur concerné */}
          <div className={`p-3.5 rounded-xl border ${darkMode ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Secteur sélectionné
            </div>
            <div className="text-sm font-black text-emerald-500 flex items-center gap-2">
              <span>{sector.sectorIcon || '🏢'}</span>
              <span>{sector.name}</span>
            </div>
            <div className={`text-xs mt-1 flex items-center gap-1.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              <Building2 size={12} className="text-slate-400" />
              <span>Site actuel : <strong>{currentSite?.name || sector.location || 'Site Principal'}</strong></span>
            </div>
          </div>

          {/* Choix du site de destination */}
          <div>
            <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Choisir le site de destination <span className="text-rose-500">*</span>
            </label>
            {selectableSites.length === 0 ? (
              <div className={`p-4 rounded-xl border text-center text-xs ${darkMode ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                Aucun autre site disponible. Veuillez d'abord créer un nouveau site d'exploitation dans le Hub (Niveau 1).
              </div>
            ) : (
              <div className="space-y-2">
                {selectableSites.map((site) => (
                  <label
                    key={site.id}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      targetSiteId === site.id
                        ? darkMode
                          ? 'bg-indigo-950/40 border-indigo-500/60 text-white'
                          : 'bg-indigo-50 border-indigo-300 text-indigo-900 shadow-sm'
                        : darkMode
                        ? 'bg-slate-950 border-slate-800 hover:border-slate-700'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="targetSite"
                        value={site.id}
                        checked={targetSiteId === site.id}
                        onChange={(e) => setTargetSiteId(e.target.value)}
                        className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <div>
                        <div className="text-xs font-bold">{site.name}</div>
                        <div className={`text-[11px] flex items-center gap-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                          <MapPin size={11} className="text-emerald-500 shrink-0" />
                          <span>{site.city}</span>
                          {site.manager && <span>• Resp : {site.manager}</span>}
                        </div>
                      </div>
                    </div>
                    {site.is_main && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 uppercase">
                        Principal
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Règle de conservation des données & avertissement */}
          <div className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs ${
            darkMode ? 'bg-amber-950/20 border-amber-800/40 text-amber-300' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <ShieldCheck size={18} className="shrink-0 text-amber-500 mt-0.5" />
            <div className="space-y-1">
              <strong className="block font-bold">Règle de conservation absolue des données :</strong>
              <p className="text-[11px] leading-relaxed">
                Ce déplacement met uniquement à jour le rattachement géographique du secteur.
                Toutes les ventes, dépenses, stocks, créances et données comptables historiques restent rigoureusement intactes sans aucun décalage artificiel.
              </p>
            </div>
          </div>

          {/* Boutons */}
          <div className={`flex items-center justify-end gap-2.5 pt-3 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                darkMode ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || selectableSites.length === 0 || !targetSiteId}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-600/20 disabled:opacity-50"
            >
              {loading ? 'Déplacement en cours...' : 'Confirmer le déplacement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
