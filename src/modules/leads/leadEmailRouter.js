function safeJsonParse(str, fallback = {}) {
  try {
    if (!str) return fallback
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

/**
 * @param {Object} params
 * @param {string} params.pageUrl   URL enviada por el frontend
 * @param {string} params.referer   Header Referer (fallback)
 * @returns {string} email destino
 */
export function resolveLeadRecipient({ pageUrl = '', referer = '' }) {
  const routes = safeJsonParse(process.env.LEAD_EMAIL_ROUTES, {})
  const defaultEmail = process.env.LEAD_EMAIL_DEFAULT || ''

  const url = String(pageUrl || referer || '').toLowerCase()

  // Reglas: match por substring (dominio o path)
  for (const [pattern, email] of Object.entries(routes)) {
    if (!pattern || !email) continue
    if (url.includes(pattern.toLowerCase())) {
      return email
    }
  }

  return defaultEmail
}
