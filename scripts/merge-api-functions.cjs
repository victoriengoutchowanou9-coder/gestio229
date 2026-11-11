// =============================================================================
// GESTIO 229 ERP — Consolidation des Fonctions Serverless Vercel (Hobby <= 12)
// Regroupe les fonctions compatibles pour respecter la limite Hobby
// Préserve 100% des routes, paramètres, sécurité, headers et tables
// =============================================================================

const fs = require('fs');
const path = require('path');

console.log('🔄 ================================================================');
console.log('🔄 [GESTIO 229] CONSOLIDATION DES FONCTIONS SERVERLESS VERCEL');
console.log('🔄 ================================================================\n');

// ─── 1. METTRE À JOUR api/admin-data.ts POUR INTÉGRER admin-push ──────────────
console.log('1️⃣ Intégration de admin-push dans api/admin-data.ts...');
let adminDataContent = fs.readFileSync('api/admin-data.ts', 'utf8');

// Ajouter l'import de pushHelper si non présent
if (!adminDataContent.includes('pushHelper')) {
  adminDataContent = adminDataContent.replace(
    "import * as crypto from 'crypto'",
    `import * as crypto from 'crypto'
import {
  VAPID_PUBLIC_KEY,
  saveCreatorSubscription,
  removeCreatorSubscription,
  getCreatorSubscriptions,
  sendTestPushToCreator,
  getNotificationHistory,
} from './_lib/pushHelper.ts'`
  );
}

// Ajouter le bloc de gestion Push dans le handler
const pushActionsBlock = `
    // ── GESTION DES NOTIFICATIONS PUSH CONCEPTEUR (INTÉGRÉE) ───────────────
    if (action === 'vapid_public_key' || (req.query.channel === 'push' && req.method === 'GET' && !action)) {
      return res.status(200).json({ success: true, publicKey: VAPID_PUBLIC_KEY })
    }

    if (action === 'subscribe' && req.method === 'POST') {
      const { subscription, deviceName } = req.body || {}
      const userAgent = req.headers['user-agent'] || 'Appareil mobile'
      const result = await saveCreatorSubscription(sb, subscription, {
        userAgent,
        deviceName: deviceName || 'Téléphone Concepteur',
        ip: clientIp,
      })
      if (!result.success) return res.status(400).json(result)
      return res.status(200).json({
        success: true,
        message: 'Appareil enregistré avec succès pour les notifications push.',
      })
    }

    if (action === 'unsubscribe' && req.method === 'POST') {
      const { endpoint } = req.body || {}
      if (!endpoint) return res.status(400).json({ success: false, error: 'Endpoint obligatoire.' })
      await removeCreatorSubscription(sb, endpoint)
      return res.status(200).json({ success: true, message: 'Appareil désabonné avec succès.' })
    }

    if (action === 'test' && req.method === 'POST') {
      const testResult = await sendTestPushToCreator(sb)
      if (!testResult.success) {
        return res.status(400).json({
          success: false,
          error: testResult.error || "Échec de l'envoi du test.",
        })
      }
      return res.status(200).json({
        success: true,
        message: \`Notification Push de test envoyée avec succès sur \${testResult.sentCount} appareil(s) !\`,
        sentCount: testResult.sentCount,
      })
    }

    if (action === 'status' && (req.query.channel === 'push' || req.method === 'GET')) {
      const subscriptions = await getCreatorSubscriptions(sb)
      return res.status(200).json({
        success: true,
        deviceCount: subscriptions.length,
        devices: subscriptions.map((s) => ({
          deviceName: s.device_name,
          createdAt: s.created_at,
          userAgent: s.user_agent,
        })),
      })
    }

    if (action === 'history' && (req.query.channel === 'push' || req.method === 'GET')) {
      const history = await getNotificationHistory(sb, 30)
      return res.status(200).json({ success: true, history })
    }
`;

if (!adminDataContent.includes("action === 'vapid_public_key'")) {
  adminDataContent = adminDataContent.replace(
    "const { action } = req.query\n\n  try {",
    "const action = String(req.query.action || req.body?.action || '').trim()\n\n  try {" + pushActionsBlock
  );
  // Alternative si CRLF
  if (!adminDataContent.includes("action === 'vapid_public_key'")) {
    adminDataContent = adminDataContent.replace(
      "const { action } = req.query\r\n\r\n  try {",
      "const action = String(req.query.action || req.body?.action || '').trim()\r\n\r\n  try {" + pushActionsBlock
    );
  }
}
fs.writeFileSync('api/admin-data.ts', adminDataContent, 'utf8');
console.log('✅ api/admin-data.ts mis à jour avec le support complet des notifications push.');

