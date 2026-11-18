'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'utilisateurs', 'UtilisateursPage.tsx');
let c = fs.readFileSync(filePath, 'utf8');

// ─── 1. INSERT RAPPORTS TAB BEFORE AUDIT TAB ───────────────────────────────
const auditTabMarker = "      {/* ONGLET 3: SÉCURITÉ & AUDIT */}";
const auditTabPos = c.indexOf(auditTabMarker);
if (auditTabPos === -1) { console.error('Audit marker not found'); process.exit(1); }

const rapportsTab = `      {/* ONGLET "RAPPORTS & RENTABILITE RH" */}
      {activeTab === 'rapports' && (() => {
        // Synthèse par secteur depuis allStaffList et payrollPayments pour le mois sélectionné
        const sectorMap: Record<string, {
          sectorName: string; headcount: number;
          salarialBrut: number; cnssPatronale: number; salarialNet: number;
          advances: number; loans: number; repayments: number;
        }> = {}

        allStaffList.forEach((emp) => {
          const slug = emp.sectorSlug || 'general'
          if (!sectorMap[slug]) sectorMap[slug] = {
            sectorName: emp.sectorName || slug, headcount: 0,
            salarialBrut: 0, cnssPatronale: 0, salarialNet: 0,
            advances: 0, loans: 0, repayments: 0,
          }
          const e = sectorMap[slug]
          e.headcount++
          const gross = emp.baseSalary + emp.transportAllowance + emp.housingAllowance + emp.bonus
          const cnssSal = Math.round(gross * 0.036)
          const cnssPatr = Math.round(gross * 0.164)
          const vps = Math.round(gross * 0.04)
          const paidRec = payrollPayments.find((p) => p.employeeId === emp.id && p.period === payrollPeriod)
          e.salarialBrut += gross
          e.cnssPatronale += cnssPatr + vps
          e.salarialNet += paidRec ? (paidRec.netSalary || 0) : Math.max(0, gross - cnssSal)
        })

        const sectorRows = Object.values(sectorMap)
        const totalBrut = sectorRows.reduce((s, r) => s + r.salarialBrut, 0)
        const totalNet = sectorRows.reduce((s, r) => s + r.salarialNet, 0)
        const totalCharges = sectorRows.reduce((s, r) => s + r.cnssPatronale, 0)
        const totalStaff = sectorRows.reduce((s, r) => s + r.headcount, 0)

        return (
          <div className="space-y-6">
            {/* En-tête */}
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-indigo-600" />
                    Rapports de Paie &amp; Rentabilité RH
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Synthèse mensuelle par secteur d&apos;activité — Période : <strong>{payrollPeriod}</strong></p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={payrollPeriod}
                    onChange={(e) => setPayrollPeriod(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const d = new Date(); d.setMonth(d.getMonth() - i)
                      const val = d.toISOString().slice(0, 7)
                      return <option key={val} value={val}>{val}</option>
                    })}
                  </select>
                </div>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">Effectif Total</span>
                <p className="text-2xl font-black text-slate-900">{totalStaff}</p>
                <span className="text-[10px] text-slate-400">{sectorRows.length} secteur(s)</span>
              </div>
              <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-indigo-700 block mb-1">Masse Salariale Brute</span>
                <p className="text-xl font-black text-indigo-900 font-mono">{fmt(totalBrut)}</p>
                <span className="text-[10px] text-indigo-500">Total bruts imposables</span>
              </div>
              <div className="p-4 bg-rose-50 rounded-xl border border-rose-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-rose-700 block mb-1">Charges Patronales</span>
                <p className="text-xl font-black text-rose-900 font-mono">{fmt(totalCharges)}</p>
                <span className="text-[10px] text-rose-500">CNSS 16,4% + VPS 4%</span>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 shadow-sm">
                <span className="text-[10px] font-bold uppercase text-emerald-700 block mb-1">Total Net à Payer</span>
                <p className="text-xl font-black text-emerald-900 font-mono">{fmt(totalNet)}</p>
                <span className="text-[10px] text-emerald-600">Après cotisations salariales</span>
              </div>
            </div>

            {/* Tableau par secteur */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <h4 className="font-black text-slate-800 text-sm">Détail par Secteur d&apos;Activité</h4>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition no-print"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Imprimer
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 border-b border-slate-200 font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="px-4 py-3">Secteur</th>
                      <th className="px-4 py-3 text-center">Effectif</th>
                      <th className="px-4 py-3 text-right">Brut Total</th>
                      <th className="px-4 py-3 text-right">Net Total</th>
                      <th className="px-4 py-3 text-right">Charges Patron.</th>
                      <th className="px-4 py-3 text-right">Coût RH Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sectorRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-slate-400">
                          Aucun employé rattaché pour cette période
                        </td>
                      </tr>
                    ) : (
                      sectorRows.map((row, idx) => {
                        const coutRH = row.salarialNet + row.cnssPatronale
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition">
                            <td className="px-4 py-3">
                              <span className="font-bold text-slate-900">{row.sectorName}</span>
                              <span className="text-[10px] text-slate-400 block">Secteur d&apos;activité</span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-slate-800">{row.headcount}</td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">{fmt(row.salarialBrut)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{fmt(row.salarialNet)}</td>
                            <td className="px-4 py-3 text-right font-mono text-rose-600">{fmt(row.cnssPatronale)}</td>
                            <td className="px-4 py-3 text-right font-mono font-black text-slate-900">{fmt(coutRH)}</td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white text-xs font-bold">
                    <tr>
                      <td className="px-4 py-3">TOTAL ENTREPRISE</td>
                      <td className="px-4 py-3 text-center">{totalStaff}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(totalBrut)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-400">{fmt(totalNet)}</td>
                      <td className="px-4 py-3 text-right font-mono text-rose-400">{fmt(totalCharges)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-400">{fmt(totalNet + totalCharges)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-[11px] text-slate-500">
                <strong>Formule Marge Nette Secteur :</strong> Marge Brute – Dépenses Hors RH – Salaires Nets – Charges Patronales
                <br />Les remboursements d&apos;avances/prêts sont comptabilisés en créances (compte 422) et n&apos;affectent pas la marge nette une seconde fois.
              </div>
            </div>
          </div>
        )
      })()}

`;

