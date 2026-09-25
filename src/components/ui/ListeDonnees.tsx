// =============================================================================
// GESTIO 229 / GESTIONAFRICA — Composant ListeDonnees Sécurisé
// Débloque l'écran blanc dû aux données vides avec chaînage optionnel (?.)
// =============================================================================

import React from 'react'

interface ListeDonneesProps<T> {
  donnees?: T[] | null
  renderItem?: (item: T, index: number) => React.ReactNode
  messageVide?: string
  actionVide?: React.ReactNode
  className?: string
}

export default function ListeDonnees<T extends { id?: string | number }>({
  donnees,
  renderItem,
  messageVide = 'Aucune donnée disponible pour le moment.',
  actionVide,
  className = 'space-y-2'
}: ListeDonneesProps<T>) {
  if (!donnees || donnees.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
        <p className="text-slate-500 text-sm font-medium">{messageVide}</p>
        {actionVide && <div className="mt-3">{actionVide}</div>}
      </div>
    )
  }

  return (
    <div className={className}>
      {donnees.map((item, index) => (
        renderItem ? renderItem(item, index) : (
          <div key={item.id ?? index} className="p-3 bg-white border border-slate-200 rounded-xl">
            {JSON.stringify(item)}
          </div>
        )
      ))}
    </div>
  )
}
