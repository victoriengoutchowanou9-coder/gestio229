const fs = require('fs');

let code = fs.readFileSync('src/pages/dashboard/DashboardPage.tsx', 'utf8');

// 1. Ajouter l'import de getAllAvoirs
if (!code.includes('getAllAvoirs')) {
  code = code.replace(
    "import { fetchResumeActivite } from '../../lib/supabaseTenant'",
    "import { fetchResumeActivite } from '../../lib/supabaseTenant'\nimport { getAllAvoirs, FactureAvoirRecord } from '../../services/factureAvoirService'"
  );
  console.log('1. Import getAllAvoirs added');
}

// 2. Ajouter l'état pour les avoirs du jour et du mois
if (!code.includes('const [avoirsDuMois, setAvoirsDuMois] = useState')) {
  code = code.replace(
    "const [resumeActivite, setResumeActivite] = useState<{ ca_ht: number, marge_brute: number }>({ ca_ht: 0, marge_brute: 0 })",
    `const [resumeActivite, setResumeActivite] = useState<{ ca_ht: number, marge_brute: number }>({ ca_ht: 0, marge_brute: 0 })
  const [avoirsDuMois, setAvoirsDuMois] = useState<FactureAvoirRecord[]>([])`
  );
  console.log('2. State avoirsDuMois added');
}

// 3. Charger les avoirs du mois dans loadDashboardData
if (!code.includes('const avList = await getAllAvoirs')) {
  code = code.replace(
    "setResumeActivite({\n            ca_ht: Number(resume.ca_ht) || 0,\n            marge_brute: Number(resume.marge_brute) || 0\n          })",
    `setResumeActivite({
            ca_ht: Number(resume.ca_ht) || 0,
            marge_brute: Number(resume.marge_brute) || 0
          })
        }
      } catch (rErr) {
        console.warn('Avertissement chargement v_resume_activite:', rErr)
      }

      try {
        const avList = await getAllAvoirs(companyId, currentSectorSlug)
        setAvoirsDuMois(avList)`
  );
  console.log('3. Loading avoirs in loadDashboardData');
}

// 4. Calculer les métriques d'avoirs (Total Avoirs mois, Remboursements espèces, Remboursements MoMo, Crédits clients)
if (!code.includes('avoirsMetrics')) {
  const targetCalc = "const todayDateStr = new Date()";
  const metricsSnippet = `// ── Indicateurs Avoirs Globaux Étape 8 ──
  const avoirsMetrics = useMemo(() => {
    const currentYearMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    const currentToday = new Date().toISOString().slice(0, 10)

    let totalAvoirsMois = 0
    let totalRemboursementsEspeces = 0
    let totalRemboursementsMoMo = 0
    let totalCreditsClientsAvoirs = 0
    let totalAvoirsAujourdhui = 0

    avoirsDuMois.forEach((a) => {
      if (a.statut === 'annule') return
      const aMonth = a.date_avoir ? a.date_avoir.slice(0, 7) : ''
      const aDate = a.date_avoir ? a.date_avoir.slice(0, 10) : ''
      const mnt = Number(a.montant_total_avoir) || 0

      if (aMonth === currentYearMonth) {
        totalAvoirsMois += mnt
        if (a.remboursement_effectue) {
          if (a.mode_remboursement === 'especes') {
            totalRemboursementsEspeces += mnt
          } else if (a.mode_remboursement === 'momo') {
            totalRemboursementsMoMo += mnt
          }
        }
        if (a.mode_remboursement === 'credit_client') {
          totalCreditsClientsAvoirs += mnt
        }
      }

      if (aDate === currentToday) {
        totalAvoirsAujourdhui += mnt
      }
    })

    return {
      totalAvoirsMois,
      totalRemboursementsEspeces,
      totalRemboursementsMoMo,
      totalCreditsClientsAvoirs,
      totalAvoirsAujourdhui
    }
  }, [avoirsDuMois])

  `;

  code = code.replace(targetCalc, metricsSnippet + targetCalc);
  console.log('4. avoirsMetrics computed');
}

// 5. Ajuster le CA du Jour Net
if (!code.includes('caDuJourNet')) {
  code = code.replace(
    "const caDuJour = useMemo(() => {\n    return salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)\n  }, [salesToday])",
    `const caDuJourBrut = useMemo(() => {
    return salesToday.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [salesToday])

  const caDuJourNet = useMemo(() => {
    return Math.max(0, caDuJourBrut - (avoirsMetrics?.totalAvoirsAujourdhui || 0))
  }, [caDuJourBrut, avoirsMetrics])

  const caDuJour = caDuJourNet`
  );
  console.log('5. caDuJourNet calculated');
}

// 6. Ajouter le bloc Widget Avoirs dans le Dashboard JSX
if (!code.includes('Total Avoirs du Mois')) {
  const targetCardsGrid = `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">`;
  const widgetsAvoirsSection = `{/* ── WIDGETS FACTURES D'AVOIRS (CONFORME ÉTAPE 8 DU PROMPT) ── */}
      <div className="bg-gradient-to-r from-rose-900/90 via-slate-900 to-amber-950 text-white rounded-3xl p-5 border border-rose-800/40 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-300">
              Synthèse Factures d'Avoir & Régularisations
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Ce mois • Filtré {sectorDisplayName}</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[10px] text-slate-300 uppercase block font-semibold">Total Avoirs Mois</span>
            <p className="text-lg font-black text-rose-400 font-mono mt-0.5">{fmt(avoirsMetrics.totalAvoirsMois)}</p>
            <span className="text-[10px] text-slate-400">Toutes factures confondues</span>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[10px] text-slate-300 uppercase block font-semibold">Remboursements Espèces</span>
            <p className="text-lg font-black text-amber-300 font-mono mt-0.5">{fmt(avoirsMetrics.totalRemboursementsEspeces)}</p>
            <span className="text-[10px] text-slate-400">Sorties fond de caisse</span>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[10px] text-slate-300 uppercase block font-semibold">Remboursements MoMo</span>
            <p className="text-lg font-black text-cyan-300 font-mono mt-0.5">{fmt(avoirsMetrics.totalRemboursementsMoMo)}</p>
            <span className="text-[10px] text-slate-400">Sorties fond Mobile Money</span>
          </div>

          <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
            <span className="text-[10px] text-slate-300 uppercase block font-semibold">Crédits Clients Issus Avoirs</span>
            <p className="text-lg font-black text-emerald-300 font-mono mt-0.5">{fmt(avoirsMetrics.totalCreditsClientsAvoirs)}</p>
            <span className="text-[10px] text-slate-400">Réductions créances & avoirs</span>
          </div>
        </div>
      </div>\n\n      `;

  code = code.replace(targetCardsGrid, widgetsAvoirsSection + targetCardsGrid);
  console.log('6. Avoirs widgets section added to DashboardPage');
}

fs.writeFileSync('src/pages/dashboard/DashboardPage.tsx', code, 'utf8');
console.log('DashboardPage updated successfully!');
