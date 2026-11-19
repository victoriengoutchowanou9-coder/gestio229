'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'admin', 'AdminSubscriptions.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// 1. Update lucide imports
if (!c.includes('Search,')) {
  c = c.replace(
    "  CreditCard, RefreshCw, Eye, CheckCircle2, XCircle, Clock,",
    "  CreditCard, RefreshCw, Eye, CheckCircle2, XCircle, Clock, Search, Filter, DollarSign, Sparkles,"
  );
}

// 2. Update activeTab type and declare saaspay state
const oldStateMarker = "  const [activeTab, setActiveTab] = useState<'companies' | 'payments' | 'settings'>('companies')";
const newStateMarker = `  const [activeTab, setActiveTab] = useState<'companies' | 'payments' | 'saaspay' | 'settings'>('companies')
  const [saaspayTransactions, setSaaspayTransactions] = useState<any[]>([])
  const [saaspaySearch, setSaaspaySearch] = useState('')
  const [saaspayStatusFilter, setSaaspayStatusFilter] = useState<'all' | 'successful' | 'pending' | 'failed'>('all')
  const [saaspayPeriodFilter, setSaaspayPeriodFilter] = useState<'all' | 'this_month' | 'last_3_months'>('all')
  const [checkingSaaspayId, setCheckingSaaspayId] = useState<string | null>(null)`;

c = c.replace(oldStateMarker, newStateMarker);

// 3. Update loadSubscriptionDetails to query saaspay_transactions
const oldLoadMarker = `      const [{ data: gRows }, { data: sRows }, reqs, settings] = await Promise.all([
        supabase.from('abonnements_global').select('*'),
        supabase.from('abonnements_secteurs').select('*').order('created_at', { ascending: true }),
        listerDemandesPaiementManuel(),
        getParametresPaiementManuel(),
      ])`;

const newLoadMarker = `      const [{ data: gRows }, { data: sRows }, reqs, settings, { data: spRows }] = await Promise.all([
        supabase.from('abonnements_global').select('*'),
        supabase.from('abonnements_secteurs').select('*').order('created_at', { ascending: true }),
        listerDemandesPaiementManuel(),
        getParametresPaiementManuel(),
        supabase.from('saaspay_transactions').select('*').order('created_at', { ascending: false }),
      ])
      if (spRows) setSaaspayTransactions(spRows)`;

c = c.replace(oldLoadMarker, newLoadMarker);

// 4. Add handleCheckSaaspayStatus
const handleSaveMarker = "  const handleSaveManualSettings = async (e: React.FormEvent) => {";
const checkHandler = `  const handleCheckSaaspayStatus = async (ref: string, sessionId?: string) => {
    setCheckingSaaspayId(ref || sessionId || '')
    try {
      const q = new URLSearchParams()
      if (ref) q.set('ref', ref)
      if (sessionId) q.set('session_id', sessionId)
      const res = await fetch(\`/api/saaspay-webhook?\${q.toString()}\`)
      const data = await res.json()
      if (data?.success) {
        setFeedback({
          type: 'success',
          text: \`Transaction \${ref} synchronisée : \${data.message || data.status}\`,
        })
        await loadSubscriptionDetails()
      } else {
        setFeedback({
          type: 'error',
          text: data?.error || data?.message || 'Statut non mis à jour.',
        })
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: e.message || 'Erreur réseau.' })
    } finally {
      setCheckingSaaspayId(null)
    }
  }

  const handleSaveManualSettings = async (e: React.FormEvent) => {`;

c = c.replace(handleSaveMarker, checkHandler);

// 5. Add tab button for SaaS Pay
const tabSettingsMarker = `        <button
          onClick={() => setActiveTab('settings')}`;

const saaspayTabButton = `        <button
          onClick={() => setActiveTab('saaspay')}
          className={\`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition \${
            activeTab === 'saaspay'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }\`}
        >
          <Sparkles className="w-4 h-4 text-emerald-400" />
          Paiements SaaS Pay (\${saaspayTransactions.length})
          {saaspayTransactions.filter((t) => t.status === 'pending').length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold">
              \${saaspayTransactions.filter((t) => t.status === 'pending').length} en attente
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('settings')}`;

c = c.replace(tabSettingsMarker, saaspayTabButton);

