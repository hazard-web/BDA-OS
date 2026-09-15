const mongoose = require('mongoose')

const pulseCompanyFileSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      trim: true,
      default: 'application/octet-stream',
    },
    size: {
      type: Number,
      default: 0,
    },
    url: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    uploadedByName: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true },
)

pulseCompanyFileSchema.index({ organizationId: 1, createdAt: -1 })

module.exports = mongoose.model('PulseCompanyFile', pulseCompanyFileSchema)
