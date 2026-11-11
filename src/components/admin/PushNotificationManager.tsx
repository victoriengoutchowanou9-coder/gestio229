// =============================================================================
// GESTIO 229 ADMIN — Gestionnaire des Notifications Push du Concepteur
// Permet d'enregistrer le téléphone du concepteur, tester la réception,
// et consulter l'historique exhaustif des notifications d'inscriptions.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell, Smartphone, Send, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ShieldCheck, History, Info, Clock, Check
} from 'lucide-react'
import { adminApiFetch } from '../../store/adminStore'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export const PushNotificationManager: React.FC = () => {
  const [isSupported, setIsSupported] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [deviceCount, setDeviceCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [testSuccess, setTestSuccess] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])

  // Vérification du support navigateur
  useEffect(() => {
    const supported =
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    setIsSupported(supported)
    if (supported && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  // Vérifier si l'appareil actuel est déjà souscrit
  const checkCurrentSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return false
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      const active = Boolean(sub)
      setIsSubscribed(active)
      return active
    } catch (_) {
      return false
    }
  }, [])

  // Charger le statut serveur et l'historique
  const loadStatusAndHistory = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      await checkCurrentSubscription()

      // Charger le statut des appareils
      const resStatus = await adminApiFetch('/api/admin-push?action=status')
      const jsonStatus = await resStatus.json()
      if (jsonStatus.success) {
        setDeviceCount(jsonStatus.deviceCount || 0)
      }

      // Charger l'historique
      const resHistory = await adminApiFetch('/api/admin-push?action=history')
      const jsonHistory = await resHistory.json()
      if (jsonHistory.success) {
        setHistory(jsonHistory.history || [])
      }
    } catch (err: any) {
      console.warn('[PushManager] Notice chargement:', err)
    } finally {
      setLoading(false)
    }
  }, [checkCurrentSubscription])

  useEffect(() => {
    loadStatusAndHistory()
  }, [loadStatusAndHistory])

  // Activer les notifications sur cet appareil
  const handleSubscribe = async () => {
    setErrorMsg(null)
    setTestSuccess(null)
    setActionLoading(true)

    try {
      if (!isSupported) {
        throw new Error('Votre navigateur ou appareil ne supporte pas les notifications Web Push.')
      }

      // 1. Demander la permission à l'utilisateur
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        throw new Error('Permission refusée par le navigateur. Veuillez autoriser les notifications dans les paramètres de votre navigateur.')
      }

      // 2. Obtenir la clé publique VAPID
      const vapidRes = await adminApiFetch('/api/admin-push?action=vapid_public_key')
      const vapidJson = await vapidRes.json()
      if (!vapidJson.success || !vapidJson.publicKey) {
        throw new Error(vapidJson.error || 'Impossible de récupérer la clé VAPID.')
      }

      // 3. S'assurer que le Service Worker est actif
      let reg: ServiceWorkerRegistration
      try {
        reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
      } catch (swErr: any) {
        throw new Error(`Erreur d'initialisation du Service Worker : ${swErr.message}`)
      }

      // 4. Souscrire auprès du PushManager
      const convertedVapidKey = urlBase64ToUint8Array(vapidJson.publicKey)
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      })

      // 5. Envoyer la souscription au serveur backend
      const deviceName = /android/i.test(navigator.userAgent)
        ? 'Téléphone Android du Concepteur'
        : /iphone|ipad/i.test(navigator.userAgent)
        ? 'iPhone du Concepteur'
        : 'Ordinateur Super Admin'

      const saveRes = await adminApiFetch('/api/admin-push?action=subscribe', {
        method: 'POST',
        body: JSON.stringify({
          action: 'subscribe',
          subscription: subscription.toJSON(),
          deviceName,
        }),
      })

      const saveJson = await saveRes.json()
      if (!saveJson.success) {
        throw new Error(saveJson.error || "Échec de l'enregistrement de l'appareil.")
      }

      setIsSubscribed(true)
      setTestSuccess("Cet appareil est désormais connecté aux alertes push d'inscriptions !")
      await loadStatusAndHistory()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de l\'activation des notifications.')
    } finally {
      setActionLoading(false)
    }
  }

  // Désactiver les notifications sur cet appareil
  const handleUnsubscribe = async () => {
    setActionLoading(true)
    setErrorMsg(null)
    setTestSuccess(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await adminApiFetch('/api/admin-push?action=unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ action: 'unsubscribe', endpoint }),
        })
      }
      setIsSubscribed(false)
      setTestSuccess('Notifications désactivées pour cet appareil.')
      await loadStatusAndHistory()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la désactivation.')
    } finally {
      setActionLoading(false)
    }
  }

  // Déclencher un test push immédiat
  const handleTestNotification = async () => {
    setActionLoading(true)
    setErrorMsg(null)
    setTestSuccess(null)
    try {
      const res = await adminApiFetch('/api/admin-push?action=test', {
        method: 'POST',
        body: JSON.stringify({ action: 'test' }),
      })
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error || 'Échec de l\'envoi du test.')
      }

      setTestSuccess(json.message || 'Notification de test transmise avec succès !')
      await loadStatusAndHistory()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de l\'envoi du test.')
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 space-y-6 shadow-xl">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-white font-bold text-lg flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-400" />
            <span>Notifications Push du Concepteur (Nouvelles Inscriptions)</span>
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Recevez une alerte instantanée sur votre téléphone chaque fois qu'une nouvelle entreprise s'inscrit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
            isSubscribed
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
              : 'bg-slate-800 text-slate-400 border-slate-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isSubscribed ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span>{isSubscribed ? 'Cet appareil est connecté' : 'Non connecté sur cet appareil'}</span>
          </span>
          <button
            type="button"
            onClick={loadStatusAndHistory}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Messages de retour */}
      {testSuccess && (
        <div className="bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs p-3.5 rounded-xl flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{testSuccess}</span>
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-950/60 border border-rose-800 text-rose-200 text-xs p-3.5 rounded-xl flex items-center gap-2.5 animate-fadeIn">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Actions principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Carte 1 : Connexion de l'appareil */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-slate-200 font-bold text-xs">
            <Smartphone className="w-4 h-4 text-emerald-400" />
            <span>Enregistrement de l'appareil</span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Pour recevoir les notifications sur votre téléphone Android, ouvrez cette page dans Chrome ou l'application PWA installée, puis cliquez ci-dessous.
          </p>

          <div className="pt-1">
            {!isSubscribed ? (
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={actionLoading || !isSupported}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer"
              >
                {actionLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Configuration en cours...</span>
                  </>
                ) : (
                  <>
                    <Bell className="w-3.5 h-3.5" />
                    <span>Activer les notifications sur cet appareil</span>
                  </>
                )}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex-1 bg-emerald-950/40 border border-emerald-800/80 text-emerald-300 py-2 px-3 rounded-xl text-xs font-semibold flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Actif sur cet appareil</span>
                </span>
                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  disabled={actionLoading}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-3 rounded-xl text-xs font-medium transition"
                >
                  Désactiver
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Carte 2 : Test immédiat */}
        <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-slate-200 font-bold text-xs">
              <Send className="w-4 h-4 text-amber-400" />
              <span>Tester la notification Push</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {deviceCount} appareil(s) actif(s)
            </span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Envoyez une alerte test instantanée pour vérifier la sonnerie, la vibration et l'affichage sur votre téléphone.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleTestNotification}
              disabled={actionLoading || deviceCount === 0}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 disabled:text-slate-400 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 shadow-lg shadow-amber-950/40 cursor-pointer disabled:cursor-not-allowed"
            >
              {actionLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Envoi du test en cours...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Tester la notification Push</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Guide Android PWA */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-3.5 text-blue-200 text-xs leading-relaxed flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-blue-300">
            Fonctionnement garanti en arrière-plan sur téléphone Android :
          </p>
          <p className="text-blue-200/90 text-[11px]">
            Pour recevoir les notifications même lorsque le navigateur ou l'écran est fermé : installez GESTIO 229 en application PWA (depuis Chrome sur Android : menu <strong>⋮</strong> &gt; <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>), puis autorisez les notifications.
          </p>
        </div>
      </div>

      {/* Historique des alertes d'inscriptions */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h3 className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-emerald-400" />
            <span>Historique des notifications transmises</span>
          </h3>
          <span className="text-[11px] text-slate-400">{history.length} alerte(s) enregistrée(s)</span>
        </div>

        {history.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-slate-800/60">
            Aucune notification d'inscription n'a encore été déclenchée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-bold border-b border-slate-800 uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Date & Heure</th>
                  <th className="py-2.5 px-3">Entreprise</th>
                  <th className="py-2.5 px-3">Responsable</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-3">Secteurs</th>
                  <th className="py-2.5 px-3 text-right">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {history.map((item) => {
                  const d = item.details || {}
                  const sectors = Array.isArray(d.selected_sectors)
                    ? d.selected_sectors.join(', ')
                    : 'Boutique'
                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                        {new Date(item.createdAt).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">
                        {item.companyName || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {d.responsible_name || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                        <div>{d.email || '—'}</div>
                        {d.phone && <div className="text-emerald-400 font-mono">{d.phone}</div>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-[11px] max-w-xs truncate">
                        {sectors}
                      </td>
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          item.status === 'success'
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
                            : 'bg-amber-950/60 text-amber-300 border-amber-700'
                        }`}>
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Envoyée</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
export default PushNotificationManager
