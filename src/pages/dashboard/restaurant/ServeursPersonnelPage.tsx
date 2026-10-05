import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Plus, RefreshCw, Award, Percent, DollarSign,
  Phone, UserCheck, Shield, ChevronRight, X, Search
} from 'lucide-react'
import { useTenant } from '../../../hooks/useTenant'
import { useUIStore } from '../../../store/uiStore'
import { formatFCFA } from '../../../utils/tax'
import clsx from 'clsx'

const fmt = (n: number) => formatFCFA(n)

export const ServeursPersonnelPage: React.FC = () => {
  const { companyId, supabaseTenant } = useTenant()
  const { toast } = useUIStore()

  const [personnel, setPersonnel] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search, setSearch] = useState('')

  const [form, setForm] = useState({
    matricule: '',
    nom_complet: '',
    role: 'SERVEUR',
    telephone: '',
    zone_attribuee: 'Salle principale',
    taux_commission: 2,
    notes: ''
  })

  const defaultPersonnel = [
    {
      id: 'srv-1',
      matricule: 'SRV-001',
      nom_complet: 'Koffi Dossou',
      role: 'SERVEUR',
      telephone: '+229 97 12 34 56',
      zone_attribuee: 'Salle principale',
      taux_commission: 3,
      statut: 'ACTIF',
      total_ventes: 345000,
      nb_commandes: 28
    },
    {
      id: 'srv-2',
      matricule: 'SRV-002',
      nom_complet: 'Awa Traoré',
      role: 'SERVEUR',
      telephone: '+229 95 67 89 01',
      zone_attribuee: 'VIP & Terrasse',
      taux_commission: 3,
      statut: 'ACTIF',
      total_ventes: 480000,
      nb_commandes: 34
    },
    {
      id: 'srv-3',
      matricule: 'BAR-001',
      nom_complet: 'Moussa Agbeko',
      role: 'BARMAN',
      telephone: '+229 66 11 22 33',
      zone_attribuee: 'Comptoir Bar',
      taux_commission: 2,
      statut: 'ACTIF',
      total_ventes: 590000,
      nb_commandes: 52
    },
    {
      id: 'srv-4',
      matricule: 'CUIS-001',
      nom_complet: 'Chef Paulin',
      role: 'CUISINIER',
      telephone: '+229 90 44 55 66',
      zone_attribuee: 'Cuisine centrale',
      taux_commission: 0,
      statut: 'ACTIF',
      total_ventes: 0,
      nb_commandes: 0
    }
  ]

  const loadPersonnel = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    try {
      const { data, error } = await supabaseTenant('restaurant_serveurs')
        .select('*')
        .order('nom_complet')

      if (error) throw error
      if (data && data.length > 0) {
        setPersonnel(data)
      } else {
        setPersonnel(defaultPersonnel)
      }
    } catch (err: any) {
      console.warn('[Serveurs] Fallback utilisé:', err.message)
      setPersonnel(defaultPersonnel)
    } finally {
      setLoading(false)
    }
  }, [companyId, supabaseTenant])

  useEffect(() => {
    loadPersonnel()
  }, [loadPersonnel])

  const handleSaveMembre = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nom_complet.trim() || !form.matricule.trim()) {
      toast.error('Champs requis', 'Veuillez renseigner le matricule et le nom complet.')
      return
    }

    try {
      await supabaseTenant('restaurant_serveurs').insert({
        matricule: form.matricule.trim().toUpperCase(),
        nom_complet: form.nom_complet.trim(),
        role: form.role,
        telephone: form.telephone,
        zone_attribuee: form.zone_attribuee,
        taux_commission: Number(form.taux_commission) || 0,
        statut: 'ACTIF',
        notes: form.notes
      })

      toast.success('Membre ajouté', `${form.nom_complet} (${form.role}) enregistré.`)
      setShowModal(false)
      loadPersonnel()
    } catch (err: any) {
      toast.error('Erreur', err.message)
    }
  }

  const filtered = useMemo(() => {
    return personnel.filter(p =>
      !search ||
      p.nom_complet.toLowerCase().includes(search.toLowerCase()) ||
      p.matricule.toLowerCase().includes(search.toLowerCase()) ||
      p.role.toLowerCase().includes(search.toLowerCase())
    )
  }, [personnel, search])

  const totalVentesEquipe = useMemo(() => {
    return personnel.reduce((sum, p) => sum + (Number(p.total_ventes) || 0), 0)
  }, [personnel])

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <Users className="w-6 h-6 text-rose-600" />
            Personnel & Équipe de Service
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestion des serveurs, barmen, cuisiniers, affectation des zones et suivi des commissions sur ventes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={loadPersonnel} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl transition">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl text-xs font-black flex items-center gap-2 shadow-lg shadow-rose-600/20 transition"
          >
            <Plus className="w-4 h-4" /> Nouveau Membre d'Équipe
          </button>
        </div>
      </div>

      {/* Cartes Équipe */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Total Effectif Piste/Salle</span>
          <p className="text-2xl font-black text-slate-900 mt-1">{personnel.length} membres</p>
        </div>
        <div className="bg-emerald-50/60 p-5 rounded-3xl border border-emerald-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-emerald-800 uppercase">Ventes Réalisées Équipe</span>
          <p className="text-2xl font-black text-emerald-700 font-mono mt-1">{fmt(totalVentesEquipe)}</p>
        </div>
        <div className="bg-rose-50/60 p-5 rounded-3xl border border-rose-200/80 shadow-sm">
          <span className="text-[10px] font-bold text-rose-800 uppercase">Meilleur Serveur du Mois</span>
          <p className="text-lg font-black text-rose-700 mt-1">Awa Traoré (480 000 F)</p>
        </div>
      </div>

      {/* Tableau Personnel */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Rechercher membre par nom ou rôle..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Matricule & Nom</th>
                <th className="py-3 px-4">Poste / Rôle</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Zone Assignée</th>
                <th className="py-3 px-4 text-center">Taux Comm.</th>
                <th className="py-3 px-4 text-right">Ventes Générées</th>
                <th className="py-3 px-4 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/60 transition">
                  <td className="py-3 px-4">
                    <p className="font-black text-slate-900">{p.nom_complet}</p>
                    <p className="text-[10px] font-mono text-slate-400 font-bold">{p.matricule}</p>
                  </td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-50 text-rose-700">
                      {p.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600">{p.telephone || '-'}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{p.zone_attribuee}</td>
                  <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                    {p.taux_commission} %
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-black text-emerald-600">
                    {p.total_ventes > 0 ? fmt(p.total_ventes) : '-'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      {p.statut}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Ajout Personnel */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base">Ajouter un Membre d'Équipe</h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-xl text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMembre} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Matricule *</label>
                  <input
                    type="text"
                    required
                    placeholder="SRV-005"
                    value={form.matricule}
                    onChange={e => setForm({ ...form, matricule: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Rôle / Poste</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                  >
                    <option value="SERVEUR">Serveur / Serveuse</option>
                    <option value="BARMAN">Barman / Barmaid</option>
                    <option value="CUISINIER">Cuisinier / Grillardin</option>
                    <option value="CHEF_RANG">Chef de rang / Maître d'hôtel</option>
                    <option value="CAISSIER">Caissier(e)</option>
                    <option value="LIVREUR">Livreur</option>
                    <option value="GERANT">Gérant / Manager</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Nom complet *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Koffi Mensah"
                  value={form.nom_complet}
                  onChange={e => setForm({ ...form, nom_complet: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Téléphone</label>
                  <input
                    type="tel"
                    placeholder="+229 97 00 00 00"
                    value={form.telephone}
                    onChange={e => setForm({ ...form, telephone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Commission (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    step="0.5"
                    value={form.taux_commission}
                    onChange={e => setForm({ ...form, taux_commission: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Zone Assignée</label>
                <select
                  value={form.zone_attribuee}
                  onChange={e => setForm({ ...form, zone_attribuee: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                >
                  <option value="Salle principale">Salle principale</option>
                  <option value="Terrasse">Terrasse</option>
                  <option value="VIP & Salon">VIP & Salon</option>
                  <option value="Comptoir Bar">Comptoir Bar</option>
                  <option value="Toutes zones">Toutes zones</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-xl text-xs shadow-md shadow-rose-600/20"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default ServeursPersonnelPage
