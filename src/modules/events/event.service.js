import { LeadEvent } from './event.model.js'

export const EVENT_TYPES = ['whatsapp_contact_click']

const BILLABLE_EVENT_TYPES = new Set(['whatsapp_contact_click'])

function cleanText(value, max = 1000) {
  if (value === null || value === undefined) return ''
  return String(value).trim().slice(0, max)
}

function cleanObject(input, maxValueLength = 1000) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      cleanText(key, 120),
      typeof value === 'object' && value !== null
        ? cleanObject(value, maxValueLength)
        : cleanText(value, maxValueLength),
    ])
  )
}

function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toSafeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.toString()?.split(',')[0]?.trim() || req.ip
  )
}

function eventCategory(eventType) {
  return 'whatsapp'
}

function normalizeEventBody(body = {}, req) {
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = { payload: { rawBody: body } }
    }
  }

  const eventType = cleanText(body.eventType, 80)

  if (!EVENT_TYPES.includes(eventType)) {
    const error = new Error('Tipo de evento inválido')
    error.status = 400
    throw error
  }

  const contact = body.contact || {}
  const attribution = body.attribution || body.utm || {}
  const isBillableLead = BILLABLE_EVENT_TYPES.has(eventType)

  const doc = {
    eventType,
    category: eventCategory(eventType),
    isBillableLead,
    leadChannel: isBillableLead ? 'whatsapp' : '',
    sessionId: cleanText(body.sessionId, 180),
    visitorId: cleanText(body.visitorId, 180),
    locale: cleanText(body.locale, 12),
    source: {
      pageUrl: cleanText(body.pageUrl, 2000),
      referrer: cleanText(body.referrer || req.get('referer'), 2000),
      origin: cleanText(req.get('origin'), 300),
      host: cleanText(req.get('host'), 300),
      apiKey: cleanText(req.get('x-api-key'), 120),
    },
    contact: {
      target: cleanText(body.contactTarget || contact.target, 120),
      channel: cleanText(body.contactChannel || contact.channel, 80),
      phone: cleanText(body.whatsappPhone || contact.phone, 60),
      url: cleanText(body.whatsappUrl || contact.url, 2000),
    },
    attribution: {
      utmSource: cleanText(body.utm_source || attribution.utmSource, 180),
      utmMedium: cleanText(body.utm_medium || attribution.utmMedium, 180),
      utmCampaign: cleanText(body.utm_campaign || attribution.utmCampaign, 180),
      utmTerm: cleanText(body.utm_term || attribution.utmTerm, 180),
      utmContent: cleanText(body.utm_content || attribution.utmContent, 180),
      gclid: cleanText(body.gclid || attribution.gclid, 300),
      fbclid: cleanText(body.fbclid || attribution.fbclid, 300),
    },
    meta: {
      ip: getIp(req),
      userAgent: cleanText(req.get('user-agent'), 1000),
    },
    payload: cleanObject(body.payload || body.metadata || {}, 1000),
  }

  const eventId = cleanText(body.eventId || body.dedupeKey, 180)
  if (eventId) doc.eventId = eventId

  return doc
}

function buildEventFilter(query = {}) {
  const filter = {}

  if (query.eventType && EVENT_TYPES.includes(cleanText(query.eventType))) {
    filter.eventType = cleanText(query.eventType)
  }

  if (query.category && ['whatsapp'].includes(cleanText(query.category))) {
    filter.category = cleanText(query.category)
  }

  if (query.billable !== undefined) {
    filter.isBillableLead = String(query.billable).toLowerCase() === 'true'
  }

  if (query.leadChannel) {
    filter.leadChannel = cleanText(query.leadChannel, 80)
  }

  if (query.pageUrl) {
    filter['source.pageUrl'] = {
      $regex: toSafeRegex(query.pageUrl),
      $options: 'i',
    }
  }

  const from = parseDate(query.from)
  const to = parseDate(query.to)
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = from
    if (to) filter.createdAt.$lte = to
  }

  return filter
}

export async function trackEvent(req) {
  const doc = normalizeEventBody(req.body, req)

  try {
    const event = await LeadEvent.create(doc)
    return { event, deduped: false }
  } catch (error) {
    if (Number(error?.code) === 11000 && doc.eventId) {
      const event = await LeadEvent.findOne({ eventId: doc.eventId })
      if (event) return { event, deduped: true }
    }

    throw error
  }
}

export async function listEvents(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 200)
  const filter = buildEventFilter(query)

  const [rows, total] = await Promise.all([
    LeadEvent.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    LeadEvent.countDocuments(filter),
  ])

  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    rows,
  }
}

export async function summarizeEvents(query = {}) {
  const filter = buildEventFilter(query)

  const [byType, byPage, totals] = await Promise.all([
    LeadEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$eventType',
          total: { $sum: 1 },
          billable: { $sum: { $cond: ['$isBillableLead', 1, 0] } },
        },
      },
      { $sort: { total: -1 } },
    ]),
    LeadEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$source.pageUrl',
          total: { $sum: 1 },
          billable: { $sum: { $cond: ['$isBillableLead', 1, 0] } },
        },
      },
      { $sort: { billable: -1, total: -1 } },
      { $limit: Math.min(Math.max(Number(query.pageLimit) || 25, 1), 100) },
    ]),
    LeadEvent.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          billable: { $sum: { $cond: ['$isBillableLead', 1, 0] } },
          whatsappClicks: {
            $sum: {
              $cond: [{ $eq: ['$eventType', 'whatsapp_contact_click'] }, 1, 0],
            },
          },
        },
      },
    ]),
  ])

  return {
    totals: totals[0] || {
      total: 0,
      billable: 0,
      whatsappClicks: 0,
    },
    byType,
    byPage,
  }
}

export async function getEventById(id) {
  return LeadEvent.findById(id).lean()
}

export default {
  trackEvent,
  listEvents,
  summarizeEvents,
  getEventById,
}
