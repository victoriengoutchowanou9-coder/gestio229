// =============================================================================
// GESTIO 229 ERP — Template Email & Rapport de Fermeture de Caisse
// Design Professionnel, Moderne et Responsive (100% Compatible Gmail & Mobiles)
// Respect strict des règles comptables et financières GESTIO229
// =============================================================================

export interface FermetureCaisseData {
  dateHeure?: string
  date?: string
  heure?: string
  caissiere?: string
  fermePar?: string
  caisseReference?: string
  secteur?: string
  entreprise?: string

  // Chiffre d'affaires & Ventes
  ca: number
  espece: number
  momo: number
  ventesCredit?: number
  nombreVentes?: number
  nombreArticles?: number

  // Marge & Rentabilité
  marge: number
  margePercent?: number
  coutAchat?: number

  // Bilan Caisse Espèces
  fondInitialEspeces?: number
  encaissementsEspeces?: number
  approvisionnementsEspeces?: number
  depensesEspeces?: number
  retraitsEspeces?: number
  soldeTheoriqueEspeces?: number
  soldePhysiqueEspeces?: number
  ecartEspeces?: number

  // Sorties & MoMo
  depenses: number
  depensesMomo?: number
  remboursement?: number
  remboursementsCount?: number

  // Créances
  creances: number
  nombreDossiersCreances?: number
  nouvellesCreancesJour?: number
  reglementsCreancesTotal?: number
  reglementsCreancesCount?: number
  clientsDebiteurs?: Array<{ nom: string; solde: number }>

  // Dépenses détaillées
  depensesDetails?: Array<{ motif: string; montant: number; mode: string; auteur?: string }>

  // Produits
  top5?: Array<{ nom: string; qte: number; montant: number }>
  top5Produits?: Array<{ nom: string; quantite?: number; qte?: number; totalVentes?: number; montant?: number }>

  // Autres indicateurs
  ventesAnnuleesCount?: number
  ventesAnnuleesMontant?: number
  nombreClientsServis?: number
  observations?: string
  anomalies?: string
}

export const formatMontantFCFA = (n: number = 0): string => {
  return `${Math.round(n || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`
}

