// =============================================================================
// GESTIO 229 SAAS — Modal : Vider les données d'un secteur d'activité
// Double confirmation explicite (nom du secteur)
// Permet de repartir sur une base propre sans impacter l'entreprise,
// ses utilisateurs, son abonnement, ni les autres secteurs.
// =============================================================================

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, RefreshCw, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ActivityEntry } from '../../views/hub/MultiservicesHub';

interface ClearSectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  activity: ActivityEntry | null;
  companyId: string;
  darkMode?: boolean;
}

export const ClearSectorModal: React.FC<ClearSectorModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  activity,
  companyId,
  darkMode = true,
}) => {
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  if (!isOpen || !activity) return null;

  // Nom attendu pour la confirmation : le nom de l'établissement ou le libellé du secteur
  const expectedName = activity.name || activity.sectorLabel || activity.sectorSlug;
  const isInputValid =
    confirmationInput.trim().toLowerCase() === expectedName.trim().toLowerCase() ||
    confirmationInput.trim().toLowerCase() === activity.sectorLabel.trim().toLowerCase() ||
    confirmationInput.trim().toLowerCase() === activity.sectorSlug.trim().toLowerCase();

  const handleConfirmClear = async () => {
    if (!isInputValid || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // Récupérer le token de session Supabase pour sécuriser l'appel
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || '';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch('/api/company-clear-sector', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          company_id: companyId,
          activity_id: activity.id,
          sector_slug: activity.sectorSlug,
          confirmation_name: confirmationInput.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Erreur lors du vidage des données du secteur.');
      }

      setSuccessMessage(
        result.message ||
          'Le secteur a été vidé avec succès. Vous pouvez maintenant commencer à enregistrer vos propres informations.'
      );

      // Invalider les caches locaux éventuels
      try {
        localStorage.removeItem(`gestio229_metrics_${companyId}`);
        localStorage.removeItem(`gestio229_stats_${activity.id}`);
      } catch (_) {}

      // Émettre les événements de mise à jour pour que le Hub et les pages se rafraîchissent
      window.dispatchEvent(new CustomEvent('sector_data_cleared', { detail: { sectorSlug: activity.sectorSlug, activityId: activity.id } }));
      window.dispatchEvent(new Event('sector_changed'));

      setTimeout(() => {
        setIsSubmitting(false);
        setConfirmationInput('');
        setSuccessMessage('');
        onSuccess();
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('[ClearSectorModal] Erreur:', err);
      setErrorMessage(err.message || 'Impossible de vider le secteur. Veuillez réessayer.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden transition-all ${
          darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* En-tête */}
        <div
          className={`flex items-center justify-between px-6 py-4 border-b ${
            darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Trash2 size={20} />
            </div>
            <div>
              <h3 className="text-base font-black uppercase tracking-tight text-amber-500">
                VIDER LES DONNÉES DU SECTEUR ?
              </h3>
              <p className="text-xs text-slate-400">
                {activity.name} • {activity.sectorLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Corps */}
        <div className="p-6 space-y-4">
          {successMessage ? (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-start gap-3">
              <CheckCircle2 size={22} className="shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold">Opération réussie</h4>
                <p className="text-xs mt-1 text-emerald-300/90">{successMessage}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Message officiel */}
              <div
                className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2.5 ${
                  darkMode ? 'bg-amber-950/20 border-amber-800/40 text-amber-200/90' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-center gap-2 font-bold text-amber-500 uppercase tracking-wide">
                  <AlertTriangle size={15} />
                  <span>Avertissement important</span>
                </div>
                <p>
                  Vous êtes sur le point de supprimer les données opérationnelles de ce secteur d'activité. Cette opération permettra de recommencer avec vos propres informations.
                </p>
                <p className="font-semibold text-rose-400">
                  Attention : cette action est irréversible. Assurez-vous d'avoir effectué une sauvegarde si nécessaire.
                </p>
              </div>

              {/* Ce qui est purgé vs ce qui est préservé */}
              <div
                className={`p-3.5 rounded-xl border text-[11px] space-y-1.5 ${
                  darkMode ? 'bg-slate-950/70 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <div className="font-semibold text-slate-400 uppercase tracking-wider text-[10px]">
                  Périmètre de suppression :
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400">
                  <li><span className="text-rose-400 font-medium">Supprimé :</span> Ventes, stocks, articles, opérations de caisse et dépenses de ce secteur.</li>
                  <li><span className="text-emerald-400 font-medium">Préservé :</span> Votre compte entreprise, vos employés, votre abonnement et les autres secteurs.</li>
                </ul>
              </div>

              {/* Champ de confirmation */}
              <div className="space-y-2 pt-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Pour confirmer, tapez le nom du secteur :{' '}
                  <span className="font-mono font-bold text-amber-400 select-all">
                    {expectedName}
                  </span>
                </label>
                <input
                  type="text"
                  value={confirmationInput}
                  onChange={(e) => setConfirmationInput(e.target.value)}
                  placeholder={`Tapez "${expectedName}"`}
                  disabled={isSubmitting}
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium border outline-none transition-all ${
                    darkMode
                      ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                      : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-amber-500 focus:ring-1 focus:ring-amber-500'
                  }`}
                  autoFocus
                />
              </div>

              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                  {errorMessage}
                </div>
              )}
            </>
          )}
        </div>

        {/* Pied de page / Boutons */}
        <div
          className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${
            darkMode ? 'border-slate-800 bg-slate-950/60' : 'border-slate-100 bg-slate-50'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors border ${
              darkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
          >
            Annuler
          </button>

          {!successMessage && (
            <button
              type="button"
              onClick={handleConfirmClear}
              disabled={!isInputValid || isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                isInputValid && !isSubmitting
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30 cursor-pointer active:scale-95'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Vidage en cours...</span>
                </>
              ) : (
                <>
                  <Trash2 size={13} />
                  <span>Confirmer et vider le secteur</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
