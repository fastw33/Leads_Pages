import express from 'express'
import morgan from 'morgan'
import helmet from 'helmet'
import path from 'path'
import { fileURLToPath } from 'url'

import notFound from './middlewares/notFound.js'
import errorHandler from './middlewares/errorHandler.js'
import { authMiddleware } from './config/jwt.js'
import { buildCors } from './config/corsOptions.js'

// ✅ SOLO UNA VEZ
import leadsRoutes from './modules/leads/lead.routes.js'
import leadsAdminRoutes from './modules/leads/lead.admin.routes.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function createApp() {
  const app = express()
  const API_PREFIX = '/Leads'

  app.use(buildCors())
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

  const uploadsDir = path.resolve(__dirname, '../uploads')
  app.use('/uploads', authMiddleware, express.static(uploadsDir))

  // ✅ RUTA PUBLICA (API KEY) - NO JWT
  app.use(`${API_PREFIX}/public/leads`, leadsRoutes)

  // ✅ CRM de leads con JWT
  app.use(`${API_PREFIX}/admin/leads`, authMiddleware, leadsAdminRoutes)

  // Endpoints de diagnostico basico del servicio
  app.get('/', (req, res) => res.status(200).send('Leads API OK'))
  app.get('/health', (req, res) => res.status(200).send('OK'))
  app.get('/favicon.ico', (req, res) => res.status(204).end())

  app.use(notFound)
  app.use(errorHandler)

  return app
}

export default { createApp }
