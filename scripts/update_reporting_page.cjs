const fs = require('fs');

let code = fs.readFileSync('src/pages/dashboard/reporting/ReportingPage.tsx', 'utf8');

// 1. Ajouter l'import de getAllAvoirs et FactureAvoirRecord
if (!code.includes('factureAvoirService')) {
  code = code.replace(
    "import { calculateTaxFromTTC } from '../../../utils/tax'",
    "import { calculateTaxFromTTC } from '../../../utils/tax'\nimport { getAllAvoirs, FactureAvoirRecord } from '../../../services/factureAvoirService'"
  );
  console.log('1. Import added');
}

// 2. Ajouter l'état pour les avoirs
if (!code.includes('const [avoirs, setAvoirs] = useState')) {
  code = code.replace(
    "const [products, setProducts] = useState<ProductMargin[]>",
    "const [avoirs, setAvoirs] = useState<FactureAvoirRecord[]>([])\n  const [products, setProducts] = useState<ProductMargin[]>"
  );
  console.log('2. State avoirs added');
}

// 3. Charger les avoirs dans loadData
if (!code.includes('const allAvoirs = await getAllAvoirs')) {
  code = code.replace(
    "setProducts((sectorProducts as any) || [])",
    "setProducts((sectorProducts as any) || [])\n      const allAvoirs = await getAllAvoirs(company.id, currentSectorSlug)\n      setAvoirs(allAvoirs)"
  );
  console.log('3. Loading avoirs in loadData');
}

// 4. Filtrer les avoirs sur la période
if (!code.includes('filteredAvoirs')) {
  const targetExpFilter = "return expenses.filter((e) => {";
  const avoirFilterSnippet = `// Filtrer les avoirs validés sur la période sélectionnée
  const filteredAvoirs = useMemo(() => {
    return avoirs.filter((a) => {
      if (a.statut === 'annule') return false
      const aDate = a.date_avoir ? a.date_avoir.slice(0, 10) : ''
      if (!aDate) return true
      if (dateRangeStart && aDate < dateRangeStart) return false
      if (dateRangeEnd && aDate > dateRangeEnd) return false
      return true
    })
  }, [avoirs, dateRangeStart, dateRangeEnd])

  const totalAvoirsValides = useMemo(() => {
    return filteredAvoirs.reduce((sum, a) => sum + (Number(a.montant_total_avoir) || 0), 0)
  }, [filteredAvoirs])

  `;

  code = code.replace(targetExpFilter, avoirFilterSnippet + targetExpFilter);
  console.log('4. Filtered avoirs and totalAvoirsValides computed');
}

// 5. Mettre à jour CA Brut / CA Net
if (!code.includes('totalRevenueNet')) {
  code = code.replace(
    "const totalRevenue = useMemo(() => {\n    return filteredSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)\n  }, [filteredSales])",
    `// CA Brut (Total des ventes enregistrées sur la période)
  const totalRevenueBrut = useMemo(() => {
    return filteredSales.reduce((sum, s) => sum + (Number(s.total_amount) || 0), 0)
  }, [filteredSales])

  // CA Net = CA Brut - Avoirs Validés (Conforme Règle Métier Étape 4)
  const totalRevenueNet = useMemo(() => {
    return Math.max(0, totalRevenueBrut - totalAvoirsValides)
  }, [totalRevenueBrut, totalAvoirsValides])

  const totalRevenue = totalRevenueNet`
  );
  console.log('5. totalRevenueNet computed');
}

// 6. Ajouter la colonne "Avoirs validés" et "Marge après avoirs" dans la table "Marge par Produit"
if (!code.includes('<th className="p-4 text-center">Avoirs</th>')) {
  code = code.replace(
    '<th className="p-4 text-center">Quantité vendue</th>',
    '<th className="p-4 text-center">Quantité vendue</th>\n                  <th className="p-4 text-center text-rose-600">Avoirs (Retour)</th>'
  );

  // Mettre à jour le mapping des marges par produit pour déduire les avoirs par produit
  code = code.replace(
    "let realQtySold = 0\n      let realCaTTC = 0",
    `let realQtySold = 0\n      let realCaTTC = 0\n      let qtyAvoiree = 0\n      let montantAvoirsProd = 0\n\n      filteredAvoirs.forEach((av) => {\n        if (av.lignes && Array.isArray(av.lignes)) {\n          av.lignes.forEach((al: any) => {\n            if (al.article_id === prod.id) {\n              qtyAvoiree += Number(al.qte_retournee) || 0\n              montantAvoirsProd += Number(al.total_ligne) || 0\n            }\n          })\n        }\n      })`
  );

  code = code.replace(
    "// Marge nette = (prix_vente - prix_achat) * quantité\n      const netMargin = (unitSale - costPrice) * realQtySold",
    `// Quantité nette vendue après retour avoirs
      const netQtySold = Math.max(0, realQtySold - qtyAvoiree)
      // Marge brute déduite des retours avoirs
      const netMargin = Math.max(0, (unitSale - costPrice) * netQtySold)`
  );

  code = code.replace(
    "qtySold: realQtySold,",
    "qtySold: realQtySold,\n        qtyAvoiree,\n        netQtySold,"
  );

  code = code.replace(
    `<td className="p-4 text-center font-bold font-mono text-slate-700">
                      {item.qtySold}
                    </td>`,
    `<td className="p-4 text-center font-bold font-mono text-slate-700">
                      {item.qtySold}
                    </td>
                    <td className="p-4 text-center font-bold font-mono text-rose-600">
                      {item.qtyAvoiree > 0 ? \`-\${item.qtyAvoiree}\` : '-'}
                    </td>`
  );
  console.log('6. Table product margins updated with Avoirs column');
}

// 7. Afficher le Total Avoirs Validés dans les KPI
if (!code.includes('Total Avoirs Validés')) {
  const targetKpiCard = `{/* 1. Chiffre d'Affaires */}`;
  const kpiAvoirCard = `{/* Indicateur Spécial : Avoirs Validés */}
        <div className="bg-white rounded-3xl border border-rose-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase text-rose-700">Avoirs Validés (Déduits)</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
              -
            </div>
          </div>
          <p className="text-2xl font-black text-rose-700 font-mono">-{fmt(totalAvoirsValides)}</p>
          <div className="mt-2 text-[11px] text-slate-500 flex justify-between border-t border-slate-100 pt-1.5">
            <span>CA Brut : {fmt(totalRevenueBrut)}</span>
            <strong className="text-emerald-700">CA Net : {fmt(totalRevenueNet)}</strong>
          </div>
        </div>\n\n        `;

  code = code.replace(targetKpiCard, kpiAvoirCard + targetKpiCard);
  console.log('7. KPI card Avoirs Validés added');
}

fs.writeFileSync('src/pages/dashboard/reporting/ReportingPage.tsx', code, 'utf8');
console.log('ReportingPage updated successfully!');
