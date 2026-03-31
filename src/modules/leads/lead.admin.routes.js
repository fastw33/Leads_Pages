import { Router } from 'express'
import {
  createManualForCrm,
  getByIdForCrm,
  listForCrm,
  normalizeForCrm,
  updateCrm,
} from './lead.controller.js'
import { upload, multerErrorHandler } from '../../middlewares/upload.js'

const router = Router()

router.get('/', listForCrm)
router.post('/manual', upload.any(), multerErrorHandler, createManualForCrm)
router.post('/normalize', normalizeForCrm)
router.get('/:id', getByIdForCrm)
router.patch('/:id/crm', updateCrm)

export default router
