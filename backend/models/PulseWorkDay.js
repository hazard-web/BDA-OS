const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    lat: Number,
    lng: Number,
    city: String,
    sector: String,
    locality: String,
    state: String,
    country: String,
    displayName: String,
  },
  { _id: false },
);

const eventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['CHECK_IN', 'CHECK_OUT', 'RESUME', 'MIDNIGHT_CLOSE', 'TARGET_REACHED'],
      required: true,
    },
    at: { type: Date, required: true },
    activeMsAtEvent: { type: Number, default: 0 },
    ip: String,
    userAgent: String,
    location: locationSchema,
  },
  { _id: true },
);

const sessionSchema = new mongoose.Schema(
  {
    checkInAt: { type: Date, required: true },
    checkOutAt: Date,
    durationMs: { type: Number, default: 0 },
    ip: String,
    userAgent: String,
    locationIn: locationSchema,
    locationOut: locationSchema,
  },
  { _id: true },
);

const taskEntrySchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    project: { type: String, default: 'BDA OS', trim: true },
    minutes: { type: Number, required: true, min: 1 },
  },
  { _id: true },
);

const pulseWorkDaySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    email: { type: String, required: true, lowercase: true, trim: true },
    date: { type: String, required: true }, // yyyy-MM-dd (local/IST calendar day)
    totalActiveMs: { type: Number, default: 0 },
    targetHours: { type: Number, default: 9 },
    targetReachedAt: Date,
    timesheetLogged: { type: Boolean, default: false },
    timesheetLoggedAt: Date,
    timesheetHours: { type: Number, default: 0 },
    timesheetSubmitted: { type: Boolean, default: false },
    timesheetSubmittedAt: Date,
    taskEntries: [taskEntrySchema],
    status: {
      type: String,
      enum: ['idle', 'active', 'stopped', 'closed'],
      default: 'idle',
    },
    events: [eventSchema],
    sessions: [sessionSchema],
  },
  { timestamps: true },
);

pulseWorkDaySchema.index({ user: 1, date: -1 }, { unique: true });
pulseWorkDaySchema.index({ email: 1, date: -1 });

module.exports = mongoose.model('PulseWorkDay', pulseWorkDaySchema);
