const mongoose = require('mongoose')

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

/** Per-org schedule for the Google Chat daily update bot (IST times). */
const chatBotSettingsSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: false },
    // Chat spaces (spaces/…): team gets the prompts, manager gets the daily summary
    teamSpace: { type: String, trim: true, default: '' },
    managerSpace: { type: String, trim: true, default: '' },
    // People who get the end-of-day report by email (instead of or as well as the manager space)
    summaryEmails: { type: [String], default: [] },
    // Members left out of prompts, reminders and counts (e.g. leadership); new joiners are included
    excludedUsers: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], default: [] },
    morningTime: { type: String, default: '09:45', match: HHMM },
    afternoonTime: { type: String, default: '14:30', match: HHMM },
    eveningTime: { type: String, default: '19:00', match: HHMM },
    reminderTime: { type: String, default: '19:20', match: HHMM },
    summaryTime: { type: String, default: '19:35', match: HHMM },
    // yyyy-MM-dd of the last scheduled run per slot, so each fires once a day
    lastRun: {
      morning: { type: String, default: '' },
      afternoon: { type: String, default: '' },
      evening: { type: String, default: '' },
      reminder: { type: String, default: '' },
      summary: { type: String, default: '' },
    },
    // Outcome of the latest run per slot: { at, ok, message } — shown in Bot settings
    lastResult: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
)

module.exports = mongoose.model('ChatBotSettings', chatBotSettingsSchema)
