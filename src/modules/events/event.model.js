import mongoose from 'mongoose'

const EventAttributionSchema = new mongoose.Schema(
  {
    utmSource: { type: String, default: '', trim: true },
    utmMedium: { type: String, default: '', trim: true },
    utmCampaign: { type: String, default: '', trim: true },
    utmTerm: { type: String, default: '', trim: true },
    utmContent: { type: String, default: '', trim: true },
    gclid: { type: String, default: '', trim: true },
    fbclid: { type: String, default: '', trim: true },
  },
  { _id: false }
)

const EventContactSchema = new mongoose.Schema(
  {
    target: { type: String, default: '', trim: true },
    channel: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    url: { type: String, default: '', trim: true },
  },
  { _id: false }
)

const EventSchema = new mongoose.Schema(
  {
    eventId: { type: String, trim: true, unique: true, sparse: true },
    eventType: {
      type: String,
      enum: ['whatsapp_contact_click'],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['whatsapp'],
      required: true,
      index: true,
    },
    isBillableLead: { type: Boolean, default: false, index: true },
    leadChannel: { type: String, default: '', trim: true, index: true },
    sessionId: { type: String, default: '', trim: true, index: true },
    visitorId: { type: String, default: '', trim: true, index: true },
    locale: { type: String, default: '', trim: true, index: true },

    source: {
      pageUrl: { type: String, default: '', trim: true, index: true },
      referrer: { type: String, default: '', trim: true },
      origin: { type: String, default: '', trim: true },
      host: { type: String, default: '', trim: true },
      apiKey: { type: String, default: '', trim: true },
    },

    contact: { type: EventContactSchema, default: () => ({}) },
    attribution: { type: EventAttributionSchema, default: () => ({}) },

    meta: {
      ip: { type: String, default: '' },
      userAgent: { type: String, default: '' },
    },

    payload: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: true }
)

EventSchema.index({ eventType: 1, createdAt: -1 })
EventSchema.index({ isBillableLead: 1, createdAt: -1 })
EventSchema.index({ 'source.pageUrl': 1, createdAt: -1 })
EventSchema.index({ leadChannel: 1, createdAt: -1 })

export const LeadEvent = mongoose.model('LeadEvent', EventSchema)
