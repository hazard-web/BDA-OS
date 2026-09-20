const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const staffSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    // Employee ID is now OPTIONAL - admins may assign manually or leave blank.
    // Auto-generation has been removed per the new self-service profile flow.
    employeeId: {
      type: String,
      required: false,
      index: true,
      sparse: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      // index is covered by the compound unique index { user, email } below
    },
    phone: {
      type: String,
      trim: true,
    },
    // ── Self-Service Profile Fields (filled by employee after login) ──
    panNumber: {
      type: String,
      uppercase: true,
      trim: true,
      // Format: ABCDE1234F (5 letters, 4 digits, 1 letter)
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN Number format. Expected: ABCDE1234F'],
    },
    dob: {
      type: Date,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', ''],
      default: '',
    },
    address: {
      street: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
      country: { type: String, default: 'India' },
    },
    emergencyContact: {
      name: { type: String, default: '' },
      relationship: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    designation: String,
    department: String,
    pfNumber: String,
    joiningDate: Date,
    type: {
      type: String,
      enum: ['Employee', 'Intern'],
      default: 'Employee',
    },
    overtimeEligible: {
      type: Boolean,
      default: false,
    },
    // Bank details are now top-level (previously nested under `financials`)
    // Retained for back-compat with existing PDFs.
    financials: {
      panNumber: String,
      bankName: String,
      accountNumber: String,
      ifscCode: String,
    },
    bankDetails: {
      accountHolderName: { type: String, default: '' },
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      branch: { type: String, default: '' },
      accountType: { type: String, default: 'Savings', enum: ['Savings', 'Current'] },
    },
    documents: {
      aadharCard: {
        fileName: String,
        originalName: String,
        url: String,
        uploadedAt: Date,
      },
      panCard: {
        fileName: String,
        originalName: String,
        url: String,
        uploadedAt: Date,
      },
      profileImage: {
        fileName: String,
        originalName: String,
        url: String,
        uploadedAt: Date,
      },
    },
    additionalDocuments: [{
      documentType: { type: String, required: true },
      fileName: { type: String, required: true },
      originalName: { type: String, required: true },
      url: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
      notes: String
    }],
    salaryDetails: {
      annualCTC: {
        type: Number,
        default: 0,
      },
      baseSalary: {
        type: Number,
        default: 0,
      }, // Represents Monthly Stipend for Interns
    },
    leaveBalance: {
      casual: { type: Number, default: 18 },
      sick: { type: Number, default: 12 }
    },
    internLeaveQuota: {
      type: Number,
      default: 1
    },
    // Working days override (null = inherit admin defaultWorkDays)
    workingDays: {
      type: [Number],
      default: undefined,
    },
    clientAssignment: {
      type: String,
      default: '',
    },
    // Portal Authentication Fields
    portalPassword: {
      type: String,
    },
    isPortalEnabled: {
      type: Boolean,
      default: false,
    },
    mustChangePassword: {
      type: Boolean,
      default: true,
    },
    // Profile-completion flag. False on creation; flipped to true
    // once the employee fills in the required personal & bank details.
    profileCompleted: {
      type: Boolean,
      default: false,
    },
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    passwordResetToken: String,
    passwordResetExpires: Date,
    lastLogin: Date,
  },
  { timestamps: true }
);

// Hash portal password before saving
staffSchema.pre('save', async function (next) {
  if (!this.isModified('portalPassword')) return next();
  if (this.portalPassword === undefined || this.portalPassword === null) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.portalPassword = await bcrypt.hash(this.portalPassword, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to check password
staffSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.portalPassword) return false;
  return await bcrypt.compare(candidatePassword, this.portalPassword);
};

// Indexes that accelerate the hottest queries:
//  • { user, email }      - UNIQUE: prevents duplicate employees per company (enforced at DB level)
//  • { user, createdAt }  - admin staff list (sorted by newest)
//  • { user, employeeId } - duplicate-employee-id check on create + payslip join
//  • { user, isPortalEnabled } - stats "active portals" count
staffSchema.index({ user: 1, email: 1 }, { unique: true });
staffSchema.index({ user: 1, createdAt: -1 });
staffSchema.index({ user: 1, employeeId: 1 }, { unique: true, sparse: true });
staffSchema.index({ user: 1, isPortalEnabled: 1 });
staffSchema.index({ user: 1, type: 1 });

module.exports = mongoose.model('Staff', staffSchema);
