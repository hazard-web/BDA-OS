const mongoose = require('mongoose')

/** Local copy of a Flowlu agile issue or project task. */
const flowluTicketSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    source: { type: String, enum: ['agile', 'task'], required: true },
    flowluId: { type: Number, required: true },
    key: { type: String, trim: true, default: '' },
    name: { type: String, trim: true, default: '' },
    projectId: { type: Number, default: null },
    projectName: { type: String, trim: true, default: '' },
    sprintId: { type: Number, default: null },
    sprintName: { type: String, trim: true, default: '' },
    stageId: { type: Number, default: null },
    stageName: { type: String, trim: true, default: '' },
    workflowId: { type: Number, default: null },
    assigneeFlowluId: { type: Number, default: null, index: true },
    estimate: { type: Number, default: 0 },
    deadline: { type: Date, default: null },
    done: { type: Boolean, default: false },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
)

flowluTicketSchema.index({ organizationId: 1, source: 1, flowluId: 1 }, { unique: true })

module.exports = mongoose.model('FlowluTicket', flowluTicketSchema)
