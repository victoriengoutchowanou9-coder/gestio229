// =============================================================================
// GESTIO 229 SaaS — Hook Universel de Caisse (Tous Secteurs)
// =============================================================================
// Règle 1 : Caisse identifiée par un vrai UUID Supabase (ZÉRO dummy string ID)
// Règle 2 : Auto-récupération ou création en BDD si la caisse n'existe pas encore
// Règle 3 : Ouverture / Fermeture universelle avec gestion des fonds
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { cleanSectorSlug } from '../services/caisseSectorService'

export interface CaisseUniverselle {
  id: string
  company_id: string
  sector_key: string
  name: string
  solde_actuel: number
  is_open: boolean
  opened_at?: string | null
  opened_by?: string | null
  created_at?: string
  // Colonnes BDD réelles
  sector_slug?: string
  secteur_slug?: string
  nom?: string
  statut?: string
  date_ouverture?: string
  date_fermeture?: string | null
  fond_ouverture_especes?: number
  fond_ouverture_momo?: number
  solde_especes_final?: number
  solde_momo_final?: number
}

function getEquivalentSlugs(slug: string): string[] {
  const clean = cleanSectorSlug(slug)
  const set = new Set<string>([clean, slug.toLowerCase().trim().replace(/^sec-/, '')])
  if (clean === 'imprimerie' || clean === 'impression') {
    set.add('imprimerie')
    set.add('impression')
  }
  if (clean === 'station' || clean === 'station-service' || clean === 'stationservice') {
    set.add('station')
    set.add('station-service')
  }
  if (clean === 'immobilier' || clean === 'location' || clean === 'locatif' || clean === 'locative' || clean === 'gestion-locative') {
    set.add('immobilier')
    set.add('location')
    set.add('locatif')
    set.add('locative')
  }
  if (clean === 'agrobusiness' || clean === 'agro' || clean === 'agro-business') {
    set.add('agrobusiness')
    set.add('agro')
  }
  if (clean === 'cosmetiques' || clean === 'cosmetique') {
    set.add('cosmetiques')
    set.add('cosmetique')
  }
  return Array.from(set).filter(Boolean)
}

