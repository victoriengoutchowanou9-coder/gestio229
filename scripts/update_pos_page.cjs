const fs = require('fs');

let code = fs.readFileSync('src/pages/dashboard/vente-pos/POSPage.tsx', 'utf8');

// 1. Remplacer handleCreateAvoir
const startIdx = code.indexOf('const handleCreateAvoir = async (sale: SaleRecord) => {');
const endIdx = code.indexOf('const handleDownloadPDF = (sale: SaleRecord) => {');

if (startIdx !== -1 && endIdx !== -1) {
  const newFn = [
    'const handleOpenAvoirModal = (sale?: SaleRecord) => {',
    '    if (sale && sale.status === "AVOIR") {',
    '      toast.error("Opération impossible", "Cette facture fait déjà l\'objet d\'un avoir.")',
    '      return',
    '    }',
    '    setSelectedSaleForAvoir(sale || null)',
    '    setShowAvoirModal(true)',
    '  }',
    '',
    '  const handleCreateAvoir = (sale: SaleRecord) => {',
    '    handleOpenAvoirModal(sale)',
    '  }',
    '',
    '  '
  ].join('\n');
  code = code.substring(0, startIdx) + newFn + code.substring(endIdx);
  console.log('1. handleCreateAvoir replaced');
} else {
  console.error('Could not find handleCreateAvoir or handleDownloadPDF');
}

// 2. Bouton Créer un avoir dans l'historique
const targetToolbar = 'Rafra';
const idxToolbar = code.indexOf(targetToolbar);
if (idxToolbar !== -1) {
  const closeBtnIdx = code.indexOf('</button>', idxToolbar);
  const insertBtn = [
    '',
    '            <button',
    '              onClick={() => handleOpenAvoirModal()}',
    '              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"',
    '            >',
    '              <RotateCcw className="w-3.5 h-3.5" /> Créer un avoir',
    '            </button>'
  ].join('\n');
  code = code.substring(0, closeBtnIdx + 9) + insertBtn + code.substring(closeBtnIdx + 9);
  console.log('2. Toolbar button added');
}

// 3. Modal CreerAvoirModal à la fin
const marker = 'onTransferSuccess={handleTransferSuccess}';
const idxMarker = code.indexOf(marker);
if (idxMarker !== -1) {
  const closeTagIdx = code.indexOf(')}', idxMarker);
  const modalAvoirSnippet = [
    '',
    '      {/* ── MODALE CRÉATION FACTURE D\'AVOIR (GLOBAL TOUS SECTEURS + EXTENSION BRASSERIE) ── */}',
    '      <CreerAvoirModal',
    '        isOpen={showAvoirModal}',
    '        onClose={() => {',
    '          setShowAvoirModal(false)',
    '          setSelectedSaleForAvoir(null)',
    '        }}',
    '        onSuccess={(nouvelAvoir) => {',
    '          toast.success("Facture d\'Avoir générée", `Avoir ${nouvelAvoir.numero} enregistré avec succès.`)',
    '          loadData()',
    '        }}',
    '        initialFactureId={selectedSaleForAvoir?.id || null}',
    '        currentSectorSlug={currentSectorSlug}',
    '        caisseStatus={{',
    '          isTodayOpen: activeCaisse ? !activeCaisse.is_previous_day : false,',
    '          fond_actuel_especes: Number(activeCaisse?.fond_actuel_especes ?? 0),',
    '          fond_actuel_momo: Number(activeCaisse?.fond_actuel_momo ?? 0)',
    '        }}',
    '        salesList={salesHistory}',
    '        productsList={products}',
    '        customersList={customers}',
    '      />'
  ].join('\n');
  code = code.substring(0, closeTagIdx + 2) + '\n' + modalAvoirSnippet + code.substring(closeTagIdx + 2);
  console.log('3. CreerAvoirModal added to JSX');
}

fs.writeFileSync('src/pages/dashboard/vente-pos/POSPage.tsx', code, 'utf8');
console.log('Done!');
