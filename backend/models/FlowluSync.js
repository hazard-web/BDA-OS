const mongoose = require('mongoose')

const flowluUserSchema = new mongoose.Schema(
  {
    flowluId: { type: Number, required: true },
    name: { type: String, trim: true, default: '' },
    email: { type: String, lowercase: true, trim: true, default: '' },
    canLogin: { type: Boolean, default: true },
  },
  { _id: false },
)

const flowluProjectSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['agile', 'task'], required: true },
    flowluId: { type: Number, required: true },
    name: { type: String, trim: true, default: '' },
  },
  { _id: false },
)

const flowluStageSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['agile', 'task'], required: true },
    workflowId: { type: Number, required: true },
    stageId: { type: Number, required: true },
    name: { type: String, trim: true, default: '' },
    ordering: { type: Number, default: 0 },
  },
  { _id: false },
)

/** Per-org Flowlu sync state and the cached Flowlu user list used for mapping. */
const flowluSyncSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    users: { type: [flowluUserSchema], default: [] },
    projects: { type: [flowluProjectSchema], default: [] },
    stages: { type: [flowluStageSchema], default: [] },
    // Admin-picked projects to sync; projectsChosenAt null means "never chosen" (fall back to env list)
    selectedProjects: { type: [flowluProjectSchema], default: [] },
    projectsChosenAt: Date,
    usersSyncedAt: Date,
    ticketsSyncedAt: Date,
    lastError: { type: String, default: '' },
    lastErrorAt: Date,
    // Background ticket sync (one at a time per org; running doubles as the lock)
    ticketJob: {
      running: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      startedAt: Date,
      finishedAt: Date,
      progress: { type: String, default: '' },
      message: { type: String, default: '' },
      error: { type: String, default: '' },
    },
    lastWebhook: {
      at: Date,
      summary: { type: String, default: '' },
    },
  },
  { timestamps: true },
)

module.exports = mongoose.model('FlowluSync', flowluSyncSchema)