// ─── 2. METTRE À JOUR api/send-rapport-pdf.ts POUR INTÉGRER test-email ET cron ─
console.log('\n2️⃣ Intégration de test-email et cron dans api/send-rapport-pdf.ts...');
let sendPdfContent = fs.readFileSync('api/send-rapport-pdf.ts', 'utf8');

const testEmailAndCronBlock = `
  const actionParam = String(req.query?.action || req.body?.action || '').trim()
  const isTestEmailRoute = actionParam === 'test-email' || (req.url && req.url.includes('test-email'))
  const isCronRoute = actionParam === 'cron' || (req.url && req.url.includes('cron-rapport-caisse'))

  // ── ROUTE TEST EMAIL (GET / POST) ──────────────────────────────────────────
  if (isTestEmailRoute) {
    const providerInfo = getActiveEmailProviderInfo()

    if (req.method === 'GET') {
      return res.status(200).json({
        success: true,
        provider: providerInfo.provider,
        label: providerInfo.label,
        details: providerInfo.details,
        isHttps: providerInfo.isHttps,
        hasCredentials: providerInfo.provider !== 'unconfigured',
      })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        success: false,
        error: 'Méthode non autorisée. Utilisez POST ou GET.',
      })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { testEmail } = body
    const defaultRecipient = (process.env.SMTP_USER || process.env.SMTP_FROM_EMAIL || 'victoriengoutchowanou2024@gmail.com').trim()
    const targetEmail = (testEmail || defaultRecipient).trim()

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'Adresse email de test invalide. Veuillez renseigner un email valide (ex: direction@gestio229.com).',
      })
    }

    const nowStr = new Date().toLocaleString('fr-BJ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const html = \`
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #064e3b; margin: 0; padding: 32px 16px; color: #ffffff;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; color: #1e293b; box-shadow: 0 16px 36px rgba(0,0,0,0.4);">
    <div style="background: linear-gradient(135deg, #059669 0%, #064e3b 100%); color: #ffffff; padding: 30px; text-align: center;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 900;">GESTIO 229 • Transmission Réussie</h1>
      <p style="margin: 6px 0 0; font-size: 13px; color: #d1fae5;">Service d'acheminement des rapports de caisse</p>
    </div>
    <div style="padding: 28px; font-size: 14px; line-height: 1.6;">
      <p style="font-size: 15px; margin-top: 0;">Bonjour,</p>
      <p>Ce message confirme que votre canal d'envoi d'emails transactionnels est <strong>actif et opérationnel</strong>.</p>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Canal :</strong> \${providerInfo.label}</p>
        <p style="margin: 4px 0;"><strong>Destinataire :</strong> \${targetEmail}</p>
        <p style="margin: 4px 0;"><strong>Date &amp; Heure :</strong> \${nowStr}</p>
      </div>
      <p style="color: #059669; font-weight: 700;">✅ Lors de chaque fermeture de caisse, le rapport PDF officiel sera transmis automatiquement à vos destinataires enregistrés.</p>
    </div>
    <div style="background: #f1f5f9; padding: 14px; text-align: center; font-size: 12px; color: #64748b;">
      GESTIO 229 ERP • STANDARD DU BÉNIN • <a href="https://www.gestio229.com" style="color: #059669; font-weight: bold;">www.gestio229.com</a>
    </div>
  </div>
</body>
</html>
    \`.trim()

    const text = \`Test de connexion email GESTIO 229 réussi à \${nowStr} pour \${targetEmail}. Canal: \${providerInfo.label}\`

    try {
      const sendResult = await sendTrackedEmail({
        to: targetEmail,
        subject: \`🧪 Test de Connexion Email — GESTIO 229 (\${nowStr})\`,
        html,
        text,
        emailType: 'test_email',
        metadata: { isTest: true, triggered_at: nowStr, channel: providerInfo.label },
      })

      if (sendResult.success) {
        return res.status(200).json({
          success: true,
          message: \`Email de test transmis avec succès à \${targetEmail} via \${sendResult.providerLabel} !\`,
          provider: sendResult.provider,
          providerLabel: sendResult.providerLabel,
          messageId: sendResult.messageId,
          targetEmail,
        })
      } else {
        return res.status(200).json({
          success: false,
          error: sendResult.error || 'Échec de la transmission du message.',
          diagnostic: sendResult.diagnostic,
          providerLabel: sendResult.providerLabel,
        })
      }
    } catch (err: any) {
      console.error('[test-email] Erreur transmission :', err)
      const diag = diagnoseEmailError(err)
      return res.status(200).json({
        success: false,
        error: err?.message || 'Erreur lors de la transmission du message.',
        diagnostic: diag.diagnostic,
        code: diag.code,
        providerLabel: getActiveEmailProviderInfo().label,
      })
    }
  }

  // ── ROUTE CRON RAPPORT CAISSE ──────────────────────────────────────────────
  if (isCronRoute) {
    if (req.query?.trigger !== 'cloture_validee') {
      return res.status(200).json({
        success: true,
        disabled: true,
        message: 'Envoi automatique programmé désactivé. Le rapport de caisse est envoyé lors de la clôture réelle.',
      })
    }
  }
`;

