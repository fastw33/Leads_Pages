// src/modules/leads/lead.service.js
import { Lead } from './lead.model.js'
import { resolveLeadRecipient } from './leadEmailRouter.js'
import { sendLeadEmail } from '../notifications/mailer.js'
import { buildLeadEmailHtml } from '../notifications/leadEmailTemplate.js'

const LEAD_STATUS = [
  'new',
  'contacted',
  'visit_scheduled',
  'visit_done',
  'quote_sent',
  'follow_up',
  'closed',
]

const LEAD_STATUS_ALIASES = {
  qualified: 'visit_scheduled',
  appointment: 'visit_scheduled',
  proposal: 'quote_sent',
  no_response: 'follow_up',
  won: 'closed',
  lost: 'closed',
  unqualified: 'closed',
  spam: 'closed',
}

const LEAD_PRIORITY = ['low', 'medium', 'high']

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase()
}

function pickValue(payload, aliases) {
  if (!payload || typeof payload !== 'object') return ''

  const aliasSet = new Set(aliases.map(normalizeKey))

  for (const [key, value] of Object.entries(payload)) {
    if (aliasSet.has(normalizeKey(key))) {
      return value ?? ''
    }
  }

  return ''
}

function cleanText(value) {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function normalizeLeadStatus(value) {
  const raw = cleanText(value)
  if (!raw) return 'new'
  return LEAD_STATUS_ALIASES[raw] || raw
}

function inferCompanyFromText(value) {
  const raw = cleanText(value).toLowerCase()
  if (!raw) return ''
  if (raw.includes('fastwaysas') || raw.includes('fastway')) return 'Fastway'
  if (raw.includes('metalharvest') || raw.includes('harvest')) return 'Harvest'
  if (raw.includes('greenwayinter') || raw.includes('greenway'))
    return 'Greenway'
  return ''
}

function parseConsent(value) {
  if (typeof value === 'boolean') return value

  const raw = normalizeKey(value)
  return ['true', 'si', 'yes', 'ok', 'on', '1', 'acepto'].includes(raw)
}

function splitName(fullName) {
  const clean = cleanText(fullName)
  if (!clean) return { firstName: '', lastName: '' }

  const parts = clean.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }

  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts.slice(-1).join(' '),
  }
}

function buildNormalizedPayload(payload) {
  const fullName =
    cleanText(pickValue(payload, ['name', 'nombre', 'fullName', 'fullname'])) ||
    `${cleanText(pickValue(payload, ['firstName', 'nombres']))} ${cleanText(
      pickValue(payload, ['lastName', 'apellidos'])
    )}`.trim()

  const { firstName, lastName } = splitName(fullName)

  return {
    fullName,
    firstName,
    lastName,
    company: cleanText(pickValue(payload, ['company', 'empresa', 'compania'])),
    email: cleanText(
      pickValue(payload, ['email', 'correo', 'mail'])
    ).toLowerCase(),
    phone: cleanText(
      pickValue(payload, ['phone', 'telefono', 'celular', 'movil', 'whatsapp'])
    ),
    document: cleanText(
      pickValue(payload, ['document', 'documento', 'nit', 'cedula', 'dni'])
    ),
    personType: cleanText(
      pickValue(payload, ['tipoPersona', 'tipo_persona', 'personType'])
    ),
    serviceType: cleanText(
      pickValue(payload, ['service', 'servicio', 'serviceType'])
    ),
    origin: cleanText(pickValue(payload, ['origin', 'origen', 'from'])),
    destination: cleanText(
      pickValue(payload, ['destination', 'destino', 'to'])
    ),
    cargoType: cleanText(pickValue(payload, ['cargo', 'carga', 'tipoCarga'])),
    description: cleanText(
      pickValue(payload, [
        'details',
        'detalle',
        'descripcion',
        'description',
        'mensaje',
        'message',
        'comentarios',
      ])
    ),
    estimatedPrice: cleanText(
      pickValue(payload, ['precioEstimado', 'estimatedPrice', 'presupuesto'])
    ),
    consent: parseConsent(
      pickValue(payload, ['consent', 'aceptaTerminos', 'acceptTerms'])
    ),
    rawKeys: Object.keys(payload || {}),
  }
}

function buildInitialCrm() {
  const now = new Date()
  return {
    status: 'new',
    statusChangedAt: now,
    owner: '',
    commercial: '',
    priority: 'medium',
    tags: [],
    followUpAt: null,
    nextStep: '',
    nextStepAt: null,
    lastContactAt: null,
    notes: '',
    statusHistory: [
      {
        from: '',
        to: 'new',
        note: 'Lead recibido desde formulario web',
        changedBy: 'system',
        changedAt: now,
      },
    ],
  }
}

function toSafeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function parseDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function buildActor(reqUser) {
  if (!reqUser || typeof reqUser !== 'object') return 'admin'

  return String(
    reqUser.id ||
      reqUser._id ||
      reqUser.email ||
      reqUser.username ||
      reqUser.name ||
      'admin'
  )
}

function appendInternalNote(existingNotes, note, actor) {
  const cleanNote = cleanText(note)
  if (!cleanNote) return cleanText(existingNotes)

  const stamp = new Date().toISOString()
  const line = `[${stamp}] ${cleanText(actor) || 'admin'}: ${cleanNote}`
  const base = cleanText(existingNotes)

  return [base, line].filter(Boolean).join('\n')
}

function buildFallbackLeadParts(lead) {
  const payload = lead?.payload || {}

  return {
    normalized: lead?.normalized || buildNormalizedPayload(payload),
    crm:
      lead?.crm?.status && Array.isArray(lead?.crm?.statusHistory)
        ? lead.crm
        : buildInitialCrm(),
  }
}

function getIp(req) {
  return (
    req.headers['x-forwarded-for']?.toString()?.split(',')[0]?.trim() || req.ip
  )
}

function parsePayload(body) {
  // estándar: payload viene como JSON string en multipart
  // pero si viene como objeto directo, también lo aceptamos.
  const raw = body?.payload

  if (!raw) {
    // fallback: guardar todo menos campos de control
    const { payload, pageUrl, formId, ...rest } = body || {}
    return rest
  }

  if (typeof raw === 'object') return raw

  try {
    return JSON.parse(raw)
  } catch {
    // si mandan payload mal, lo guardamos como texto para no perder lead
    return { _rawPayload: String(raw) }
  }
}

function pickFirstNonEmpty(values = []) {
  for (const value of values) {
    const clean = cleanText(value)
    if (clean) return clean
  }
  return ''
}

function buildManualPayload(body = {}) {
  const payloadInput = body?.payload

  if (
    payloadInput &&
    typeof payloadInput === 'object' &&
    !Array.isArray(payloadInput)
  ) {
    return payloadInput
  }

  const fullName = pickFirstNonEmpty([
    body.fullName,
    body.nombre,
    [body.firstName, body.lastName].map(cleanText).filter(Boolean).join(' '),
  ])

  return {
    name: fullName,
    firstName: cleanText(body.firstName),
    lastName: cleanText(body.lastName),
    email: cleanText(body.email).toLowerCase(),
    phone: cleanText(body.phone),
    company: cleanText(body.company),
    message: cleanText(body.message),
    service: cleanText(body.serviceType),
    origin: cleanText(body.origin),
    destination: cleanText(body.destination),
    source: 'manual-crm',
  }
}

function mapFiles(req) {
  const files = Array.isArray(req.files) ? req.files : []
  return files.map(f => ({
    fieldname: f.fieldname,
    originalname: f.originalname,
    filename: f.filename,
    mimetype: f.mimetype,
    size: f.size,
    path: f.path,
  }))
}

function isDuplicateSequenceError(error) {
  const message = String(error?.message || '')
  return Number(error?.code) === 11000 && message.includes('sequence_1')
}

async function syncLeadSequenceCounter() {
  const latest = await Lead.findOne({ sequence: { $exists: true, $ne: null } })
    .sort({ sequence: -1 })
    .select({ sequence: 1 })
    .lean()

  const maxSequence = Number(latest?.sequence || 0)

  await Lead.db
    .collection('leadcounters')
    .updateOne(
      { key: 'lead_sequence' },
      { $max: { value: maxSequence } },
      { upsert: true }
    )
}

async function createLeadWithSequenceRetry(doc, retries = 3) {
  let lastError = null

  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await Lead.create(doc)
    } catch (error) {
      lastError = error
      if (!isDuplicateSequenceError(error)) throw error
      await syncLeadSequenceCounter()
    }
  }

  throw lastError || new Error('No se pudo crear el lead')
}

