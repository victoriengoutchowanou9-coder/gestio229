// =============================================================================
// GESTIO 229 SaaS — Service Gestion des Avances & Prêts aux Employés
// Conforme Code du Travail & SYSCOHADA (Créances sur le personnel)
// =============================================================================

import { supabase } from '../lib/supabase'

export interface StaffAdvance {
  id: string
  company_id: string
  staff_id: string
  employee_name: string
  sector_slug: string
  date_avance: string
  montant: number
  motif?: string
  mode_decaissement: 'especes' | 'virement' | 'momo' | 'cheque'
  montant_rembourse: number
  solde_restant: number
  statut: 'en_cours' | 'partiellement_recupere' | 'solde'
  created_at: string
}

export interface StaffLoan {
  id: string
  company_id: string
  staff_id: string
  employee_name: string
  sector_slug: string
  date_octroi: string
  montant_total: number
  motif?: string
  duree_mois: number
  mensualite: number
  date_debut_remboursement: string
  mode_decaissement: 'especes' | 'virement' | 'momo' | 'cheque'
  montant_rembourse: number
  solde_restant: number
  statut: 'en_cours' | 'partiellement_rembourse' | 'solde'
  created_at: string
}

export interface StaffRepayment {
  id: string
  company_id: string
  staff_id: string
  employee_name: string
  sector_slug: string
  type_dette: 'avance' | 'pret'
  dette_id: string
  date_remboursement: string
  montant: number
  mode_paiement: 'retenue_sur_salaire' | 'especes' | 'virement' | 'momo' | 'cheque'
  payroll_period?: string
  notes?: string
  created_at: string
}

export interface StaffDebtSummary {
  staffId: string
  employeeName: string
  sectorSlug: string
  totalAdvanceGranted: number
  totalAdvanceRepaid: number
  totalAdvanceBalance: number
  totalLoanGranted: number
  totalLoanRepaid: number
  totalLoanBalance: number
  totalDebtBalance: number
  monthlyLoanPayment: number
  activeAdvances: StaffAdvance[]
  activeLoans: StaffLoan[]
  repayments: StaffRepayment[]
}

// ─── Clés de résilience LocalStorage isolées par entreprise ──────────────────
const ADVANCES_KEY = (compId: string) => `gestio229_staff_advances_${compId}`
const LOANS_KEY = (compId: string) => `gestio229_staff_loans_${compId}`
const REPAYMENTS_KEY = (compId: string) => `gestio229_staff_repayments_${compId}`

function getLocal<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

