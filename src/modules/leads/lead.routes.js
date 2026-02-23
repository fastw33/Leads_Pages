import { Router } from 'express'
import { ingest } from './lead.controller.js'
import { apiKeyAuth } from '../../middlewares/apiKeyAuth.js'
import { upload, multerErrorHandler } from '../../middlewares/upload.js'

const router = Router()

// estándar: acepta cualquier mix de archivos
router.post('/ingest', apiKeyAuth, upload.any(), multerErrorHandler, ingest)

export default router