export async function ingestLead(req) {
  const payload = parsePayload(req.body)
  const files = mapFiles(req)
  const normalized = buildNormalizedPayload(payload)
  const crm = buildInitialCrm()

  const source = {
    pageUrl: req.body?.pageUrl || '',
    formId: req.body?.formId || '',
    referer: req.get('referer') || '',
    origin: req.get('origin') || '',
    host: req.get('host') || '',
    apiKey: req.get('x-api-key') || '',
  }

  if (!normalized.company) {
    normalized.company =
      inferCompanyFromText(source.pageUrl) ||
      inferCompanyFromText(source.referer) ||
      inferCompanyFromText(source.origin)
  }

  const meta = {
    ip: getIp(req),
    userAgent: req.get('user-agent') || '',
  }

  // 1) Guardar lead en DB
  const lead = await createLeadWithSequenceRetry({
    payload,
    normalized,
    crm,
    source,
    meta,
    files,
  })

  // 2) Resolver destinatario según URL
  const to = resolveLeadRecipient({
    pageUrl: source.pageUrl,
    referer: source.referer,
  })

  // 3) Enviar email (si hay destinatario)
  if (to) {
    try {
      // ✅ Adjuntar lo que venga por multer (foto/archivo/documento)
      const attachments = files.map(f => ({
        filename: f.originalname || f.filename,
        path: f.path,
        contentType: f.mimetype,
      }))

      // ✅ HTML viene del template (no del service)
      const html = buildLeadEmailHtml(
        { payload, files },
        {
          pageUrl: source.pageUrl,
          formId: source.formId,
          referer: source.referer,
          origin: source.origin,
          host: source.host,
          ip: meta.ip,
          userAgent: meta.userAgent,
        }
      )

      await sendLeadEmail({
        to,
        subject: `Nuevo lead - ${source.pageUrl || source.referer || 'sin-url'}`,
        html,
        replyTo: payload?.email || undefined,
        attachments,
      })

      lead.notification = { sent: true, to, sentAt: new Date() }
      await lead.save()
    } catch (err) {
      lead.notification = {
        sent: false,
        to,
        error: err?.message?.toString()?.slice(0, 1000),
      }
      await lead.save()
    }
  }

  return lead
}

export async function createManualLead(
  body = {},
  reqUser = null,
  requestFiles = []
) {
  const payload = buildManualPayload(body)
  const normalized = buildNormalizedPayload(payload)
  const crm = buildInitialCrm()
  const actor = buildActor(reqUser)
  const files = Array.isArray(requestFiles)
    ? requestFiles.map(f => ({
        fieldname: f.fieldname,
        originalname: f.originalname,
        filename: f.filename,
        mimetype: f.mimetype,
        size: f.size,
        path: f.path,
      }))
    : []

  if (!normalized.company) {
    normalized.company = inferCompanyFromText(body.pageUrl)
  }

  if (body.status && LEAD_STATUS.includes(normalizeLeadStatus(body.status))) {
    crm.status = normalizeLeadStatus(body.status)
    crm.statusChangedAt = new Date()
    crm.statusHistory = [
      {
        from: '',
        to: crm.status,
        note: 'Lead manual creado desde CRM',
        changedBy: buildActor(reqUser),
        changedAt: new Date(),
      },
    ]
  }

  crm.owner = cleanText(body.owner)
  crm.commercial = cleanText(body.commercial)
  crm.nextStep = cleanText(body.nextStep)
  crm.notes = appendInternalNote('', body.notes, actor)

  const nextStepAt = parseDate(body.nextStepAt)
  if (body.nextStepAt && !nextStepAt) {
    const err = new Error('nextStepAt no es una fecha valida')
    err.status = 400
    throw err
  }
  crm.nextStepAt = nextStepAt

  if (cleanText(body.notes)) {
    crm.statusHistory.push({
      from: crm.status,
      to: crm.status,
      note: cleanText(body.notes),
      changedBy: actor,
      changedAt: new Date(),
    })
  }

  const source = {
    pageUrl: cleanText(body.pageUrl),
    formId: cleanText(body.formId) || 'manual-crm',
    referer: '',
    origin: cleanText(body.origin) || 'manual',
    host: cleanText(body.host),
    apiKey: 'manual-crm',
  }

  const lead = await createLeadWithSequenceRetry({
    payload,
    normalized,
    crm,
    source,
    meta: {
      ip: cleanText(body.ip),
      userAgent: `manual-crm:${actor}`,
    },
    files,
    notification: {
      sent: false,
      to: '',
    },
  })

  return lead.toObject()
}

export async function listLeads(query = {}) {
  const page = Math.max(Number(query.page) || 1, 1)
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100)

  const filter = {}

  if (query.status && LEAD_STATUS.includes(normalizeLeadStatus(query.status))) {
    filter['crm.status'] = normalizeLeadStatus(query.status)
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

  if (query.q) {
    const rx = { $regex: toSafeRegex(query.q), $options: 'i' }
    filter.$or = [
      { 'normalized.fullName': rx },
      { 'normalized.company': rx },
      { 'normalized.email': rx },
      { 'normalized.phone': rx },
      { 'normalized.description': rx },
      { 'source.pageUrl': rx },
    ]
  }

  const [rows, total] = await Promise.all([
    Lead.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Lead.countDocuments(filter),
  ])

  return {
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    rows: rows.map(doc => {
      const plain = doc.toObject()
      const fallback = buildFallbackLeadParts(plain)
      return {
        ...plain,
        normalized: fallback.normalized,
        crm: fallback.crm,
      }
    }),
  }
}

