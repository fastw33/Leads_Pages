// src/modules/notifications/mailer.js
import nodemailer from 'nodemailer'

const { MAIL_HOST, MAIL_PORT, MAIL_SECURE, MAIL_USER, MAIL_PASS, MAIL_FROM } =
  process.env

if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) {
  throw new Error('❌ Configuración SMTP incompleta')
}

export const transporter = nodemailer.createTransport({
  host: MAIL_HOST,
  port: Number(MAIL_PORT),
  secure: MAIL_SECURE === 'true', // true = 465, false = 587
  auth: {
    user: MAIL_USER,
    pass: MAIL_PASS,
  },
})

export async function verifyMailer() {
  try {
    await transporter.verify()
    console.log('📧 SMTP conectado correctamente')
  } catch (err) {
    console.error('❌ Error SMTP:', err.message)
  }
}

/**
 * Envía correo de lead
 * @param {object} params
 * @param {string|string[]} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string=} params.replyTo
 * @param {Array=} params.attachments
 */
export async function sendLeadEmail({
  to,
  subject,
  html,
  replyTo,
  attachments = [],
}) {
  return transporter.sendMail({
    from: MAIL_FROM,
    to,
    subject,
    replyTo,
    html,
    attachments, // ✅ CLAVE: ahora sí se envían los adjuntos
  })
}
