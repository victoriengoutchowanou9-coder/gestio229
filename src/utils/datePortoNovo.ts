// =============================================================================
// GESTIO 229 SaaS — Utilitaire Date & Heure Fuseau Africa/Porto-Novo (Bénin)
// =============================================================================

export interface PortoNovoDateTime {
  timeStr: string          // Ex: "15:42:08"
  dateStr: string          // Ex: "Mardi 29 septembre 2026"
  fullDisplay: string      // Ex: "Mardi 29 septembre 2026 — 15:42:08"
  hour: number             // 0-23
  minute: number           // 0-59
  second: number           // 0-59
  isoPortoNovo: string     // ISO string format
}

/**
 * Retourne la date et l'heure courante convertie dans le fuseau Africa/Porto-Novo
 */
export function getPortoNovoNow(date: Date = new Date()): PortoNovoDateTime {
  const timeFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Porto-Novo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Porto-Novo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const parts = timeFormatter.formatToParts(date)
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
  const second = parseInt(parts.find((p) => p.type === 'second')?.value || '0', 10)

  const rawDateStr = dateFormatter.format(date)
  const dateStr = rawDateStr.charAt(0).toUpperCase() + rawDateStr.slice(1)
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`

  return {
    timeStr,
    dateStr,
    fullDisplay: `${dateStr} — ${timeStr}`,
    hour,
    minute,
    second,
    isoPortoNovo: date.toISOString(),
  }
}
