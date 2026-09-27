const express = require('express')
const mongoose = require('mongoose')
const { auth } = require('./auth')
const User = require('../models/User')
const FlowluSync = require('../models/FlowluSync')
const FlowluTicket = require('../models/FlowluTicket')
const PulseWorkDay = require('../models/PulseWorkDay')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { personName } = require('../utils/pulsePerson')
const {
  flowluBaseUrl,
  isFlowluConfigured,
  flowluIdList,
  flowluRequest,
  flowluList,
} = require('../utils/flowlu')

const router = express.Router()

function requireAdmin(req, res, next) {
  if (!isPulseAdmin(req.user)) {
    return res.status(403).json({ success: false, message: 'Admin access required' })
  }
  return next()
}

function orgObjectId(user) {
  return new mongoose.Types.ObjectId(orgIdOf(user))
}

async function orgMembers(organizationId) {
  return User.find({ $or: [{ organizationId }, { _id: organizationId }] })
    .select('email firstName lastName displayName avatarUrl role flowluUserId flowluLinkSource')
    .sort({ createdAt: 1 })
    .lean()
}

async function syncState(organizationId) {
  return FlowluSync.findOneAndUpdate(
    { organizationId },
    { $setOnInsert: { organizationId } },
    { upsert: true, new: true },
  )
}

async function recordError(organizationId, err) {
  await FlowluSync.updateOne(
    { organizationId },
    { $set: { lastError: err.message || String(err), lastErrorAt: new Date() } },
    { upsert: true },
  )
}

const PROJECT_ENV = { agile: 'FLOWLU_AGILE_PROJECT_IDS', task: 'FLOWLU_PROJECT_IDS' }

// A non-empty env list caps which projects this server may touch (e.g. UAT sandbox only).
function projectAllowed(source, flowluId) {
  const limit = flowluIdList(PROJECT_ENV[source])
  return !limit.length || limit.includes(flowluId)
}

/** Projects to sync: the admin's saved pick within the env cap, else the env lists. */
function projectsToSync(state) {
  if (state?.projectsChosenAt) {
    return (state.selectedProjects || []).filter((p) => projectAllowed(p.source, p.flowluId))
  }
  const names = new Map((state?.projects || []).map((p) => [`${p.source}:${p.flowluId}`, p.name]))
  return Object.entries(PROJECT_ENV).flatMap(([source, env]) =>
    flowluIdList(env).map((flowluId) => ({ source, flowluId, name: names.get(`${source}:${flowluId}`) || '' })))
}

// Submitted ticket rows that never reached BMS (no time-log id yet).
const PENDING_LOG = {
  timesheetSubmitted: true,
  taskEntries: { $elemMatch: { kind: 'ticket', flowluTimelogId: null } },
}

async function pendingLogCount(userIds) {
  const [row] = await PulseWorkDay.aggregate([
    { $match: { user: { $in: userIds }, ...PENDING_LOG } },
    { $unwind: '$taskEntries' },
    { $match: { 'taskEntries.kind': 'ticket', 'taskEntries.flowluTimelogId': null } },
    { $count: 'n' },
  ])
  return row?.n || 0
}