// 6. Add activeTab === 'saaspay' UI right after activeTab === 'settings' form
const settingsEndMarker = `          <div className="flex justify-end">
            <button
              type="submit"
              disabled={processingAction}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Save className="w-4 h-4" />
              Enregistrer les coordonnées
            </button>
          </div>
        </form>
      )}`;

const saaspayTabContent = `          <div className="flex justify-end">
            <button
              type="submit"
              disabled={processingAction}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
            >
              <Save className="w-4 h-4" />
              Enregistrer les coordonnées
            </button>
          </div>
        </form>
      )}

      {/* ONGLET 4 : SUIVI DES PAIEMENTS SAAS PAY (Section 6 du cahier des charges) */}
      {activeTab === 'saaspay' && (() => {
        // Calcul des KPI strictement basés sur la documentation
        const successfulTxs = saaspayTransactions.filter((t) => t.status === 'successful')
        const pendingTxs = saaspayTransactions.filter((t) => t.status === 'pending')
        const failedTxs = saaspayTransactions.filter((t) => t.status === 'failed' || t.status === 'cancelled')
        // Les montants encaissés proviennent UNIQUEMENT des transactions confirmées (Section 6)
        const totalRevenueConfirmed = successfulTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0)

        // Filtrage dynamique
        const filteredSaaspayTxs = saaspayTransactions.filter((t) => {
          // Statut
          if (saaspayStatusFilter !== 'all') {
            if (saaspayStatusFilter === 'successful' && t.status !== 'successful') return false
            if (saaspayStatusFilter === 'pending' && t.status !== 'pending') return false
            if (saaspayStatusFilter === 'failed' && (t.status === 'successful' || t.status === 'pending')) return false
          }
          // Période
          if (saaspayPeriodFilter !== 'all') {
            const txDate = new Date(t.created_at || t.paid_at || Date.now())
            const now = new Date()
            if (saaspayPeriodFilter === 'this_month') {
              if (txDate.getMonth() !== now.getMonth() || txDate.getFullYear() !== now.getFullYear()) return false
            } else if (saaspayPeriodFilter === 'last_3_months') {
              const threeMonthsAgo = new Date()
              threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
              if (txDate < threeMonthsAgo) return false
            }
          }
          // Recherche entreprise ou référence
          if (saaspaySearch.trim()) {
            const q = saaspaySearch.toLowerCase().trim()
            const matchName = (t.company_name || '').toLowerCase().includes(q)
            const matchId = (t.company_id || '').toLowerCase().includes(q)
            const matchRef = (t.transaction_reference || '').toLowerCase().includes(q)
            const matchSession = (t.checkout_session_id || '').toLowerCase().includes(q)
            if (!matchName && !matchId && !matchRef && !matchSession) return false
          }
          return true
        })

        return (
          <div className="space-y-5">
            {/* 4 Indicateurs KPI Clés (Section 6) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
                <span className="text-[10px] font-bold uppercase text-emerald-400 block mb-1">
                  Paiements Réussis
                </span>
                <p className="text-2xl font-black text-white font-mono">{successfulTxs.length}</p>
                <span className="text-[10px] text-slate-400">Transactions confirmées</span>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
                <span className="text-[10px] font-bold uppercase text-amber-400 block mb-1">
                  Paiements En Attente
                </span>
                <p className="text-2xl font-black text-amber-300 font-mono">{pendingTxs.length}</p>
                <span className="text-[10px] text-slate-400">En cours opérateur</span>
              </div>

              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
                <span className="text-[10px] font-bold uppercase text-rose-400 block mb-1">
                  Paiements Échoués
                </span>
                <p className="text-2xl font-black text-rose-400 font-mono">{failedTxs.length}</p>
                <span className="text-[10px] text-slate-400">Annulés ou non aboutis</span>
              </div>

              <div className="p-4 bg-slate-900 border border-emerald-500/40 rounded-2xl shadow-sm bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/40">
                <span className="text-[10px] font-bold uppercase text-emerald-300 block mb-1">
                  Chiffre d'Affaires Encaissé
                </span>
                <p className="text-2xl font-black text-emerald-400 font-mono">
                  {totalRevenueConfirmed.toLocaleString('fr-FR')} FCFA
                </p>
                <span className="text-[10px] text-emerald-500/80">Confirmé SaaS Pay uniquement</span>
              </div>
            </div>

            {/* Barre de Recherche et Filtres */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between">
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={saaspaySearch}
                  onChange={(e) => setSaaspaySearch(e.target.value)}
                  placeholder="Rechercher entreprise, ID ou référence..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto flex-wrap justify-end">
                {/* Filtre Statut */}
                <select
                  value={saaspayStatusFilter}
                  onChange={(e) => setSaaspayStatusFilter(e.target.value as any)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="successful">🟢 Réussi uniquement</option>
                  <option value="pending">🟡 En attente uniquement</option>
                  <option value="failed">🔴 Échoué / Annulé</option>
                </select>

                {/* Filtre Période */}
                <select
                  value={saaspayPeriodFilter}
                  onChange={(e) => setSaaspayPeriodFilter(e.target.value as any)}
                  className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 font-semibold focus:outline-none focus:border-emerald-500"
                >
                  <option value="all">Toutes les périodes</option>
                  <option value="this_month">Ce mois-ci</option>
                  <option value="last_3_months">3 derniers mois</option>
                </select>

                <button
                  type="button"
                  onClick={handleRefreshAll}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Actualiser
                </button>
              </div>
            </div>

            {/* Tableau complet des transactions SaaS Pay */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 border-b border-slate-800 font-bold uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Entreprise</th>
                      <th className="px-4 py-3">Réf. Transaction</th>
                      <th className="px-4 py-3 text-right">Montant</th>
                      <th className="px-4 py-3">Date & Heure</th>
                      <th className="px-4 py-3">Moyen / Opérateur</th>
                      <th className="px-4 py-3 text-center">Statut</th>
                      <th className="px-4 py-3">Expiration Abonnement</th>
                      <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredSaaspayTxs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-slate-500">
                          Aucune transaction SaaS Pay enregistrée pour les filtres sélectionnés.
                        </td>
                      </tr>
                    ) : (
                      filteredSaaspayTxs.map((t) => {
                        const isSuccess = t.status === 'successful'
                        const isPending = t.status === 'pending'
                        const isChecking = checkingSaaspayId === t.transaction_reference

                        return (
                          <tr key={t.id} className="hover:bg-slate-800/40 transition">
                            <td className="px-4 py-3">
                              <p className="font-bold text-white text-sm">{t.company_name}</p>
                              <p className="font-mono text-[10px] text-slate-500 truncate max-w-[180px]" title={t.company_id}>
                                ID : {t.company_id}
                              </p>
                            </td>

                            <td className="px-4 py-3 font-mono font-semibold text-emerald-300 text-[11px]">
                              {t.transaction_reference}
                            </td>

                            <td className="px-4 py-3 text-right font-mono font-black text-sm text-white">
                              {Number(t.amount).toLocaleString('fr-FR')} FCFA
                            </td>

                            <td className="px-4 py-3 text-slate-400 text-[11px]">
                              {t.paid_at || t.created_at
                                ? new Date(t.paid_at || t.created_at).toLocaleString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                : '—'}
                            </td>

                            <td className="px-4 py-3 font-medium text-slate-300">
                              <span className="capitalize">{t.payment_operator || t.payment_method || 'SaaS Pay'}</span>
                            </td>

                            <td className="px-4 py-3 text-center">
                              {isSuccess ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  Réussi
                                </span>
                              ) : isPending ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                  <Clock className="w-3 h-3 text-amber-400 animate-spin" />
                                  En attente
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                  <XCircle className="w-3 h-3 text-rose-400" />
                                  Échoué
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 font-mono text-[11px] text-slate-300">
                              {t.subscription_extended_until
                                ? new Date(t.subscription_extended_until).toLocaleDateString('fr-BJ')
                                : '—'}
                            </td>

                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleCheckSaaspayStatus(t.transaction_reference, t.checkout_session_id)}
                                disabled={isChecking}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-[10px] font-bold transition border border-slate-700 inline-flex items-center gap-1"
                                title="Vérifier auprès de SaaS Pay"
                              >
                                {isChecking ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                <span>Vérifier</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      })()}`;

c = c.replace(settingsEndMarker, saaspayTabContent);

fs.writeFileSync(filePath, c, 'utf8');
console.log('AdminSubscriptions.tsx patched successfully with SaaS Pay tab!');
