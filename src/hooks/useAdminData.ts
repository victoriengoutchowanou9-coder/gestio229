// =============================================================================
// GESTIO 229 ADMIN — Hook useAdminData
// Centralise les appels à l'API admin-data.ts avec gestion des erreurs
// =============================================================================

import { useState, useEffect, useCallback } from 'react'
import { adminApiFetch, useAdminStore } from '../store/adminStore'

export function useAdminStats() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApiFetch('/api/admin-data?action=stats')
      const json = await res.json()
      if (json.success) setData(json.data)
      else setError(json.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

export function useAdminCompanies() {
  const [companies, setCompanies] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApiFetch('/api/admin-data?action=companies')
      const json = await res.json()
      if (json.success) setCompanies(json.data || [])
      else setError(json.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { companies, loading, error, reload: load }
}

export function useAdminCompanyDetail(id: string | null) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await adminApiFetch(`/api/admin-data?action=company_detail&id=${id}`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else setError(json.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

export function useAdminFeedbacks(filters: { status?: string; type?: string; sector?: string } = {}) {
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ action: 'feedbacks' })
      if (filters.status) params.set('status', filters.status)
      if (filters.type) params.set('type', filters.type)
      if (filters.sector) params.set('sector', filters.sector)
      const res = await adminApiFetch(`/api/admin-data?${params}`)
      const json = await res.json()
      if (json.success) setFeedbacks(json.data || [])
      else setError(json.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [filters.status, filters.type, filters.sector])

  useEffect(() => { load() }, [load])
  return { feedbacks, loading, error, reload: load }
}

export function useAdminFeedbacksCount() {
  const [count, setCount] = useState(0)
  const load = useCallback(async () => {
    try {
      const res = await adminApiFetch('/api/admin-data?action=feedbacks_count')
      const json = await res.json()
      if (json.success) setCount(json.count || 0)
    } catch (_) {}
  }, [])
  useEffect(() => { load() }, [load])
  return count
}

export function useAdminAuditLogs() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApiFetch('/api/admin-data?action=admin_audit')
      const json = await res.json()
      if (json.success) setLogs(json.data || [])
      else setError(json.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  return { logs, loading, error, reload: load }
}

export function useAdminFinances(period: string = 'month') {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminApiFetch(`/api/admin-data?action=finances&period=${period}`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else setError(json.error)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])
  return { data, loading, error, reload: load }
}

export function useAdminSectorsStats() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApiFetch('/api/admin-data?action=sectors_stats')
      const json = await res.json()
      if (json.success) setData(json.data)
    } catch (_) {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  return { data, loading, reload: load }
}