c = c.substring(0, auditTabPos) + rapportsTab + c.substring(auditTabPos);
console.log('Rapports tab inserted. File lines:', c.split('\n').length);

// ─── 2. INSERT AVANCES & PRETS MODAL BEFORE SALARY MODAL ───────────────────
const payModalMarker = "{/* ══ MODAL PAYER LE SALAIRE ═══════════════════════════════════════════ */}";
const payModalPos = c.indexOf(payModalMarker);
if (payModalPos === -1) { console.error('Pay modal marker not found!'); process.exit(1); }

const avancesModal = `{/* ══ MODAL AVANCES & PRÊTS ══════════════════════════════════════════════ */}
      {selectedStaffForDebt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center font-bold text-indigo-800">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Avances &amp; Prêts</h3>
                  <p className="text-xs text-slate-500">{selectedStaffForDebt.fullName} — {selectedStaffForDebt.jobTitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {debtSummary && (debtSummary.totalAdvancesDue + debtSummary.totalLoansDue) > 0 && (
                  <span className="px-3 py-1 bg-rose-100 text-rose-800 text-xs font-black rounded-full border border-rose-300">
                    Dette totale : {fmt(debtSummary.totalAdvancesDue + debtSummary.totalLoansDue)}
                  </span>
                )}
                <button type="button" onClick={() => setSelectedStaffForDebt(null)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="px-6 pt-4 flex gap-2 border-b border-slate-100 pb-0">
              {(['avances', 'prets', 'historique'] as const).map((st) => (
                <button key={st} type="button" onClick={() => setDebtActiveSubTab(st)}
                  className={\`px-4 py-2 text-xs font-bold rounded-t-xl border-b-2 transition \${debtActiveSubTab === st
                    ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                    : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>
                  {st === 'avances' ? 'Avances sur Salaire' : st === 'prets' ? 'Prêts Accordés' : 'Historique Remboursements'}
                </button>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {debtLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* ─── SUB-TAB: AVANCES ─── */}
                  {debtActiveSubTab === 'avances' && (
                    <div className="space-y-4">
                      {/* Liste des avances actives */}
                      {staffAdvances.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm">Aucune avance sur salaire enregistrée</div>
                      ) : (
                        <div className="space-y-2">
                          {staffAdvances.map((av: any) => (
                            <div key={av.id} className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs flex justify-between items-center">
                              <div>
                                <p className="font-bold text-amber-900">{av.motif || 'Avance sur salaire'}</p>
                                <p className="text-amber-600">{av.date_avance} · {av.mode_decaissement}</p>
                              </div>
                              <div className="text-right">
                                <p className="font-mono font-black text-rose-700">{fmt(av.montant)}</p>
                                <span className={\`text-[10px] px-2 py-0.5 rounded-full font-bold \${av.statut === 'rembourse' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}\`}>
                                  {av.statut === 'rembourse' ? 'Soldé' : 'En cours'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulaire nouvelle avance */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Accorder une Nouvelle Avance</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Montant (F CFA) *</label>
                            <input type="number" min={0} step={500} value={advanceForm.montant}
                              onChange={(e) => setAdvanceForm((p) => ({ ...p, montant: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                              placeholder="Ex: 25000" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Date</label>
                            <input type="date" value={advanceForm.date_avance}
                              onChange={(e) => setAdvanceForm((p) => ({ ...p, date_avance: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Motif</label>
                          <input type="text" value={advanceForm.motif}
                            onChange={(e) => setAdvanceForm((p) => ({ ...p, motif: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                            placeholder="Ex: Urgence médicale" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Mode de Décaissement</label>
                          <select value={advanceForm.mode_decaissement}
                            onChange={(e) => setAdvanceForm((p) => ({ ...p, mode_decaissement: e.target.value as any }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
                            <option value="especes">Espèces</option>
                            <option value="virement">Virement</option>
                            <option value="momo">Mobile Money</option>
                            <option value="cheque">Chèque</option>
                          </select>
                        </div>
                        <div className="flex justify-end">
                          <button type="button" disabled={savingDebt || !advanceForm.montant}
                            onClick={() => handleCreateAdvance(selectedStaffForDebt)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                            {savingDebt ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Enregistrer l&apos;Avance
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── SUB-TAB: PRÊTS ─── */}
                  {debtActiveSubTab === 'prets' && (
                    <div className="space-y-4">
                      {staffLoans.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm">Aucun prêt accordé à cet employé</div>
                      ) : (
                        <div className="space-y-2">
                          {staffLoans.map((loan: any) => (
                            <div key={loan.id} className="p-3 bg-indigo-50 rounded-xl border border-indigo-200 text-xs">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-indigo-900">{loan.motif || 'Prêt personnel'}</p>
                                  <p className="text-indigo-600">{loan.date_octroi} · {loan.duree_mois} mois · Mensualité {fmt(loan.mensualite)}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-mono font-black text-indigo-800">{fmt(loan.montant_total)}</p>
                                  <p className="text-[10px] text-rose-600 font-bold">Reste : {fmt(loan.solde_restant || loan.montant_total)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulaire nouveau prêt */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                        <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Accorder un Nouveau Prêt</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Montant Total *</label>
                            <input type="number" min={0} step={1000} value={loanForm.montant_total}
                              onChange={(e) => setLoanForm((p) => ({ ...p, montant_total: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Ex: 150000" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Durée (mois)</label>
                            <input type="number" min={1} max={60} value={loanForm.duree_mois}
                              onChange={(e) => setLoanForm((p) => ({ ...p, duree_mois: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Mensualité (F CFA)</label>
                            <input type="number" min={0} step={500}
                              value={loanForm.mensualite || (loanForm.montant_total && loanForm.duree_mois ? Math.ceil(Number(loanForm.montant_total) / Number(loanForm.duree_mois)).toString() : '')}
                              onChange={(e) => setLoanForm((p) => ({ ...p, mensualite: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none" placeholder="Auto-calculé" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Début Remboursement</label>
                            <input type="date" value={loanForm.date_debut_remboursement}
                              onChange={(e) => setLoanForm((p) => ({ ...p, date_debut_remboursement: e.target.value }))}
                              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Motif</label>
                          <input type="text" value={loanForm.motif}
                            onChange={(e) => setLoanForm((p) => ({ ...p, motif: e.target.value }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">Mode de Décaissement</label>
                          <select value={loanForm.mode_decaissement}
                            onChange={(e) => setLoanForm((p) => ({ ...p, mode_decaissement: e.target.value as any }))}
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white">
                            <option value="especes">Espèces</option>
                            <option value="virement">Virement</option>
                            <option value="momo">Mobile Money</option>
                            <option value="cheque">Chèque</option>
                          </select>
                        </div>
                        <div className="flex justify-end">
                          <button type="button" disabled={savingDebt || !loanForm.montant_total}
                            onClick={() => handleCreateLoan(selectedStaffForDebt)}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                            {savingDebt ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                            Enregistrer le Prêt
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ─── SUB-TAB: HISTORIQUE ─── */}
                  {debtActiveSubTab === 'historique' && (
                    <div className="space-y-4">
                      {staffRepayments.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-sm">Aucun remboursement enregistré</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs text-slate-600">
                            <thead className="bg-slate-50 font-bold text-slate-500 uppercase border-b border-slate-200">
                              <tr>
                                <th className="px-3 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Type</th>
                                <th className="px-3 py-2 text-right">Montant</th>
                                <th className="px-3 py-2 text-left">Mode</th>
                                <th className="px-3 py-2 text-left">Notes</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {staffRepayments.map((rep: any) => (
                                <tr key={rep.id} className="hover:bg-slate-50">
                                  <td className="px-3 py-2 font-mono">{rep.date_remboursement || rep.date_paiement}</td>
                                  <td className="px-3 py-2">
                                    <span className={\`px-2 py-0.5 rounded-full text-[10px] font-bold \${rep.type_dette === 'avance' ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-800'}\`}>
                                      {rep.type_dette === 'avance' ? 'Avance' : 'Prêt'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">{fmt(rep.montant)}</td>
                                  <td className="px-3 py-2 capitalize">{rep.mode_paiement || '—'}</td>
                                  <td className="px-3 py-2 text-slate-400">{rep.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Formulaire remboursement manuel */}
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3">
                        <p className="text-xs font-black text-emerald-800 uppercase tracking-wider">Enregistrer un Remboursement Manuel</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-emerald-800 mb-1">Type de Dette</label>
                            <select value={repayForm.type_dette}
                              onChange={(e) => setRepayForm((p) => ({ ...p, type_dette: e.target.value as any }))}
                              className="w-full px-3 py-2 border border-emerald-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                              <option value="avance">Avance sur salaire</option>
                              <option value="pret">Prêt accordé</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-emerald-800 mb-1">Montant (F CFA)</label>
                            <input type="number" min={0} step={500} value={repayForm.montant}
                              onChange={(e) => setRepayForm((p) => ({ ...p, montant: e.target.value }))}
                              className="w-full px-3 py-2 border border-emerald-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Ex: 15000" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-emerald-800 mb-1">Mode de Paiement</label>
                            <select value={repayForm.mode_paiement}
                              onChange={(e) => setRepayForm((p) => ({ ...p, mode_paiement: e.target.value as any }))}
                              className="w-full px-3 py-2 border border-emerald-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                              <option value="especes">Espèces</option>
                              <option value="virement">Virement</option>
                              <option value="momo">Mobile Money</option>
                              <option value="cheque">Chèque</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold uppercase text-emerald-800 mb-1">Notes</label>
                            <input type="text" value={repayForm.notes}
                              onChange={(e) => setRepayForm((p) => ({ ...p, notes: e.target.value }))}
                              className="w-full px-3 py-2 border border-emerald-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Remarque optionnelle" />
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <button type="button" disabled={savingDebt || !repayForm.montant}
                            onClick={() => handleRecordRepayment(selectedStaffForDebt)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-sm flex items-center gap-1.5 disabled:opacity-50">
                            {savingDebt ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Enregistrer le Remboursement
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      `;

c = c.substring(0, payModalPos) + avancesModal + c.substring(payModalPos);
console.log('Avances modal inserted. File lines:', c.split('\n').length);

fs.writeFileSync(filePath, c, 'utf8');
console.log('File saved. Done.');
