// =============================================================================
// GESTIO 229 ADMIN — Gestionnaire des Notifications Push du Concepteur
// Permet d'enregistrer le téléphone du concepteur (Android / Chrome / PWA),
// tester la réception réelle de bout en bout et consulter l'historique exhaustif.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react'
import {
  Bell, Smartphone, Send, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ShieldCheck, History, Info, Clock, Check, Radio, CheckCheck
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
  const [swActive, setSwActive] = useState(false)
  const [isServerSynced, setIsServerSynced] = useState(false)
  const [deviceCount, setDeviceCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [testSuccess, setTestSuccess] = useState<string | null>(null)
  const [localAckReceived, setLocalAckReceived] = useState<{ title: string; time: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])

  // Détection de l'appareil
  const deviceType = typeof navigator !== 'undefined'
    ? (/android/i.test(navigator.userAgent)
        ? 'Téléphone Android'
        : /iphone|ipad/i.test(navigator.userAgent)
        ? 'Appareil iOS (Safari PWA)'
        : 'Ordinateur / Desktop')
    : 'Appareil inconnu'

  // Vérification initiale du support navigateur
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

  // Écouteur en direct des messages du Service Worker pour confirmation de réception
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GESTIO_PUSH_RECEIVED') {
        const timeStr = new Intl.DateTimeFormat('fr-FR', {
          timeStyle: 'medium',
          timeZone: 'Africa/Porto-Novo',
        }).format(new Date(event.data.timestamp || Date.now()))

        setLocalAckReceived({
          title: event.data.title || 'Notification reçue',
          time: timeStr,
        })
      }
    }

    navigator.serviceWorker.addEventListener('message', handleSwMessage)
    return () => {
      navigator.serviceWorker.removeEventListener('message', handleSwMessage)
    }
  }, [])

  // Charger le statut serveur et l'historique
  const loadStatusAndHistory = useCallback(async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      let currentEndpoint = ''
      let localActive = false

      if ('serviceWorker' in navigator && 'PushManager' in window) {
        // Vérifier l'état du Service Worker
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) {
          setSwActive(true)
          const sub = await reg.pushManager.getSubscription()
          if (sub) {
            localActive = true
            currentEndpoint = sub.endpoint
          }
        } else {
          setSwActive(false)
        }
      }

      setIsSubscribed(localActive)

      // Charger le statut des appareils depuis le serveur
      const urlStatus = currentEndpoint
        ? `/api/admin-push?action=status&endpoint=${encodeURIComponent(currentEndpoint)}`
        : '/api/admin-push?action=status'

      const resStatus = await adminApiFetch(urlStatus)
      const jsonStatus = await resStatus.json()

      if (jsonStatus.success) {
        setDeviceCount(jsonStatus.deviceCount || 0)
        const serverRegistered = Boolean(jsonStatus.isCurrentDeviceRegistered)
        setIsServerSynced(serverRegistered)

        // Si le navigateur a un abonnement local mais qu'il n'est pas encore en base, synchroniser
        if (localActive && !serverRegistered && currentEndpoint) {
          try {
            const reg = await navigator.serviceWorker.ready
            const sub = await reg.pushManager.getSubscription()
            if (sub) {
              const deviceName = /android/i.test(navigator.userAgent)
                ? 'Téléphone Android du Concepteur'
                : 'Appareil Super Admin'
              await adminApiFetch('/api/admin-push?action=subscribe', {
                method: 'POST',
                body: JSON.stringify({
                  action: 'subscribe',
                  subscription: sub.toJSON(),
                  deviceName,
                }),
              })
              setIsServerSynced(true)
              setDeviceCount((prev) => Math.max(prev, 1))
            }
          } catch (_) {}
        }
      }

      // Charger l'historique des notifications
      const resHistory = await adminApiFetch('/api/admin-push?action=history')
      const jsonHistory = await resHistory.json()
      if (jsonHistory.success) {
        setHistory(jsonHistory.history || [])
      }
    } catch (err: any) {
      console.warn('[PushManager] Notice chargement statut:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatusAndHistory()
  }, [loadStatusAndHistory])

  // Activer les notifications sur cet appareil
  const handleSubscribe = async () => {
    setErrorMsg(null)
    setTestSuccess(null)
    setLocalAckReceived(null)
    setActionLoading(true)

    try {
      if (!isSupported) {
        throw new Error('Votre navigateur ou appareil ne supporte pas les notifications Web Push.')
      }

      // 1. Demande de permission
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') {
        throw new Error('Permission non accordée. Pour Android Chrome : ouvrez les paramètres du site (icône cadenas à gauche de l\'URL) > Autorisations > Notifications > Autoriser.')
      }

      // 2. Récupérer la clé publique VAPID
      const vapidRes = await adminApiFetch('/api/admin-push?action=vapid_public_key')
      const vapidJson = await vapidRes.json()
      if (!vapidJson.success || !vapidJson.publicKey) {
        throw new Error(vapidJson.error || 'Impossible de récupérer la clé VAPID.')
      }

      // 3. Enregistrer et activer le Service Worker
      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js')
      } else {
        await reg.update().catch(() => {})
      }
      await navigator.serviceWorker.ready
      setSwActive(true)

      // 4. Souscription Push avec gestion propre des anciennes clés
      const convertedVapidKey = urlBase64ToUint8Array(vapidJson.publicKey)
      let subscription: PushSubscription

      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        })
      } catch (subErr: any) {
        // En cas de conflit avec une ancienne clé VAPID, désabonner et recréer
        const existing = await reg.pushManager.getSubscription()
        if (existing) {
          await existing.unsubscribe()
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey,
          })
        } else {
          throw subErr
        }
      }

      // 5. Enregistrer auprès du serveur
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
        throw new Error(saveJson.error || "Échec de l'enregistrement sur le serveur.")
      }

      setIsSubscribed(true)
      setIsServerSynced(true)
      setTestSuccess("Cet appareil est désormais connecté avec succès aux alertes d'inscriptions !")
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
    setLocalAckReceived(null)
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
      setIsServerSynced(false)
      setTestSuccess('Notifications désactivées pour cet appareil.')
      await loadStatusAndHistory()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de la désactivation.')
    } finally {
      setActionLoading(false)
    }
  }

  // Déclencher un test push immédiat avec confirmation de bout en bout
  const handleTestNotification = async () => {
    setActionLoading(true)
    setErrorMsg(null)
    setTestSuccess(null)
    setLocalAckReceived(null)

    try {
      const res = await adminApiFetch('/api/admin-push?action=test', {
        method: 'POST',
        body: JSON.stringify({ action: 'test' }),
      })
      const json = await res.json()
      if (!json.success) {
        throw new Error(json.error || 'Échec de l\'envoi du test par le serveur Push.')
      }

      setTestSuccess(
        json.message || `Notification Push de test transmise avec succès au service Push (${json.sentCount || 1} appareil notifié) !`
      )
      await loadStatusAndHistory()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erreur lors de l\'envoi du test.')
    } finally {
      setActionLoading(false)
    }
  }

  const isFullyConnected = isSubscribed && isServerSynced && permission === 'granted'

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
            Recevez une alerte sonore et vibrante instantanée sur votre téléphone Android dès qu'une nouvelle entreprise s'inscrit sur GESTIO 229.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
            isFullyConnected
              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700'
              : 'bg-amber-950/60 text-amber-400 border-amber-800'
          }`}>
            <span className={`w-2 h-2 rounded-full ${isFullyConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-500'}`} />
            <span>{isFullyConnected ? 'Cet appareil est connecté' : 'Configuration incomplète sur cet appareil'}</span>
          </span>
          <button
            type="button"
            onClick={loadStatusAndHistory}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
            title="Rafraîchir l'état"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Tableau de bord de Diagnostic Réel */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/70 border border-slate-800 rounded-xl p-3 text-xs">
        <div className="space-y-1">
          <span className="text-slate-400 text-[11px] block">Appareil & Système</span>
          <div className="font-semibold text-white truncate" title={deviceType}>
            {deviceType}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-slate-400 text-[11px] block">Autorisation Système</span>
          <div className="flex items-center gap-1.5 font-bold">
            {permission === 'granted' ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Accordée
              </span>
            ) : permission === 'denied' ? (
              <span className="text-rose-400 flex items-center gap-1">
                <XCircle className="w-3.5 h-3.5" /> Bloquée
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> À demander
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-slate-400 text-[11px] block">Service Worker (SW)</span>
          <div className="flex items-center gap-1.5 font-bold">
            {swActive ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Actif (/sw.js)
              </span>
            ) : (
              <span className="text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> En attente
              </span>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-slate-400 text-[11px] block">Appareils Concepteur Actifs</span>
          <div className="font-mono font-bold text-amber-400">
            {deviceCount} connecté(s)
          </div>
        </div>
      </div>

      {/* Messages de retour */}
      {testSuccess && (
        <div className="bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs p-3.5 rounded-xl flex items-center gap-2.5 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{testSuccess}</span>
        </div>
      )}

      {/* Confirmation locale en direct si le Service Worker a reçu et affiché la notification */}
      {localAckReceived && (
        <div className="bg-emerald-900/60 border border-emerald-500 text-emerald-100 text-xs p-3.5 rounded-xl flex items-center gap-2.5 shadow-lg shadow-emerald-950/50 animate-bounce">
          <CheckCheck className="w-5 h-5 text-emerald-300 shrink-0" />
          <div>
            <div className="font-bold text-emerald-200">
              Notification Push reçue et affichée sur cet appareil à {localAckReceived.time} !
            </div>
            <div className="text-[11px] text-emerald-300/90">
              Titre : {localAckReceived.title}
            </div>
          </div>
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
            <span>Enregistrement de cet appareil</span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Pour recevoir les notifications sur votre téléphone Android même écran éteint ou navigateur fermé, ouvrez cette page dans Chrome ou l'application PWA installée, puis cliquez ci-dessous.
          </p>

          <div className="pt-1">
            {!isFullyConnected ? (
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
                  <span>Connecté et actif sur cet appareil</span>
                </span>
                <button
                  type="button"
                  onClick={handleUnsubscribe}
                  disabled={actionLoading}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white py-2 px-3 rounded-xl text-xs font-medium transition cursor-pointer"
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
              <span>Tester la notification Push réelle</span>
            </span>
            <span className="text-[11px] text-slate-400 font-mono">
              {deviceCount} appareil(s) actif(s)
            </span>
          </div>
          <p className="text-slate-400 text-xs leading-relaxed">
            Envoyez une alerte test instantanée. Elle transitera par les serveurs Google FCM jusqu'à votre téléphone avec sonnerie et vibration.
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

      {/* Guide Android PWA & Réception en arrière-plan */}
      <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-3.5 text-blue-200 text-xs leading-relaxed flex items-start gap-2.5">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-blue-300">
            Conditions pour la réception en arrière-plan et écran éteint sur Android :
          </p>
          <ul className="text-blue-200/90 text-[11px] list-disc list-inside space-y-0.5">
            <li>Installez GESTIO 229 en PWA depuis Chrome (menu <strong>⋮</strong> &gt; <strong>« Installer l'application »</strong>).</li>
            <li>Assurez-vous que les notifications de Chrome ou de l'application ne sont pas bloquées dans les paramètres Android.</li>
            <li>Désactivez l'optimisation de batterie agressive pour GESTIO 229 dans les paramètres Android si vous souhaitez une alerte immédiate écran verrouillé.</li>
          </ul>
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
