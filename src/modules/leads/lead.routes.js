import { Router } from 'express'
import { ingest, ping } from './lead.controller.js'
import { apiKeyAuth } from '../../middlewares/apiKeyAuth.js'
import { upload, multerErrorHandler } from '../../middlewares/upload.js'

const router = Router()

// estándar: acepta cualquier mix de archivos
router.post('/ingest', apiKeyAuth, upload.any(), multerErrorHandler, ingest)
router.get('/ping', ping)

export default router
