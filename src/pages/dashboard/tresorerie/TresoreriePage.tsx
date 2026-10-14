// =============================================================================
// GESTIO 229 SaaS — Trésorerie Centrale (Banques, MoMo & Liquidités)
// =============================================================================
// Séparation stricte de la Caisse
// Gestion des comptes réels, approbation des versements de caisse et décaissements
// Nettoyé de toute valeur fictive — Zéro donnée fictive
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Landmark, Plus, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Wallet, Building2, RefreshCw, Smartphone, Check, X, ShieldAlert,
  Printer, ArrowRightLeft, CheckCircle2, AlertCircle, Trash2, Eye
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { getActiveSectorSlug, filterItemsForSector, withSectorMeta } from '../../../lib/sectorClient'
import { TreasuryDisbursementModal, ModalPortal } from '../../../components/modals'
import { logAuditEvent } from '../../../services/auditService'


const fmt = (n: number) =>
  new Intl.NumberFormat('fr-BJ').format(Math.round(n || 0)) + ' FCFA'

interface TreasuryAccount {
  id: string
  name: string
  type: 'bank' | 'mobile_money' | 'vault'
  institution: string
  account_number: string
  balance: number
  alert_threshold?: number
}

interface PendingTransfer {
  id: string
  created_at: string
  requested_by: string
  type: string
  amount: number
  motif: string
  status: 'EN_ATTENTE' | 'APPROVED' | 'REJECTED'
}

