const mongoose = require('mongoose')

const fileSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    mime: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    data: { type: String, default: '' },
  },
  { _id: false },
)

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, trim: true, default: '' },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    country: { type: String, trim: true, default: 'India' },
    state: { type: String, trim: true, default: '' },
    postalCode: { type: String, trim: true, default: '' },
  },
  { _id: false },
)

const emergencySchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    relationship: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  { _id: false },
)

const educationSchema = new mongoose.Schema(
  {
    schoolName: { type: String, trim: true, default: '' },
    degree: { type: String, trim: true, default: '' },
    fieldOfStudy: { type: String, trim: true, default: '' },
    dateOfCompletion: { type: String, trim: true, default: '' },
    additionalNotes: { type: String, trim: true, default: '' },
  },
  { _id: true },
)

const experienceSchema = new mongoose.Schema(
  {
    occupation: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' },
    summary: { type: String, trim: true, default: '' },
    duration: { type: String, trim: true, default: '' },
    currentlyWorkHere: { type: String, trim: true, default: '' },
  },
  { _id: true },
)

const candidateSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    candidateId: {
      type: String,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Not started', 'In progress', 'Details received', 'Offer sent', 'Joined', 'Withdrawn'],
      default: 'Draft',
    },
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    officialEmail: { type: String, lowercase: true, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    countryCode: { type: String, trim: true, default: '+91' },
    dob: { type: Date },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other', ''],
      default: '',
    },
    emergencyContact: { type: emergencySchema, default: () => ({}) },
    uan: { type: String, trim: true, default: '' },
    aadhaar: { type: String, trim: true, default: '' },
    pan: { type: String, uppercase: true, trim: true, default: '' },
    photo: { type: fileSchema, default: undefined },
    aadhaarFront: { type: fileSchema, default: undefined },
    aadhaarBack: { type: fileSchema, default: undefined },
    panFront: { type: fileSchema, default: undefined },
    panBack: { type: fileSchema, default: undefined },
    presentAddress: { type: addressSchema, default: () => ({}) },
    permanentAddress: { type: addressSchema, default: () => ({}) },
    sameAsPresent: { type: Boolean, default: false },
    experienceYears: { type: String, trim: true, default: '' },
    sourceOfHire: { type: String, trim: true, default: '' },
    skillSet: { type: String, trim: true, default: '' },
    highestQualification: { type: String, trim: true, default: '' },
    additionalInfo: { type: String, trim: true, default: '' },
    workLocation: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    currentSalary: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    offerLetter: { type: fileSchema, default: undefined },
    tentativeJoiningDate: { type: Date },
    education: { type: [educationSchema], default: [] },
    experience: { type: [experienceSchema], default: [] },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedByName: { type: String, trim: true, default: '' },
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    modifiedByName: { type: String, trim: true, default: '' },
    onboardingToken: { type: String, trim: true, index: true, sparse: true },
    onboardingTokenExpires: { type: Date },
    onboardingEmailSentAt: { type: Date },
    employeeSubmittedAt: { type: Date },
    pulseInviteId: { type: mongoose.Schema.Types.ObjectId, ref: 'PulseInvite' },
    pulseInviteSentAt: { type: Date },
  },
  { timestamps: true },
)

candidateSchema.index({ organizationId: 1, email: 1 })
candidateSchema.index({ organizationId: 1, createdAt: -1 })

module.exports = mongoose.model('Candidate', candidateSchema)
