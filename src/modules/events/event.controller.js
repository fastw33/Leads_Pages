import {
  getEventById,
  listEvents,
  summarizeEvents,
  trackEvent,
} from './event.service.js'

/**
 * POST /Leads/public/events/track
 * Recibe eventos ligeros de analítica/lead attribution sin enviar correo.
 */
export async function track(req, res, next) {
  try {
    const { event, deduped } = await trackEvent(req)

    return res.status(deduped ? 200 : 201).json({
      ok: true,
      eventId: event._id,
      eventType: event.eventType,
      isBillableLead: Boolean(event.isBillableLead),
      leadChannel: event.leadChannel || null,
      deduped,
    })
  } catch (err) {
    return next(err)
  }
}

export async function ping(req, res) {
  return res.status(200).json({
    ok: true,
    service: 'lead-events',
    time: new Date().toISOString(),
  })
}

export async function listForAdmin(req, res, next) {
  try {
    const result = await listEvents(req.query)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    return next(err)
  }
}

export async function summaryForAdmin(req, res, next) {
  try {
    const result = await summarizeEvents(req.query)
    return res.status(200).json({ ok: true, ...result })
  } catch (err) {
    return next(err)
  }
}

export async function getByIdForAdmin(req, res, next) {
  try {
    const event = await getEventById(req.params.id)
    if (!event) {
      return res.status(404).json({ ok: false, error: 'Evento no encontrado' })
    }

    return res.status(200).json({ ok: true, event })
  } catch (err) {
    return next(err)
  }
}

export default {
  track,
  ping,
  listForAdmin,
  summaryForAdmin,
  getByIdForAdmin,
}
