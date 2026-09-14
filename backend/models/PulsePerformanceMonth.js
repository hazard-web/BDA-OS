const mongoose = require('mongoose')

const scoresSchema = new mongoose.Schema(
  {
    outcomes: { type: Number, default: 0, min: 0, max: 100 },
    quality: { type: Number, default: 0, min: 0, max: 100 },
    deadline: { type: Number, default: 0, min: 0, max: 100 },
    ownership: { type: Number, default: 0, min: 0, max: 100 },
    bms: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
)

const pulsePerformanceMonthSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    month: { type: String, required: true }, // yyyy-MM
    scores: { type: scoresSchema, default: () => ({}) },
    fixedPay: { type: Number, default: 0 },
    projectTier: {
      type: String,
      enum: ['Core', 'Enhanced', 'Significant', 'Strategic'],
      default: 'Core',
    },
    projectApproved: { type: Boolean, default: false },
    learningApproved: { type: Boolean, default: false },
    innovationApproved: { type: Boolean, default: false },
    managerNote: { type: String, default: '', trim: true },
    employeeNote: { type: String, default: '', trim: true },
    correctionRequested: { type: Boolean, default: false },
    correctionNote: { type: String, default: '', trim: true },
    status: {
      type: String,
      enum: ['draft', 'review', 'confirmed', 'locked'],
      default: 'draft',
    },
    lockedAt: Date,
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
)

pulsePerformanceMonthSchema.index({ organizationId: 1, month: 1 })
pulsePerformanceMonthSchema.index({ user: 1, month: 1 }, { unique: true })

module.exports = mongoose.model('PulsePerformanceMonth', pulsePerformanceMonthSchema)
