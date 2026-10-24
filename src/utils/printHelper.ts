// =============================================================================
// GESTIO 229 SaaS — Gestionnaire d'impression universel anti-page-blanche
// Garantit que tous les appels window.print() et Ctrl+P (factures, reçus,
// tickets, rapports, fiches de stock, états comptables SYSCOHADA, modales)
// impriment un document complet, lisible et jamais une page blanche.
// =============================================================================

const PRINT_ROOT_ID = 'gestio-print-root'
let isInstalled = false

function findBestPrintTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  // 1. Cibles d'impression explicites
  const explicitSelectors = [
    '#printable-area',
    '#invoice-a4-standard',
    '#print-document-root',
    '[data-printable="true"]',
    '.printable-document',
    '.print-area',
  ]
  for (const sel of explicitSelectors) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el && el.innerText.trim().length > 0) {
      return el
    }
  }

  // 2. Modale ouverte (ex: Facture, Bon de commande, Fiche de stock, Ticket, Rapport)
  const modalCandidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[id^="modal-portal"] > div, [role="dialog"], .fixed.inset-0 > div'
    )
  ).filter((el) => {
    const rect = el.getBoundingClientRect()
    return rect.width > 150 && rect.height > 100 && el.innerText.trim().length > 10
  })

  if (modalCandidates.length > 0) {
    return modalCandidates[modalCandidates.length - 1]
  }

  // 3. Contenu principal de la page active (Rapports, Comptabilité SYSCOHADA, Stock, Caisse)
  const mainCandidates = [
    'main',
    '.page-content',
    '#root main',
    '#root',
  ]
  for (const sel of mainCandidates) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el && el.innerText.trim().length > 0) {
      return el
    }
  }

  return document.body
}

function syncFormValues(source: HTMLElement, clone: HTMLElement) {
  const srcInputs = source.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input, select, textarea'
  )
  const cloneInputs = clone.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input, select, textarea'
  )
  srcInputs.forEach((srcEl, idx) => {
    const cloneEl = cloneInputs[idx]
    if (!cloneEl) return
    if (srcEl instanceof HTMLInputElement && cloneEl instanceof HTMLInputElement) {
      if (srcEl.type === 'checkbox' || srcEl.type === 'radio') {
        cloneEl.checked = srcEl.checked
        if (srcEl.checked) cloneEl.setAttribute('checked', 'checked')
      } else {
        cloneEl.value = srcEl.value
        cloneEl.setAttribute('value', srcEl.value)
      }
    } else if (srcEl instanceof HTMLSelectElement && cloneEl instanceof HTMLSelectElement) {
      cloneEl.value = srcEl.value
      Array.from(cloneEl.options).forEach((opt) => {
        if (opt.value === srcEl.value) opt.setAttribute('selected', 'selected')
      })
    } else if (srcEl instanceof HTMLTextAreaElement && cloneEl instanceof HTMLTextAreaElement) {
      cloneEl.value = srcEl.value
      cloneEl.textContent = srcEl.value
    }
  })
}

export function preparePrintRoot(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  const target = findBestPrintTarget()
  if (!target) return null

  let printRoot = document.getElementById(PRINT_ROOT_ID)
  if (!printRoot) {
    printRoot = document.createElement('div')
    printRoot.id = PRINT_ROOT_ID
    document.body.appendChild(printRoot)
  }

  printRoot.innerHTML = ''
  const clone = target.cloneNode(true) as HTMLElement

  // Synchroniser les valeurs des champs de formulaire
  syncFormValues(target, clone)

  // Nettoyer les contraintes de scroll/hauteur qui tronquent l'impression dans les modales
  clone.style.maxHeight = 'none'
  clone.style.height = 'auto'
  clone.style.overflow = 'visible'
  clone.querySelectorAll<HTMLElement>('.overflow-y-auto, .overflow-x-auto, .overflow-hidden, .max-h-\\[90vh\\], .max-h-\\[92vh\\], .max-h-\\[85vh\\]').forEach((el) => {
    el.style.maxHeight = 'none'
    el.style.height = 'auto'
    el.style.overflow = 'visible'
  })

  // Supprimer les boutons d'action non imprimables dans le clone
  clone.querySelectorAll('.no-print, .print\\:hidden').forEach((el) => el.remove())

  printRoot.appendChild(clone)
  document.body.classList.add('gestio-printing-active')
  return printRoot
}

export function cleanupPrintRoot() {
  if (typeof document === 'undefined') return
  document.body.classList.remove('gestio-printing-active')
  const printRoot = document.getElementById(PRINT_ROOT_ID)
  if (printRoot) {
    printRoot.remove()
  }
}

export function installGlobalPrintHelper() {
  if (typeof window === 'undefined' || isInstalled) return
  isInstalled = true

  const nativePrint = window.print.bind(window)

  window.addEventListener('beforeprint', () => {
    if (!document.body.classList.contains('gestio-printing-active')) {
      preparePrintRoot()
    }
  })

  window.addEventListener('afterprint', () => {
    cleanupPrintRoot()
  })

  window.print = () => {
    try {
      preparePrintRoot()
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            nativePrint()
          } finally {
            setTimeout(cleanupPrintRoot, 500)
          }
        }, 120)
      })
    } catch (_) {
      nativePrint()
    }
  }
}
