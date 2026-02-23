export function apiKeyAuth(req, res, next) {
  const key = req.get('x-api-key')
  const allowed = (process.env.API_KEYS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (!key)
    return res.status(401).json({ ok: false, message: 'Falta x-api-key' })
  if (!allowed.includes(key))
    return res.status(403).json({ ok: false, message: 'API key inválida' })
  next()
}