export async function getLeadById(id) {
  const lead = await Lead.findById(id)
  if (!lead) return null

  const plain = lead.toObject()
  const fallback = buildFallbackLeadParts(plain)

  return {
    ...plain,
    normalized: fallback.normalized,
    crm: fallback.crm,
  }
}

export async function updateLeadCrmStatus(id, body = {}, reqUser = null) {
  const lead = await Lead.findById(id)
  if (!lead) {
    const err = new Error('Lead no encontrado')
    err.status = 404
    throw err
  }

  const fallback = buildFallbackLeadParts(lead)
  lead.normalized = fallback.normalized
  lead.crm = fallback.crm

  const actor = buildActor(reqUser)
  const note = cleanText(body.note)
  const nextStatus = normalizeLeadStatus(body.status)
  const hadNextStepBefore = cleanText(lead?.crm?.nextStep)
  const hadNextStepAtBefore = lead?.crm?.nextStepAt
    ? new Date(lead.crm.nextStepAt).getTime()
    : 0
  const hadFollowUpAtBefore = lead?.crm?.followUpAt
    ? new Date(lead.crm.followUpAt).getTime()
    : 0
  const touchedAgendaFields =
    Object.prototype.hasOwnProperty.call(body, 'nextStep') ||
    Object.prototype.hasOwnProperty.call(body, 'nextStepAt') ||
    Object.prototype.hasOwnProperty.call(body, 'followUpAt')
  const hadPendingAgenda = Boolean(
    cleanText(lead?.crm?.nextStep) ||
    lead?.crm?.nextStepAt ||
    lead?.crm?.followUpAt
  )

  if (nextStatus && !LEAD_STATUS.includes(nextStatus)) {
    const err = new Error(`Estado inválido. Use: ${LEAD_STATUS.join(', ')}`)
    err.status = 400
    throw err
  }

  if (body.priority) {
    const nextPriority = cleanText(body.priority)
    if (!LEAD_PRIORITY.includes(nextPriority)) {
      const err = new Error(
        `Prioridad inválida. Use: ${LEAD_PRIORITY.join(', ')}`
      )
      err.status = 400
      throw err
    }
    lead.crm.priority = nextPriority
  }

  if (Object.prototype.hasOwnProperty.call(body, 'owner')) {
    lead.crm.owner = cleanText(body.owner)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'commercial')) {
    lead.crm.commercial = cleanText(body.commercial)
  }

  if (Array.isArray(body.tags)) {
    lead.crm.tags = body.tags.map(cleanText).filter(Boolean)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    lead.crm.notes = appendInternalNote(lead.crm.notes, body.notes, actor)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'followUpAt')) {
    const followUpAt = parseDate(body.followUpAt)
    if (body.followUpAt && !followUpAt) {
      const err = new Error('followUpAt no es una fecha válida')
      err.status = 400
      throw err
    }
    lead.crm.followUpAt = followUpAt
  }

  if (Object.prototype.hasOwnProperty.call(body, 'nextStep')) {
    lead.crm.nextStep = cleanText(body.nextStep)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'nextStepAt')) {
    const nextStepAt = parseDate(body.nextStepAt)
    if (body.nextStepAt && !nextStepAt) {
      const err = new Error('nextStepAt no es una fecha válida')
      err.status = 400
      throw err
    }
    lead.crm.nextStepAt = nextStepAt
  }

  if (Object.prototype.hasOwnProperty.call(body, 'lastContactAt')) {
    const lastContactAt = parseDate(body.lastContactAt)
    if (body.lastContactAt && !lastContactAt) {
      const err = new Error('lastContactAt no es una fecha válida')
      err.status = 400
      throw err
    }
    lead.crm.lastContactAt = lastContactAt
  }

  const currentStatus = normalizeLeadStatus(lead.crm.status || 'new')
  let autoAgendaHistoryNote = ''

  if (touchedAgendaFields) {
    const nextStepNow = cleanText(lead?.crm?.nextStep)
    const nextStepAtNow = lead?.crm?.nextStepAt
      ? new Date(lead.crm.nextStepAt).getTime()
      : 0
    const followUpAtNow = lead?.crm?.followUpAt
      ? new Date(lead.crm.followUpAt).getTime()
      : 0

    const agendaChanged =
      nextStepNow !== hadNextStepBefore ||
      nextStepAtNow !== hadNextStepAtBefore ||
      followUpAtNow !== hadFollowUpAtBefore

    if (agendaChanged) {
      // Si se LIMPIAN los campos (de tener valores a estar vacíos)
      if (hadNextStepBefore || hadNextStepAtBefore || hadFollowUpAtBefore) {
        if (!nextStepNow && !nextStepAtNow && !followUpAtNow) {
          autoAgendaHistoryNote = 'Gestión de agenda completada'
        }
      }
      // Si se CREAN o MODIFICAN los campos (y no hay nota enviada)
      else if (!note && (nextStepNow || nextStepAtNow || followUpAtNow)) {
        const dateLabel = lead?.crm?.nextStepAt || lead?.crm?.followUpAt
        autoAgendaHistoryNote = [
          `Se agendo seguimiento: ${nextStepNow || 'Sin detalle'}`,
          dateLabel ? `Fecha: ${new Date(dateLabel).toISOString()}` : '',
        ]
          .filter(Boolean)
          .join(' | ')
      }
    }
  }

  const agendaWasCleared = Boolean(
    touchedAgendaFields &&
    hadPendingAgenda &&
    !cleanText(lead?.crm?.nextStep) &&
    !lead?.crm?.nextStepAt &&
    !lead?.crm?.followUpAt
  )

  if (nextStatus && nextStatus !== currentStatus) {
    if (hadPendingAgenda && !agendaWasCleared) {
      const err = new Error(
        'No puedes cambiar el estado porque este lead tiene gestion pendiente en agenda. Primero marca "gestionado" en Agenda.'
      )
      err.status = 409
      throw err
    }

    lead.crm.statusHistory.push({
      from: currentStatus,
      to: nextStatus,
      note,
      changedBy: actor,
      changedAt: new Date(),
    })
    lead.crm.status = nextStatus
    lead.crm.statusChangedAt = new Date()
  } else if (note && !autoAgendaHistoryNote) {
    // Agregar nota solo si no hay autoAgendaHistoryNote (evitar duplicado)
    lead.crm.statusHistory.push({
      from: currentStatus,
      to: currentStatus,
      note,
      changedBy: actor,
      changedAt: new Date(),
    })
  }

  if (autoAgendaHistoryNote) {
    const statusForHistory = normalizeLeadStatus(
      lead.crm.status || currentStatus
    )
    lead.crm.statusHistory.push({
      from: statusForHistory,
      to: statusForHistory,
      note: autoAgendaHistoryNote,
      changedBy: actor,
      changedAt: new Date(),
    })
  }

  if (note && autoAgendaHistoryNote) {
    // Si hay AMBOS (nota enviada + autoAgendaHistoryNote), agregar la nota también
    const statusForHistory = normalizeLeadStatus(
      lead.crm.status || currentStatus
    )
    lead.crm.statusHistory.push({
      from: statusForHistory,
      to: statusForHistory,
      note,
      changedBy: actor,
      changedAt: new Date(),
    })
  }

  if (note) {
    lead.crm.notes = appendInternalNote(lead.crm.notes, note, actor)
  }

  await lead.save()
  return lead.toObject()
}