function setLocal<T>(key: string, data: T[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (_) {}
}

export const staffAdvanceLoanService = {
  // ─── 1. AVANCES SUR SALAIRE ────────────────────────────────────────────────
  async getStaffAdvances(companyId: string, staffId?: string, sectorSlug?: string): Promise<StaffAdvance[]> {
    if (!companyId) return []
    try {
      let query = supabase
        .from('staff_advances')
        .select('*')
        .eq('company_id', companyId)
        .order('date_avance', { ascending: false })

      if (staffId) {
        query = query.eq('staff_id', staffId)
      }
      if (sectorSlug) {
        query = query.eq('sector_slug', sectorSlug.toLowerCase().replace(/^sec-/, '').trim())
      }

      const { data, error } = await query
      if (error || !data) {
        // Fallback local
        const local = getLocal<StaffAdvance>(ADVANCES_KEY(companyId))
        return local.filter((a) => {
          if (staffId && a.staff_id !== staffId) return false
          if (sectorSlug && a.sector_slug !== sectorSlug.toLowerCase().replace(/^sec-/, '').trim()) return false
          return true
        })
      }

      // Synchroniser local pour résilience
      setLocal(ADVANCES_KEY(companyId), data)
      return data
    } catch (_) {
      const local = getLocal<StaffAdvance>(ADVANCES_KEY(companyId))
      return local.filter((a) => {
        if (staffId && a.staff_id !== staffId) return false
        if (sectorSlug && a.sector_slug !== sectorSlug.toLowerCase().replace(/^sec-/, '').trim()) return false
        return true
      })
    }
  },

  async createStaffAdvance(
    companyId: string,
    data: {
      staff_id: string
      employee_name: string
      sector_slug: string
      date_avance?: string
      montant: number
      motif?: string
      mode_decaissement?: 'especes' | 'virement' | 'momo' | 'cheque'
    }
  ): Promise<StaffAdvance> {
    const cleanSector = (data.sector_slug || 'boutique').toLowerCase().replace(/^sec-/, '').trim()
    const montant = Math.max(0, Number(data.montant) || 0)
    const newAdvance: StaffAdvance = {
      id: `adv-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      company_id: companyId,
      staff_id: data.staff_id,
      employee_name: data.employee_name,
      sector_slug: cleanSector,
      date_avance: data.date_avance || new Date().toISOString().split('T')[0],
      montant,
      motif: data.motif || 'Avance sur salaire ponctuelle',
      mode_decaissement: data.mode_decaissement || 'especes',
      montant_rembourse: 0,
      solde_restant: montant,
      statut: 'en_cours',
      created_at: new Date().toISOString(),
    }

    try {
      const { data: dbRes, error } = await supabase
        .from('staff_advances')
        .insert({
          company_id: companyId,
          staff_id: data.staff_id.startsWith('staff-') || data.staff_id.startsWith('adv-') ? null : data.staff_id,
          employee_name: data.employee_name,
          sector_slug: cleanSector,
          date_avance: newAdvance.date_avance,
          montant,
          motif: newAdvance.motif,
          mode_decaissement: newAdvance.mode_decaissement,
          montant_rembourse: 0,
          solde_restant: montant,
          statut: 'en_cours',
        })
        .select()
        .maybeSingle()

      if (!error && dbRes?.id) {
        newAdvance.id = dbRes.id
      }
    } catch (_) {}

    // Sauvegarde local
    const local = getLocal<StaffAdvance>(ADVANCES_KEY(companyId))
    setLocal(ADVANCES_KEY(companyId), [newAdvance, ...local.filter((a) => a.id !== newAdvance.id)])

    // Optionnel : impact en caisse si espèces
    if (newAdvance.mode_decaissement === 'especes') {
      try {
        const { data: reg } = await supabase
          .from('cash_registers')
          .select('id, current_cash_balance')
          .eq('company_id', companyId)
          .limit(1)
          .maybeSingle()
        if (reg) {
          await supabase
            .from('cash_registers')
            .update({ current_cash_balance: Math.max(0, (Number(reg.current_cash_balance) || 0) - montant) })
            .eq('id', reg.id)
        }
      } catch (_) {}
    }

    return newAdvance
  },

  // ─── 2. PRÊTS AU PERSONNEL ────────────────────────────────────────────────
  async getStaffLoans(companyId: string, staffId?: string, sectorSlug?: string): Promise<StaffLoan[]> {
    if (!companyId) return []
    try {
      let query = supabase
        .from('staff_loans')
        .select('*')
        .eq('company_id', companyId)
        .order('date_octroi', { ascending: false })

      if (staffId) {
        query = query.eq('staff_id', staffId)
      }
      if (sectorSlug) {
        query = query.eq('sector_slug', sectorSlug.toLowerCase().replace(/^sec-/, '').trim())
      }

      const { data, error } = await query
      if (error || !data) {
        const local = getLocal<StaffLoan>(LOANS_KEY(companyId))
        return local.filter((l) => {
          if (staffId && l.staff_id !== staffId) return false
          if (sectorSlug && l.sector_slug !== sectorSlug.toLowerCase().replace(/^sec-/, '').trim()) return false
          return true
        })
      }

      setLocal(LOANS_KEY(companyId), data)
      return data
    } catch (_) {
      const local = getLocal<StaffLoan>(LOANS_KEY(companyId))
      return local.filter((l) => {
        if (staffId && l.staff_id !== staffId) return false
        if (sectorSlug && l.sector_slug !== sectorSlug.toLowerCase().replace(/^sec-/, '').trim()) return false
        return true
      })
    }
  },

  async createStaffLoan(
    companyId: string,
    data: {
      staff_id: string
      employee_name: string
      sector_slug: string
      date_octroi?: string
      montant_total: number
      motif?: string
      duree_mois: number
      mensualite?: number
      date_debut_remboursement?: string
      mode_decaissement?: 'especes' | 'virement' | 'momo' | 'cheque'
    }
  ): Promise<StaffLoan> {
    const cleanSector = (data.sector_slug || 'boutique').toLowerCase().replace(/^sec-/, '').trim()
    const montantTotal = Math.max(0, Number(data.montant_total) || 0)
    const dureeMois = Math.max(1, Number(data.duree_mois) || 1)
    const mensualite = data.mensualite && Number(data.mensualite) > 0 ? Number(data.mensualite) : Math.round(montantTotal / dureeMois)

    const newLoan: StaffLoan = {
      id: `loan-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      company_id: companyId,
      staff_id: data.staff_id,
      employee_name: data.employee_name,
      sector_slug: cleanSector,
      date_octroi: data.date_octroi || new Date().toISOString().split('T')[0],
      montant_total: montantTotal,
      motif: data.motif || 'Prêt personnel accordé par l\'entreprise',
      duree_mois: dureeMois,
      mensualite,
      date_debut_remboursement: data.date_debut_remboursement || new Date().toISOString().split('T')[0],
      mode_decaissement: data.mode_decaissement || 'especes',
      montant_rembourse: 0,
      solde_restant: montantTotal,
      statut: 'en_cours',
      created_at: new Date().toISOString(),
    }

    try {
      const { data: dbRes, error } = await supabase
        .from('staff_loans')
        .insert({
          company_id: companyId,
          staff_id: data.staff_id.startsWith('staff-') || data.staff_id.startsWith('loan-') ? null : data.staff_id,
          employee_name: data.employee_name,
          sector_slug: cleanSector,
          date_octroi: newLoan.date_octroi,
          montant_total: montantTotal,
          motif: newLoan.motif,
          duree_mois: dureeMois,
          mensualite,
          date_debut_remboursement: newLoan.date_debut_remboursement,
          mode_decaissement: newLoan.mode_decaissement,
          montant_rembourse: 0,
          solde_restant: montantTotal,
          statut: 'en_cours',
        })
        .select()
        .maybeSingle()

      if (!error && dbRes?.id) {
        newLoan.id = dbRes.id
      }
    } catch (_) {}

    const local = getLocal<StaffLoan>(LOANS_KEY(companyId))
    setLocal(LOANS_KEY(companyId), [newLoan, ...local.filter((l) => l.id !== newLoan.id)])

    if (newLoan.mode_decaissement === 'especes') {
      try {
        const { data: reg } = await supabase
          .from('cash_registers')
          .select('id, current_cash_balance')
          .eq('company_id', companyId)
          .limit(1)
          .maybeSingle()
        if (reg) {
          await supabase
            .from('cash_registers')
            .update({ current_cash_balance: Math.max(0, (Number(reg.current_cash_balance) || 0) - montantTotal) })
            .eq('id', reg.id)
        }
      } catch (_) {}
    }

    return newLoan
  },

  // ─── 3. REMBOURSEMENTS & RETENUES ──────────────────────────────────────────
  async getStaffRepayments(companyId: string, staffId?: string, detteId?: string): Promise<StaffRepayment[]> {
    if (!companyId) return []
    try {
      let query = supabase
        .from('staff_repayments')
        .select('*')
        .eq('company_id', companyId)
        .order('date_remboursement', { ascending: false })

      if (staffId) {
        query = query.eq('staff_id', staffId)
      }
      if (detteId) {
        query = query.eq('dette_id', detteId)
      }

      const { data, error } = await query
      if (error || !data) {
        const local = getLocal<StaffRepayment>(REPAYMENTS_KEY(companyId))
        return local.filter((r) => {
          if (staffId && r.staff_id !== staffId) return false
          if (detteId && r.dette_id !== detteId) return false
          return true
        })
      }

      setLocal(REPAYMENTS_KEY(companyId), data)
      return data
    } catch (_) {
      const local = getLocal<StaffRepayment>(REPAYMENTS_KEY(companyId))
      return local.filter((r) => {
        if (staffId && r.staff_id !== staffId) return false
        if (detteId && r.dette_id !== detteId) return false
        return true
      })
    }
  },

  async recordStaffRepayment(
    companyId: string,
    data: {
      staff_id: string
      employee_name: string
      sector_slug: string
      type_dette: 'avance' | 'pret'
      dette_id: string
      montant: number
      mode_paiement?: 'retenue_sur_salaire' | 'especes' | 'virement' | 'momo' | 'cheque'
      payroll_period?: string
      notes?: string
      date_remboursement?: string
    }
  ): Promise<StaffRepayment> {
    const cleanSector = (data.sector_slug || 'boutique').toLowerCase().replace(/^sec-/, '').trim()
    const montant = Math.max(0, Number(data.montant) || 0)

    const newRepayment: StaffRepayment = {
      id: `rep-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      company_id: companyId,
      staff_id: data.staff_id,
      employee_name: data.employee_name,
      sector_slug: cleanSector,
      type_dette: data.type_dette,
      dette_id: data.dette_id,
      date_remboursement: data.date_remboursement || new Date().toISOString().split('T')[0],
      montant,
      mode_paiement: data.mode_paiement || 'retenue_sur_salaire',
      payroll_period: data.payroll_period,
      notes: data.notes || `Remboursement ${data.type_dette} via ${data.mode_paiement || 'retenue'}`,
      created_at: new Date().toISOString(),
    }

    // 1. Sauvegarde en base Supabase
    try {
      const { data: dbRes, error } = await supabase
        .from('staff_repayments')
        .insert({
          company_id: companyId,
          staff_id: data.staff_id.startsWith('staff-') || data.staff_id.startsWith('rep-') ? null : data.staff_id,
          employee_name: data.employee_name,
          sector_slug: cleanSector,
          type_dette: data.type_dette,
          dette_id: data.dette_id.startsWith('adv-') || data.dette_id.startsWith('loan-') ? null : data.dette_id,
          date_remboursement: newRepayment.date_remboursement,
          montant,
          mode_paiement: newRepayment.mode_paiement,
          payroll_period: newRepayment.payroll_period,
          notes: newRepayment.notes,
        })
        .select()
        .maybeSingle()

      if (!error && dbRes?.id) {
        newRepayment.id = dbRes.id
      }
    } catch (_) {}

    // 2. Mettre à jour l'avance ou le prêt concerné
    if (data.type_dette === 'avance') {
      const advances = getLocal<StaffAdvance>(ADVANCES_KEY(companyId))
      const targetAdv = advances.find((a) => a.id === data.dette_id)
      if (targetAdv) {
        const newRepaid = (targetAdv.montant_rembourse || 0) + montant
        const newBalance = Math.max(0, targetAdv.montant - newRepaid)
        targetAdv.montant_rembourse = newRepaid
        targetAdv.solde_restant = newBalance
        targetAdv.statut = newBalance <= 0 ? 'solde' : 'partiellement_recupere'
        setLocal(ADVANCES_KEY(companyId), advances)

        try {
          await supabase
            .from('staff_advances')
            .update({
              montant_rembourse: newRepaid,
              solde_restant: newBalance,
              statut: newBalance <= 0 ? 'solde' : 'partiellement_recupere',
            })
            .eq('id', data.dette_id)
        } catch (_) {}
      }
    } else if (data.type_dette === 'pret') {
      const loans = getLocal<StaffLoan>(LOANS_KEY(companyId))
      const targetLoan = loans.find((l) => l.id === data.dette_id)
      if (targetLoan) {
        const newRepaid = (targetLoan.montant_rembourse || 0) + montant
        const newBalance = Math.max(0, targetLoan.montant_total - newRepaid)
        targetLoan.montant_rembourse = newRepaid
        targetLoan.solde_restant = newBalance
        targetLoan.statut = newBalance <= 0 ? 'solde' : 'partiellement_rembourse'
        setLocal(LOANS_KEY(companyId), loans)

        try {
          await supabase
            .from('staff_loans')
            .update({
              montant_rembourse: newRepaid,
              solde_restant: newBalance,
              statut: newBalance <= 0 ? 'solde' : 'partiellement_rembourse',
            })
            .eq('id', data.dette_id)
        } catch (_) {}
      }
    }

    // Sauvegarde local repayments
    const localReps = getLocal<StaffRepayment>(REPAYMENTS_KEY(companyId))
    setLocal(REPAYMENTS_KEY(companyId), [newRepayment, ...localReps.filter((r) => r.id !== newRepayment.id)])

    // Si règlement en espèces direct (non retenue sur salaire), réencaissement en caisse
    if (data.mode_paiement === 'especes') {
      try {
        const { data: reg } = await supabase
          .from('cash_registers')
          .select('id, current_cash_balance')
          .eq('company_id', companyId)
          .limit(1)
          .maybeSingle()
        if (reg) {
          await supabase
            .from('cash_registers')
            .update({ current_cash_balance: (Number(reg.current_cash_balance) || 0) + montant })
            .eq('id', reg.id)
        }
      } catch (_) {}
    }

    return newRepayment
  },

  // ─── 4. SYNTHÈSE DES DETTES D'UN EMPLOYÉ ──────────────────────────────────
  async getStaffDebtSummary(companyId: string, staffId: string): Promise<StaffDebtSummary> {
    const advances = await this.getStaffAdvances(companyId, staffId)
    const loans = await this.getStaffLoans(companyId, staffId)
    const repayments = await this.getStaffRepayments(companyId, staffId)

    const activeAdvances = advances.filter((a) => a.solde_restant > 0)
    const activeLoans = loans.filter((l) => l.solde_restant > 0)

    const totalAdvanceGranted = advances.reduce((s, a) => s + (Number(a.montant) || 0), 0)
    const totalAdvanceRepaid = advances.reduce((s, a) => s + (Number(a.montant_rembourse) || 0), 0)
    const totalAdvanceBalance = Math.max(0, totalAdvanceGranted - totalAdvanceRepaid)

    const totalLoanGranted = loans.reduce((s, l) => s + (Number(l.montant_total) || 0), 0)
    const totalLoanRepaid = loans.reduce((s, l) => s + (Number(l.montant_rembourse) || 0), 0)
    const totalLoanBalance = Math.max(0, totalLoanGranted - totalLoanRepaid)

    const monthlyLoanPayment = activeLoans.reduce((s, l) => s + (Number(l.mensualite) || 0), 0)

    const empName = advances[0]?.employee_name || loans[0]?.employee_name || 'Collaborateur'
    const secSlug = advances[0]?.sector_slug || loans[0]?.sector_slug || 'boutique'

    return {
      staffId,
      employeeName: empName,
      sectorSlug: secSlug,
      totalAdvanceGranted,
      totalAdvanceRepaid,
      totalAdvanceBalance,
      totalLoanGranted,
      totalLoanRepaid,
      totalLoanBalance,
      totalDebtBalance: totalAdvanceBalance + totalLoanBalance,
      monthlyLoanPayment,
      activeAdvances,
      activeLoans,
      repayments,
    }
  },

  // ─── 5. SYNTHÈSE GLOBALE PAR SECTEUR POUR RAPPORTS DE PAIE & RENTABILITÉ ─
  async getSectorStaffFinancials(
    companyId: string,
    sectorSlug: string,
    period: string
  ): Promise<{
    sectorSlug: string
    period: string
    totalNetSalaries: number
    totalCnssPatronale: number
    totalVpsBenin: number
    totalEmployerCharges: number
    totalStaffExpenses: number
    totalAdvanceDeductions: number
    totalLoanDeductions: number
    totalAdvancesGranted: number
    totalLoansGranted: number
    totalRepaymentsReceived: number
    totalOutstandingDebt: number
  }> {
    const cleanSector = sectorSlug.toLowerCase().replace(/^sec-/, '').trim()

    // 1. Récupérer les bulletins / fiches de paie payées pour ce secteur et cette période
    let netSalaries = 0
    let cnssPatronale = 0
    let vpsBenin = 0
    let advDeductions = 0
    let loanDeductions = 0

    try {
      const { data: payrolls } = await supabase
        .from('payroll_records')
        .select('*')
        .eq('company_id', companyId)
        .eq('period', period)

      const filteredPayrolls = (payrolls || []).filter((p: any) => {
        const sec = (p.sector_slug || '').toLowerCase().replace(/^sec-/, '').trim()
        return !sec || sec === cleanSector
      })

      filteredPayrolls.forEach((p: any) => {
        netSalaries += Number(p.net_salary || p.net_payable) || 0
        cnssPatronale += Number(p.cnss_patronale) || 0
        vpsBenin += Number(p.vps_benin) || 0
        advDeductions += Number(p.advance_deduction) || 0
        loanDeductions += Number(p.loan_deduction) || 0
      })
    } catch (_) {}

    // 2. Avances et prêts accordés dans ce secteur
    const allAdvances = await this.getStaffAdvances(companyId, undefined, cleanSector)
    const allLoans = await this.getStaffLoans(companyId, undefined, cleanSector)
    const allRepayments = await this.getStaffRepayments(companyId)

    const advancesGranted = allAdvances.reduce((s, a) => s + (Number(a.montant) || 0), 0)
    const loansGranted = allLoans.reduce((s, l) => s + (Number(l.montant_total) || 0), 0)
    const outstandingDebt =
      allAdvances.reduce((s, a) => s + (Number(a.solde_restant) || 0), 0) +
      allLoans.reduce((s, l) => s + (Number(l.solde_restant) || 0), 0)

    const sectorRepayments = allRepayments.filter((r) => r.sector_slug === cleanSector)
    const repaymentsReceived = sectorRepayments.reduce((s, r) => s + (Number(r.montant) || 0), 0)

    const employerCharges = cnssPatronale + vpsBenin
    const totalStaffExpenses = netSalaries + employerCharges

    return {
      sectorSlug: cleanSector,
      period,
      totalNetSalaries: netSalaries,
      totalCnssPatronale: cnssPatronale,
      totalVpsBenin: vpsBenin,
      totalEmployerCharges: employerCharges,
      totalStaffExpenses,
      totalAdvanceDeductions: advDeductions,
      totalLoanDeductions: loanDeductions,
      totalAdvancesGranted: advancesGranted,
      totalLoansGranted: loansGranted,
      totalRepaymentsReceived: repaymentsReceived,
      totalOutstandingDebt: outstandingDebt,
    }
  },
}
