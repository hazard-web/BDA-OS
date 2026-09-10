const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    // OAuth-only accounts may have no local password
    required: function requiredPassword() {
      return !(this.oauthProviders && this.oauthProviders.length > 0)
    },
    minlength: 6,
  },
  oauthProviders: [
    {
      provider: { type: String, trim: true },
      providerId: { type: String, trim: true },
    },
  ],
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
  avatarUrl: {
    type: String,
    trim: true,
    default: '',
  },
  companyName: {
    type: String,
    trim: true,
    default: 'BDA Technologies Private Limited'
  },
  companyAddress: {
    type: String,
    trim: true,
    default: 'Flat No. 207, Plot No. 31A, Unione Residency, Akbarpur, Behrampur, Ghaziabad, Uttar Pradesh, India, 201009'
  },
  companyPhone: {
    type: String,
    trim: true,
    default: ''
  },
  companyEmail: {
    type: String,
    trim: true,
    default: 'hr@bdatechnologies.com'
  },
  companyCIN: {
    type: String,
    trim: true,
    default: 'U74999UP2017PTC096671'
  },
  companyGST: {
    type: String,
    trim: true,
    default: '09AAHCB4248F1ZO'
  },
  companyWebsite: {
    type: String,
    trim: true,
    default: 'www.bdatechnologies.com'
  },
  companyDomain: {
    type: String,
    trim: true,
    lowercase: true,
    default: '',
  },
  companyLogo: {
    type: String, // Base64 string
    default: 'data:image/png;base64,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'
  },
  // Pulse access: admin manages Organization; member uses My Space only
  role: {
    type: String,
    enum: ['admin', 'member'],
    // Legacy users without a role behave as admin (see pulseAuth.isPulseAdmin)
    default: 'admin',
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  isVerified: {
    type: Boolean,
    default: false,
  },
  // Explicit false = new org must finish HR company setup.
  // Missing/undefined = legacy accounts (skip wizard).
  onboardingCompleted: {
    type: Boolean,
  },
  industry: {
    type: String,
    trim: true,
    default: '',
  },
  // Pulse (HR product) - separate org setup from BDA OS onboarding
  pulseSetupCompleted: {
    type: Boolean,
    default: false,
  },
  pulsePortalId: {
    type: String,
    trim: true,
    default: '',
  },
  pulseEmployeeCount: {
    type: String,
    trim: true,
    default: '',
  },
  displayName: {
    type: String,
    trim: true,
    default: '',
  },
  gender: {
    type: String,
    trim: true,
    default: "I'd prefer not to say",
  },
  country: {
    type: String,
    trim: true,
    default: 'India',
  },
  state: {
    type: String,
    trim: true,
    default: '',
  },
  timezone: {
    type: String,
    trim: true,
    default: 'Asia/Kolkata',
  },
  language: {
    type: String,
    trim: true,
    default: 'English',
  },
  // Extra sign-in / recovery emails (primary remains `email`)
  additionalEmails: [
    {
      email: { type: String, trim: true, lowercase: true, required: true },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  googleWorkspace: {
    refreshToken: { type: String, select: false, default: '' },
    connected: { type: Boolean, default: false },
    lastSyncAt: { type: Date, default: null },
    lastError: { type: String, trim: true, default: '' },
  },
  verificationToken: String,
  verificationExpires: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  defaultWorkDays: {
    type: [Number],
    default: [1, 2, 3, 4, 5], // 0=Sun 1=Mon … 6=Sat; default Mon-Fri
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.index(
  { pulsePortalId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      pulsePortalId: { $type: 'string', $gt: '' },
    },
  },
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