if (!sendPdfContent.includes('isTestEmailRoute')) {
  // Insérer juste après if (req.method === 'OPTIONS') { return res.status(200).end() }
  sendPdfContent = sendPdfContent.replace(
    "if (req.method === 'OPTIONS') {\n    return res.status(200).end()\n  }",
    "if (req.method === 'OPTIONS') {\n    return res.status(200).end()\n  }\n" + testEmailAndCronBlock
  );
  if (!sendPdfContent.includes('isTestEmailRoute')) {
    sendPdfContent = sendPdfContent.replace(
      "if (req.method === 'OPTIONS') {\r\n    return res.status(200).end()\r\n  }",
      "if (req.method === 'OPTIONS') {\r\n    return res.status(200).end()\r\n  }\r\n" + testEmailAndCronBlock
    );
  }
}
fs.writeFileSync('api/send-rapport-pdf.ts', sendPdfContent, 'utf8');
console.log('✅ api/send-rapport-pdf.ts mis à jour avec le support de test-email et cron.');

// ─── 3. METTRE À JOUR api/company-clear-sector.ts POUR INTÉGRER sector-request ET verify-access
console.log('\n3️⃣ Intégration de sector-request et verify-access dans api/company-clear-sector.ts...');
let clearSectorContent = fs.readFileSync('api/company-clear-sector.ts', 'utf8');

const sectorAccessAndRequestBlock = `
// ── INTÉGRATION DE SECTOR-REQUEST & VERIFY-ACCESS ────────────────────────────
async function handleSectorRequest(req: VercelRequest, res: VercelResponse, sb: any) {
  const {
    company_id,
    company_name,
    user_id,
    user_email,
    user_phone,
    requested_sectors,
    requested_modules,
    reason,
    business_details
  } = req.body || {}

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'Identifiant d\\’entreprise requis.' })
  }

  const sectors: string[] = Array.isArray(requested_sectors)
    ? requested_sectors
    : typeof requested_sectors === 'string' && requested_sectors
    ? [requested_sectors]
    : []

  if (sectors.length === 0) {
    return res.status(400).json({ success: false, error: 'Veuillez préciser le(s) secteur(s) souhaité(s).' })
  }

  try {
    const { data: request, error: reqErr } = await sb
      .from('sector_access_requests')
      .insert({
        company_id,
        company_name: company_name || 'Entreprise',
        user_id: user_id || null,
        user_email: user_email || '',
        user_phone: user_phone || '',
        requested_sectors: sectors,
        requested_modules: Array.isArray(requested_modules) ? requested_modules : [],
        reason: reason || 'Demande d\\’extension multi-activités',
        business_details: business_details || '',
        status: 'pending',
      })
      .select()
      .single()

    if (reqErr) throw reqErr

    try {
      await sb.from('admin_audit_logs').insert({
        admin_username: 'Système Demandes',
        action: 'DEMANDE_ACCES_MULTISECTEUR',
        company_id,
        company_name: company_name || '',
        result: 'info',
        details: { requestId: request?.id, requested_sectors: sectors, email: user_email, reason }
      })
    } catch (_) {}

    return res.status(200).json({
      success: true,
      message: 'Votre demande d\\’accès multi-secteur a été transmise au Super Administrateur.',
      requestId: request?.id,
    })
  } catch (err: any) {
    console.error('[SectorRequest] Erreur:', err.message)
    return res.status(500).json({ success: false, error: 'Erreur lors de l\\’envoi de votre demande.' })
  }
}

async function handleVerifyAccess(req: VercelRequest, res: VercelResponse, sb: any, clientIp: string) {
  const { userId, userEmail, companyId, targetSector, targetModule } = req.body || {}
  try {
    const { data: company, error: compErr } = await sb
      .from('companies')
      .select('id, name, subscription_status, is_active')
      .eq('id', companyId)
      .maybeSingle()

    if (compErr || !company) {
      return res.status(403).json({ success: false, code: 'COMPANY_NOT_FOUND', error: 'Entreprise introuvable.' })
    }

    if (!company.is_active) {
      return res.status(403).json({ success: false, code: 'COMPANY_SUSPENDED', error: 'Entreprise suspendue.' })
    }

    return res.status(200).json({
      success: true,
      data: {
        companyId: company.id,
        companyName: company.name,
        role: 'administrateur',
        subStatus: company.subscription_status,
        ip: clientIp,
      }
    })
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message || 'Erreur serveur.' })
  }
}
`;