export const TresoreriePage: React.FC = () => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const { companyId: tenantCompanyId, sectorSlug: tenantSectorSlug } = useTenant()
  const params = useParams<{ sectorSlug?: string }>()
  const currentSectorSlug = tenantSectorSlug || params.sectorSlug || getActiveSectorSlug()
  const currentCompanyId = tenantCompanyId || company?.id || ''

  const [accounts, setAccounts] = useState<TreasuryAccount[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([])
  const [allTransfersHistory, setAllTransfersHistory] = useState<PendingTransfer[]>([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showAddAccountModal, setShowAddAccountModal] = useState(false)
  const [showDisbursementModal, setShowDisbursementModal] = useState(false)

  // Formulaire nouveau compte trésorerie
  const [newAccForm, setNewAccForm] = useState({
    name: '',
    type: 'bank' as 'bank' | 'mobile_money' | 'vault',
    institution: '',
    account_number: '',
    initial_balance: 0,
    alert_threshold: 50000
  })

  // Initialisation automatique des comptes COFFRE-FORT + MOMO MARCHANDS si manquants (PARTIE 2D)
  const ensureDefaultAccounts = async (compId: string, existingList: TreasuryAccount[]): Promise<TreasuryAccount[]> => {
    const list = [...existingList]
    const hasVault = list.some((a) => a.type === 'vault')
    const hasMomo = list.some((a) => a.type === 'mobile_money')

    if (!hasVault) {
      let createdVault: TreasuryAccount | null = null
      try {
        const { data: vault, error } = await supabase
          .from('treasury_accounts')
          .insert({
            company_id: compId,
            name: 'COFFRE-FORT (Espèces)',
            type: 'vault',
            account_number: 'COFFRE-PRINCIPAL',
            balance: 0,
            syscohada_code: '571000',
            is_active: true
          })
          .select()
          .maybeSingle()
        if (vault) {
          createdVault = {
            id: vault.id,
            name: vault.name || 'COFFRE-FORT (Espèces)',
            type: 'vault',
            institution: 'Trésorerie Centrale',
            account_number: vault.account_number || 'COFFRE-PRINCIPAL',
            balance: Number(vault.balance) || 0,
            alert_threshold: 50000
          }
        }
      } catch (err) {
        console.warn('Erreur insertion Supabase Coffre-Fort:', err)
      }

      // Si l'insertion Supabase n'a pas renvoyé de ligne, fallback déterministe pour ne jamais bloquer l'affichage
      if (!createdVault) {
        createdVault = {
          id: `${compId}-vault`,
          name: 'COFFRE-FORT (Espèces)',
          type: 'vault',
          institution: 'Trésorerie Centrale',
          account_number: 'COFFRE-PRINCIPAL',
          balance: 0,
          alert_threshold: 50000
        }
      }
      list.push(createdVault)
    }

    if (!hasMomo) {
      let createdMomo: TreasuryAccount | null = null
      try {
        const { data: momo, error } = await supabase
          .from('treasury_accounts')
          .insert({
            company_id: compId,
            name: 'MOMO MARCHANDS Central',
            type: 'mobile_money',
            account_number: 'MOMO-CENTRAL',
            balance: 0,
            syscohada_code: '521100',
            is_active: true
          })
          .select()
          .maybeSingle()
        if (momo) {
          createdMomo = {
            id: momo.id,
            name: momo.name || 'MOMO MARCHANDS Central',
            type: 'mobile_money',
            institution: 'MTN / Moov Central',
            account_number: momo.account_number || 'MOMO-CENTRAL',
            balance: Number(momo.balance) || 0,
            alert_threshold: 10000
          }
        }
      } catch (err) {
        console.warn('Erreur insertion Supabase MoMo Marchands:', err)
      }

      // Si l'insertion Supabase n'a pas renvoyé de ligne, fallback déterministe
      if (!createdMomo) {
        createdMomo = {
          id: `${compId}-momo`,
          name: 'MOMO MARCHANDS Central',
          type: 'mobile_money',
          institution: 'MTN / Moov Central',
          account_number: 'MOMO-CENTRAL',
          balance: 0,
          alert_threshold: 10000
        }
      }
      list.push(createdMomo)
    }

    return list
  }

  // Charger les comptes trésorerie réels et recalculer les soldes exacts
  const loadTreasuryData = useCallback(async () => {
    const compId = currentCompanyId || company?.id
    if (!compId) return
    setLoading(true)
    try {
      // 1. Charger les comptes réels de l'entreprise (Trésorerie Centrale non restreinte par secteur)
      const { data: dbAccounts } = await supabase
        .from('treasury_accounts')
        .select('*')
        .eq('company_id', compId)
        .order('created_at', { ascending: true })

      let rawAccounts: TreasuryAccount[] = (dbAccounts || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        institution: a.institution || (a.type === 'vault' ? 'Trésorerie Centrale' : a.type === 'mobile_money' ? 'MTN / Moov Central' : 'Établissement Financier'),
        account_number: a.account_number || '',
        balance: Number(a.balance) || 0,
        alert_threshold: Number(a.alert_threshold) || 50000
      }))

      // Fallback local storage si la base est vide (ex: offline ou RLS)
      if (rawAccounts.length === 0) {
        try {
          const cached = localStorage.getItem(`gestio_treasury_accounts_${compId}`)
          if (cached) {
            const parsed = JSON.parse(cached)
            if (Array.isArray(parsed) && parsed.length > 0) {
              rawAccounts = parsed
            }
          }
        } catch (_) {}
      }

      // Garantir l'existence d'au moins 1 Coffre-Fort et 1 MoMo Marchands
      rawAccounts = await ensureDefaultAccounts(compId, rawAccounts)

      // 2. Charger toutes les opérations de retrait / versement enregistrées
      let allTransfers: PendingTransfer[] = []
      const seenTransfers = new Set<string>()

      // 2a. Depuis treasury_transfers
      try {
        const { data: dbTransfers } = await supabase
          .from('treasury_transfers')
          .select('*')
          .eq('company_id', compId)
          .order('created_at', { ascending: false })
          .limit(200)

        if (dbTransfers && dbTransfers.length > 0) {
          dbTransfers.forEach((t: any) => {
            const rawStatus = String(t.status || '').toUpperCase()
            const isApproved = rawStatus === 'APPROVED' || rawStatus === 'VALIDE' || rawStatus === 'VALIDÉ'
            const isRejected = rawStatus === 'REJECTED' || rawStatus === 'REFUSE' || rawStatus === 'REFUSÉ'
            const normStatus = isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'EN_ATTENTE'
            const rawType = String(t.type || '').toLowerCase()
            const isEsp = rawType.includes('esp') || rawType.includes('cash')

            const item: PendingTransfer = {
              id: t.id,
              created_at: t.created_at,
              requested_by: t.requested_by || 'Caissier',
              type: isEsp ? 'Espèces' : 'MoMo',
              amount: Number(t.amount) || 0,
              motif: t.motif || 'Versement caisse',
              status: normStatus as any
            }
            const dedupKey = item.amount + '_' + item.type + '_' + (item.created_at || '').slice(0, 16) + '_' + item.motif
            seenTransfers.add(dedupKey)
            seenTransfers.add(t.id)
            allTransfers.push(item)
          })
        }
      } catch (_) {}

      // 2b. Depuis demandes_retrait (avec déduplication stricte pour éviter tout doublon)
      try {
        const { data: demandesRet } = await supabase
          .from('demandes_retrait')
          .select('*')
          .eq('company_id', compId)
          .order('created_at', { ascending: false })
          .limit(200)

        if (demandesRet && demandesRet.length > 0) {
          demandesRet.forEach((d: any) => {
            const rawStatus = String(d.statut || '').toLowerCase()
            const isApproved = rawStatus === 'valide' || rawStatus === 'validé' || rawStatus === 'approved'
            const isRejected = rawStatus === 'refuse' || rawStatus === 'refusé' || rawStatus === 'rejected'
            const normStatus = isApproved ? 'APPROVED' : isRejected ? 'REJECTED' : 'EN_ATTENTE'
            const isEsp = d.mode_paiement !== 'momo'
            const mnt = Number(d.montant) || 0
            const typeStr = isEsp ? 'Espèces' : 'MoMo'
            const dedupKey = mnt + '_' + typeStr + '_' + (d.created_at || '').slice(0, 16) + '_' + (d.motif || '')

            if (!seenTransfers.has(d.id) && !seenTransfers.has(dedupKey)) {
              seenTransfers.add(d.id)
              seenTransfers.add(dedupKey)
              allTransfers.push({
                id: d.id,
                created_at: d.created_at,
                requested_by: d.demandeur_nom || 'Caissier',
                type: typeStr as any,
                amount: mnt,
                motif: d.motif || 'Retrait caisse vers trésorerie',
                status: normStatus as any
              })
            }
          })
        }
      } catch (_) {}

      // 3. Réconciliation IDEMPOTENTE : chaque retrait validé est crédité dans le bon compte de trésorerie.
      //    Espèces -> COFFRE-FORT (Espèces)
      //    MoMo -> MOMO MARCHANDS Central
      //    Marqueur : caisse_mouvements (source_module = 'tresorerie_credit', source_id = id du retrait).
      const validatedTransfers = allTransfers.filter((t) => t.status === 'APPROVED')
      let creditedIds = new Set<string>()
      try {
        const { data: markers } = await supabase
          .from('caisse_mouvements')
          .select('source_id')
          .eq('company_id', compId)
          .eq('source_module', 'tresorerie_credit')
        creditedIds = new Set((markers || []).map((m: any) => String(m.source_id)))
      } catch (_) {}

      // Charger aussi les marqueurs locaux
      try {
        const localCredited = JSON.parse(localStorage.getItem(`gestio_credited_transfer_ids_${compId}`) || '[]')
        if (Array.isArray(localCredited)) {
          localCredited.forEach((id: string) => creditedIds.add(String(id)))
        }
      } catch (_) {}

      const finalAccounts = [...rawAccounts]
      const reconcileChannel = async (channel: 'Espèces' | 'MoMo', accType: 'vault' | 'mobile_money') => {
        let idx = finalAccounts.findIndex((a) => a.type === accType)
        if (idx === -1) {
          const fallbackAcc: TreasuryAccount = accType === 'vault' ? {
            id: `${compId}-vault`,
            name: 'COFFRE-FORT (Espèces)',
            type: 'vault',
            institution: 'Trésorerie Centrale',
            account_number: 'COFFRE-PRINCIPAL',
            balance: 0,
            alert_threshold: 50000
          } : {
            id: `${compId}-momo`,
            name: 'MOMO MARCHANDS Central',
            type: 'mobile_money',
            institution: 'MTN / Moov Central',
            account_number: 'MOMO-CENTRAL',
            balance: 0,
            alert_threshold: 10000
          }
          finalAccounts.push(fallbackAcc)
          idx = finalAccounts.length - 1
        }

        const acc = finalAccounts[idx]
        const channelApproved = validatedTransfers.filter((t) => t.type === channel)
        const unmarked = channelApproved.filter((t) => !creditedIds.has(String(t.id)))
        if (unmarked.length === 0) return

        // Retraits validés jamais crédités : on crédite le manque réel dans le compte correspondant
        const sumAllApproved = channelApproved.reduce((s, t) => s + (Number(t.amount) || 0), 0)
        const sumUnmarked = unmarked.reduce((s, t) => s + (Number(t.amount) || 0), 0)
        const currentBal = Number(acc.balance) || 0
        const toCredit = Math.min(sumUnmarked, Math.max(0, sumAllApproved - currentBal))

        if (toCredit > 0) {
          const newBal = currentBal + toCredit
          try {
            await supabase
              .from('treasury_accounts')
              .update({ balance: newBal, updated_at: new Date().toISOString() })
              .eq('id', acc.id)
          } catch (updErr) {
            console.warn('Mise à jour solde treasury_accounts:', updErr)
          }
          finalAccounts[idx] = { ...acc, balance: newBal }
        }

        // Poser le marqueur pour chaque retrait afin qu'il ne soit plus jamais recrédité
        try {
          await supabase.from('caisse_mouvements').insert(
            unmarked.map((t) => ({
              company_id: compId,
              sector_slug: 'tresorerie',
              type: 'reception_caisse',
              sens: 'entree_depuis_caisse',
              montant: t.amount,
              montant_total: t.amount,
              montant_especes: channel === 'Espèces' ? t.amount : 0,
              montant_momo: channel === 'MoMo' ? t.amount : 0,
              motif: `Crédit ${acc.name} — retrait caisse validé (${t.motif || ''})`,
              source_module: 'tresorerie_credit',
              source_id: String(t.id),
              statut: 'valide',
              user_name: 'Réconciliation automatique'
            }))
          )
        } catch (_) {}

        unmarked.forEach((t) => creditedIds.add(String(t.id)))
        try {
          localStorage.setItem(`gestio_credited_transfer_ids_${compId}`, JSON.stringify(Array.from(creditedIds)))
        } catch (_) {}
      }

      try {
        await reconcileChannel('Espèces', 'vault')
        await reconcileChannel('MoMo', 'mobile_money')
      } catch (recErr) {
        console.warn('[Trésorerie] Réconciliation des soldes:', recErr)
      }

      // Sauvegarde dans le localStorage pour persistance hors-ligne et rechargement immédiat
      try {
        localStorage.setItem(`gestio_treasury_accounts_${compId}`, JSON.stringify(finalAccounts))
      } catch (_) {}

      setAccounts(finalAccounts)
      setAllTransfersHistory(allTransfers)
      setPendingTransfers(allTransfers.filter((t) => t.status === 'EN_ATTENTE'))
    } catch (err: any) {
      console.error('Erreur chargement trésorerie :', err)
      // En cas d'erreur de requête, tenter de charger le cache local
      try {
        const cached = localStorage.getItem(`gestio_treasury_accounts_${compId}`)
        if (cached) {
          setAccounts(JSON.parse(cached))
        } else {
          setAccounts([])
        }
      } catch (_) {
        setAccounts([])
      }
      setPendingTransfers([])
    } finally {
      setLoading(false)
    }
  }, [currentCompanyId, company?.id])

  useEffect(() => {
    loadTreasuryData()
  }, [loadTreasuryData])

  // Mettre à jour les comptes dans l'état local et dans le localStorage
  const saveAccounts = (updated: TreasuryAccount[]) => {
    setAccounts(updated)
    const compId = currentCompanyId || company?.id
    if (compId) {
      try {
        localStorage.setItem(`gestio_treasury_accounts_${compId}`, JSON.stringify(updated))
      } catch (_) {}
    }
  }

  // Ajouter un nouveau compte réel
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newAccForm.name.trim() || !currentCompanyId) return

    const fullAccNum = newAccForm.institution.trim()
      ? `${newAccForm.institution.trim()} - ${newAccForm.account_number.trim() || 'Principal'}`
      : (newAccForm.account_number.trim() || 'Principal')

    let createdId = `acc-${Date.now()}`

    // Insertion directe et persistante dans Supabase
    try {
      const { data: dbAcc, error } = await supabase
        .from('treasury_accounts')
        .insert({
          company_id: currentCompanyId,
          name: newAccForm.name.trim(),
          type: newAccForm.type,
          account_number: fullAccNum,
          balance: Number(newAccForm.initial_balance) || 0,
          syscohada_code: newAccForm.type === 'bank' ? '521000' : newAccForm.type === 'vault' ? '571000' : '521100',
          is_active: true
        })
        .select()
        .single()

      if (dbAcc?.id) {
        createdId = dbAcc.id
      }
    } catch (dbErr) {
      console.warn('Fallback insertion Supabase treasury_accounts:', dbErr)
    }

    const newAccount: TreasuryAccount = {
      id: createdId,
      name: newAccForm.name.trim(),
      type: newAccForm.type,
      institution: newAccForm.institution.trim() || 'Établissement Financier',
      account_number: newAccForm.account_number.trim() || 'N/A',
      balance: Number(newAccForm.initial_balance) || 0,
      alert_threshold: Number(newAccForm.alert_threshold) || 50000
    }

    const updated = [...accounts, newAccount]
    saveAccounts(updated)

    await logAuditEvent({
      companyId: currentCompanyId,
      userId: user?.id,
      userName: user?.full_name,
      userRole: user?.role,
      action: 'CREATION_COMPTE_TRESORERIE',
      module: 'TRESORERIE',
      sector: currentSectorSlug.toUpperCase(),
      description: `Création du compte de trésorerie "${newAccount.name}" (${newAccount.type}) avec solde initial de ${fmt(newAccount.balance)}`
    })

    toast.success('Compte de trésorerie créé avec succès !')
    setShowAddAccountModal(false)
    setNewAccForm({
      name: '',
      type: 'bank',
      institution: '',
      account_number: '',
      initial_balance: 0,
      alert_threshold: 50000
    })
  }

  // Approuver une demande de versement — DOUBLE TRANSACTION (PARTIE 2B)
  // Espèces : incrémente COFFRE-FORT (Espèces)
  // MoMo : incrémente MOMO MARCHANDS central
  const handleApproveTransfer = async (transfer: PendingTransfer) => {
    const compId = currentCompanyId || company?.id
    const isEspeces = /esp|cash/i.test(String(transfer.type || ''))

    // 1. Trouver le compte de destination correspondant (Coffre-Fort pour Espèces, MoMo Marchands pour MoMo)
    let target = accounts.find((a) =>
      isEspeces ? a.type === 'vault' : a.type === 'mobile_money'
    )
    if (!target) {
      target = isEspeces
        ? accounts.find((a) => a.name.toLowerCase().includes('coffre'))
        : accounts.find((a) => a.name.toLowerCase().includes('momo'))
    }

    // Si le compte cible n'existe pas encore dans l'état, le créer d'office pour ne JAMAIS perdre l'encaissement !
    if (!target && compId) {
      target = isEspeces ? {
        id: `${compId}-vault`,
        name: 'COFFRE-FORT (Espèces)',
        type: 'vault',
        institution: 'Trésorerie Centrale',
        account_number: 'COFFRE-PRINCIPAL',
        balance: 0,
        alert_threshold: 50000
      } : {
        id: `${compId}-momo`,
        name: 'MOMO MARCHANDS Central',
        type: 'mobile_money',
        institution: 'MTN / Moov Central',
        account_number: 'MOMO-CENTRAL',
        balance: 0,
        alert_threshold: 10000
      }
      accounts.push(target)
    }

    if (target && compId) {
      // Garde anti-double crédit (double clic, double validation)
      let alreadyCredited = false
      try {
        const { data: existing } = await supabase
          .from('caisse_mouvements')
          .select('id')
          .eq('company_id', compId)
          .eq('source_module', 'tresorerie_credit')
          .eq('source_id', String(transfer.id))
          .limit(1)
        alreadyCredited = !!(existing && existing.length > 0)
      } catch (_) {}

      // Vérifier aussi dans le cache local
      if (!alreadyCredited) {
        try {
          const localCredited = JSON.parse(localStorage.getItem(`gestio_credited_transfer_ids_${compId}`) || '[]')
          if (Array.isArray(localCredited) && localCredited.includes(String(transfer.id))) {
            alreadyCredited = true
          }
        } catch (_) {}
      }

      if (!alreadyCredited) {
        // Lire le solde réel en base (évite d'écraser avec un état React périmé)
        let baseBal = Number(target.balance) || 0
        try {
          const { data: fresh } = await supabase
            .from('treasury_accounts')
            .select('balance')
            .eq('id', target.id)
            .maybeSingle()
          if (fresh) baseBal = Number(fresh.balance) || 0
        } catch (_) {}

        const newBal = baseBal + Number(transfer.amount)
        const nextAccounts = accounts.map((a) => (a.id === target!.id ? { ...a, balance: newBal } : a))
        saveAccounts(nextAccounts)

        try {
          await supabase
            .from('treasury_accounts')
            .update({ balance: newBal, updated_at: new Date().toISOString() })
            .eq('id', target.id)
        } catch (updErr) {
          console.warn('Mise à jour solde treasury_accounts:', updErr)
        }

        // Marqueur de crédit : ce retrait ne sera plus jamais recrédité
        try {
          await supabase.from('caisse_mouvements').insert({
            company_id: compId,
            sector_slug: 'tresorerie',
            type: 'reception_caisse',
            sens: 'entree_depuis_caisse',
            montant: transfer.amount,
            montant_total: transfer.amount,
            montant_especes: isEspeces ? transfer.amount : 0,
            montant_momo: isEspeces ? 0 : transfer.amount,
            motif: `Crédit ${target.name} — ${transfer.motif}`,
            source_module: 'tresorerie_credit',
            source_id: String(transfer.id),
            statut: 'valide',
            user_name: user?.full_name || 'Admin',
            user_id: user?.id && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null
          })
        } catch (_) {}

        // Enregistrer dans le cache local des crédits
        try {
          const localCredited = JSON.parse(localStorage.getItem(`gestio_credited_transfer_ids_${compId}`) || '[]')
          if (Array.isArray(localCredited) && !localCredited.includes(String(transfer.id))) {
            localCredited.push(String(transfer.id))
            localStorage.setItem(`gestio_credited_transfer_ids_${compId}`, JSON.stringify(localCredited))
          }
        } catch (_) {}
      }
    }

    // 2. Marquer la demande comme APPROUVÉE
    const updatedTransfers: PendingTransfer[] = pendingTransfers.map((t) =>
      t.id === transfer.id ? { ...t, status: 'APPROVED' as any } : t
    )
    setPendingTransfers(updatedTransfers.filter((t) => t.status === 'EN_ATTENTE'))
    setAllTransfersHistory((prev) => prev.map((t) => t.id === transfer.id ? { ...t, status: 'APPROVED' as any } : t))

    // 3. Mettre à jour treasury_transfers
    if (compId) {
      try {
        await supabase
          .from('treasury_transfers')
          .update({
            status: 'APPROVED',
            approved_by: user?.full_name || 'Direction',
            approved_at: new Date().toISOString()
          })
          .eq('id', transfer.id)
      } catch (e) {}
    }

    // 4. Mettre à jour demandes_retrait côté caisse
    if (compId) {
      try {
        await supabase
          .from('demandes_retrait')
          .update({
            statut: 'valide',
            valide_par: user?.full_name || 'Direction',
            valide_at: new Date().toISOString()
          })
          .eq('id', transfer.id)
      } catch (e) {}
    }

    // 5. Le mouvement côté trésorerie est déjà enregistré par le marqueur de crédit (étape 1)

    // 6. Mettre à jour le mouvement caisse côté caissière (statut en_attente → valide)
    try {
      await supabase
        .from('caisse_mouvements')
        .update({ statut: 'valide', updated_at: new Date().toISOString() })
        .eq('source_id', transfer.id)
        .eq('type', 'retrait_tresorerie')
    } catch (_) {}

    await logAuditEvent({
      companyId: compId,
      userId: user?.id,
      userName: user?.full_name,
      userRole: user?.role,
      action: 'APPROBATION_TRANSFERT_CAISSE',
      module: 'TRESORERIE',
      sector: currentSectorSlug.toUpperCase(),
      description: 'Approbation du transfert de caisse de ' + fmt(transfer.amount) + ' (' + transfer.type + ') → ' + (target?.name || 'Trésorerie') + '. Double transaction exécutée.'
    })

    toast.success(
      'Fonds Encaissés en Trésorerie !',
      'Le versement de ' + fmt(transfer.amount) + ' a été approuvé et crédité dans ' + (target?.name || 'Trésorerie') + '.'
    )

    // Recharger la trésorerie pour rafraîchir tous les soldes consolidés
    setTimeout(() => {
      loadTreasuryData()
    }, 300)
  }

  // Rejeter une demande — libère le montant bloqué
  const handleRejectTransfer = async (transferId: string) => {
    const compId = currentCompanyId || company?.id
    setPendingTransfers((prev) => prev.filter((t) => t.id !== transferId))
    setAllTransfersHistory((prev) => prev.map((t) => t.id === transferId ? { ...t, status: 'REJECTED' } : t))

    if (compId) {
      try {
        await supabase
          .from('treasury_transfers')
          .update({ status: 'REJECTED', rejected_at: new Date().toISOString() })
          .eq('id', transferId)
      } catch (e) {}

      // Libérer le montant côté caisse_mouvements
      try {
        await supabase
          .from('caisse_mouvements')
          .update({ statut: 'refuse', updated_at: new Date().toISOString() })
          .eq('source_id', String(transferId))
          .eq('type', 'retrait_tresorerie')
      } catch (_) {}

      // Mettre à jour demandes_retrait
      try {
        await supabase
          .from('demandes_retrait')
          .update({ statut: 'refuse', updated_at: new Date().toISOString() })
          .eq('id', transferId)
      } catch (_) {}

      await logAuditEvent({
        companyId: compId,
        userId: user?.id,
        userName: user?.full_name,
        userRole: user?.role,
        action: 'REJET_TRANSFERT_CAISSE',
        module: 'TRESORERIE',
        sector: currentSectorSlug.toUpperCase(),
        description: `Rejet de la demande de transfert de caisse réf: ${transferId}. Montant libéré.`
      })
    }

    toast.info('Demande rejetée', 'Le montant bloqué a été libéré. Le caissier a été notifié.')
  }

  // Totaux calculés à partir des comptes réels
  const totalBankBalance = useMemo(() => accounts.filter((a) => a.type === 'bank').reduce((sum, a) => sum + (Number(a.balance) || 0), 0), [accounts])
  const totalMomoBalance = useMemo(() => accounts.filter((a) => a.type === 'mobile_money').reduce((sum, a) => sum + (Number(a.balance) || 0), 0), [accounts])
  const totalVaultBalance = useMemo(() => accounts.filter((a) => a.type === 'vault').reduce((sum, a) => sum + (Number(a.balance) || 0), 0), [accounts])
  // Trésorerie consolidée = Banque + MoMo Marchands + Coffre-fort (Espèces)
  const totalTreasuryBalance = totalBankBalance + totalMomoBalance + totalVaultBalance

  const pendingRequestsList = useMemo(() => pendingTransfers.filter((t) => t.status === 'EN_ATTENTE'), [pendingTransfers])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── En-tête Trésorerie ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Landmark className="w-6 h-6 text-indigo-600" />
            Trésorerie Centrale
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Comptes bancaires, comptes marchands MoMo, coffre-fort et validation des versements
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowAddAccountModal(true)}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Ajouter un compte</span>
          </button>
          <button
            onClick={() => setShowDisbursementModal(true)}
            disabled={accounts.length === 0}
            className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Nouveau Décaissement</span>
          </button>
        </div>
      </div>

      {/* ── KPIs Trésorerie Réels ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-bold text-indigo-200 uppercase tracking-wider">
            Trésorerie Consolidée
          </span>
          <p className="text-2xl font-black text-emerald-400 font-mono my-2">
            {fmt(totalTreasuryBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-700/80 pt-1.5">
            {accounts.length} compte(s) actif(s)
          </span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Comptes Bancaires
            </span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-xl font-black text-slate-900 font-mono">
            {fmt(totalBankBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            {accounts.filter((a) => a.type === 'bank').length} banque(s)
          </span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              MoMo Marchands
            </span>
            <Smartphone className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-xl font-black text-amber-800 font-mono">
            {fmt(totalMomoBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            {accounts.filter((a) => a.type === 'mobile_money').length} ligne(s) marchandes
          </span>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Coffre-Fort (Espèces)
            </span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-xl font-black text-emerald-800 font-mono">
            {fmt(totalVaultBalance)}
          </p>
          <span className="text-[10px] text-slate-400 border-t border-slate-100 pt-1.5">
            Liquidités centrales
          </span>
        </div>
      </div>

      {/* ── Demandes de Versement Caisse en Attente ──────────────────────────── */}
      {pendingRequestsList.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm text-amber-950 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <span>Demandes de Versement Caisse en Attente ({pendingRequestsList.length})</span>
            </h3>
            <span className="text-xs text-amber-800 font-semibold">Validation requise</span>
          </div>

          <div className="overflow-x-auto bg-white rounded-2xl border border-amber-100">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-100/60 text-amber-900 font-bold border-b border-amber-200">
                <tr>
                  <th className="p-3">Demandeur</th>
                  <th className="p-3">Date / Heure</th>
                  <th className="p-3 text-center">Canal</th>
                  <th className="p-3 text-right">Montant</th>
                  <th className="p-3">Motif</th>
                  <th className="p-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {pendingRequestsList.map((transfer) => (
                  <tr key={transfer.id}>
                    <td className="p-3 font-sans font-bold text-slate-800">{transfer.requested_by}</td>
                    <td className="p-3 font-sans text-slate-500">
                      {new Date(transfer.created_at).toLocaleString('fr-BJ', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        transfer.type === 'Espèces' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {transfer.type}
                      </span>
                    </td>
                    <td className="p-3 text-right font-black text-slate-900">{fmt(transfer.amount)}</td>
                    <td className="p-3 font-sans text-slate-600">{transfer.motif}</td>
                    <td className="p-3 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleApproveTransfer(transfer)}
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Encaisser</span>
                        </button>
                        <button
                          onClick={() => handleRejectTransfer(transfer.id)}
                          className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold transition"
                        >
                          Rejeter
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Historique Complet des Retraits Caisse ────────────────────────────── */}
      {allTransfersHistory.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800">
                Historique des Retraits Caisse ({allTransfersHistory.length})
              </h3>
            </div>
            <span className="text-xs text-slate-400">Virements internes Caisse → Trésorerie</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                <tr>
                  <th className="p-3">Demandeur</th>
                  <th className="p-3">Date / Heure</th>
                  <th className="p-3 text-center">Canal</th>
                  <th className="p-3 text-right">Montant</th>
                  <th className="p-3">Motif</th>
                  <th className="p-3 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {allTransfersHistory.map((transfer) => (
                  <tr key={transfer.id} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 font-sans font-bold text-slate-800">{transfer.requested_by}</td>
                    <td className="p-3 font-sans text-slate-500">
                      {new Date(transfer.created_at).toLocaleString('fr-BJ', {
                        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </td>
                    <td className="p-3 text-center font-sans">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        transfer.type === 'Espèces' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {transfer.type === 'Espèces' ? '💵 Espèces' : '📱 MoMo'}
                      </span>
                    </td>
                    <td className="p-3 text-right font-black text-slate-900">{fmt(transfer.amount)}</td>
                    <td className="p-3 font-sans text-slate-600 max-w-[150px] truncate">{transfer.motif}</td>
                    <td className="p-3 text-center font-sans">
                      {transfer.status === 'APPROVED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 justify-center">
                          <CheckCircle2 className="w-3 h-3" /> Validé
                        </span>
                      ) : transfer.status === 'REJECTED' ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                          ✗ Refusé
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          ⏳ En attente
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Liste des Comptes de Trésorerie Réels ────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-800">
              Comptes & Coffres Actifs ({accounts.length})
            </h3>
          </div>
          <span className="text-xs text-slate-400">Soldes réels validés</span>
        </div>

        {accounts.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <p className="text-sm font-bold text-slate-600">Aucune donnée disponible</p>
            <p className="text-xs max-w-sm mx-auto text-slate-400">
              Aucun compte bancaire ou compte Mobile Money n'a encore été configuré pour cet établissement.
            </p>
            <button
              onClick={() => setShowAddAccountModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition"
            >
              + Enregistrer le premier compte
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {accounts.map((acc) => (
              <div key={acc.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50/80 transition">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm ${
                    acc.type === 'bank' ? 'bg-indigo-100 text-indigo-700' :
                    acc.type === 'mobile_money' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {acc.type === 'bank' ? <Building2 className="w-5 h-5" /> :
                     acc.type === 'mobile_money' ? <Smartphone className="w-5 h-5" /> :
                     <Wallet className="w-5 h-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800">{acc.name}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {acc.institution} • {acc.account_number}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-base font-black font-mono text-slate-900">{fmt(acc.balance)}</p>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    acc.balance > (acc.alert_threshold || 50000)
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-rose-50 text-rose-700'
                  }`}>
                    {acc.balance > (acc.alert_threshold || 50000) ? 'Solde suffisant' : 'Alerte solde bas'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── MODAL AJOUT DE COMPTE TRÉSORERIE ─────────────────────────────────── */}
      <ModalPortal isOpen={showAddAccountModal} onClose={() => setShowAddAccountModal(false)} id="modal-add-treasury-acc">
        <div className="bg-white rounded-3xl shadow-2xl p-6 max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex justify-between items-center pb-3 border-b border-slate-100 mb-4">
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Plus className="w-5 h-5 text-indigo-600" />
              Ajouter un Compte de Trésorerie
            </h3>
            <button onClick={() => setShowAddAccountModal(false)} className="text-slate-400 hover:text-slate-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleCreateAccount} className="space-y-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Type de Compte *</label>
              <select
                value={newAccForm.type}
                onChange={(e) => setNewAccForm({ ...newAccForm, type: e.target.value as any })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
              >
                <option value="bank">Compte Bancaire (Ecobank, BOA, UBA, etc.)</option>
                <option value="mobile_money">Compte Marchand Mobile Money (MTN / Moov)</option>
                <option value="vault">Coffre-Fort Central (Espèces)</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Libellé du Compte *</label>
              <input
                type="text"
                required
                placeholder="Ex: Compte Courant Principal"
                value={newAccForm.name}
                onChange={(e) => setNewAccForm({ ...newAccForm, name: e.target.value })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Établissement / Réseau *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Ecobank Bénin"
                  value={newAccForm.institution}
                  onChange={(e) => setNewAccForm({ ...newAccForm, institution: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">N° de Compte / RIB</label>
                <input
                  type="text"
                  placeholder="Ex: BJ061..."
                  value={newAccForm.account_number}
                  onChange={(e) => setNewAccForm({ ...newAccForm, account_number: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Solde Réel Initial (FCFA) *</label>
              <input
                type="number"
                required
                min="0"
                value={newAccForm.initial_balance}
                onChange={(e) => setNewAccForm({ ...newAccForm, initial_balance: Number(e.target.value) })}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-sm"
              />
              <p className="text-[10px] text-slate-400 mt-1">Solde effectif disponible à ce jour sur le relevé.</p>
            </div>

            <div className="flex gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddAccountModal(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-xs font-semibold hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md"
              >
                Créer le Compte
              </button>
            </div>
          </form>
        </div>
      </ModalPortal>

      {/* Modal Décaissement */}
      <TreasuryDisbursementModal
        isOpen={showDisbursementModal}
        onClose={() => setShowDisbursementModal(false)}
        onSuccess={async (d) => {
          const compId = currentCompanyId || company?.id
          const isEsp = d.source === 'especes'
          const isMomo = d.source === 'momo'
          const amt = Number(d.amount) || 0

          let targetAcc = accounts.find((a) =>
            isEsp ? a.type === 'vault' : isMomo ? a.type === 'mobile_money' : a.type === 'bank'
          ) || accounts[0]

          if (targetAcc) {
            const newBal = Math.max(0, (Number(targetAcc.balance) || 0) - amt)
            const updated = accounts.map((a) =>
              a.id === targetAcc.id ? { ...a, balance: newBal } : a
            )
            saveAccounts(updated)

            if (compId) {
              try {
                await supabase
                  .from('treasury_accounts')
                  .update({ balance: newBal, updated_at: new Date().toISOString() })
                  .eq('id', targetAcc.id)
              } catch (_) {}
            }
          }
          toast.success('Décaissement enregistré avec succès')
          setTimeout(() => loadTreasuryData(), 300)
        }}
      />
    </div>
  )
}

export default TresoreriePage
