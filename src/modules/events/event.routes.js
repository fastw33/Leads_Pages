import express, { Router } from 'express'
import { apiKeyAuth } from '../../middlewares/apiKeyAuth.js'
import { ping, track } from './event.controller.js'

const router = Router()
const parseBeaconBody = express.text({
  limit: '64kb',
  type: ['text/plain'],
})

router.post('/track', apiKeyAuth, parseBeaconBody, track)
router.get('/ping', ping)

export default router
