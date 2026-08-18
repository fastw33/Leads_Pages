import { Router } from 'express'
import {
  getByIdForAdmin,
  listForAdmin,
  summaryForAdmin,
} from './event.controller.js'

const router = Router()

router.get('/', listForAdmin)
router.get('/summary', summaryForAdmin)
router.get('/:id', getByIdForAdmin)

export default router
