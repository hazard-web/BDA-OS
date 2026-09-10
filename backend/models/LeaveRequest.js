const mongoose = require('mongoose');

const leaveRequestSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
      index: true
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    type: {
      type: String,
      enum: ['Casual', 'Sick', 'Custom'],
      default: 'Casual',
      required: true
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending'
    },
    reason: {
      type: String,
      required: true
    },
    attachment: {
      name: String,
      mime: String,
      size: Number,
      url: String,
    },
    adminNotes: {
      type: String
    }
  },
  { timestamps: true }
);

// Hot paths:
//  • admin "all pending" - { admin, status, createdAt }
//  • staff "my requests" - { staff, createdAt }
//  • overlap / range queries - { staff, startDate, endDate }
leaveRequestSchema.index({ admin: 1, status: 1, createdAt: -1 });
leaveRequestSchema.index({ staff: 1, createdAt: -1 });
leaveRequestSchema.index({ staff: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
