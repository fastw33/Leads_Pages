import mongoose from 'mongoose'

const LeadCounterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Number, default: 0 },
  },
  { versionKey: false }
)

const LeadCounter =
  mongoose.models.LeadCounter ||
  mongoose.model('LeadCounter', LeadCounterSchema)

const StatusHistorySchema = new mongoose.Schema(
  {
    from: { type: String, default: '' },
    to: { type: String, required: true },
    note: { type: String, default: '' },
    changedBy: { type: String, default: 'system' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const LeadNormalizedSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: '', trim: true },
    firstName: { type: String, default: '', trim: true },
    lastName: { type: String, default: '', trim: true },
    company: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    document: { type: String, default: '', trim: true },
    personType: { type: String, default: '', trim: true },
    serviceType: { type: String, default: '', trim: true },
    origin: { type: String, default: '', trim: true },
    destination: { type: String, default: '', trim: true },
    cargoType: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    estimatedPrice: { type: String, default: '', trim: true },
    consent: { type: Boolean, default: false },
    rawKeys: [{ type: String }],
  },
  { _id: false }
)

const LeadCrmSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: [
        'new',
        'contacted',
        'qualified',
        'appointment',
        'unqualified',
        'no_response',
        'proposal',
        'won',
        'lost',
        'spam',
      ],
      default: 'new',
      index: true,
    },
    statusChangedAt: { type: Date, default: Date.now, index: true },
    owner: { type: String, default: '', trim: true },
    commercial: { type: String, default: '', trim: true, index: true },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
      index: true,
    },
    tags: [{ type: String }],
    followUpAt: { type: Date, default: null },
    nextStep: { type: String, default: '', trim: true },
    nextStepAt: { type: Date, default: null, index: true },
    lastContactAt: { type: Date, default: null },
    notes: { type: String, default: '', trim: true },
    statusHistory: { type: [StatusHistorySchema], default: [] },
  },
  { _id: false }
)

const LeadSchema = new mongoose.Schema(
  {
    sequence: { type: Number, unique: true, sparse: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    normalized: { type: LeadNormalizedSchema, default: () => ({}) },
    crm: { type: LeadCrmSchema, default: () => ({}) },

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

LeadSchema.pre('validate', async function assignSequence(next) {
  try {
    if (!this.isNew || this.sequence) return next()

    const counter = await LeadCounter.findOneAndUpdate(
      { key: 'lead_sequence' },
      { $inc: { value: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )

    this.sequence = Number(counter?.value || 1)
    return next()
  } catch (error) {
    return next(error)
  }
})

LeadSchema.index({ 'source.pageUrl': 1, createdAt: -1 })
LeadSchema.index({ createdAt: -1 })
LeadSchema.index({ 'normalized.email': 1 })
LeadSchema.index({ 'normalized.phone': 1 })
LeadSchema.index({ 'crm.followUpAt': 1 })

export const Lead = mongoose.model('Lead', LeadSchema)
