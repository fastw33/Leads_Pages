// src/modules/leads/lead.controller.js
import { ingestLead } from './lead.service.js'

/**
 * POST /Leads/public/leads/ingest
 * Recibe leads (multipart/form-data) con:
 * - pageUrl
 * - formId
 * - payload (JSON string)
 * - files (0..N)
 */
export async function ingest(req, res, next) {
  try {
    const lead = await ingestLead(req)

    return res.status(201).json({
      ok: true,
      leadId: lead._id,
      notification: {
        sent: Boolean(lead?.notification?.sent),
        to: lead?.notification?.to ?? null,
      },
    })
  } catch (err) {
    return next(err)
  }
}

/**
 * GET /Leads/public/leads/ping (opcional)
 * Útil para verificar en producción si el servicio está arriba
 */
export async function ping(req, res) {
  return res.status(200).json({
    ok: true,
    service: 'leads',
    time: new Date().toISOString(),
  })
}

export default {
  ingest,
  ping,
}
