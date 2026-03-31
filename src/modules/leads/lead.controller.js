// src/modules/leads/lead.controller.js
import {
  createManualLead,
  getLeadById,
  ingestLead,
  listLeads,
  normalizeMissingLeadStructure,
  updateLeadCrmStatus,
} from './lead.service.js'

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

export async function listForCrm(req, res, next) {
  try {
    const result = await listLeads(req.query)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    return next(err)
  }
}

export async function getByIdForCrm(req, res, next) {
  try {
    const lead = await getLeadById(req.params.id)
    if (!lead) {
      return res.status(404).json({ ok: false, error: 'Lead no encontrado' })
    }

    return res.status(200).json({ ok: true, lead })
  } catch (err) {
    return next(err)
  }
}

export async function updateCrm(req, res, next) {
  try {
    const lead = await updateLeadCrmStatus(req.params.id, req.body, req.user)
    return res.status(200).json({ ok: true, lead })
  } catch (err) {
    return next(err)
  }
}

export async function normalizeForCrm(req, res, next) {
  try {
    const { limit } = req.body || {}
    const result = await normalizeMissingLeadStructure(limit)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    return next(err)
  }
}

export async function createManualForCrm(req, res, next) {
  try {
    const lead = await createManualLead(req.body, req.user, req.files)
    return res.status(201).json({ ok: true, lead })
  } catch (err) {
    return next(err)
  }
}

export default {
  ingest,
  ping,
  listForCrm,
  getByIdForCrm,
  updateCrm,
  normalizeForCrm,
  createManualForCrm,
}
