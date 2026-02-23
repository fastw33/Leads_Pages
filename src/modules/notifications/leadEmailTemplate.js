// src/modules/leads/leadEmailTemplate.js
export function buildLeadEmailHtml({ payload, files }, meta = {}) {
  const { pageUrl, formId, ip, referer } = meta

  const rows = Object.entries(payload || {})
    .map(
      ([key, value]) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;background:#f5f5f5;border:1px solid #e5e7eb">
          ${key}
        </td>
        <td style="padding:8px 12px;border:1px solid #e5e7eb">
          ${String(value || '-')}
        </td>
      </tr>
    `
    )
    .join('')

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f2f2f2;padding:24px">
    <table width="100%" style="max-width:720px;margin:auto;background:#ffffff;border-radius:8px">
      <tr>
        <td style="background:#111827;color:#fff;padding:16px 24px">
          <h2 style="margin:0">🚚 Nuevo Lead</h2>
          <p style="margin:4px 0 0;font-size:13px;opacity:.8">
            ${pageUrl || ''}
          </p>
        </td>
      </tr>

      <tr>
        <td style="padding:24px">
          <h3>Datos del contacto</h3>

          <table width="100%" style="border-collapse:collapse">
            ${rows}
          </table>

          <hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>

          <p style="font-size:13px;color:#555">
            <strong>Form ID:</strong> ${formId}<br/>
            <strong>IP:</strong> ${ip}<br/>
            <strong>Referer:</strong> ${referer || '-'}
          </p>

          ${
            files?.length
              ? `<p><strong>📎 Archivos adjuntos:</strong> ${files.length}</p>`
              : ''
          }
        </td>
      </tr>

      <tr>
        <td style="background:#f9fafb;padding:12px 24px;text-align:center;font-size:12px;color:#6b7280">
          FastWay Logistics · Leads automáticos
        </td>
      </tr>
    </table>
  </div>
  `
}
