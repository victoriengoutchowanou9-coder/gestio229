import React, { useState } from 'react'
import {
  ShieldCheck,
  QrCode,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Bus,
  Clock,
  User,
  Ticket
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import {
  transportService,
  TransportTicket
} from '../../../services/transportService'

export const TransportControleTicketsPage: React.FC = () => {
  const { companyId: ctxCompanyId, sectorSlug, company, user } = useTenant()
  const companyId = ctxCompanyId || 'demo-company'
  const tenant = company
  const controleurNom = (user as any)?.name || 'Agent Contrôleur'

  const [codeScan, setCodeScan] = useState('')
  const [resultat, setResultat] = useState<{
    success: boolean
    message: string
    ticket?: TransportTicket
    estValide: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [historiqueScans, setHistoriqueScans] = useState<{
    date: string
    code: string
    message: string
    valide: boolean
  }[]>([])

  const handleControler = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codeScan.trim()) return

    setLoading(true)
    try {
      const res = await transportService.controlerTicket(companyId, codeScan, controleurNom)
      setResultat(res)

      setHistoriqueScans(prev => [
        {
          date: new Date().toLocaleTimeString('fr-FR'),
          code: codeScan.trim(),
          message: res.message,
          valide: res.estValide,
        },
        ...prev.slice(0, 9)
      ])

      setCodeScan('')
    } catch (e) {
      setResultat({
        success: false,
        message: 'Erreur lors de la vérification du billet.',
        estValide: false,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Contrôle des Billets & Embarquement
              </h1>
              <p className="text-sm text-slate-400">
                Scan et validation d'authenticité au quai, prévention stricte des réutilisations et faux billets
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Zone de Scan Centralisée ── */}
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6 text-center">
          <div className="inline-flex p-4 rounded-2xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <QrCode className="w-12 h-12" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white">Scanner ou Saisir le Billet</h2>
            <p className="text-xs text-slate-400 mt-1">
              Pointez la douchette code-barres / QR Code ou entrez la référence du ticket (ex : TKT-202610-8492)
            </p>
          </div>

          <form onSubmit={handleControler} className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder="Scanner QR code ou N° ticket..."
              value={codeScan}
              onChange={e => setCodeScan(e.target.value)}
              className="flex-1 p-3 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={loading || !codeScan.trim()}
              className="px-6 py-3 font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center gap-2"
            >
              <Search className="w-4 h-4" />
              Vérifier
            </button>
          </form>
        </div>

        {/* ── Résultat de la validation en direct ── */}
        {resultat && (
          <div className={`p-6 rounded-3xl border shadow-2xl transition-all ${
            resultat.estValide
              ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100'
              : 'bg-rose-950/40 border-rose-500/50 text-rose-100'
          }`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${resultat.estValide ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                {resultat.estValide ? <CheckCircle2 className="w-10 h-10" /> : <XCircle className="w-10 h-10" />}
              </div>

              <div>
                <h3 className="text-lg font-black tracking-tight">
                  {resultat.estValide ? 'EMBARQUEMENT AUTORISÉ' : 'ACCÈS REFUSÉ'}
                </h3>
                <p className="text-xs opacity-90 mt-0.5 font-medium">
                  {resultat.message}
                </p>
              </div>
            </div>

            {/* Fiche détaillée du ticket validé */}
            {resultat.ticket && (
              <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block text-[11px]">Passager :</span>
                  <strong className="text-white text-sm">{resultat.ticket.passager_nom}</strong>
                  <span className="text-[10px] text-slate-400 block">{resultat.ticket.passager_telephone}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Siège attribué :</span>
                  <strong className="text-blue-400 text-base font-black">N° {resultat.ticket.siege_numero || 'Libre'}</strong>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Trajet :</span>
                  <strong className="text-white">{resultat.ticket.arret_depart} ➔ {resultat.ticket.arret_arrivee}</strong>
                  <span className="text-[10px] text-slate-400 block">{resultat.ticket.ligne_nom}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Départ & Bus :</span>
                  <strong className="text-white">{resultat.ticket.heure_depart} ({resultat.ticket.date_voyage})</strong>
                  <span className="text-[10px] text-slate-400 block">Bus : {resultat.ticket.bus_immatriculation}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Historique des Derniers Contrôles ── */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider">
            Historique des Scans Récents
          </h4>

          <div className="divide-y divide-slate-800/60 text-xs">
            {historiqueScans.length === 0 ? (
              <div className="py-4 text-center text-slate-500">
                Aucun billet contrôlé dans cette session.
              </div>
            ) : (
              historiqueScans.map((h, i) => (
                <div key={i} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {h.valide ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span className="font-mono text-slate-300 font-semibold">{h.code}</span>
                  </div>
                  <span className="text-[11px] text-slate-500 font-mono">{h.date}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default TransportControleTicketsPage
