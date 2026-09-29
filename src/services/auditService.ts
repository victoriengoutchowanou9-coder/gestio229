// =============================================================================
// GESTIO 229 SaaS — Service d'Audit et Traçabilité Centralisé
// Enregistre les actions des utilisateurs dans audit_logs de Supabase
// Conforme aux exigences de traçabilité intégrale multi-secteurs et multi-rôles
// =============================================================================

import { supabase } from '../lib/supabase'

export interface AuditLogPayload {
  companyId: string
  userId?: string
  userName?: string
  userRole?: string
  sector?: string
  module: string
  action: string
  description: string
  entityName?: string
  entityId?: string
  details?: Record<string, any>
}

/**
 * Détecte les informations du navigateur client
 */
export function getBrowserInfo(): string {
  if (typeof window === 'undefined' || !window.navigator) return 'Serveur'
  const ua = window.navigator.userAgent || ''
  if (ua.includes('Edg/')) return 'Microsoft Edge'
  if (ua.includes('Chrome/')) return 'Google Chrome'
  if (ua.includes('Firefox/')) return 'Mozilla Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Apple Safari'
  if (ua.includes('OPR/') || ua.includes('Opera/')) return 'Opera'
  return ua.slice(0, 50) || 'Navigateur Standard'
}

/**
 * Enregistre un événement dans le journal d'audit
 */
export async function logAuditEvent(payload: AuditLogPayload): Promise<void> {
  try {
    if (!payload.companyId) return

    const browser = getBrowserInfo()
    const ipAddress = '127.0.0.1' // Accessible côté client local / IP privée

    const auditData: any = {
      company_id: payload.companyId,
      user_id: payload.userId || null,
      user_name: payload.userName || 'Utilisateur',
      action: payload.action,
      entity_name: payload.entityName || payload.module,
      entity_id: payload.entityId || null,
      details: {
        role: payload.userRole || 'Utilisateur',
        sector: payload.sector || 'Général',
        module: payload.module,
        description: payload.description,
        browser,
        ...(payload.details || {}),
      },
      ip_address: ipAddress,
    }

    // Insertion directe dans la table audit_logs
    const { error } = await supabase.from('audit_logs').insert(auditData)
    if (error) {
      console.warn('[AuditService] Note enregistrement log:', error.message)
    }
  } catch (err: any) {
    console.warn('[AuditService] Exception enregistrement audit:', err?.message)
  }
}
