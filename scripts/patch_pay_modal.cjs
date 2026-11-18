'use strict';
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'utilisateurs', 'UtilisateursPage.tsx');
let c = fs.readFileSync(filePath, 'utf8');

const commentStart = c.lastIndexOf('{/* ══ MODAL PAYER LE SALAIRE');
const endMarker = '})()}\n\n      {/* Modal Modification Mot de Passe';
const endPos = c.indexOf(endMarker);
const replaceUntil = endPos + '})()}'.length;

if (commentStart === -1 || endPos === -1) {
  console.error('Could not find modal boundaries!', commentStart, endPos);
  process.exit(1);
}

const newModal = `{/* ══ MODAL PAYER LE SALAIRE ═══════════════════════════════════════════ */}
      {payingEmployee && (() => {
        const base = Number(payingEmployee.baseSalary) || 0
        const transp = Number(payingEmployee.transportAllowance) || 0
        const house = Number(payingEmployee.housingAllowance) || 0
        const bon = Number(payingEmployee.bonus) || 0
        const gross = base + transp + house + bon
        const cnssSal = Math.round(gross * 0.036)
        const netAvant = Math.max(0, gross - cnssSal)
        const totalRetenues = Number(payAdvanceDeduction) + Number(payLoanDeduction) + Number(payOtherDeductions)
        const netAPayer = Math.max(0, netAvant - totalRetenues)

        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                    <DollarSign className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-slate-900">Payer le Salaire</h3>
                    <p className="text-xs text-slate-500">Période : {payrollPeriod}</p>
                  </div>
                </div>
                <button type="button" onClick={() => setPayingEmployee(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Décomposition salariale */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-sm">{payingEmployee.fullName}</span>
                    <span className="text-xs font-semibold text-slate-500">{payingEmployee.jobTitle}</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 pt-2 border-t border-slate-200">
                    <div className="flex justify-between">
                      <span>Salaire de base :</span>
                      <span className="font-mono font-bold text-slate-800">{fmt(base)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>Indemnités &amp; Primes :</span>
                      <span className="font-mono font-bold">+{fmt(transp + house + bon)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-800 border-t border-slate-200 pt-1.5">
                      <span>= Salaire Brut :</span>
                      <span className="font-mono">{fmt(gross)}</span>
                    </div>
                    <div className="flex justify-between text-rose-600">
                      <span>CNSS salariale (3,6%) :</span>
                      <span className="font-mono font-bold">-{fmt(cnssSal)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                      <span>= Net avant retenues :</span>
                      <span className="font-mono">{fmt(netAvant)}</span>
                    </div>
                  </div>
                </div>

                {/* Retenues avances / prêts / autres */}
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 space-y-3">
                  <p className="text-xs font-black text-amber-800 uppercase tracking-wider">Retenues sur salaire</p>
                  {payingDebtSummary && (payingDebtSummary.totalAdvancesDue > 0 || payingDebtSummary.totalLoansDue > 0) && (
                    <div className="text-[11px] text-amber-700 bg-amber-100 rounded-xl p-2.5 border border-amber-200">
                      {'\u{1F4A1}'} Dettes en cours — Avances : <strong>{fmt(payingDebtSummary.totalAdvancesDue)}</strong> · Prêts : <strong>{fmt(payingDebtSummary.totalLoansDue)}</strong>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2.5">
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">Retenue Avance sur salaire (F CFA)</label>
                      <input type="number" min={0} step={500} value={payAdvanceDeduction}
                        onChange={(e) => setPayAdvanceDeduction(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">Retenue Remboursement Prêt (F CFA)</label>
                      <input type="number" min={0} step={500} value={payLoanDeduction}
                        onChange={(e) => setPayLoanDeduction(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white" placeholder="0" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-amber-900 mb-1">Autres Retenues (F CFA)</label>
                      <input type="number" min={0} step={500} value={payOtherDeductions}
                        onChange={(e) => setPayOtherDeductions(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none bg-white" placeholder="0" />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-amber-200 space-y-1 text-xs">
                    <div className="flex justify-between text-amber-700">
                      <span>Total retenues :</span>
                      <span className="font-mono font-bold">-{fmt(totalRetenues)}</span>
                    </div>
                    <div className="flex justify-between font-black text-emerald-800 pt-1">
                      <span className="text-base">NET À PAYER :</span>
                      <span className="font-mono text-lg">{fmt(netAPayer)}</span>
                    </div>
                  </div>
                </div>

                {/* Mode de paiement */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Mode / Source de Paiement *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'especes', label: 'Espèces', icon: Wallet, desc: 'Tiroir-Caisse direct' },
                      { id: 'virement', label: 'Virement', icon: CreditCard, desc: 'Trésorerie Centrale' },
                      { id: 'momo', label: 'Mobile Money', icon: Smartphone, desc: 'MTN / Moov / Wave' },
                      { id: 'cheque', label: 'Chèque', icon: FileText, desc: 'Chèque entreprise' },
                    ].map((m) => {
                      const Icon = m.icon
                      const isSelected = payMethod === m.id
                      return (
                        <button key={m.id} type="button" onClick={() => setPayMethod(m.id as any)}
                          className={\`p-3 rounded-2xl border text-left transition flex items-start gap-2.5 \${isSelected ? 'bg-emerald-50/80 border-emerald-500 text-emerald-900 shadow-sm' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}\`}>
                          <Icon className={\`w-4 h-4 mt-0.5 \${isSelected ? 'text-emerald-700' : 'text-slate-400'}\`} />
                          <div>
                            <p className="font-bold text-xs">{m.label}</p>
                            <p className="text-[10px] text-slate-400">{m.desc}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                  {'\u{1F6E1}\uFE0F'} <strong>Rattachement Comptable :</strong> Ce paiement sera enregistré au titre de <strong>{payrollPeriod}</strong>. Les retenues avances/prêts sont comptabilisées en créances (compte 422) et non en charges RH — la marge nette n'est pas affectée deux fois.
                </div>

                <div className="flex gap-2 pt-2 justify-end border-t border-slate-100">
                  <button type="button" onClick={() => setPayingEmployee(null)} disabled={isPaying}
                    className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50 transition">
                    Annuler
                  </button>
                  <button type="button" onClick={handleConfirmSalaryPayment} disabled={isPaying}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition shadow-lg shadow-emerald-600/30 flex items-center gap-1.5">
                    {isPaying ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Confirmer le Paiement ({fmt(netAPayer)})</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}`;

const newContent = c.substring(0, commentStart) + newModal + c.substring(replaceUntil);
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('Modal replaced successfully. File length:', newContent.length);
