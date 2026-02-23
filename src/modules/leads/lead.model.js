import mongoose from 'mongoose'

const LeadSchema = new mongoose.Schema(
  {
    payload: { type: mongoose.Schema.Types.Mixed, required: true },

    source: {
      pageUrl: String,
      formId: String,
      referer: String,
      origin: String,
      host: String,
      apiKey: String,
    },

    meta: {
      ip: String,
      userAgent: String,
    },

    files: [
      {
        fieldname: String,
        originalname: String,
        filename: String,
        mimetype: String,
        size: Number,
        path: String,
      },
    ],

    notification: {
      sent: { type: Boolean, default: false },
      to: String,
      sentAt: Date,
      error: String,
    },
  },
  { timestamps: true }
)

LeadSchema.index({ 'source.pageUrl': 1, createdAt: -1 })
LeadSchema.index({ createdAt: -1 })

export const Lead = mongoose.model('Lead', LeadSchema)