export async function normalizeMissingLeadStructure(limit = 500) {
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 2000)

  const leads = await Lead.find({
    $or: [
      { normalized: { $exists: false } },
      { 'crm.status': { $exists: false } },
      { sequence: { $exists: false } },
      { sequence: null },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(safeLimit)

  const maxSequenceLead = await Lead.findOne({
    sequence: { $exists: true, $ne: null },
  })
    .sort({ sequence: -1 })
    .select({ sequence: 1 })
    .lean()

  let nextSequence = Number(maxSequenceLead?.sequence || 0)

  let updated = 0

  for (const lead of leads) {
    const normalized = buildNormalizedPayload(lead.payload || {})
    const crm = buildInitialCrm()
    const existingNormalized = lead.normalized?.toObject?.() || {}
    const existingCrm = lead.crm?.toObject?.() || {}

    lead.normalized = { ...normalized, ...existingNormalized }
    lead.crm = { ...crm, ...existingCrm }

    if (!lead.sequence) {
      nextSequence += 1
      lead.sequence = nextSequence
    }

    await lead.save()
    updated += 1
  }

  return { scanned: leads.length, updated }
}

export { LEAD_STATUS, LEAD_PRIORITY }

export default {
  ingestLead,
  createManualLead,
  listLeads,
  getLeadById,
  updateLeadCrmStatus,
  normalizeMissingLeadStructure,
}
