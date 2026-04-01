// src/config/corsOptions.js
import cors from 'cors'

export function buildCors() {
  const origins = String(process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const isDev =
    String(process.env.NODE_ENV || '').toLowerCase() !== 'production'

  // si no hay orígenes configurados → abierto (dev)
  if (!origins.length) return cors()

  return cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)

      if (origins.includes(origin)) return cb(null, true)

      if (
        isDev &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
      ) {
        return cb(null, true)
      }

      return cb(new Error('CORS blocked'))
    },
    credentials: true,
  })
}
