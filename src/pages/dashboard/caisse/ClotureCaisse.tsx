// =============================================================================
// GESTIO 229 SaaS — Module Caisse & Trésorerie : Clôture Journalière Multi-Secteurs
// =============================================================================
// RÈGLE MÉTIER OFFICIELLE :
// Découvert autorisé, calcul automatique : Solde Clôture = Solde Ouverture + Σ Entrées - Σ Sorties
// En cas de solde négatif : Clôture possible, reporté en négatif le lendemain
// =============================================================================

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Lock, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle, ShieldAlert,
  Calendar, Building2, Wallet, ArrowDownRight, ArrowUpRight, Check, Printer, Clock,
  FileText, Download, Mail, Send
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../store/authStore'
import { useUIStore } from '../../../store/uiStore'
import { useTenant } from '../../../hooks/useTenant'
import { useAppContext } from '../../../contexts/AppContext'
import { formatFCFA } from '../../../utils/formatters'
import { ALL_SECTORS_CATALOG } from '../../../core/modules/moduleRegistry'
import { getOrCreateSecteurBDD, getSoldeFondActuel } from '../../../services/caisseDepensesService'
import { genererRapportCaissePDF, blobToBase64, envoyerRapportCaisseMail, RapportCaisseData } from '../../../utils/rapportCaissePdf'

const fmt = (n: number) => formatFCFA(n)

export interface ClotureLigne {
  secteurId: string
  secteurNom: string
  secteurSlug: string
  caisseId: string
  caisseNom: string
  mode: 'espece' | 'mtn_momo' | 'moov' | 'banque' | 'orange_money'
  modeLabel: string
  soldeDebut: number
  totalEntrees: number
  totalSorties: number
  soldeActuel: number
  statut: 'OK' | 'DECOUVERT'
}

