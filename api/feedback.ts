// =============================================================================
// GESTIO 229 ADMIN — API Endpoint : POST /api/feedback (PUBLIC)
// Envoi d'un avis ou suggestion par un utilisateur connecté
// Associe automatiquement company_id, sector_slug, user_id, date, heure
// =============================================================================

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL || 'https://inknljnhqmrykcrgglts.supabase.co',
    process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
  )
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' })
  }

  const { company_id, company_name, user_id, user_name, user_email, sector_slug, type, subject, message } = req.body || {}

  if (!subject || !message) {
    return res.status(400).json({ success: false, error: 'Sujet et message requis.' })
  }

  if (!company_id) {
    return res.status(400).json({ success: false, error: 'Entreprise non identifiée.' })
  }

  const validTypes = ['avis', 'suggestion', 'bug', 'demande_fonctionnalite', 'difficulte']
  const feedbackType = validTypes.includes(type) ? type : 'suggestion'

  try {
    const sb = getSupabase()
    const { error } = await sb.from('feedbacks').insert({
      company_id,
      company_name: company_name || '',
      user_id: user_id || null,
      user_name: user_name || '',
      user_email: user_email || '',
      sector_slug: sector_slug || '',
      type: feedbackType,
      subject: String(subject).slice(0, 255),
      message: String(message).slice(0, 5000),
      status: 'nouveau',
    })

    if (error) throw error
    return res.status(201).json({ success: true, message: 'Votre avis a bien été envoyé. Merci !' })
  } catch (err: any) {
    console.error('[Feedback API]', err.message)
    return res.status(500).json({ success: false, error: 'Erreur lors de l\'envoi. Réessayez.' })
  }
}