function flowluDate(value) {
  if (!value || String(value).startsWith('0000')) return null
  const date = new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

function publicMember(row, flowluById) {
  const linked = row.flowluUserId != null ? flowluById.get(row.flowluUserId) : null
  let status = 'unlinked'
  if (row.flowluUserId != null) status = linked ? row.flowluLinkSource || 'manual' : 'missing'
  return {
    _id: row._id,
    name: personName(row, row.email),
    email: row.email,
    role: row.role || 'admin',
    avatarUrl: row.avatarUrl || '',
    flowluUserId: row.flowluUserId ?? null,
    linkSource: row.flowluLinkSource || '',
    status,
  }
}

/** Auto-link members whose email equals a Flowlu login; manual links are never touched. */
async function autoLinkMembers(organizationId, flowluUsers) {
  const members = await orgMembers(organizationId)
  const manualIds = new Set(
    members.filter((m) => m.flowluLinkSource === 'manual' && m.flowluUserId != null).map((m) => m.flowluUserId),
  )
  const byEmail = new Map(flowluUsers.filter((u) => u.email).map((u) => [u.email, u]))
  let linked = 0
  let cleared = 0
  for (const member of members) {
    if (member.flowluLinkSource === 'manual') continue
    const match = byEmail.get(String(member.email || '').toLowerCase())
    const next = match && !manualIds.has(match.flowluId) ? match.flowluId : null
    if (next === (member.flowluUserId ?? null)) continue
    await User.updateOne(
      { _id: member._id },
      { $set: { flowluUserId: next, flowluLinkSource: next != null ? 'auto' : '' } },
    )
    if (next != null) linked += 1
    else cleared += 1
  }
  return { linked, cleared }
}

async function fetchFlowluUsers() {
  const rows = await flowluList('core/user/list')
  return rows.map((row) => ({
    flowluId: Number(row.id),
    name: String(row.name || [row.first_name, row.last_name].filter(Boolean).join(' ')).replace(/\s+/g, ' ').trim(),
    email: String(row.username || '').trim().toLowerCase(),
    canLogin: Number(row.role_login) === 1,
  }))
}

function stageRow(source, row) {
  return {
    source,
    workflowId: Number(row.workflow_id),
    stageId: Number(row.id),
    name: row.name || '',
    ordering: Number(row.ordering) || 0,
  }
}

function stageOptionsFor(ticket, stages) {
  return stages
    .filter((s) => s.source === ticket.source && s.workflowId === ticket.workflowId)
    .sort((a, b) => a.ordering - b.ordering)
    .map((s) => ({ id: s.stageId, name: s.name.trim() }))
}

async function fetchAgileTickets(projectId) {
  const project = await flowluRequest(`agile/projects/get/${projectId}`)
  const [stages, sprints, issues] = await Promise.all([
    project.workflow_id ? flowluList('agile/stages/list', { workflow_id: project.workflow_id }) : [],
    flowluList('agile/sprints/list', { project_id: projectId }),
    flowluList('agile/issues/list', { project_id: projectId }),
  ])
  const stageName = new Map(stages.map((s) => [Number(s.id), s.name]))
  const sprintName = new Map(sprints.map((s) => [Number(s.id), s.name]))
  const tickets = issues
    .filter((issue) => !Number(issue.is_archived))
    .map((issue) => ({
      source: 'agile',
      flowluId: Number(issue.id),
      key: issue.number_label || `#${issue.id}`,
      name: issue.name || '',
      projectId,
      projectName: project.name || '',
      sprintId: Number(issue.sprint_id) || null,
      sprintName: sprintName.get(Number(issue.sprint_id)) || '',
      stageId: Number(issue.workflow_stage_id) || null,
      stageName: stageName.get(Number(issue.workflow_stage_id)) || '',
      workflowId: Number(project.workflow_id) || null,
      assigneeFlowluId: Number(issue.assignee_id) || null,
      estimate: Number(issue.estimate) || 0,
      deadline: null,
      done: Boolean(flowluDate(issue.completed_date)),
    }))
  return {
    project: { source: 'agile', flowluId: projectId, name: project.name || '' },
    tickets,
    stages: stages.map((s) => stageRow('agile', s)),
  }
}

async function fetchProjectTasks(projectId, taskStageName) {
  const [project, tasks] = await Promise.all([
    flowluRequest(`st/projects/get/${projectId}`),
    flowluList('task/tasks/list', { module: 'st', model: 'project', model_id: projectId }),
  ])
  const tickets = tasks.map((task) => ({
    source: 'task',
    flowluId: Number(task.id),
    key: `#${task.id}`,
    name: task.name || '',
    projectId,
    projectName: project.name || '',
    sprintId: null,
    sprintName: '',
    stageId: Number(task.workflow_stage_id) || null,
    stageName: taskStageName.get(Number(task.workflow_stage_id)) || '',
    workflowId: Number(task.workflow_id) || null,
    assigneeFlowluId: Number(task.responsible_id) || null,
    estimate: Math.round(((Number(task.time_estimate) || 0) / 3600) * 100) / 100,
    deadline: flowluDate(task.deadline),
    done: Boolean(flowluDate(task.closed_date)),
  }))
  return { project: { source: 'task', flowluId: projectId, name: project.name || '' }, tickets }
}

// GET /api/flowlu/status
router.get('/status', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgObjectId(req.user)
    const [state, members, ticketCounts] = await Promise.all([
      FlowluSync.findOne({ organizationId }).lean(),
      orgMembers(organizationId),
      FlowluTicket.aggregate([
        { $match: { organizationId } },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
    ])
    const pendingLogs = await pendingLogCount(members.map((m) => m._id))
    const counts = Object.fromEntries(ticketCounts.map((row) => [row._id, row.count]))
    const base = flowluBaseUrl()
    res.json({
      success: true,
      data: {
        configured: isFlowluConfigured(),
        host: base ? new URL(base).host : '',
        selectedProjects: projectsToSync(state),
        projectsChosen: Boolean(state?.projectsChosenAt),
        flowluUserCount: state?.users?.length || 0,
        memberCount: members.length,
        linkedCount: members.filter((m) => m.flowluUserId != null).length,
        tickets: { agile: counts.agile || 0, task: counts.task || 0 },
        usersSyncedAt: state?.usersSyncedAt || null,
        ticketsSyncedAt: state?.ticketsSyncedAt || null,
        lastError: state?.lastError || '',
        lastErrorAt: state?.lastErrorAt || null,
        pendingLogs,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load BMS status' })
  }
})

// POST /api/flowlu/test — one lightweight call to prove the key and domain work
router.post('/test', auth, requireAdmin, async (req, res) => {
  const organizationId = orgObjectId(req.user)
  try {
    const started = Date.now()
    const result = await flowluRequest('core/user/list', { query: { limit: 1 } })
    await FlowluSync.updateOne({ organizationId }, { $set: { lastError: '' } }, { upsert: true })
    res.json({
      success: true,
      message: `Connected to ${new URL(flowluBaseUrl()).host} in ${Date.now() - started} ms`,
      data: { userTotal: Number(result?.total || 0) },
    })
  } catch (err) {
    await recordError(organizationId, err)
    res.status(502).json({ success: false, message: err.message || 'Could not reach BMS' })
  }
})

// GET /api/flowlu/mapping
router.get('/mapping', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgObjectId(req.user)
    const [state, members] = await Promise.all([
      FlowluSync.findOne({ organizationId }).lean(),
      orgMembers(organizationId),
    ])
    const flowluUsers = state?.users || []
    const flowluById = new Map(flowluUsers.map((u) => [u.flowluId, u]))
    res.json({
      success: true,
      data: {
        members: members.map((m) => publicMember(m, flowluById)),
        flowluUsers,
        usersSyncedAt: state?.usersSyncedAt || null,
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load mapping' })
  }
})

// POST /api/flowlu/sync/users — refresh Flowlu users, then auto-match by email
router.post('/sync/users', auth, requireAdmin, async (req, res) => {
  const organizationId = orgObjectId(req.user)
  try {
    const users = await fetchFlowluUsers()
    await syncState(organizationId)
    await FlowluSync.updateOne(
      { organizationId },
      { $set: { users, usersSyncedAt: new Date(), lastError: '' } },
    )
    const result = await autoLinkMembers(organizationId, users)
    res.json({
      success: true,
      message: `${users.length} BMS users · ${result.linked} newly matched by email${result.cleared ? ` · ${result.cleared} unlinked` : ''}`,
      data: { flowluUserCount: users.length, ...result },
    })
  } catch (err) {
    await recordError(organizationId, err)
    res.status(502).json({ success: false, message: err.message || 'User sync failed' })
  }
})

// PUT /api/flowlu/mapping/:userId — { flowluUserId: number|null } or { auto: true }
router.put('/mapping/:userId', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgObjectId(req.user)
    if (!mongoose.Types.ObjectId.isValid(req.params.userId)) {
      return res.status(400).json({ success: false, message: 'Invalid person' })
    }
    const member = await User.findOne({
      _id: req.params.userId,
      $or: [{ organizationId }, { _id: organizationId }],
    })
    if (!member) return res.status(404).json({ success: false, message: 'Person not found in this organization' })

    const state = await FlowluSync.findOne({ organizationId }).lean()
    const flowluUsers = state?.users || []

    if (req.body?.auto === true) {
      member.flowluUserId = null
      member.flowluLinkSource = ''
      await member.save()
      await autoLinkMembers(organizationId, flowluUsers)
      return res.json({ success: true, message: `${personName(member, member.email)} is back on email matching` })
    }

    const raw = req.body?.flowluUserId
    const flowluUserId = raw == null || raw === '' ? null : Number(raw)
    if (flowluUserId != null) {
      const target = flowluUsers.find((u) => u.flowluId === flowluUserId)
      if (!target) {
        return res.status(400).json({ success: false, message: 'That BMS user is not in the last sync. Sync users first.' })
      }
      const taken = await User.findOne({
        _id: { $ne: member._id },
        flowluUserId,
        $or: [{ organizationId }, { _id: organizationId }],
      }).lean()
      if (taken) {
        return res.status(409).json({
          success: false,
          message: `BMS user ${target.name || flowluUserId} is already linked to ${personName(taken, taken.email)} (${taken.email})`,
        })
      }
    }

    member.flowluUserId = flowluUserId
    member.flowluLinkSource = 'manual'
    await member.save()
    res.json({
      success: true,
      message: flowluUserId != null
        ? `${personName(member, member.email)} linked`
        : `${personName(member, member.email)} marked as not linked`,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save mapping' })
  }
})

// POST /api/flowlu/sync/tickets — pull issues/tasks from the allowlisted projects
router.post('/sync/tickets', auth, requireAdmin, async (req, res) => {
  const organizationId = orgObjectId(req.user)
  try {
    const selected = projectsToSync(await FlowluSync.findOne({ organizationId }).lean())
    const agileIds = selected.filter((p) => p.source === 'agile').map((p) => p.flowluId)
    const taskProjectIds = selected.filter((p) => p.source === 'task').map((p) => p.flowluId)
    if (!selected.length) {
      return res.status(400).json({ success: false, message: 'No projects selected. Choose projects to sync first.' })
    }

    const results = []
    const stages = []
    for (const id of agileIds) {
      const result = await fetchAgileTickets(id)
      results.push(result)
      stages.push(...result.stages)
    }
    if (taskProjectIds.length) {
      const taskStages = await flowluList('task/stages/list')
      const taskStageName = new Map(taskStages.map((s) => [Number(s.id), s.name]))
      stages.push(...taskStages.map((s) => stageRow('task', s)))
      for (const id of taskProjectIds) results.push(await fetchProjectTasks(id, taskStageName))
    }

    const now = new Date()
    const tickets = results.flatMap((r) => r.tickets)
    if (tickets.length) {
      await FlowluTicket.bulkWrite(tickets.map((ticket) => ({
        updateOne: {
          filter: { organizationId, source: ticket.source, flowluId: ticket.flowluId },
          update: { $set: { ...ticket, organizationId, syncedAt: now } },
          upsert: true,
        },
      })))
    }
    const removed = await FlowluTicket.deleteMany({ organizationId, syncedAt: { $lt: now } })

    await syncState(organizationId)
    await FlowluSync.updateOne(
      { organizationId },
      { $set: { projects: results.map((r) => r.project), stages, ticketsSyncedAt: now, lastError: '' } },
    )
    const agileCount = tickets.filter((t) => t.source === 'agile').length
    res.json({
      success: true,
      message: `${agileCount} issues and ${tickets.length - agileCount} tasks synced from ${results.length} project${results.length === 1 ? '' : 's'}${removed.deletedCount ? ` · ${removed.deletedCount} removed` : ''}`,
      data: { issues: agileCount, tasks: tickets.length - agileCount, removed: removed.deletedCount },
    })
  } catch (err) {
    await recordError(organizationId, err)
    res.status(502).json({ success: false, message: err.message || 'Ticket sync failed' })
  }
})

// GET /api/flowlu/projects — every Flowlu agile + classic project with its selection state
router.get('/projects', auth, requireAdmin, async (req, res) => {
  const organizationId = orgObjectId(req.user)
  try {
    const state = await FlowluSync.findOne({ organizationId }).lean()
    const chosen = new Set(projectsToSync(state).map((p) => `${p.source}:${p.flowluId}`))
    const [agile, classic] = await Promise.all([
      flowluList('agile/projects/list'),
      flowluList('st/projects/list'),
    ])
    const shape = (source, row, archived) => {
      const flowluId = Number(row.id)
      return {
        source,
        flowluId,
        name: row.name || `Project ${flowluId}`,
        archived,
        allowed: projectAllowed(source, flowluId),
        selected: chosen.has(`${source}:${flowluId}`),
      }
    }
    const projects = [
      ...agile.map((row) => shape('agile', row, Boolean(Number(row.is_archived)))),
      ...classic.map((row) => shape('task', row, Boolean(Number(row.is_archive)))),
    ].sort((a, b) => a.name.localeCompare(b.name))
    res.json({
      success: true,
      data: { projects },
    })
  } catch (err) {
    await recordError(organizationId, err)
    res.status(502).json({ success: false, message: err.message || 'Could not load BMS projects' })
  }
})

// PUT /api/flowlu/projects — { projects: [{ source, flowluId, name }] }
router.put('/projects', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgObjectId(req.user)
    const incoming = Array.isArray(req.body?.projects) ? req.body.projects : null
    if (!incoming) return res.status(400).json({ success: false, message: 'projects array is required' })

    const seen = new Set()
    const selected = []
    for (const row of incoming) {
      const source = row?.source
      const flowluId = Number(row?.flowluId)
      if (!PROJECT_ENV[source] || !Number.isInteger(flowluId) || flowluId <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid project in selection' })
      }
      if (!projectAllowed(source, flowluId)) {
        return res.status(403).json({ success: false, message: `Project ${flowluId} is not allowed on this server` })
      }
      const key = `${source}:${flowluId}`
      if (seen.has(key)) continue
      seen.add(key)
      selected.push({ source, flowluId, name: String(row?.name || '').trim().slice(0, 200) })
    }

    await syncState(organizationId)
    await FlowluSync.updateOne(
      { organizationId },
      { $set: { selectedProjects: selected, projectsChosenAt: new Date() } },
    )
    res.json({
      success: true,
      message: `${selected.length} project${selected.length === 1 ? '' : 's'} selected for sync`,
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save projects' })
  }
})

// GET /api/flowlu/tickets
router.get('/tickets', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgObjectId(req.user)
    const [tickets, members, state] = await Promise.all([
      FlowluTicket.find({ organizationId }).sort({ projectName: 1, source: 1, flowluId: 1 }).lean(),
      orgMembers(organizationId),
      FlowluSync.findOne({ organizationId }).select('users stages').lean(),
    ])
    const memberByFlowlu = new Map(members.filter((m) => m.flowluUserId != null).map((m) => [m.flowluUserId, m]))
    const flowluById = new Map((state?.users || []).map((u) => [u.flowluId, u]))
    res.json({
      success: true,
      data: tickets.map((t) => {
        const member = memberByFlowlu.get(t.assigneeFlowluId)
        return {
          id: String(t._id),
          source: t.source,
          flowluId: t.flowluId,
          key: t.key,
          name: t.name,
          projectName: t.projectName,
          sprintName: t.sprintName,
          stageName: t.stageName,
          stageId: t.stageId,
          stageOptions: stageOptionsFor(t, state?.stages || []),
          estimate: t.estimate,
          deadline: t.deadline,
          done: t.done,
          assignee: t.assigneeFlowluId
            ? {
                flowluName: flowluById.get(t.assigneeFlowluId)?.name || `BMS user ${t.assigneeFlowluId}`,
                memberName: member ? personName(member, member.email) : '',
              }
            : null,
        }
      }),
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load tickets' })
  }
})

// GET /api/flowlu/my-tickets — open tickets assigned to the signed-in person
router.get('/my-tickets', auth, async (req, res) => {
  try {
    const pendingLogs = await pendingLogCount([req.user._id])
    if (req.user.flowluUserId == null) {
      return res.json({ success: true, data: { linked: false, tickets: [], pendingLogs } })
    }
    const organizationId = orgObjectId(req.user)
    const [tickets, state] = await Promise.all([
      FlowluTicket.find({ organizationId, assigneeFlowluId: req.user.flowluUserId, done: false })
        .sort({ projectName: 1, source: 1, flowluId: 1 })
        .lean(),
      FlowluSync.findOne({ organizationId }).select('stages').lean(),
    ])
    res.json({
      success: true,
      data: {
        linked: true,
        pendingLogs,
        tickets: tickets.map((t) => ({
          source: t.source,
          flowluId: t.flowluId,
          key: t.key,
          name: t.name,
          projectId: t.projectId,
          projectName: t.projectName,
          sprintName: t.sprintName,
          stageName: t.stageName,
          stageId: t.stageId,
          stageOptions: stageOptionsFor(t, state?.stages || []),
        })),
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load your tickets' })
  }
})

const TIMESHEET_TARGET = {
  agile: { module: 'agile', model: 'issue' },
  task: { module: 'task', model: 'task' },
}

/** Fill ticket rows from the synced ticket copy; rejects tickets outside the org's sync. */
async function resolveTicketEntries(user, entries) {
  const organizationId = orgObjectId(user)
  const resolved = []
  for (const entry of entries) {
    if (entry.kind !== 'ticket') {
      resolved.push(entry)
      continue
    }
    const ticket = await FlowluTicket.findOne({
      organizationId,
      source: entry.ticket.source,
      flowluId: entry.ticket.flowluId,
    }).lean()
    if (!ticket) {
      const err = new Error('That ticket is not synced from BMS. Pick it again.')
      err.status = 400
      throw err
    }
    resolved.push({
      ...entry,
      project: ticket.projectName || entry.project,
      description: entry.description || `${ticket.key} ${ticket.name}`.trim(),
      ticket: { source: ticket.source, flowluId: ticket.flowluId, key: ticket.key, name: ticket.name },
    })
  }
  return resolved
}

async function flowluTimesheetFor(ticket) {
  const target = TIMESHEET_TARGET[ticket.source]
  const existing = await flowluRequest('timetracker/timesheets/list', {
    query: {
      'filter[module]': target.module,
      'filter[model]': target.model,
      'filter[model_id]': ticket.flowluId,
    },
  })
  if (existing?.items?.length) return Number(existing.items[0].id)
  const created = await flowluRequest('timetracker/timesheets/create', {
    method: 'POST',
    body: { ...target, model_id: ticket.flowluId },
  })
  return Number(created.id)
}

/** Send a submitted day's ticket rows to BMS as time logs; rows already sent are skipped. */
async function pushTimesheetToFlowlu(user, doc) {
  const rows = (doc.taskEntries || []).filter((e) => e.kind === 'ticket' && e.ticket && !e.flowluTimelogId)
  if (!rows.length) return { sent: 0, failed: 0 }
  if (user.flowluUserId == null || !isFlowluConfigured()) {
    rows.forEach((e) => { e.flowluError = 'Not linked to a BMS user' })
    await doc.save()
    return { sent: 0, failed: rows.length }
  }
  let sent = 0
  for (const entry of rows) {
    try {
      const timesheetId = await flowluTimesheetFor(entry.ticket)
      const log = await flowluRequest('timetracker/timelogs/create', {
        method: 'POST',
        body: {
          timesheet_id: timesheetId,
          user_id: user.flowluUserId,
          created_by: user.flowluUserId,
          // Flowlu derives time_spent from start/stop if sent; manual logs carry only the duration and day
          time_spent: entry.minutes * 60,
          created_date: `${doc.date} 10:00:00`,
          status: 30,
          is_manual: 1,
          description: entry.description,
        },
      })
      entry.flowluTimelogId = Number(log.id)
      entry.flowluError = ''
      sent += 1
    } catch (err) {
      entry.flowluError = err.message || 'BMS time log failed'
    }
  }
  await doc.save()
  return { sent, failed: rows.length - sent }
}

// POST /api/flowlu/retry-logs — { scope: 'mine' | 'all' }; 'all' is admin-only
router.post('/retry-logs', auth, async (req, res) => {
  try {
    const all = req.body?.scope === 'all'
    if (all && !isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' })
    }
    const users = all ? await orgMembers(orgObjectId(req.user)) : [req.user]
    const userById = new Map(users.map((u) => [String(u._id), u]))
    const days = await PulseWorkDay.find({ user: { $in: users.map((u) => u._id) }, ...PENDING_LOG })
    let sent = 0
    let failed = 0
    for (const day of days) {
      const result = await pushTimesheetToFlowlu(userById.get(String(day.user)), day)
      sent += result.sent
      failed += result.failed
    }
    res.json({
      success: true,
      message: !sent && !failed
        ? 'No pending ticket logs'
        : `${sent} ticket log${sent === 1 ? '' : 's'} sent to BMS${failed ? ` · ${failed} still failing` : ''}`,
      data: { sent, failed },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Retry failed' })
  }
})

const TICKET_API = {
  agile: { update: 'agile/issues/update', get: 'agile/issues/get', done: 'completed_date' },
  task: { update: 'task/tasks/update', get: 'task/tasks/get', done: 'closed_date' },
}

// PUT /api/flowlu/tickets/:source/:flowluId/stage — { stageId }; assignee or admin
router.put('/tickets/:source/:flowluId/stage', auth, async (req, res) => {
  const organizationId = orgObjectId(req.user)
  try {
    const { source } = req.params
    const flowluId = Number(req.params.flowluId)
    const api = TICKET_API[source]
    if (!api || !Number.isInteger(flowluId)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket' })
    }
    const ticket = await FlowluTicket.findOne({ organizationId, source, flowluId })
    if (!ticket) return res.status(404).json({ success: false, message: 'Ticket is not synced from BMS' })
    const isAssignee = req.user.flowluUserId != null && req.user.flowluUserId === ticket.assigneeFlowluId
    if (!isAssignee && !isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Only the assignee or an admin can move this ticket' })
    }

    const state = await FlowluSync.findOne({ organizationId }).select('stages').lean()
    const stageId = Number(req.body?.stageId)
    const stage = stageOptionsFor(ticket, state?.stages || []).find((s) => s.id === stageId)
    if (!stage) return res.status(400).json({ success: false, message: 'That stage is not in this ticket’s workflow' })

    await flowluRequest(`${api.update}/${flowluId}`, { method: 'POST', body: { workflow_stage_id: stageId } })
    const fresh = await flowluRequest(`${api.get}/${flowluId}`)
    ticket.stageId = Number(fresh.workflow_stage_id) || stageId
    ticket.stageName = stage.name
    ticket.done = Boolean(flowluDate(fresh[api.done]))
    await ticket.save()
    res.json({
      success: true,
      message: `${ticket.key} moved to ${stage.name}`,
      data: { stageId: ticket.stageId, stageName: ticket.stageName, done: ticket.done },
    })
  } catch (err) {
    await recordError(organizationId, err)
    res.status(502).json({ success: false, message: err.message || 'Could not update the ticket in BMS' })
  }
})

module.exports = { router, resolveTicketEntries, pushTimesheetToFlowlu }