export function generateFermetureCaisseHTML(data: FermetureCaisseData): string {
  const fmt = formatMontantFCFA

  const entreprise = data.entreprise || 'GESTIO 229'
  const secteur = data.secteur || 'Général'
  const caissiere = data.caissiere || 'Caissier'
  const fermePar = data.fermePar || caissiere
  const caisseRef = data.caisseReference || 'Caisse Principale'
  const dateFormatted = data.date || new Date().toLocaleDateString('fr-BJ')
  const heureFormatted = data.heure || new Date().toLocaleTimeString('fr-BJ', { hour: '2-digit', minute: '2-digit' })
  const dateHeure = data.dateHeure || `${dateFormatted} à ${heureFormatted}`

  // 1. Chiffre d'affaires
  const caTotal = Number(data.ca || 0)
  const caEspeces = Number(data.espece || 0)
  const caMomo = Number(data.momo || 0)
  const caCredit = Number(data.ventesCredit || 0)
  const nbVentes = Number(data.nombreVentes ?? 0)
  const nbArticles = Number(data.nombreArticles ?? 0)

  // 2. Marge
  const margeVal = Number(data.marge || 0)
  const margePct = typeof data.margePercent === 'number'
    ? data.margePercent
    : (caTotal > 0 ? Math.round((margeVal / caTotal) * 100) : 0)
  const coutAchat = Number(data.coutAchat ?? (caTotal > margeVal ? caTotal - margeVal : 0))

  // 3. Bilan Caisse Espèces
  const fondInitial = Number(data.fondInitialEspeces || 0)
  const encaissementsEsp = Number(data.encaissementsEspeces ?? caEspeces)
  const approvEsp = Number(data.approvisionnementsEspeces || 0)
  const depensesEsp = Number(data.depensesEspeces ?? (data.depenses ? data.depenses - (data.depensesMomo || 0) : 0))
  const retraitsEsp = Number(data.retraitsEspeces || 0)

  const soldeTheorique = Number(
    data.soldeTheoriqueEspeces ?? (fondInitial + encaissementsEsp + approvEsp - depensesEsp - retraitsEsp)
  )
  const soldePhysique = Number(data.soldePhysiqueEspeces ?? soldeTheorique)
  const ecartEsp = Number(data.ecartEspeces ?? (soldePhysique - soldeTheorique))

  let statutEcartHtml = '<span style="color: #0E9F6E; font-weight: 800;">0 FCFA (Caisse Parfaitement Équilibrée)</span>'
  if (ecartEsp > 0) {
    statutEcartHtml = `<span style="color: #0E9F6E; font-weight: 800;">+${fmt(ecartEsp)} (Excédent de caisse)</span>`
  } else if (ecartEsp < 0) {
    statutEcartHtml = `<span style="color: #DC2626; font-weight: 800;">${fmt(ecartEsp)} (Déficit constaté)</span>`
  }

  // 4. Top 5 Produits
  const rawTop5 = data.top5Produits || data.top5 || []
  const top5List = (Array.isArray(rawTop5) ? rawTop5 : []).slice(0, 5).map((p: any) => ({
    nom: p.nom || p.name || 'Produit',
    qte: Number(p.quantite ?? p.qte ?? 1),
    montant: Number(p.totalVentes ?? p.montant ?? 0)
  }))

  const top5RowsHtml = top5List.length > 0
    ? top5List.map((p, i) => `
        <tr>
          <td align="left" style="padding: 10px 8px; font-size: 13px; color: #1E293B; border-bottom: 1px solid #F1F5F9;">
            <strong style="color: #4F46E5; margin-right: 6px;">#${i + 1}</strong>
            <span style="font-weight: 600;">${p.nom}</span>
          </td>
          <td align="center" style="padding: 10px 8px; font-size: 13px; color: #64748B; font-weight: 600; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            ${p.qte}
          </td>
          <td align="right" style="padding: 10px 8px; font-size: 13px; font-weight: 800; color: #0F1F3C; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            ${fmt(p.montant)}
          </td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="3" align="center" style="padding: 14px; font-size: 12px; color: #94A3B8; font-style: italic;">
            Aucune vente d'articles enregistrée pour cette session.
          </td>
        </tr>
      `

  // 5. Créances & Clients Débiteurs
  const creancesTotal = Number(data.creances || 0)
  const nouvCreances = Number(data.nouvellesCreancesJour ?? caCredit)
  const reglementsCreances = Number(data.reglementsCreancesTotal ?? data.remboursement ?? 0)
  const clientsDebiteurs = Array.isArray(data.clientsDebiteurs) ? data.clientsDebiteurs.slice(0, 5) : []
  const nbDossiers = Number(data.nombreDossiersCreances ?? clientsDebiteurs.length)

  const clientsDebiteursRowsHtml = clientsDebiteurs.length > 0
    ? clientsDebiteurs.map((c, i) => `
        <tr>
          <td align="left" style="padding: 8px 6px; font-size: 12px; color: #1E293B; border-bottom: 1px solid #FEE2E2;">
            <span style="font-weight: 600;">${c.nom}</span>
          </td>
          <td align="right" style="padding: 8px 6px; font-size: 12px; font-weight: 800; color: #B45309; border-bottom: 1px solid #FEE2E2; white-space: nowrap;">
            ${fmt(c.solde)}
          </td>
        </tr>
      `).join('')
    : ''

  // 6. Dépenses Détaillées
  const depensesList = Array.isArray(data.depensesDetails) ? data.depensesDetails : []
  const depensesRowsHtml = depensesList.length > 0
    ? depensesList.map((d) => `
        <tr>
          <td align="left" style="padding: 8px 6px; font-size: 12px; color: #334155; border-bottom: 1px solid #F1F5F9;">
            ${d.motif || 'Dépense'}
          </td>
          <td align="center" style="padding: 8px 6px; font-size: 11px; color: #64748B; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; background-color: #F1F5F9; font-weight: 600;">${d.mode || 'Espèces'}</span>
          </td>
          <td align="right" style="padding: 8px 6px; font-size: 12px; font-weight: 800; color: #DC2626; border-bottom: 1px solid #F1F5F9; white-space: nowrap;">
            -${fmt(d.montant)}
          </td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="3" align="center" style="padding: 12px; font-size: 12px; color: #94A3B8; font-style: italic;">
            Aucune dépense enregistrée sur cette caisse.
          </td>
        </tr>
      `

  // 7. Contrôle & Autres infos
  const nbClients = data.nombreClientsServis ?? nbVentes
  const nbAnnulations = Number(data.ventesAnnuleesCount || 0)
  const totalSorties = depensesEsp + retraitsEsp

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fermeture de Caisse - ${entreprise}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F1F5F9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Conteneur externe -->
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F1F5F9; margin: 0; padding: 24px 8px;">
    <tr>
      <td align="center">

        <!-- Carte Principale 640px -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 640px; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08);">

          <!-- 1. EN-TÊTE PROFESSIONNEL BLEU NUIT & VIOLET GESTIO229 -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0F1F3C 0%, #1E1B4B 60%, #312E81 100%); padding: 32px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; padding: 4px 12px; background: rgba(255, 255, 255, 0.12); border-radius: 20px; font-size: 11px; font-weight: 800; color: #A5B4FC; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                      GESTIO 229 • RAPPORT OFFICIEL Z
                    </span>
                    <h1 style="margin: 8px 0 4px; font-size: 24px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px;">
                      FERMETURE DE CAISSE
                    </h1>
                    <p style="margin: 0 0 14px; font-size: 15px; font-weight: 700; color: #34D399;">
                      ${entreprise}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="border-top: 1px solid rgba(255, 255, 255, 0.15); padding-top: 14px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 12px; color: #CBD5E1; line-height: 1.6;">
                          🏢 <strong>Secteur :</strong> <span style="color: #FFFFFF;">${secteur}</span><br/>
                          👤 <strong>Caissier(ère) :</strong> <span style="color: #FFFFFF;">${caissiere}</span><br/>
                          🔒 <strong>Responsable :</strong> <span style="color: #FFFFFF;">${fermePar}</span>
                        </td>
                        <td align="right" style="font-size: 12px; color: #CBD5E1; line-height: 1.6;">
                          📅 <strong>Date :</strong> <span style="color: #FFFFFF;">${dateFormatted}</span><br/>
                          ⏰ <strong>Heure :</strong> <span style="color: #FFFFFF;">${heureFormatted}</span><br/>
                          🏷️ <strong>Réf Caisse :</strong> <span style="color: #FFFFFF;">${caisseRef}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CORPS DU RAPPORT -->
          <tr>
            <td style="padding: 24px 20px;">

              <!-- 2. CHIFFRE D'AFFAIRES DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    💰 CHIFFRE D'AFFAIRES DU JOUR (VENTES RÉELLES)
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 14px; font-weight: 700; color: #475569;">
                          Chiffre d'Affaires Total
                        </td>
                        <td align="right" style="font-size: 26px; font-weight: 900; color: #0F1F3C; white-space: nowrap;">
                          ${fmt(caTotal)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #E2E8F0; margin: 12px 0; padding-top: 12px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="left" style="padding: 4px 0; font-size: 13px; color: #334155;">
                                • Encaissements Espèces
                              </td>
                              <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 800; color: #0E9F6E;">
                                ${fmt(caEspeces)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="padding: 4px 0; font-size: 13px; color: #334155;">
                                • Paiements Mobile Money (MTN / Moov)
                              </td>
                              <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 800; color: #0284C7;">
                                ${fmt(caMomo)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="padding: 4px 0; font-size: 13px; color: #334155;">
                                • Ventes à Crédit (Créances clients créées)
                              </td>
                              <td align="right" style="padding: 4px 0; font-size: 13px; font-weight: 800; color: #D97706;">
                                ${fmt(caCredit)}
                              </td>
                            </tr>
                            <tr>
                              <td colspan="2" style="border-top: 1px dashed #CBD5E1; padding-top: 8px; margin-top: 8px;"></td>
                            </tr>
                            <tr>
                              <td align="left" style="font-size: 12px; color: #64748B;">
                                Total ventes : <strong>${nbVentes}</strong> | Total articles vendus : <strong>${nbArticles}</strong>
                              </td>
                              <td align="right" style="font-size: 11px; color: #94A3B8; font-style: italic;">
                                CA = Espèces + MoMo + Crédit
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 3. MARGE BÉNÉFICIAIRE -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    📈 MARGE BÉNÉFICIAIRE &amp; RENTABILITÉ DU JOUR
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 16px 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 13px; font-weight: 700; color: #065F46;">
                          Marge Bénéficiaire Totale
                        </td>
                        <td align="right" style="font-size: 20px; font-weight: 900; color: #0E9F6E; white-space: nowrap;">
                          ${fmt(margeVal)} <span style="font-size: 14px; font-weight: 800; color: #059669;">(${margePct}%)</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #A7F3D0; padding-top: 10px; margin-top: 10px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="left" style="font-size: 12px; color: #047857;">
                                Coût d'achat réel des produits vendus :
                              </td>
                              <td align="right" style="font-size: 13px; font-weight: 800; color: #065F46;">
                                ${fmt(coutAchat)}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 4. BILAN DE LA CAISSE ESPÈCES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    💵 BILAN DE LA CAISSE ESPÈCES (CONTRÔLE PHYSIQUE)
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 16px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          Fonds de caisse initial
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #0F1F3C;">
                          +${fmt(fondInitial)}
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          + Encaissements ventes en espèces
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #0E9F6E;">
                          +${fmt(encaissementsEsp)}
                        </td>
                      </tr>
                      ${approvEsp > 0 ? `
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          + Approvisionnements de caisse
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #0E9F6E;">
                          +${fmt(approvEsp)}
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          - Dépenses réglées en espèces
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #DC2626;">
                          -${fmt(depensesEsp)}
                        </td>
                      </tr>
                      ${retraitsEsp > 0 ? `
                      <tr>
                        <td align="left" style="padding: 6px 0; font-size: 13px; color: #475569;">
                          - Retraits / Versements coffre
                        </td>
                        <td align="right" style="padding: 6px 0; font-size: 13px; font-weight: 800; color: #DC2626;">
                          -${fmt(retraitsEsp)}
                        </td>
                      </tr>` : ''}
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #E2E8F0; padding-top: 8px; margin-top: 6px;"></td>
                      </tr>
                      <tr style="background-color: #F8FAFC;">
                        <td align="left" style="padding: 8px 10px; font-size: 13px; font-weight: 800; color: #0F1F3C; border-radius: 8px 0 0 8px;">
                          Montant Théorique Attendu en Caisse
                        </td>
                        <td align="right" style="padding: 8px 10px; font-size: 15px; font-weight: 900; color: #0F1F3C; border-radius: 0 8px 8px 0; white-space: nowrap;">
                          ${fmt(soldeTheorique)}
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 8px 10px; font-size: 13px; font-weight: 700; color: #334155;">
                          Montant Physique Déclaré par Caissier
                        </td>
                        <td align="right" style="padding: 8px 10px; font-size: 15px; font-weight: 800; color: #0F1F3C; white-space: nowrap;">
                          ${fmt(soldePhysique)}
                        </td>
                      </tr>
                      <tr style="background-color: ${ecartEsp === 0 ? '#ECFDF5' : ecartEsp > 0 ? '#F0FDF4' : '#FEF2F2'};">
                        <td align="left" style="padding: 8px 10px; font-size: 13px; font-weight: 800; color: #1E293B; border-radius: 8px 0 0 8px;">
                          Écart Constaté
                        </td>
                        <td align="right" style="padding: 8px 10px; font-size: 14px; border-radius: 0 8px 8px 0; white-space: nowrap;">
                          ${statutEcartHtml}
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 8px 0 0; font-size: 11px; color: #94A3B8; font-style: italic;">
                      ℹ️ Règle comptable : Les paiements Mobile Money et créances sont strictement exclus du solde physique des espèces.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- 5. TOP 5 PRODUITS DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    🏆 TOP 5 DES PRODUITS DU JOUR (PAR CHIFFRE D'AFFAIRES)
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 6px 14px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <thead>
                        <tr style="border-bottom: 2px solid #E2E8F0;">
                          <th align="left" style="padding: 8px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Produit</th>
                          <th align="center" style="padding: 8px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Qté Vendue</th>
                          <th align="right" style="padding: 8px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Chiffre d'Affaires</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${top5RowsHtml}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 6. SITUATION DES CRÉANCES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    📋 GESTION DES CRÉANCES CLIENTS
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px; padding: 16px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-size: 13px; font-weight: 700; color: #92400E;">
                          Portefeuille Total Créances en Cours
                        </td>
                        <td align="right" style="font-size: 18px; font-weight: 900; color: #B45309; white-space: nowrap;">
                          ${fmt(creancesTotal)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #FDE68A; padding-top: 8px; margin-top: 8px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0">
                            <tr>
                              <td align="left" style="font-size: 12px; color: #78350F; padding: 3px 0;">
                                • Nouvelles ventes à crédit enregistrées aujourd'hui :
                              </td>
                              <td align="right" style="font-size: 12px; font-weight: 800; color: #92400E; padding: 3px 0;">
                                ${fmt(nouvCreances)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="font-size: 12px; color: #78350F; padding: 3px 0;">
                                • Règlements de créances encaissés aujourd'hui :
                              </td>
                              <td align="right" style="font-size: 12px; font-weight: 800; color: #065F46; padding: 3px 0;">
                                ${fmt(reglementsCreances)}
                              </td>
                            </tr>
                            <tr>
                              <td align="left" style="font-size: 12px; color: #78350F; padding: 3px 0;">
                                • Nombre de dossiers débiteurs actifs :
                              </td>
                              <td align="right" style="font-size: 12px; font-weight: 800; color: #92400E; padding: 3px 0;">
                                ${nbDossiers} client(s)
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ${clientsDebiteursRowsHtml ? `
                      <tr>
                        <td colspan="2" style="padding-top: 10px;">
                          <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #FFFFFF; border-radius: 8px; border: 1px solid #FDE68A; padding: 4px 10px;">
                            ${clientsDebiteursRowsHtml}
                          </table>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 7. RAPPORT DES DÉPENSES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    💸 RAPPORT DES DÉPENSES DU JOUR (${fmt(data.depenses || 0)})
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 12px; padding: 6px 14px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <thead>
                        <tr style="border-bottom: 2px solid #E2E8F0;">
                          <th align="left" style="padding: 8px 6px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Motif</th>
                          <th align="center" style="padding: 8px 6px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Mode</th>
                          <th align="right" style="padding: 8px 6px; font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${depensesRowsHtml}
                      </tbody>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- 8. AUTRES INFORMATIONS & CONTRÔLE -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 22px;">
                <tr>
                  <td style="font-size: 12px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.5px; padding-bottom: 8px;">
                    ℹ️ SYNTHÈSE DE CONTRÔLE &amp; OBSERVATIONS
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Clients servis : <strong>${nbClients}</strong>
                        </td>
                        <td align="right" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Ventes annulées : <strong>${nbAnnulations}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Règlements créances reçus : <strong>${data.reglementsCreancesCount ?? 0}</strong>
                        </td>
                        <td align="right" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Remboursements effectués : <strong>${data.remboursementsCount ?? 0} (${fmt(data.remboursement || 0)})</strong>
                        </td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Total entrées espèces : <strong>+${fmt(encaissementsEsp + approvEsp)}</strong>
                        </td>
                        <td align="right" style="padding: 4px 0; font-size: 12px; color: #475569;">
                          • Total sorties espèces : <strong>-${fmt(totalSorties)}</strong>
                        </td>
                      </tr>
                      ${data.observations ? `
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #E2E8F0; padding-top: 10px; margin-top: 8px;">
                          <div style="background-color: #FFFFFF; border: 1px solid #CBD5E1; border-radius: 8px; padding: 10px 12px;">
                            <strong style="font-size: 11px; text-transform: uppercase; color: #64748B; display: block; margin-bottom: 4px;">Observations du caissier :</strong>
                            <span style="font-size: 12px; color: #1E293B; font-style: italic;">« ${data.observations} »</span>
                          </div>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>

              <!-- PIÈCE JOINTE PDF NOTIFICATION -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #EEF2FF; border: 1px solid #C7D2FE; border-radius: 10px; padding: 12px 16px;">
                <tr>
                  <td align="left" style="font-size: 12px; font-weight: 700; color: #3730A3;">
                    📎 Le rapport officiel complet avec toutes les pièces justificatives est joint à ce message au format PDF.
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="background-color: #0F1F3C; padding: 20px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-size: 12px; font-weight: 700; color: #FFFFFF;">
                    GESTIO 229 ERP • LOGICIEL DE GESTION &amp; CAISSE DU BÉNIN
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-size: 11px; color: #94A3B8; padding-top: 4px;">
                    ${entreprise} • Système certifié et sécurisé • <a href="https://www.gestio229.com" style="color: #34D399; text-decoration: none; font-weight: bold;">www.gestio229.com</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`.trim()
}
