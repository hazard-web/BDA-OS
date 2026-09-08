const mongoose = require('mongoose')

const pulseZipScoreSchema = new mongoose.Schema(
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
    name: { type: String, trim: true, default: '' },
    date: { type: String, required: true },
    puzzleNo: { type: Number, required: true },
    timeMs: { type: Number, required: true, min: 0 },
    backtracks: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
)

pulseZipScoreSchema.index({ organizationId: 1, date: 1, timeMs: 1, createdAt: 1 })
pulseZipScoreSchema.index({ organizationId: 1, user: 1, date: 1 }, { unique: true })

module.exports = mongoose.model('PulseZipScore', pulseZipScoreSchema)
