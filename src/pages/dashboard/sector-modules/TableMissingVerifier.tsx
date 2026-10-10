// =============================================================================
// GESTIO 229 — Composant d'assistance interactif : Vérificateur de tables
// =============================================================================

import React, { useState } from 'react'
import { Database, Copy, Check, ExternalLink, RefreshCw, AlertCircle, ShieldAlert } from 'lucide-react'
import { useUIStore } from '../../../store/uiStore'

interface TableMissingVerifierProps {
  tableName: string
  moduleTitle: string
  sectorSlug: string
  fields?: Array<{ key: string; type?: string; money?: boolean }>
  onRetry: () => void
  isRetrying: boolean
}

export const TableMissingVerifier: React.FC<TableMissingVerifierProps> = ({
  tableName,
  moduleTitle,
  sectorSlug,
  fields,
  onRetry,
  isRetrying,
}) => {
  const [copied, setCopied] = useState(false)
  const [showSql, setShowSql] = useState(false)
  const { toast } = useUIStore() as any

  // Génération dynamique des colonnes métier
  const columnsSql = (fields || [])
    .map((f) => {
      let sqlType = 'TEXT'
      if (f.type === 'number' || f.money) sqlType = 'NUMERIC(15,2) DEFAULT 0'
      else if (f.type === 'boolean') sqlType = 'BOOLEAN DEFAULT FALSE'
      else if (f.type === 'date') sqlType = 'DATE DEFAULT CURRENT_DATE'
      return `    ${f.key} ${sqlType},`
    })
    .join('\n')

  const alterColumnsSql = (fields || [])
    .map((f) => {
      let sqlType = 'TEXT'
      if (f.type === 'number' || f.money) sqlType = 'NUMERIC(15,2) DEFAULT 0'
      else if (f.type === 'boolean') sqlType = 'BOOLEAN DEFAULT FALSE'
      else if (f.type === 'date') sqlType = 'DATE DEFAULT CURRENT_DATE'
      return `ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS ${f.key} ${sqlType};`
    })
    .join('\n')

  // Script SQL complet avec toutes les colonnes requises
  const singleTableSql = `-- ==============================================================================
-- CRÉATION COMPLÈTE DE LA TABLE ${tableName} POUR GESTIO 229
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.${tableName} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT DEFAULT '${sectorSlug}',
${columnsSql}
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT '${sectorSlug}';
ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.${tableName} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
${alterColumnsSql}

ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.${tableName};
CREATE POLICY "company_isolation" ON public.${tableName} FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE INDEX IF NOT EXISTS idx_${tableName}_c_s ON public.${tableName}(company_id, sector_slug);`

  const handleCopy = () => {
    navigator.clipboard.writeText(singleTableSql)
    setCopied(true)
    if (toast?.success) toast.success(`SQL pour « ${tableName} » copié dans le presse-papier !`)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200/80 rounded-3xl p-6 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-3 bg-amber-100 text-amber-700 rounded-2xl flex-shrink-0">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-slate-900">
                Table de données manquante : <code className="text-rose-600 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">{tableName}</code>
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-200 text-amber-900">
                Module {moduleTitle}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Cette table n'a pas encore été initialisée dans votre base de données Supabase.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
          <button
            onClick={handleCopy}
            className="flex-1 sm:flex-initial px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copié !' : 'Copier le SQL de cette table'}
          </button>
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin text-emerald-600' : ''}`} />
            Vérifier à nouveau
          </button>
        </div>
      </div>

      {/* Guide étape par étape */}
      <div className="bg-white/80 rounded-2xl p-4 border border-amber-200/50 space-y-2 text-xs text-slate-700">
        <p className="font-bold text-slate-900 flex items-center gap-1.5">
          <AlertCircle className="w-4 h-4 text-amber-600" />
          Comment activer ce module en 30 secondes :
        </p>
        <ol className="list-decimal list-inside space-y-1 pl-1 text-slate-600">
          <li>
            Connectez-vous à votre tableau de bord <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-emerald-700 font-bold underline inline-flex items-center gap-0.5">Supabase <ExternalLink className="w-3 h-3 inline" /></a>.
          </li>
          <li>
            Cliquez sur le menu <strong>SQL Editor</strong> à gauche, puis sur <strong>New query</strong>.
          </li>
          <li>
            Cliquez sur le bouton <strong>"Copier le SQL de cette table"</strong> ci-dessus (ou copiez le script global <code>database/M030_sector_specific_tables.sql</code>).
          </li>
          <li>
            Collez dans l'éditeur Supabase et cliquez sur <strong>Run</strong>.
          </li>
          <li>
            Revenez ici et cliquez sur <strong>"Vérifier à nouveau"</strong> : la page deviendra immédiatement active.
          </li>
        </ol>
      </div>

      {/* Aperçu du code SQL repliable */}
      <div className="pt-1">
        <button
          onClick={() => setShowSql(!showSql)}
          className="text-[11px] font-bold text-slate-500 hover:text-slate-800 underline"
        >
          {showSql ? 'Masquer le script SQL' : 'Afficher le script SQL à exécuter'}
        </button>
        {showSql && (
          <pre className="mt-2 p-3 bg-slate-900 text-emerald-400 rounded-xl text-[11px] font-mono overflow-x-auto border border-slate-800">
            {singleTableSql}
          </pre>
        )}
      </div>
    </div>
  )
}
export default TableMissingVerifier
