// =============================================================================
// GESTIO 229 ADMIN — API Endpoint : GET /api/admin-data
// Toutes les données du Back-Office Super Admin (protégées par token JWT)
// N'utilise que le service_role Supabase côté serveur (données non filtrées RLS)
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || process.env.AUTH_SECRET || 'gestio229_admin_secret_change_in_production'

function verifyAdminToken(token: string): { valid: boolean; payload?: any } {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return { valid: false }
    const [payloadB64, sig] = parts
    const expectedSig = crypto
      .createHmac('sha256', ADMIN_SESSION_SECRET)
      .update(payloadB64)
      .digest('base64url')
    if (sig !== expectedSig) return { valid: false }
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (payload.exp < Date.now()) return { valid: false }
    if (payload.role !== 'super_admin_universel') return { valid: false }
    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// ─── Client Supabase avec service_role (bypass RLS) ─────────────────────
function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

// ─── Vérification du token Admin dans les headers ─────────────────────────
function extractAndVerifyToken(req: VercelRequest): { valid: boolean; payload?: any } {
  const authHeader = req.headers['authorization'] || ''
  if (!authHeader.startsWith('Bearer ')) return { valid: false }
  const token = authHeader.slice(7).trim()
  return verifyAdminToken(token)
}

// ─── Journalisation Admin ─────────────────────────────────────────────────
async function logAdminAction(sb: any, action: string, result: string, details: any, ip: string) {
  try {
    await sb.from('admin_audit_logs').insert({
      admin_username: 'Super Admin',
      action,
      result,
      details,
      ip_address: ip,
    })
  } catch (_) {}
}

// ─── Handler Principal ─────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')

  const auth = extractAndVerifyToken(req)
  if (!auth.valid) {
    return res.status(401).json({ success: false, error: 'Non autorisé.' })
  }

  const sb = getSupabaseAdmin()
  const clientIp = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  const { action } = req.query

  try {
    // ── STATISTIQUES GLOBALES ──────────────────────────────────────────────
    if (action === 'stats') {
      const [companiesRes, salesRes, expensesRes, usersRes] = await Promise.all([
        sb.from('companies').select('*'),
        sb.from('sales_orders').select('total_amount, created_at, company_id'),
        sb.from('expenses').select('amount, created_at, company_id'),
        sb.from('user_profiles').select('id, company_id'),
      ])

      const companies = companiesRes.data || []
      const sales = salesRes.data || []
      const users = usersRes.data || []

      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const startOfYear = new Date(now.getFullYear(), 0, 1)

      // Calcul des statuts d'abonnement
      const totalCompanies = companies.length
      const trialCompanies = companies.filter((c: any) => c.subscription_status === 'trial').length
      const activeCompanies = companies.filter((c: any) => c.subscription_status === 'active').length
      const expiredCompanies = companies.filter((c: any) => c.subscription_status === 'expired').length
      const suspendedCompanies = companies.filter((c: any) => c.subscription_status === 'suspended').length
      const inactiveCompanies = expiredCompanies + suspendedCompanies

      // Entreprises dont l'essai expire dans les 7 prochains jours
      const expiringTrials = companies.filter((c: any) => {
        if (c.subscription_status !== 'trial') return false
        const createdAt = new Date(c.created_at)
        const trialEnd = new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000)
        const diff = trialEnd.getTime() - now.getTime()
        return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000
      }).length

      // Revenus (basés sur sales_orders)
      const revenusJour = sales.filter((s: any) => new Date(s.created_at) >= startOfDay)
        .reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0)
      const revenusMois = sales.filter((s: any) => new Date(s.created_at) >= startOfMonth)
        .reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0)
      const revenusAnnee = sales.filter((s: any) => new Date(s.created_at) >= startOfYear)
        .reduce((sum: number, s: any) => sum + (Number(s.total_amount) || 0), 0)

      // Secteurs utilisés
      const allSectors = new Set<string>()
      for (const c of companies) {
        const sects = c.selected_sectors || c.sectors || []
        if (Array.isArray(sects)) sects.forEach((s: string) => allSectors.add(s.replace(/^sec-/, '').toLowerCase()))
        else if (c.active_sector) allSectors.add(c.active_sector.replace(/^sec-/, '').toLowerCase())
      }

      return res.status(200).json({
        success: true,
        data: {
          totalCompanies,
          activeCompanies,
          trialCompanies,
          expiredCompanies,
          suspendedCompanies,
          inactiveCompanies,
          expiringTrials,
          totalUsers: users.length,
          totalSectors: allSectors.size,
          revenusJour,
          revenusMois,
          revenusAnnee,
        }
      })
    }

    // ── LISTE DES ENTREPRISES ──────────────────────────────────────────────
    if (action === 'companies') {
      const { data: companies, error } = await sb
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      // Ajouter les utilisateurs de chaque entreprise
      const { data: users } = await sb.from('user_profiles').select('id, email, role, company_id, last_login')
      const usersMap: Record<string, any[]> = {}
      for (const u of (users || [])) {
        if (!usersMap[u.company_id]) usersMap[u.company_id] = []
        usersMap[u.company_id].push(u)
      }

      const result = (companies || []).map((c: any) => ({
        ...c,
        users: usersMap[c.id] || [],
        userCount: (usersMap[c.id] || []).length,
      }))

      return res.status(200).json({ success: true, data: result })
    }

    // ── DÉTAIL D'UNE ENTREPRISE ────────────────────────────────────────────
    if (action === 'company_detail') {
      const { id } = req.query
      if (!id) return res.status(400).json({ success: false, error: 'id requis' })

      const [compRes, usersRes, subRes, subHistRes, auditRes] = await Promise.all([
        sb.from('companies').select('*').eq('id', id).maybeSingle(),
        sb.from('user_profiles').select('*').eq('company_id', id),
        sb.from('subscriptions').select('*').eq('company_id', id).order('created_at', { ascending: false }),
        sb.from('subscription_history').select('*').eq('company_id', id).order('created_at', { ascending: false }),
        sb.from('audit_logs').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(20),
      ])

      return res.status(200).json({
        success: true,
        data: {
          company: compRes.data,
          users: usersRes.data || [],
          subscriptions: subRes.data || [],
          subscriptionHistory: subHistRes.data || [],
          auditLogs: auditRes.data || [],
        }
      })
    }

    // ── AVIS & SUGGESTIONS ─────────────────────────────────────────────────
    if (action === 'feedbacks') {
      const { status: filterStatus, type: filterType, sector: filterSector } = req.query
      let query = sb.from('feedbacks').select('*').order('created_at', { ascending: false })
      if (filterStatus) query = query.eq('status', filterStatus)
      if (filterType) query = query.eq('type', filterType)
      if (filterSector) query = query.eq('sector_slug', filterSector)
      const { data, error } = await query
      if (error) throw error
      return res.status(200).json({ success: true, data: data || [] })
    }

    // ── COMPTAGE DES NOUVEAUX AVIS (pour notification) ─────────────────────
    if (action === 'feedbacks_count') {
      const { data, error } = await sb
        .from('feedbacks')
        .select('id', { count: 'exact' })
        .eq('status', 'nouveau')
      return res.status(200).json({ success: true, count: data?.length || 0 })
    }

    // ── JOURNAL D'AUDIT ADMIN ──────────────────────────────────────────────
    if (action === 'admin_audit') {
      const { data, error } = await sb
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return res.status(200).json({ success: true, data: data || [] })
    }

    // ── FINANCES GLOBALES ──────────────────────────────────────────────────
    if (action === 'finances') {
      const { period } = req.query
      const now = new Date()
      let startDate: Date

      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); break
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1); break
        case 'prev_month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); break
        case '3_months':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); break
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1); break
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      }

      const { data: sales } = await sb
        .from('sales_orders')
        .select('total_amount, created_at, company_id, sector_slug')
        .gte('created_at', startDate.toISOString())

      // Regrouper par entreprise
      const byCompany: Record<string, number> = {}
      const bySector: Record<string, number> = {}
      let totalRevenue = 0

      for (const s of (sales || [])) {
        const amt = Number(s.total_amount) || 0
        totalRevenue += amt
        byCompany[s.company_id] = (byCompany[s.company_id] || 0) + amt
        if (s.sector_slug) {
          const sec = s.sector_slug.replace(/^sec-/, '').toLowerCase()
          bySector[sec] = (bySector[sec] || 0) + amt
        }
      }

      // Historique mensuel (12 mois)
      const monthlyData: Record<string, number> = {}
      const allSales = (await sb.from('sales_orders').select('total_amount, created_at')).data || []
      for (const s of allSales) {
        const d = new Date(s.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthlyData[key] = (monthlyData[key] || 0) + (Number(s.total_amount) || 0)
      }

      return res.status(200).json({
        success: true,
        data: {
          totalRevenue,
          byCompany,
          bySector,
          monthlyHistory: monthlyData,
          transactionCount: (sales || []).length,
        }
      })
    }

    // ── SECTEURS ───────────────────────────────────────────────────────────
    if (action === 'sectors_stats') {
      const { data: companies } = await sb.from('companies').select('selected_sectors, sectors, active_sector, subscription_status')
      const sectorMap: Record<string, { companies: number; trial: number; active: number }> = {}
      for (const c of (companies || [])) {
        const sects = c.selected_sectors || c.sectors || []
        const list = Array.isArray(sects) ? sects : (c.active_sector ? [c.active_sector] : [])
        for (const s of list) {
          const key = s.replace(/^sec-/, '').toLowerCase()
          if (!sectorMap[key]) sectorMap[key] = { companies: 0, trial: 0, active: 0 }
          sectorMap[key].companies += 1
          if (c.subscription_status === 'trial') sectorMap[key].trial += 1
          if (c.subscription_status === 'active') sectorMap[key].active += 1
        }
      }
      return res.status(200).json({ success: true, data: sectorMap })
    }

    // ── INSCRIPTIONS (évolution temporelle) ───────────────────────────────
    if (action === 'registrations_chart') {
      const { data } = await sb.from('companies').select('created_at').order('created_at', { ascending: true })
      const monthly: Record<string, number> = {}
      for (const c of (data || [])) {
        const d = new Date(c.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthly[key] = (monthly[key] || 0) + 1
      }
      return res.status(200).json({ success: true, data: monthly })
    }

    return res.status(400).json({ success: false, error: 'Action non reconnue.' })

  } catch (err: any) {
    console.error('[AdminData] Erreur:', err.message)
    return res.status(500).json({ success: false, error: 'Erreur serveur.' })
  }
}
