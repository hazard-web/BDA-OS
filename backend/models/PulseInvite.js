const mongoose = require('mongoose')

const pulseInviteSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'member'],
    default: 'member',
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  companyName: {
    type: String,
    trim: true,
    default: '',
  },
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'revoked'],
    default: 'pending',
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  acceptedAt: Date,
  acceptedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  firstName: {
    type: String,
    trim: true,
    default: '',
  },
  lastName: {
    type: String,
    trim: true,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

pulseInviteSchema.index({ organizationId: 1, email: 1, status: 1 })

module.exports = mongoose.model('PulseInvite', pulseInviteSchema)
