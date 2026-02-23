// src/modules/leads/lead.service.js
import { Lead } from './lead.model.js'
import { resolveLeadRecipient } from './leadEmailRouter.js'
import { sendLeadEmail } from '../notifications/mailer.js'
import { buildLeadEmailHtml } from '../notifications/leadEmailTemplate.js'

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

export async function ingestLead(req) {
  const payload = parsePayload(req.body)
  const files = mapFiles(req)

  const source = {
    pageUrl: req.body?.pageUrl || '',
    formId: req.body?.formId || '',
    referer: req.get('referer') || '',
    origin: req.get('origin') || '',
    host: req.get('host') || '',
    apiKey: req.get('x-api-key') || '',
  }

  const meta = {
    ip: getIp(req),
    userAgent: req.get('user-agent') || '',
  }

  // 1) Guardar lead en DB
  const lead = await Lead.create({ payload, source, meta, files })

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

export default { ingestLead }