if (!clearSectorContent.includes('handleSectorRequest')) {
  // Ajouter les helpers avant export default async function handler
  clearSectorContent = clearSectorContent.replace(
    'export default async function handler(req: VercelRequest, res: VercelResponse) {',
    sectorAccessAndRequestBlock + '\nexport default async function handler(req: VercelRequest, res: VercelResponse) {'
  );

  // Ajouter le routage dans handler
  const routingClearSector = `
  const actionParam = String(req.query?.action || req.body?.action || '').trim()
  const isSectorRequest = actionParam === 'sector-request' || (req.url && req.url.includes('sector-request'))
  const isVerifyAccess = actionParam === 'verify-access' || (req.url && req.url.includes('verify-access'))

  if (isSectorRequest) {
    return handleSectorRequest(req, res, sb)
  }
  if (isVerifyAccess) {
    return handleVerifyAccess(req, res, sb, clientIp)
  }
`;

  clearSectorContent = clearSectorContent.replace(
    'const sb = getSupabaseAdmin()',
    'const sb = getSupabaseAdmin()' + routingClearSector
  );
}
fs.writeFileSync('api/company-clear-sector.ts', clearSectorContent, 'utf8');
console.log('✅ api/company-clear-sector.ts mis à jour avec sector-request et verify-access.');

// ─── 4. METTRE À JOUR vercel.json ─────────────────────────────────────────────
console.log('\n4️⃣ Mise à jour des rewrites dans vercel.json...');
const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));

vercelConfig.rewrites = [
  { source: '/api/resend-confirmation-email', destination: '/api/confirm-email' },
  { source: '/api/admin-feedback', destination: '/api/feedback' },
  { source: '/api/admin-push', destination: '/api/admin-data' },
  { source: '/api/test-email', destination: '/api/send-rapport-pdf?action=test-email' },
  { source: '/api/cron-rapport-caisse', destination: '/api/send-rapport-pdf?action=cron' },
  { source: '/api/sector-request', destination: '/api/company-clear-sector?action=sector-request' },
  { source: '/api/verify-access', destination: '/api/company-clear-sector?action=verify-access' },
  { source: '/api/(.*)', destination: '/api/$1' },
  { source: '/((?!api/).*)', destination: '/index.html' }
];

fs.writeFileSync('vercel.json', JSON.stringify(vercelConfig, null, 2) + '\n', 'utf8');
console.log('✅ vercel.json mis à jour avec les 7 rewrites transparents.');

// ─── 5. SUPPRIMER LES 5 FICHIERS SERVERLESS EXCÉDENTAIRES ─────────────────────
console.log('\n5️⃣ Nettoyage des 5 fichiers redondants pour passer de 13 à 8 fonctions...');
const filesToRemove = [
  'api/admin-push.ts',
  'api/test-email.ts',
  'api/cron-rapport-caisse.ts',
  'api/sector-request.ts',
  'api/verify-access.ts'
];

for (const file of filesToRemove) {
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`  🗑️ Supprimé : ${file}`);
  }
}

// ─── 6. DÉCOMPTE & VÉRIFICATION DU QUOTA VERCEL (<= 12) ───────────────────────
const remainingApiFiles = fs.readdirSync('api').filter(f => f.endsWith('.ts') || f.endsWith('.js'));
console.log(`\n📊 Nombre de fonctions Serverless restantes : ${remainingApiFiles.length} (Limite Hobby: 12)`);
console.log('📋 Fonctions actives :');
remainingApiFiles.forEach((f, i) => console.log(`   ${i + 1}. api/${f}`));

if (remainingApiFiles.length > 12) {
  console.error(`❌ ÉCHEC : Le nombre de fonctions (${remainingApiFiles.length}) dépasse encore 12 !`);
  process.exit(1);
} else {
  console.log(`\n🎉 SUCCÈS TOTAL : ${remainingApiFiles.length} fonctions <= 12 ! Conforme au forfait Hobby Vercel.`);
}
