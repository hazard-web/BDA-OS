const mongoose = require('mongoose');

const leavePolicySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    casualLeave: {
      daysPerMonth:   { type: Number, default: 1 },
      daysPerYear:     { type: Number, default: 12 },
      isPaid:          { type: Boolean, default: true },
    },
    sickLeave: {
      daysPerMonth:   { type: Number, default: 1 },
      daysPerYear:     { type: Number, default: 12 },
      isPaid:          { type: Boolean, default: true },
    },
    carryForward: {
      enabled:         { type: Boolean, default: false },
      maxDays:         { type: Number, default: 6 },   // cap carried-forward balance
    },
    encashment: {
      enabled:         { type: Boolean, default: false },
      maxDays:         { type: Number, default: 0 },
    },
    lwp: {
      enabled:         { type: Boolean, default: true },   // LWP kicks in when balance exhausted
      salaryDeductionType: { type: String, enum: ['full', 'pro-rata'], default: 'pro-rata' },
    },
    // Pro-rata working days per month (used when actual days vary)
    workingDaysPerMonth: { type: Number, default: 26 },
    // Weekend days that are always off (0=Sun, 6=Sat)
    weekendDays: {
      type: [Number],
      default: [0, 6],
    },
    // Company holidays: ISO date strings or { date, name } objects
    holidays: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    // Auto-reset balances on the 1st of each year
    autoResetAnnual: {
      enabled:         { type: Boolean, default: true },
    },
    // Probation: new staff may have restricted leave rights
    probationPolicy: {
      allowsLeave:     { type: Boolean, default: true },
      maxLeaveDuringProbation: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LeavePolicy', leavePolicySchema);