export const ClotureCaisse: React.FC = () => {
  const { user } = useAuthStore()
  const { toast } = useUIStore()
  const { companyId, secteurActif, caisseActive, refreshFonds } = useAppContext()
  const { sectorSlug: currentSectorSlug } = useTenant()

  const [dateCloture, setDateCloture] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [lignes, setLignes] = useState<ClotureLigne[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [cloturant, setCloturant] = useState<boolean>(false)
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false)
  const [clotureSuccess, setClotureSuccess] = useState<boolean>(false)
  const [isSendingMail, setIsSendingMail] = useState<boolean>(false)

  // Charger la synthèse de clôture pour tous les secteurs ou le secteur actif
  const loadSynthese = useCallback(async () => {
    if (!companyId) return
    setLoading(true)

    try {
      const startOfDay = `${dateCloture}T00:00:00.000Z`
      const endOfDay = `${dateCloture}T23:59:59.999Z`

      // 1. Déterminer la liste des secteurs concernés
      const subscribedSectors = ALL_SECTORS_CATALOG.filter((s) => {
        if (!currentSectorSlug || currentSectorSlug === 'boutique' || currentSectorSlug === 'hub') return true
        return s.slug === currentSectorSlug
      }).slice(0, 8)

      // Récupérer les caisses
      const { data: caissesData } = await supabase
        .from('caisses')
        .select('*')
        .eq('company_id', companyId)

      // Récupérer les ventes du jour
      const { data: salesData } = await supabase
        .from('sales_orders')
        .select('*')
        .eq('company_id', companyId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)

      // Récupérer les dépenses du jour (depenses & expenses)
      const { data: depensesData } = await supabase
        .from('depenses')
        .select('*')
        .eq('company_id', companyId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('*')
        .eq('company_id', companyId)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay)

      // Récupérer les fonds actuels en BDD
      const { data: fondsData } = await supabase
        .from('fonds_actuels')
        .select('*')
        .eq('company_id', companyId)

      // Construire les lignes par (Secteur x Mode)
      const modes: Array<{ key: 'espece' | 'mtn_momo'; label: string }> = [
        { key: 'espece', label: 'Espèce' },
        { key: 'mtn_momo', label: 'MoMo' }
      ]

      const nouvellesLignes: ClotureLigne[] = []

      for (const sector of subscribedSectors) {
        const cleanSlug = sector.slug.toLowerCase().trim()
        const caisse = (caissesData || []).find((c: any) =>
          (c.sector_slug || c.secteur_slug || c.sector_key) === cleanSlug
        ) || {
          id: `caisse-${cleanSlug}`,
          nom: `Caisse 1 (${sector.name})`,
        }

        for (const mode of modes) {
          // Solde actuel depuis table fonds_actuels ou calculé
          const fondRow = (fondsData || []).find((f: any) =>
            (f.type_fond === mode.key || (mode.key === 'espece' && f.type_fond === 'especes')) &&
            (f.caisse_id === caisse.id || !f.caisse_id)
          )

          // Calculer Total Entrées du jour pour ce secteur et ce mode
          const entreesVentes = (salesData || [])
            .filter((s: any) => {
              const sec = (s.sector_slug || s.secteur_slug || 'boutique').toLowerCase().replace(/^sec-/, '')
              if (sec !== cleanSlug) return false
              const pm = (s.payment_method || s.payment_status || 'espece').toLowerCase()
              if (mode.key === 'espece') return pm === 'espece' || pm === 'especes' || pm === 'cash'
              if (mode.key === 'mtn_momo') return pm.includes('momo') || pm.includes('wave') || pm.includes('moov')
              return false
            })
            .reduce((sum: number, s: any) => sum + (Number(s.paid_amount || s.total_amount) || 0), 0)

          // Calculer Total Sorties (Dépenses) du jour pour ce secteur et ce mode
          const sortiesDepenses = [
            ...(depensesData || []).filter((d: any) => {
              const sec = (d.sector_slug || d.secteur_slug || '').toLowerCase().replace(/^sec-/, '')
              if (sec && sec !== cleanSlug) return false
              const pm = (d.mode_paiement || 'espece').toLowerCase()
              if (mode.key === 'espece') return pm === 'espece' || pm === 'especes'
              if (mode.key === 'mtn_momo') return pm.includes('momo') || pm.includes('moov')
              return false
            }),
            ...(expensesData || []).filter((e: any) => {
              const sec = (e.sector_slug || e.secteur_slug || '').toLowerCase().replace(/^sec-/, '')
              if (sec && sec !== cleanSlug) return false
              const pm = (e.payment_method || 'especes').toLowerCase()
              if (mode.key === 'espece') return pm === 'especes' || pm === 'espece' || pm === 'cash'
              if (mode.key === 'mtn_momo') return pm.includes('momo') || pm.includes('wave')
              return false
            })
          ].reduce((sum: number, exp: any) => sum + (Number(exp.amount || exp.montant) || 0), 0)

          // Récupérer le solde de début (par exemple ouverture de caisse)
          let soldeDebut = Number(caisse.fond_ouverture_especes || 0)
          if (mode.key === 'mtn_momo') {
            soldeDebut = Number(caisse.fond_ouverture_momo || 0)
          }

          // Solde actuel : priorité au solde BDD fonds_actuels s'il existe, sinon soldeDebut + entrees - sorties
          const soldeActuel = fondRow && typeof fondRow.solde_actuel === 'number'
            ? Number(fondRow.solde_actuel)
            : soldeDebut + entreesVentes - sortiesDepenses

          nouvellesLignes.push({
            secteurId: sector.slug,
            secteurNom: sector.name,
            secteurSlug: cleanSlug,
            caisseId: caisse.id,
            caisseNom: caisse.nom || 'C1',
            mode: mode.key,
            modeLabel: mode.label,
            soldeDebut,
            totalEntrees: entreesVentes,
            totalSorties: sortiesDepenses,
            soldeActuel,
            statut: soldeActuel < 0 ? 'DECOUVERT' : 'OK'
          })
        }
      }

      setLignes(nouvellesLignes)
    } catch (err: any) {
      console.error('Erreur chargement synthèse clôture :', err)
    } finally {
      setLoading(false)
    }
  }, [companyId, currentSectorSlug, dateCloture])

  useEffect(() => {
    loadSynthese()
  }, [loadSynthese])

  // Exécution de la clôture de la journée
  const handleExecuterCloture = async () => {
    if (!companyId) return
    setCloturant(true)

    try {
      const nowIso = new Date().toISOString()

      // Pour chaque ligne, enregistrer la clôture et reporter le solde final pour le lendemain (même si négatif !)
      for (const ligne of lignes) {
        // Enregistrer clôture dans mouvements_tresorerie
        try {
          await supabase.from('mouvements_tresorerie').insert({
            company_id: companyId,
            secteur_id: ligne.secteurId,
            caisse_id: ligne.caisseId,
            type: 'SORTIE',
            source: 'CLOTURE',
            montant: Math.abs(ligne.soldeActuel),
            mode_paiement: ligne.mode,
            fond_avant: ligne.soldeActuel,
            fond_apres: ligne.soldeActuel,
            description: `Clôture journalière ${dateCloture} - Solde: ${ligne.soldeActuel} FCFA`,
          })
        } catch (_) {}

        // Enregistrer également dans clotures_caisse pour traçabilité complète
        try {
          const isValidUUID = (u?: string | null) => !!u && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(u)
          await supabase.from('clotures_caisse').insert({
            company_id: companyId,
            secteur_id: isValidUUID(ligne.secteurId) ? ligne.secteurId : null,
            caisse_id: isValidUUID(ligne.caisseId) ? ligne.caisseId : null,
            date_cloture: dateCloture,
            especes_cloture: ligne.mode === 'espece' ? Math.max(0, ligne.soldeActuel) : 0,
            momo_cloture: ligne.mode === 'mtn_momo' ? Math.max(0, ligne.soldeActuel) : 0,
            fond_especes_avant: ligne.mode === 'espece' ? ligne.soldeActuel : 0,
            fond_momo_avant: ligne.mode === 'mtn_momo' ? ligne.soldeActuel : 0,
            fond_especes_apres: ligne.mode === 'espece' ? ligne.soldeActuel : 0,
            fond_momo_apres: ligne.mode === 'mtn_momo' ? ligne.soldeActuel : 0,
            fond_theorique: ligne.soldeActuel,
            fond_reel: ligne.soldeActuel,
            fond_reel_especes: ligne.mode === 'espece' ? ligne.soldeActuel : 0,
            fond_reel_momo: ligne.mode === 'mtn_momo' ? ligne.soldeActuel : 0,
            ecart: 0,
            total_entrees: ligne.totalEntrees,
            total_sorties: ligne.totalSorties,
            commentaire: `Clôture multi-secteurs (${ligne.secteurNom} - ${ligne.caisseNom})`,
          })
        } catch (_) {}

        // Mettre à jour table caisses avec le solde final qui deviendra le solde d'ouverture du lendemain
        try {
          if (ligne.mode === 'espece') {
            await supabase.from('caisses').update({
              fond_ouverture_especes: ligne.soldeActuel, // NÉGATIF REPORTÉ
              solde_actuel: ligne.soldeActuel,
              date_fermeture: nowIso,
              statut: 'fermee',
              updated_at: nowIso,
            }).eq('id', ligne.caisseId)
          } else if (ligne.mode === 'mtn_momo') {
            await supabase.from('caisses').update({
              fond_ouverture_momo: ligne.soldeActuel,
              updated_at: nowIso,
            }).eq('id', ligne.caisseId)
          }
        } catch (_) {}
      }

      await refreshFonds()
      setClotureSuccess(true)
      setShowConfirmModal(false)
      toast.success(
        'Journée clôturée avec succès !',
        'Les soldes finaux (positifs ou découverts) sont reportés au lendemain.'
      )
    } catch (err: any) {
      toast.error('Erreur lors de la clôture', err.message)
    } finally {
      setCloturant(false)
    }
  }

  // Construction des données du rapport PDF
  const construireDonneesRapport = useCallback((): RapportCaisseData => {
    const totalEntrees = lignes.reduce((s, l) => s + (l.totalEntrees || 0), 0)
    const totalSorties = lignes.reduce((s, l) => s + (l.totalSorties || 0), 0)
    const totalSoldeDebut = lignes.reduce((s, l) => s + (l.soldeDebut || 0), 0)
    const totalSoldeActuel = lignes.reduce((s, l) => s + (l.soldeActuel || 0), 0)

    const lignesEspeces = lignes.filter(l => l.mode === 'espece')
    const lignesMomo = lignes.filter(l => l.mode === 'mtn_momo')

    const fondInitialEspeces = lignesEspeces.reduce((s, l) => s + (l.soldeDebut || 0), 0)
    const fondInitialMomo = lignesMomo.reduce((s, l) => s + (l.soldeDebut || 0), 0)
    const encaissementsEspeces = lignesEspeces.reduce((s, l) => s + (l.totalEntrees || 0), 0)
    const encaissementsMomo = lignesMomo.reduce((s, l) => s + (l.totalEntrees || 0), 0)
    const depensesEspeces = lignesEspeces.reduce((s, l) => s + (l.totalSorties || 0), 0)
    const depensesMomo = lignesMomo.reduce((s, l) => s + (l.totalSorties || 0), 0)
    const fondTheoriqueEspeces = fondInitialEspeces + encaissementsEspeces - depensesEspeces
    const fondTheoriqueMomo = fondInitialMomo + encaissementsMomo - depensesMomo

    // Convertir les lignes de synthèse en mouvements pour le PDF
    const mouvementsPdf = lignes.map(l => ({
      heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      type: l.mode === 'espece' ? 'ESPÈCES' : 'MOMO',
      montant: l.soldeActuel,
      mode: l.modeLabel,
      motif: `Solde ${l.secteurNom} (${l.caisseNom})`,
      reference: `CLOT-${l.secteurSlug.toUpperCase()}`,
      client: l.statut === 'DECOUVERT' ? '⚠️ DÉCOUVERT' : 'OK'
    }))

    return {
      company: {
        name: user?.user_metadata?.company_name || 'GESTIO 229',
        phone: user?.phone || user?.user_metadata?.phone || '+229 01 00 00 00',
        email: user?.email || 'contact@gestio229.com',
      },
      secteur: {
        nom: currentSectorSlug ? `Secteur ${currentSectorSlug.toUpperCase()}` : 'SYNTHÈSE MULTI-SECTEURS',
        slug: currentSectorSlug || 'multi-secteurs'
      },
      caisse: {
        nom: 'Toutes les Caisses d\'Exploitation',
      },
      session: {
        id: `CLOTURE-${dateCloture}`,
        dateCloture,
        fermePar: user?.user_metadata?.full_name || user?.email || 'Administrateur'
      },
      user: {
        nom: user?.user_metadata?.full_name || user?.email || 'Gestionnaire Caisse'
      },
      date: dateCloture,
      synthese: {
        fondInitialEspeces,
        fondInitialMomo,
        encaissementsEspeces,
        encaissementsMomo,
        depensesEspeces,
        depensesMomo,
        fondTheoriqueEspeces,
        fondTheoriqueMomo,
        fondReelEspeces: fondTheoriqueEspeces,
        fondReelMomo: fondTheoriqueMomo,
        ecartEspeces: 0,
        ecartMomo: 0,
        caDuJour: totalEntrees,
        especesDuJour: encaissementsEspeces,
        momoDuJour: encaissementsMomo
      },
      mouvements: mouvementsPdf,
      notes: `Clôture consolidée du ${dateCloture} pour ${lignes.length} flux caisses. Total solde actuel consolidé : ${fmt(totalSoldeActuel)}.`
    }
  }, [lignes, user, dateCloture, currentSectorSlug])

  // Télécharger le rapport de clôture en PDF
  const handleTelechargerPDF = () => {
    try {
      if (lignes.length === 0) {
        toast.error('Aucune donnée à exporter', 'Veuillez patienter pendant le chargement des flux.')
        return
      }
      const data = construireDonneesRapport()
      genererRapportCaissePDF(data, { save: true })
      toast.success('Rapport PDF généré', 'Le téléchargement du rapport officiel a débuté.')
    } catch (err: any) {
      console.error('Erreur PDF :', err)
      toast.error('Erreur génération PDF', err.message || 'Impossible de générer le PDF')
    }
  }

  // Envoyer le rapport par email
  const handleEnvoyerMail = async () => {
    if (!companyId) return
    if (lignes.length === 0) {
      toast.error('Aucune donnée', 'Les flux ne sont pas encore chargés.')
      return
    }

    setIsSendingMail(true)
    try {
      const data = construireDonneesRapport()
      const { blob } = genererRapportCaissePDF(data, { save: false })
      const pdfBase64 = await blobToBase64(blob)

      // Récupérer les adresses emails de destination
      const destEmails: string[] = []
      if (user?.email) destEmails.push(user.email)

      try {
        const { data: comp } = await supabase.from('companies').select('email').eq('id', companyId).maybeSingle()
        if (comp?.email && !destEmails.includes(comp.email)) {
          destEmails.push(comp.email)
        }
      } catch (_) {}

      if (destEmails.length === 0) {
        destEmails.push('direction@gestio229.com')
      }

      const totalSoldeActuel = lignes.reduce((s, l) => s + (l.soldeActuel || 0), 0)
      const res = await envoyerRapportCaisseMail({
        companyId,
        secteurId: currentSectorSlug || 'multi-secteurs',
        date: dateCloture,
        pdfBase64,
        emails: destEmails,
        metadata: {
          secteurNom: 'Synthèse Multi-Secteurs',
          totalReel: totalSoldeActuel,
          caDuJour: data.synthese.caDuJour,
          operateur: user?.user_metadata?.full_name || user?.email || 'Gestionnaire'
        }
      })

      toast.success('Rapport transmis par email !', res.message)
    } catch (err: any) {
      console.error('Erreur envoi mail :', err)
      toast.error('Échec envoi mail', err.message || 'Impossible d\'envoyer le rapport.')
    } finally {
      setIsSendingMail(false)
    }
  }

  const nbDecouverts = useMemo(() => {
    return lignes.filter((l) => l.soldeActuel < 0).length
  }, [lignes])

  return (
    <div className="space-y-6 w-full max-w-none px-3 lg:px-4">
      {/* En-tête de la page */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Clôture Journalière de Caisse
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Contrôle des flux multi-secteurs — Solde Clôture = Solde Ouverture + Σ Entrées - Σ Dépenses
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/60 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-sm">
            <Calendar className="w-4 h-4 text-slate-500" />
            <input
              type="date"
              value={dateCloture}
              onChange={(e) => setDateCloture(e.target.value)}
              className="bg-transparent text-slate-800 dark:text-slate-100 font-medium focus:outline-none"
            />
          </div>

          <button
            onClick={loadSynthese}
            disabled={loading}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
            title="Rafraîchir les flux"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleTelechargerPDF}
            disabled={loading || lignes.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition disabled:opacity-50 text-sm"
            title="Générer et télécharger le rapport officiel PDF"
          >
            <Download className="w-4 h-4" />
            <span className="hidden md:inline">Rapport</span> PDF
          </button>

          <button
            onClick={handleEnvoyerMail}
            disabled={loading || lignes.length === 0 || isSendingMail}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm transition disabled:opacity-50 text-sm"
            title="Envoyer le rapport de caisse aux emails associés"
          >
            {isSendingMail ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            <span className="hidden md:inline">Envoyer</span> Email
          </button>

          <button
            onClick={() => setShowConfirmModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm transition text-sm"
          >
            <Lock className="w-4 h-4" />
            Clôturer Journée
          </button>
        </div>
      </div>

      {/* Alerte informatif sur le principe du découvert autorisé */}
      <div className="p-4 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 text-blue-900 dark:text-blue-200 text-sm flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Règle officielle de gestion des caisses & dépenses :</p>
          <p className="mt-1 leading-relaxed">
            Les dépenses se déduisent immédiatement des fonds réels. Si le fond est insuffisant, il passe en négatif (découvert autorisé). 
            La clôture reste 100% possible avec solde négatif. Ce négatif est conservé pour le lendemain, et se réajustera automatiquement dès la prochaine entrée de vente ou d&apos;encaissement.
          </p>
        </div>
      </div>

      {/* Alerte si des caisses sont en découvert */}
      {nbDecouverts > 0 && (
        <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span>
              <b>{nbDecouverts} compte(s) en découvert actuellement</b> — La clôture est autorisée et reportera ce découvert au jour suivant.
            </span>
          </div>
        </div>
      )}

      {/* Tableau par secteur : Secteur | Caisse | Mode | Solde Début Journée | Total Entrées | Total Sorties | Solde Actuel | Statut */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-600" />
            Synthèse d&apos;exploitation par Secteur & Caisse
          </h2>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {lignes.length} flux suivis
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 font-semibold text-xs border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="py-3 px-4">Secteur</th>
                <th className="py-3 px-4">Caisse</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4 text-right">Solde Début Journée</th>
                <th className="py-3 px-4 text-right">Total Entrées</th>
                <th className="py-3 px-4 text-right">Total Sorties (Dépenses)</th>
                <th className="py-3 px-4 text-right">Solde Actuel</th>
                <th className="py-3 px-4 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    Chargement des soldes et mouvements...
                  </td>
                </tr>
              ) : lignes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Aucun secteur actif enregistré.
                  </td>
                </tr>
              ) : (
                lignes.map((l, index) => {
                  const isNegatif = l.soldeActuel < 0
                  return (
                    <tr
                      key={`${l.secteurSlug}-${l.caisseId}-${l.mode}-${index}`}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-700/40 transition ${isNegatif ? 'bg-red-50/30 dark:bg-red-950/20' : ''}`}
                    >
                      <td className="py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-100">
                        {l.secteurNom}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        {l.caisseNom}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-700">
                          {l.modeLabel}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-medium text-slate-600 dark:text-slate-400">
                        {fmt(l.soldeDebut)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        +{fmt(l.totalEntrees)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-rose-600 dark:text-rose-400">
                        -{fmt(l.totalSorties)}
                      </td>
                      <td className={`py-3.5 px-4 text-right font-bold ${isNegatif ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
                        {fmt(l.soldeActuel)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {isNegatif ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300">
                            <AlertCircle className="w-3.5 h-3.5" />
                            DÉCOUVERT : {fmt(l.soldeActuel)} - À régulariser
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                            <Check className="w-3.5 h-3.5" />
                            OK
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmation de Clôture */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-700 space-y-5 animate-scale-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Confirmer la Clôture Journalière
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Date : {dateCloture}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-700/40 text-sm space-y-2 text-slate-700 dark:text-slate-300">
              <p><b>Formule appliquée :</b></p>
              <p className="font-mono text-xs bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-600">
                Solde Clôture = Solde Ouverture + Σ Entrées - Σ Dépenses
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Même si un solde est négatif, la clôture est validée. Le découvert est conservé pour le lendemain (Solde Début veille) et sera régularisé dès les prochaines ventes.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleExecuterCloture}
                disabled={cloturant}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-md shadow-emerald-600/20 transition flex items-center gap-2"
              >
                {cloturant ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Clôture en cours...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Valider la Clôture
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ClotureCaisse
