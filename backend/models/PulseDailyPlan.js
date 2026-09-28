const mongoose = require('mongoose')

const targetSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['ticket', 'task', 'other'], required: true },
    ticket: {
      type: new mongoose.Schema(
        {
          source: { type: String, enum: ['agile', 'task'], required: true },
          flowluId: { type: Number, required: true },
          key: { type: String, trim: true, default: '' },
        },
        { _id: false },
      ),
      default: undefined,
    },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'AssignedTask', default: null },
    title: { type: String, trim: true, required: true },
    projectName: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['planned', 'on_track', 'blocked', 'done'],
      default: 'planned',
    },
    note: { type: String, trim: true, default: '' },
    statusAt: Date,
  },
  { _id: true },
)

const slotSchema = new mongoose.Schema(
  {
    sentAt: Date,
    answeredAt: Date,
    messageName: { type: String, default: '' },
    error: { type: String, default: '' },
  },
  { _id: false },
)

/** One person's day as reported to the Google Chat update bot: plan, midday status, evening timesheet. */
const pulseDailyPlanSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, lowercase: true, trim: true, required: true },
    date: { type: String, required: true }, // yyyy-MM-dd (IST)
    targets: { type: [targetSchema], default: [] },
    morning: { type: slotSchema, default: () => ({}) },
    afternoon: { type: slotSchema, default: () => ({}) },
    evening: { type: slotSchema, default: () => ({}) },
    reminder: { type: slotSchema, default: () => ({}) },
  },
  { timestamps: true },
)

pulseDailyPlanSchema.index({ user: 1, date: 1 }, { unique: true })
pulseDailyPlanSchema.index({ organizationId: 1, date: 1 })

module.exports = mongoose.model('PulseDailyPlan', pulseDailyPlanSchema)
