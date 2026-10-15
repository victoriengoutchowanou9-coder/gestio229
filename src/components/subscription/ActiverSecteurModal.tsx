// =============================================================================
// GESTIO 229 SaaS — Modale d'Activation d'un Nouveau Secteur (Essai 30j Indépendant)
// =============================================================================
// Règle 3 : Quand on clique sur un secteur sans abonnement :
// "Activer [Secteur] ? C'est votre 1ère activation pour ce secteur. Il bénéficie
// de 30 jours d'essai gratuit INDÉPENDANT. Après ces 30 jours, il rejoindra
// automatiquement votre abonnement global existant."
// =============================================================================

import React, { useState } from 'react';
import { Sparkles, Calendar, CheckCircle2, X, Shield, ArrowRight, Loader2 } from 'lucide-react';
import { activerEssaiIndividuelSecteur } from '../../services/abonnementService';
import { ALL_SECTORS_CATALOG, SectorDefinition } from '../../core/modules/moduleRegistry';
import { canonicalSectorSlug } from '../../lib/sectorClient';

interface ActiverSecteurModalProps {
  isOpen: boolean;
  sectorSlugOrCode: string;
  sectorName?: string;
  companyId: string;
  onClose: () => void;
  onActivated: (sectorSlug: string) => void;
}

export const ActiverSecteurModal: React.FC<ActiverSecteurModalProps> = ({
  isOpen,
  sectorSlugOrCode,
  sectorName,
  companyId,
  onClose,
  onActivated,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const cleanSlug = canonicalSectorSlug(sectorSlugOrCode);
  const meta: SectorDefinition | undefined = ALL_SECTORS_CATALOG.find(
    (s) => s.slug === cleanSlug || s.code === sectorSlugOrCode.toUpperCase()
  );

  const displayName = sectorName || meta?.name || meta?.label || 'Transport & Logistique';
  const emoji = meta?.emoji || '🚀';
  const badge = meta?.badge || 'Sous-logiciel métier';

  const handleActiver = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    const result = await activerEssaiIndividuelSecteur(companyId, cleanSlug, displayName);
    setLoading(false);

    if (result.success) {
      onActivated(cleanSlug);
    } else {
      setError(result.error || "Impossible d'activer l'essai. Veuillez réessayer.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Header Coloré avec Motif */}
        <div className="relative px-6 pt-7 pb-6 bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <span className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-2xl border border-white/20 shadow-inner">
              {emoji}
            </span>
            <div>
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-400 text-slate-950 shadow-sm">
                Essai 30 Jours Gratuit
              </span>
              <h3 className="text-xl font-black tracking-tight text-white mt-1">
                Activer {displayName} ?
              </h3>
            </div>
          </div>

          <p className="text-xs text-emerald-50/90 leading-relaxed">
            Sous-logiciel d'exploitation autonome conforme au standard UEMOA / Bénin.
          </p>
        </div>

        {/* Corps Explicatif Conforme CDC Règle 3 */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
            <p className="text-sm font-semibold text-slate-800 dark:text-emerald-100 leading-relaxed">
              C'est votre <span className="font-black text-emerald-600 dark:text-emerald-400">1ère activation</span> pour ce secteur. Il bénéficie de{' '}
              <span className="font-black text-emerald-600 dark:text-emerald-400">30 jours d'essai gratuit INDÉPENDANT</span>.
            </p>
            <p className="text-xs text-slate-600 dark:text-emerald-200/80 mt-2">
              Après ces 30 jours, il rejoindra automatiquement votre abonnement global existant.
            </p>
          </div>

          {/* Avantages & Conditions */}
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
              <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
              <span>Accès illimité à 100% des modules (Vente, Caisse, Stocks, Trésorerie)</span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
              <Calendar size={15} className="text-emerald-500 shrink-0" />
              <span>30 jours complets sans interruption, même si votre abonnement global expire avant</span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
              <Shield size={15} className="text-emerald-500 shrink-0" />
              <span>Cloisonnement strict des données commerciales et comptables</span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={handleActiver}
            disabled={loading}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                <span>Activation en cours...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Activer l'essai gratuit de 30 jours</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
