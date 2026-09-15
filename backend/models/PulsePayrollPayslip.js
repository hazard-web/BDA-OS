const mongoose = require('mongoose')

const pulsePayrollPayslipSchema = new mongoose.Schema(
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
    performanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PulsePerformanceMonth',
    },
    employeeName: { type: String, default: '', trim: true },
    fixedPay: { type: Number, default: 0, min: 0 },
    performanceBonus: { type: Number, default: 0, min: 0 },
    projectBonus: { type: Number, default: 0, min: 0 },
    learningBonus: { type: Number, default: 0, min: 0 },
    innovationBonus: { type: Number, default: 0, min: 0 },
    totalBonus: { type: Number, default: 0, min: 0 },
    weightedScore: { type: Number, default: 0 },
    performanceStatus: { type: String, default: '' },
    grossPay: { type: Number, default: 0, min: 0 },
    netPay: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['generated', 'paid'],
      default: 'generated',
    },
    generatedAt: { type: Date, default: Date.now },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paidAt: Date,
  },
  { timestamps: true },
)

pulsePayrollPayslipSchema.index({ organizationId: 1, month: 1 })
pulsePayrollPayslipSchema.index({ user: 1, month: 1 }, { unique: true })

module.exports = mongoose.model('PulsePayrollPayslip', pulsePayrollPayslipSchema)