export const useCaisse = (sectorKey: string) => {
  const { company, user } = useAuthStore()
  const { toast } = useUIStore()
  const [caisse, setCaisse] = useState<CaisseUniverselle | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const clean = cleanSectorSlug(sectorKey)

  // Récupère la VRAIE caisse UUID depuis BDD
  const fetchCaisse = useCallback(async (): Promise<CaisseUniverselle | null> => {
    const compId = company?.id
    if (!compId) {
      setLoading(false)
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const eqSlugs = getEquivalentSlugs(sectorKey)
      const orFilter = eqSlugs.map((s) => `sector_slug.eq.${s},secteur_slug.eq.${s}`).join(',')

      // 1. Chercher la caisse existante pour ce secteur
      const { data: list, error: fetchErr } = await supabase
        .from('caisses')
        .select('*')
        .eq('company_id', compId)
        .or(orFilter)
        .order('created_at', { ascending: true })
        .limit(1)

      if (fetchErr) {
        console.warn('[useCaisse] Erreur lecture caisse:', fetchErr.message)
      }

      let data = list && list.length > 0 ? list[0] : null

      // 2. Si non trouvée, création auto avec VRAI UUID généré par Supabase
      if (!data) {
        const { data: newCaisse, error: insertErr } = await supabase
          .from('caisses')
          .insert({
            company_id: compId,
            sector_slug: clean,
            secteur_slug: clean,
            nom: `Caisse Principale ${clean.toUpperCase()}`,
            statut: 'fermee',
            fond_ouverture_especes: 0,
            fond_ouverture_momo: 0,
            solde_especes_final: 0,
          })
          .select()
          .single()

        if (!insertErr && newCaisse) {
          data = newCaisse
        } else if (insertErr) {
          console.error('[useCaisse] Erreur création caisse:', insertErr.message)
          // Nouvelle tentative de lecture
          const { data: retryList } = await supabase
            .from('caisses')
            .select('*')
            .eq('company_id', compId)
            .or(orFilter)
            .limit(1)
          if (retryList && retryList.length > 0) {
            data = retryList[0]
          }
        }
      }

      if (data) {
        const isOpen = data.statut === 'ouverte' || Boolean(data.is_open)
        const mapped: CaisseUniverselle = {
          ...data,
          id: data.id, // VRAI UUID Supabase
          company_id: data.company_id,
          sector_key: data.sector_slug || data.secteur_slug || clean,
          name: data.nom || data.name || `Caisse Principale ${clean.toUpperCase()}`,
          solde_actuel: Number(data.solde_actuel ?? data.solde_especes_final ?? data.fond_ouverture_especes ?? 0),
          is_open: isOpen,
          opened_at: data.opened_at || data.date_ouverture,
          opened_by: data.opened_by || data.ouvert_par,
        }
        setCaisse(mapped)
        setLoading(false)
        return mapped
      }
    } catch (err: any) {
      console.error('[useCaisse] Erreur globale fetchCaisse:', err)
      setError(err.message || 'Erreur chargement caisse')
    } finally {
      setLoading(false)
    }

    return null
  }, [clean, sectorKey, company?.id])

  useEffect(() => {
    fetchCaisse()
  }, [fetchCaisse])

  const ouvrirCaisse = async (fondInitial = 0, fondMomo = 0): Promise<boolean> => {
    if (!caisse?.id) {
      toast.error('Erreur', 'Caisse introuvable')
      return false
    }

    try {
      const nowIso = new Date().toISOString()
      const updatePayload: any = {
        statut: 'ouverte',
        date_ouverture: nowIso,
        date_fermeture: null,
        fond_ouverture_especes: fondInitial,
        fond_ouverture_momo: fondMomo,
        solde_especes_final: fondInitial,
        updated_at: nowIso,
      }
      if (user?.id) {
        updatePayload.ouvert_par = user.id
      }

      const { error: upErr } = await supabase
        .from('caisses')
        .update(updatePayload)
        .eq('id', caisse.id) // caisse.id = UUID valide

      if (upErr) {
        console.error('[useCaisse] Erreur update caisse:', upErr)
        toast.error('Erreur ouverture de caisse', upErr.message)
        return false
      }

      // Enregistrer également une session dans caisse_sessions pour l'historique d'audit
      try {
        await supabase.from('caisse_sessions').insert({
          caisse_id: caisse.id,
          company_id: caisse.company_id,
          sector_slug: clean,
          secteur_slug: clean,
          statut: 'ouverte',
          date_ouverture: nowIso,
          fond_ouverture_especes: fondInitial,
          fond_actuel_especes: fondInitial,
          fond_actuel_momo: fondMomo,
          ouvert_par_nom: user?.full_name || user?.username || 'Caissier',
        })
      } catch (sessErr) {
        console.warn('[useCaisse] Notice caisse_sessions:', sessErr)
      }

      toast.success('Caisse ouverte', `Caisse ${clean.toUpperCase()} ouverte avec un fond de ${fondInitial} F CFA`)
      await fetchCaisse()
      return true
    } catch (err: any) {
      console.error('[useCaisse] Erreur ouverture caisse:', err)
      toast.error('Erreur', err.message || 'Erreur lors de l’ouverture')
      return false
    }
  }

  const fermerCaisse = async (soldeFinal = 0, notes = ''): Promise<boolean> => {
    if (!caisse?.id) {
      toast.error('Erreur', 'Caisse introuvable')
      return false
    }

    try {
      const nowIso = new Date().toISOString()
      const updatePayload: any = {
        statut: 'fermee',
        date_fermeture: nowIso,
        solde_especes_final: soldeFinal,
        updated_at: nowIso,
      }
      if (user?.id) {
        updatePayload.ferme_par = user.id
      }

      const { error: upErr } = await supabase
        .from('caisses')
        .update(updatePayload)
        .eq('id', caisse.id)

      if (upErr) {
        console.error('[useCaisse] Erreur fermeture caisse:', upErr)
        toast.error('Erreur clôture de caisse', upErr.message)
        return false
      }

      // Clôturer la session ouverte dans caisse_sessions
      try {
        await supabase
          .from('caisse_sessions')
          .update({
            statut: 'cloturee',
            date_fermeture: nowIso,
            especes_comptees: soldeFinal,
            notes_fermeture: notes,
            cloture_par: user?.full_name || user?.username || 'Caissier',
            updated_at: nowIso,
          })
          .eq('caisse_id', caisse.id)
          .in('statut', ['ouverte', 'open'])
          .is('date_fermeture', null)
      } catch (sessErr) {
        console.warn('[useCaisse] Notice clôture caisse_sessions:', sessErr)
      }

      toast.success('Caisse fermée', `Caisse ${clean.toUpperCase()} clôturée avec succès`)
      await fetchCaisse()
      return true
    } catch (err: any) {
      console.error('[useCaisse] Erreur fermeture caisse:', err)
      toast.error('Erreur', err.message || 'Erreur lors de la clôture')
      return false
    }
  }

  return { caisse, loading, error, fetchCaisse, ouvrirCaisse, fermerCaisse }
}

export const useCaisseUniverselle = useCaisse
export default useCaisse
