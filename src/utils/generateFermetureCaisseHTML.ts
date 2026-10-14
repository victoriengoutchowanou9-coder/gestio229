// =============================================================================
// GESTIO 229 — Template Email & PDF Fermeture de Caisse Moderne
// Palette stricte : #0F1F3C (Bleu nuit), #0E9F6E (Vert), #FFFFFF (Blanc), #F3F4F6 (Gris clair), #111827 (Texte)
// 100% Compatible Gmail (Tables HTML imbriquées, inline styles, responsive mobile)
// =============================================================================

export interface FermetureCaisseData {
  dateHeure: string
  caissiere: string
  secteur: string
  entreprise: string
  ca: number
  espece: number
  momo: number
  marge: number
  margePercent?: number
  depenses: number
  remboursement: number
  creances: number
  top5: Array<{ nom: string; qte: number; montant: number }>
}

export const formatMontantFCFA = (n: number = 0): string => {
  return `${Math.round(n || 0).toLocaleString('fr-FR').replace(/\s/g, ' ')} FCFA`
}

export function generateFermetureCaisseHTML(data: FermetureCaisseData): string {
  const fmt = formatMontantFCFA
  const margePct = typeof data.margePercent === 'number'
    ? data.margePercent
    : (data.ca > 0 ? Math.round((data.marge / data.ca) * 100) : 0)

  const top5List = Array.isArray(data.top5) && data.top5.length > 0 ? data.top5.slice(0, 5) : []

  const top5RowsHtml = top5List.length > 0
    ? top5List.map((p, i) => `
        <tr>
          <td align="left" style="padding: 9px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #111827; ${i > 0 ? 'border-top: 1px solid #F1F5F9;' : ''}">
            <strong style="color: #0F1F3C; margin-right: 6px;">${i + 1}.</strong>
            <span>${p.nom || 'Produit'}</span>
            <span style="color: #6B7280; font-size: 12px; margin-left: 6px;">— ${p.qte || 0} vendus</span>
          </td>
          <td align="right" style="padding: 9px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 800; color: #111827; white-space: nowrap; ${i > 0 ? 'border-top: 1px solid #F1F5F9;' : ''}">
            ${fmt(p.montant)}
          </td>
        </tr>
      `).join('')
    : `
        <tr>
          <td colspan="2" align="center" style="padding: 12px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; color: #9CA3AF; font-style: italic;">
            Aucune vente enregistrée pour cette session.
          </td>
        </tr>
      `

  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Fermeture de Caisse - ${data.secteur || 'GESTIO 229'}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F3F4F6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">

  <!-- Conteneur externe pleine largeur -->
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #F3F4F6; margin: 0; padding: 24px 0;">
    <tr>
      <td align="center" style="padding: 0 12px;">

        <!-- Carte principale 600px max -->
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; border: 1px solid #E5E7EB; box-shadow: 0 4px 12px rgba(15, 31, 60, 0.05);">

          <!-- HEADER BLEU NUIT (#0F1F3C) -->
          <tr>
            <td align="center" style="background-color: #0F1F3C; padding: 28px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px; padding-bottom: 6px;">
                    🏪 Fermeture de Caisse
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 500; color: #CBD5E1; padding-bottom: 4px;">
                    ${data.dateHeure} — <strong style="color: #FFFFFF;">${data.caissiere}</strong>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; font-weight: 700; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px;">
                    Secteur : <span style="color: #FFFFFF;">${data.secteur}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- CORPS DU RAPPORT -->
          <tr>
            <td style="padding: 22px 24px 24px 24px;">

              <!-- SECTION 1 - CHIFFRE D'AFFAIRES DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    💰 CHIFFRE D'AFFAIRES DU JOUR
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 18px 20px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #475569;">
                          CA total du jour
                        </td>
                        <td align="right" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 26px; font-weight: 900; color: #0F1F3C; letter-spacing: -0.5px; white-space: nowrap;">
                          ${fmt(data.ca)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 2 - DÉTAILS ENCAISSEMENTS -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    🏦 DÉTAILS ENCAISSEMENTS
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 6px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #475569;">
                          Espèce du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${fmt(data.espece)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #F1F5F9; height: 1px; padding: 0;"></td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #475569;">
                          Momo du jour <span style="font-size: 11px; color: #94A3B8;">(MTN + Moov)</span>
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${fmt(data.momo)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 3 - RENTABILITÉ & SORTIES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    📈 RENTABILITÉ &amp; SORTIES
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #ECFDF5; border: 1px solid #A7F3D0; border-radius: 12px; padding: 6px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #065F46;">
                          Marge brute du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #0E9F6E; white-space: nowrap;">
                          ${fmt(data.marge)} <span style="font-size: 12px; font-weight: 800; color: #0E9F6E; margin-left: 4px;">(${margePct}%)</span>
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #A7F3D0; height: 1px; padding: 0;"></td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #374151;">
                          Dépenses du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${fmt(data.depenses)}
                        </td>
                      </tr>
                      <tr>
                        <td colspan="2" style="border-top: 1px solid #A7F3D0; height: 1px; padding: 0;"></td>
                      </tr>
                      <tr>
                        <td align="left" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #374151;">
                          Remboursement du jour
                        </td>
                        <td align="right" style="padding: 10px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 14px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${fmt(data.remboursement)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 4 - SITUATION CRÉANCES -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    📋 SITUATION CRÉANCES
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 14px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 13px; color: #475569;">
                          Situation des créances actuel<br/>
                          <span style="font-size: 11px; color: #94A3B8;">(total restant dû clients à ce jour)</span>
                        </td>
                        <td align="right" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 15px; font-weight: 800; color: #111827; white-space: nowrap;">
                          ${fmt(data.creances)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SECTION 5 - TOP 5 PRODUITS VENDUS DU JOUR -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11px; font-weight: 800; color: #0F1F3C; text-transform: uppercase; letter-spacing: 0.6px; padding-bottom: 8px;">
                    🏆 TOP 5 PRODUITS VENDUS DU JOUR
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 6px 18px;">
                    <table width="100%" border="0" cellpadding="0" cellspacing="0">
                      ${top5RowsHtml}
                    </table>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td align="center" style="background-color: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 24px; text-align: center;">
              <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 12px; font-weight: 600; color: #64748B;">
                    Rapport généré par GESTIO 229 — <strong style="color: #0F1F3C;">${data.entreprise || 'GESTIO 229'}</strong>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; font-size: 10px; color: #94A3B8; padding-top: 4px;">
                    Plateforme de Gestion Commerciale, Caisse &amp; Trésorerie • www.gestio229.com
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
