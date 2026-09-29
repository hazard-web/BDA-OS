const express = require('express')
const mongoose = require('mongoose')
const { auth } = require('./auth')
const User = require('../models/User')
const PulseDailyPlan = require('../models/PulseDailyPlan')
const ChatBotSettings = require('../models/ChatBotSettings')
const FlowluTicket = require('../models/FlowluTicket')
const AssignedTask = require('../models/AssignedTask')
const PulseWorkDay = require('../models/PulseWorkDay')
const LeavePolicy = require('../models/LeavePolicy')
const LeaveRequest = require('../models/LeaveRequest')
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth')
const { personName } = require('../utils/pulsePerson')
const {
  isChatConfigured,
  chatConfigError,
  isAddonMode,
  chatEndpointUrl,
  sendChatMessage,
  verifyChatRequest,
} = require('../utils/googleChat')
const { sendProjectStatusEmail } = require('../utils/emailService')
const { getProductionBaseUrl } = require('../utils/urlHelper')
const {
  submitTimesheetFor,
  linkedStaff,
  pulseWorkDaysOf,
  policyHolidayEntries,
  OPEN_TASK_STATUSES,
} = require('./pulseCheckIn')

const router = express.Router()

const SLOTS = ['morning', 'afternoon', 'evening', 'reminder', 'summary']
const STATUS_LABEL = { planned: 'Planned', on_track: 'On track', blocked: 'Blocked', done: 'Done' }
const SLOT_WINDOW_MINUTES = 90

function requireAdmin(req, res, next) {
  if (!isPulseAdmin(req.user)) {
    return res.status(403).json({ success: false, message: 'Admin access required' })
  }
  return next()
}

function orgObjectId(user) {
  return new mongoose.Types.ObjectId(orgIdOf(user))
}

function istNow(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hhmm: `${parts.hour}:${parts.minute}` }
}

function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number)
  return h * 60 + m
}

function weekdayOf(date) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function dateLabel(date) {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

function targetKey(target) {
  if (target.kind === 'ticket') return `ticket:${target.ticket.source}:${target.ticket.flowluId}`
  if (target.kind === 'task') return `task:${target.task}`
  return `other:${String(target.title).toLowerCase()}`
}

async function getPlan(user, date) {
  return PulseDailyPlan.findOneAndUpdate(
    { user: user._id, date },
    { $setOnInsert: { organizationId: orgIdOf(user), user: user._id, email: user.email, date } },
    { upsert: true, new: true },
  )
}

async function planOptions(user) {
  const organizationId = orgIdOf(user)
  const [tickets, staff] = await Promise.all([
    user.flowluUserId != null
      ? FlowluTicket.find({ organizationId, assigneeFlowluId: user.flowluUserId, done: false })
        .sort({ projectName: 1, flowluId: 1 })
        .lean()
      : [],
    linkedStaff(user),
  ])
  const tasks = staff
    ? await AssignedTask.find({ staff: staff._id, status: { $in: OPEN_TASK_STATUSES } }).sort({ dueDate: 1 }).lean()
    : []
  return { tickets, tasks }
}

/** Participants expected to work on `date`: not excluded, org workday, no company holiday, not on approved leave. */
// ignoreCalendar: manual past-day reports still skip excluded people and approved leave, not weekends/holidays
async function workingMembers(organizationId, date, excludedUsers = [], { ignoreCalendar = false } = {}) {
  const excluded = new Set(excludedUsers.map(String))
  const owner = await User.findById(organizationId).lean()
  if (!owner) return []
  if (!ignoreCalendar && !pulseWorkDaysOf(owner).includes(weekdayOf(date))) return []
  const policy = await LeavePolicy.findOne({ user: organizationId }).lean()
  if (!ignoreCalendar && policyHolidayEntries(policy?.holidays).some((h) => h.date === date)) return []
  const members = await User.find({ $or: [{ organizationId }, { _id: organizationId }] }).lean()
  const working = []
  for (const member of members) {
    if (excluded.has(String(member._id))) continue
    const staff = await linkedStaff(member)
    const onLeave = staff && await LeaveRequest.exists({
      staff: staff._id,
      status: 'Approved',
      startDate: { $lte: new Date(`${date}T23:59:59`) },
      endDate: { $gte: new Date(`${date}T00:00:00`) },
    })
    if (!onLeave) working.push(member)
  }
  return working
}

/* ---------- Google Chat cards ---------- */

const para = (text) => ({ textParagraph: { text } })

// Add-on Chat apps route every click to the endpoint URL, so the handler travels as the `fn` parameter.
function button(text, fn, params = {}, openDialog = false) {
  return {
    text,
    onClick: {
      action: {
        function: isAddonMode() ? chatEndpointUrl() : fn,
        parameters: Object.entries({ fn, ...params }).map(([key, value]) => ({ key, value: String(value) })),
        ...(openDialog ? { interaction: 'OPEN_DIALOG' } : {}),
      },
    },
  }
}

const buttons = (...list) => ({ buttonList: { buttons: list } })

function formValues(event, name) {
  return event.formInputs?.[name]?.stringInputs?.value || []
}

function formValue(event, name) {
  return String(formValues(event, name)[0] || '').trim()
}

/** Card posted in the team space; each person opens their own dialog from it. */
const PROMPTS = {
  morning: { title: 'Plan your day', subtitle: 'Pick the tickets and tasks you will work on today.', button: 'Plan my day', open: 'openPlan' },
  afternoon: { title: 'Progress check', subtitle: 'How is your plan going?', button: 'Update progress', open: 'openUpdate' },
  evening: { title: 'Timesheet', subtitle: 'Add the hours you spent today. Deadline 7:20 PM.', button: 'Fill timesheet', open: 'openTimesheet' },
}

function promptMessage(slot, date) {
  const p = PROMPTS[slot]
  return {
    text: `${p.title} · ${dateLabel(date)}`,
    cardsV2: [{
      cardId: `${slot}-${date}`,
      card: {
        header: { title: `${p.title} · ${dateLabel(date)}`, subtitle: p.subtitle },
        sections: [{ widgets: [buttons(button(p.button, p.open, { date }, true))] }],
      },
    }],
  }
}

function planDialog(user, date, { tickets, tasks }, plan) {
  const chosen = new Set(plan.targets.map(targetKey))
  const items = [
    ...tickets.map((t) => {
      const value = `ticket:${t.source}:${t.flowluId}`
      return { text: `${t.key} · ${t.name} (${t.projectName})`, value, selected: chosen.has(value) }
    }),
    ...tasks.map((t) => {
      const value = `task:${t._id}`
      return { text: `Task · ${t.title}`, value, selected: chosen.has(value) }
    }),
    ...plan.targets
      .filter((t) => t.kind === 'other')
      .map((t) => ({ text: `${t.title} (${t.projectName || 'General'})`, value: targetKey(t), selected: true })),
  ]
  const projects = [...new Set(tickets.map((t) => t.projectName).filter(Boolean)), 'General']
  return {
    header: { title: `Plan your day · ${dateLabel(date)}`, subtitle: personName(user, user.email) },
    sections: [
      items.length
        ? { header: 'Your tickets and tasks', widgets: [{ selectionInput: { name: 'targets', type: 'CHECK_BOX', items } }] }
        : { widgets: [para('No open tickets or tasks are assigned to you. Add what you are working on below.')] },
      {
        header: 'Something else',
        widgets: [
          { textInput: { name: 'other_title', label: 'Other work (optional)', type: 'SINGLE_LINE' } },
          {
            selectionInput: {
              name: 'other_project',
              label: 'Project',
              type: 'DROPDOWN',
              items: projects.map((name, index) => ({ text: name, value: name, selected: index === projects.length - 1 })),
            },
          },
          buttons(button('Save my plan', 'submitPlan', { date })),
        ],
      },
    ],
  }
}

function updateDialog(user, date, plan) {
  if (!plan.targets.length) {
    return {
      header: { title: `Progress check · ${dateLabel(date)}`, subtitle: 'You have no plan for today yet.' },
      sections: [{ widgets: [para('Tell me what you are working on first.'), buttons(button('Plan my day', 'openPlan', { date }))] }],
    }
  }
  const sections = plan.targets.map((target) => ({
    header: target.projectName ? `${target.title} · ${target.projectName}` : target.title,
    widgets: [
      {
        selectionInput: {
          name: `status_${target._id}`,
          type: 'RADIO_BUTTON',
          items: ['on_track', 'blocked', 'done'].map((value) => ({
            text: STATUS_LABEL[value],
            value,
            selected: (target.status === 'planned' ? 'on_track' : target.status) === value,
          })),
        },
      },
      { textInput: { name: `note_${target._id}`, label: 'Note (optional)', type: 'SINGLE_LINE', value: target.note || '' } },
    ],
  }))
  sections.push({ widgets: [buttons(button('Send update', 'submitUpdate', { date }))] })
  return { header: { title: `Progress check · ${dateLabel(date)}`, subtitle: personName(user, user.email) }, sections }
}

function timesheetDialog(user, date, plan) {
  const sections = plan.targets.map((target) => ({
    widgets: [{
      textInput: {
        name: `hours_${target._id}`,
        label: `${target.title}${target.projectName ? ` · ${target.projectName}` : ''}`,
        hintText: 'Hours, e.g. 2 or 1.5',
        type: 'SINGLE_LINE',
      },
    }],
  }))
  sections.push({
    header: 'Other work',
    widgets: [
      { textInput: { name: 'general_desc', label: 'Description', type: 'SINGLE_LINE' } },
      { textInput: { name: 'general_hours', label: 'Hours', hintText: 'e.g. 1', type: 'SINGLE_LINE' } },
      buttons(button('Submit timesheet', 'submitTimesheet', { date })),
    ],
  })
  return { header: { title: `Timesheet · ${dateLabel(date)}`, subtitle: personName(user, user.email) }, sections }
}

/** One event shape for classic Chat app events and Workspace add-on (commonEventObject/chat.*Payload) events. */
function normalizeEvent(body) {
  if (body.chat || body.commonEventObject) {
    const chat = body.chat || {}
    const common = body.commonEventObject || {}
    const clicked = chat.buttonClickedPayload
    let type = 'UNKNOWN'
    if (chat.messagePayload) type = 'MESSAGE'
    else if (chat.addedToSpacePayload) type = 'ADDED_TO_SPACE'
    else if (chat.removedFromSpacePayload) type = 'REMOVED_FROM_SPACE'
    else if (clicked || common.parameters || common.invokedFunction) type = 'CARD_CLICKED'
    return {
      addon: true,
      type,
      user: chat.user || {},
      message: chat.messagePayload?.message || {},
      isDialogEvent: Boolean(clicked?.isDialogEvent),
      fn: common.parameters?.fn || common.invokedFunction || '',
      params: common.parameters || {},
      formInputs: common.formInputs || {},
    }
  }
  const params = {
    ...(body.common?.parameters || {}),
    ...Object.fromEntries((body.action?.parameters || []).map((p) => [p.key, p.value])),
  }
  return {
    addon: false,
    type: body.type,
    user: body.user || {},
    message: body.message || {},
    isDialogEvent: Boolean(body.isDialogEvent),
    fn: params.fn || body.common?.invokedFunction || body.action?.actionMethodName || '',
    params,
    formInputs: body.common?.formInputs || {},
  }
}

/** Response builders for whichever format the event arrived in. */
function responder(addon) {
  if (addon) {
    return {
      message: (message) => ({ hostAppDataAction: { chatDataAction: { createMessageAction: { message } } } }),
      openDialog: (card) => ({ action: { navigations: [{ pushCard: card }] } }),
      closeDialog: (text) => ({ action: { navigations: [{ endNavigation: { action: 'CLOSE_DIALOG' } }], notification: { text } } }),
      // Validation errors keep the dialog open so the person can fix their input
      dialogError: (text) => ({ action: { notification: { text } } }),
    }
  }
  const status = (userFacingMessage, statusCode) => ({
    actionResponse: { type: 'DIALOG', dialogAction: { actionStatus: { statusCode, userFacingMessage } } },
  })
  return {
    message: (message) => message,
    openDialog: (card) => ({ actionResponse: { type: 'DIALOG', dialogAction: { dialog: { body: card } } } }),
    closeDialog: (text) => status(text, 'OK'),
    dialogError: (text) => status(text, 'INVALID_ARGUMENT'),
  }
}

/* ---------- Form handlers ---------- */

async function handlePlan(user, event, date) {
  const plan = await getPlan(user, date)
  const { tickets, tasks } = await planOptions(user)
  const ticketByValue = new Map(tickets.map((t) => [`ticket:${t.source}:${t.flowluId}`, t]))
  const taskByValue = new Map(tasks.map((t) => [`task:${t._id}`, t]))
  const previous = new Map(plan.targets.map((t) => [targetKey(t), t]))
  const next = []
  for (const value of formValues(event, 'targets')) {
    const ticket = ticketByValue.get(value)
    const task = taskByValue.get(value)
    const kept = previous.get(value)
    if (ticket) {
      next.push({
        kind: 'ticket',
        ticket: { source: ticket.source, flowluId: ticket.flowluId, key: ticket.key },
        title: `${ticket.key} ${ticket.name}`,
        projectName: ticket.projectName,
        status: kept?.status || 'planned',
        note: kept?.note || '',
      })
    } else if (task) {
      next.push({ kind: 'task', task: task._id, title: task.title, projectName: 'Tasks', status: kept?.status || 'planned', note: kept?.note || '' })
    } else if (kept?.kind === 'other') {
      next.push(kept)
    }
  }
  const otherTitle = formValue(event, 'other_title')
  if (otherTitle && !next.some((t) => targetKey(t) === `other:${otherTitle.slice(0, 200).toLowerCase()}`)) {
    next.push({ kind: 'other', title: otherTitle.slice(0, 200), projectName: formValue(event, 'other_project') || 'General' })
  }
  if (!next.length) throw Object.assign(new Error('Pick at least one item or add other work'), { status: 400 })
  plan.targets = next
  plan.morning.answeredAt = new Date()
  await plan.save()
  return `Plan saved: ${next.length} item${next.length === 1 ? '' : 's'}`
}

async function handleUpdate(user, event, date) {
  const plan = await getPlan(user, date)
  const now = new Date()
  plan.targets.forEach((target) => {
    const status = formValue(event, `status_${target._id}`)
    if (STATUS_LABEL[status]) target.status = status
    target.note = formValue(event, `note_${target._id}`).slice(0, 500)
    target.statusAt = now
  })
  plan.afternoon.answeredAt = now
  await plan.save()
  const blocked = plan.targets.filter((t) => t.status === 'blocked').length
  return blocked ? `Update saved · ${blocked} blocked — your admin can see it` : 'Update saved — thanks!'
}

function minutesFrom(raw) {
  const hours = Number(String(raw || '').replace(',', '.'))
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 0
}

async function handleTimesheet(user, event, date) {
  const plan = await getPlan(user, date)
  const entries = []
  plan.targets.forEach((target) => {
    const minutes = minutesFrom(formValue(event, `hours_${target._id}`))
    if (!minutes) return
    if (target.kind === 'ticket') {
      entries.push({ kind: 'ticket', ticket: { source: target.ticket.source, flowluId: target.ticket.flowluId }, minutes })
    } else if (target.kind === 'task') {
      entries.push({ kind: 'general', task: String(target.task), description: target.title, minutes })
    } else {
      entries.push({ kind: 'general', description: target.title, project: target.projectName || 'General', minutes })
    }
  })
  const generalMinutes = minutesFrom(formValue(event, 'general_hours'))
  const generalDesc = formValue(event, 'general_desc')
  if (generalMinutes && generalDesc) {
    entries.push({ kind: 'general', description: generalDesc.slice(0, 200), project: 'General', minutes: generalMinutes })
  }
  const { doc, bms } = await submitTimesheetFor(user, { date, entries })
  plan.evening.answeredAt = new Date()
  await plan.save()
  const bmsNote = bms.failed ? ` · ${bms.failed} BMS log(s) not sent, retry on the Timesheet page` : bms.sent ? ` · ${bms.sent} logged in BMS` : ''
  return `Timesheet submitted: ${doc.timesheetHours}h${bmsNote}`
}

/* ---------- Scheduled posts ---------- */

async function markSent(members, slot, date) {
  const now = new Date()
  for (const member of members) {
    const plan = await getPlan(member, date)
    plan[slot].sentAt = now
    plan[slot].error = ''
    await plan.save()
  }
}

async function submittedUserIds(members, date) {
  const days = await PulseWorkDay.find({ user: { $in: members.map((m) => m._id) }, date, timesheetSubmitted: true })
    .select('user')
    .lean()
  return new Set(days.map((d) => String(d.user)))
}

/** End-of-day digest for the manager space and summary emails; missing = working today without a timesheet. */
async function buildSummary(organizationId, settings, date, working) {
  const status = await computeStatus(organizationId, date, settings.excludedUsers)
  const workingIds = new Set(working.map((m) => String(m._id)))
  const people = status.people.filter((p) => p.participant && (p.targets.length || p.timesheet.submitted || p.unplanned.length))
  return {
    date,
    dateLabel: dateLabel(date),
    people: people.map((p) => ({
      name: p.name,
      submitted: p.timesheet.submitted,
      hours: p.timesheet.hours,
      targets: p.targets,
      unplanned: p.unplanned,
    })),
    blocked: people.flatMap((p) => p.targets
      .filter((t) => t.status === 'blocked')
      .map((t) => ({ name: p.name, title: t.title, note: t.note }))),
    missing: status.people.filter((p) => workingIds.has(p.user) && !p.timesheet.submitted).map((p) => p.name),
    totals: {
      people: working.length,
      submitted: status.people.filter((p) => workingIds.has(p.user) && p.timesheet.submitted).length,
      minutes: people.reduce((sum, p) => sum + Math.round((p.timesheet.hours || 0) * 60), 0),
    },
  }
}

function summaryText(summary) {
  const lines = [`📊 *Daily project status — ${summary.dateLabel}*`, `${summary.totals.submitted}/${summary.totals.people} timesheets submitted`, '']
  summary.people.forEach((p) => {
    lines.push(`*${p.name}* — ${p.submitted ? `${p.hours}h logged` : 'no timesheet'}`)
    p.targets.forEach((t) => lines.push(`   • ${t.title} (${t.projectName || 'General'}) — ${STATUS_LABEL[t.status]}${t.note ? `: ${t.note}` : ''}`))
    p.unplanned.forEach((u) => lines.push(`   • ${u.title} (${u.projectName || 'General'}) — unplanned`))
  })
  if (summary.blocked.length) lines.push('', '🚨 *Blocked*', ...summary.blocked.map((b) => `• ${b.name} — ${b.title}${b.note ? `: ${b.note}` : ''}`))
  if (summary.missing.length) lines.push('', '⏳ *No timesheet*', ...summary.missing.map((n) => `• ${n}`))
  return lines.join('\n')
}

async function sendSummary(organizationId, settings, date, working) {
  const summary = await buildSummary(organizationId, settings, date, working)
  const sentTo = []
  if (settings.managerSpace && isChatConfigured()) {
    await sendChatMessage(settings.managerSpace, { text: summaryText(summary) })
    sentTo.push('manager space')
  }
  if (settings.summaryEmails?.length) {
    const org = await User.findById(organizationId).select('companyName').lean()
    await sendProjectStatusEmail({
      to: settings.summaryEmails.join(', '),
      companyName: org?.companyName,
      summary,
      statusUrl: `${getProductionBaseUrl()}/bda-os/company/status`,
    })
    sentTo.push(`${settings.summaryEmails.length} email${settings.summaryEmails.length === 1 ? '' : 's'}`)
  }
  return sentTo.length
    ? { posted: true, people: working.length, to: sentTo.join(' + ') }
    : { posted: false, reason: 'Set a manager space or summary emails first' }
}

async function runSlot(organizationId, slot, date, { ignoreCalendar = false } = {}) {
  const settings = await settingsFor(organizationId)
  const members = await workingMembers(organizationId, date, settings.excludedUsers, { ignoreCalendar })
  if (!members.length) return { posted: false, reason: 'Not a working day or nobody is working' }
  if (slot === 'summary') return sendSummary(organizationId, settings, date, members)
  if (!isChatConfigured()) return { posted: false, reason: `Google Chat is not usable: ${chatConfigError()}` }
  if (!settings.teamSpace) return { posted: false, reason: 'No team space set' }
  if (slot === 'reminder') {
    const done = await submittedUserIds(members, date)
    const pending = members.filter((m) => !done.has(String(m._id)))
    if (!pending.length) return { posted: false, reason: 'Everyone has submitted' }
    await sendChatMessage(settings.teamSpace, {
      text: `🔔 *Timesheet reminder* — still waiting on: ${pending.map((m) => personName(m, m.email)).join(', ')}`,
      cardsV2: promptMessage('evening', date).cardsV2,
    })
    await markSent(pending, 'reminder', date)
    return { posted: true, people: pending.length }
  }
  await sendChatMessage(settings.teamSpace, promptMessage(slot, date))
  await markSent(members, slot, date)
  return { posted: true, people: members.length }
}

let ticking = false

function describeResult(result) {
  return result.posted ? `sent for ${result.people} people${result.to ? ` to ${result.to}` : ''}` : `not posted: ${result.reason}`
}

async function recordResult(settingsId, slot, ok, message) {
  await ChatBotSettings.updateOne(
    { _id: settingsId },
    { $set: { [`lastResult.${slot}`]: { at: new Date(), ok, message: String(message).slice(0, 500) } } },
  )
}

async function schedulerTick() {
  if (ticking) return
  ticking = true
  try {
    const { date, hhmm } = istNow()
    const now = minutesOf(hhmm)
    const all = await ChatBotSettings.find({ enabled: true })
    for (const s of all) {
      for (const slot of SLOTS) {
        const at = minutesOf(s[`${slot}Time`])
        if (s.lastRun?.[slot] === date || now < at || now - at > SLOT_WINDOW_MINUTES) continue
        // Atomic claim: during a redeploy two containers can tick; only one may post
        const claimed = await ChatBotSettings.findOneAndUpdate(
          { _id: s._id, [`lastRun.${slot}`]: { $ne: date } },
          { $set: { [`lastRun.${slot}`]: date } },
        )
        if (!claimed) continue
        try {
          const result = await runSlot(s.organizationId, slot, date)
          console.log(`[chat-bot] ${slot} ${date}:`, describeResult(result))
          await recordResult(s._id, slot, result.posted, describeResult(result))
        } catch (err) {
          console.error(`[chat-bot] ${slot} ${date} failed:`, err.message)
          await recordResult(s._id, slot, false, `failed: ${err.message}`)
        }
      }
    }
  } catch (err) {
    console.error('[chat-bot] scheduler tick failed:', err.message)
  } finally {
    ticking = false
  }
}

/** Only one server may schedule (local and UAT share a database), so it is opt-in. */
function startChatBotScheduler() {
  if (process.env.GOOGLE_CHAT_SCHEDULER !== 'true') return false
  setInterval(schedulerTick, 60_000)
  console.log('💬 Google Chat update bot scheduler on (checks every minute)')
  return true
}

/* ---------- Google Chat events ---------- */

const HELP_TEXT = 'I post a plan card in the morning, a progress check in the afternoon, and the timesheet in the evening. '
  + 'Mention me with *plan*, *update* or *timesheet* any time.'

// Most recent Chat request, shown in Bot settings to confirm Google can reach this server
let lastEvent = null

// POST /api/chat-bot/events — Google Chat app endpoint (HTTP; classic or Workspace add-on)
router.post('/events', async (req, res) => {
  const event = normalizeEvent(req.body || {})
  const reply = responder(event.addon)
  try {
    const { ok: verified, reason } = await verifyChatRequest(req)
    lastEvent = {
      at: new Date(),
      format: event.addon ? 'Workspace add-on' : 'classic',
      type: event.fn ? `${event.type} · ${event.fn}` : event.type,
      email: event.user.email || '',
      verified,
      reason,
    }
    if (!verified) return res.status(401).json({ text: 'Unauthorized' })
    if (event.type === 'ADDED_TO_SPACE') {
      return res.json(reply.message({ text: `Thanks for adding the BDA OS update bot! ${HELP_TEXT}` }))
    }
    if (event.type !== 'MESSAGE' && event.type !== 'CARD_CLICKED') return res.json({})

    const email = String(event.user.email || '').toLowerCase()
    const user = email ? await User.findOne({ $or: [{ email }, { 'additionalEmails.email': email }] }) : null
    const noAccount = `I could not find a BDA OS account for ${email || 'you'}.`
    const { date: today } = istNow()

    if (event.type === 'MESSAGE') {
      if (!user) return res.json(reply.message({ text: noAccount }))
      const text = String(event.message.argumentText || event.message.text || '').trim().toLowerCase()
      if (/^\/?(plan|morning)\b/.test(text)) return res.json(reply.message(promptMessage('morning', today)))
      if (/^\/?(update|status|progress)\b/.test(text)) return res.json(reply.message(promptMessage('afternoon', today)))
      if (/^\/?(timesheet|evening|log)\b/.test(text)) return res.json(reply.message(promptMessage('evening', today)))
      return res.json(reply.message({ text: HELP_TEXT }))
    }

    if (!user) return res.json(event.isDialogEvent ? reply.closeDialog(noAccount) : reply.message({ text: noAccount }))
    const { fn } = event
    const date = /^\d{4}-\d{2}-\d{2}$/.test(event.params.date || '') ? event.params.date : today

    try {
      if (fn === 'openPlan') return res.json(reply.openDialog(planDialog(user, date, await planOptions(user), await getPlan(user, date))))
      if (fn === 'openUpdate') return res.json(reply.openDialog(updateDialog(user, date, await getPlan(user, date))))
      if (fn === 'openTimesheet') {
        const day = await PulseWorkDay.findOne({ user: user._id, date }).select('timesheetSubmitted timesheetHours').lean()
        if (day?.timesheetSubmitted) return res.json(reply.closeDialog(`Already submitted: ${day.timesheetHours}h for ${dateLabel(date)}`))
        return res.json(reply.openDialog(timesheetDialog(user, date, await getPlan(user, date))))
      }
      if (fn === 'submitPlan') return res.json(reply.closeDialog(await handlePlan(user, event, date)))
      if (fn === 'submitUpdate') return res.json(reply.closeDialog(await handleUpdate(user, event, date)))
      if (fn === 'submitTimesheet') return res.json(reply.closeDialog(await handleTimesheet(user, event, date)))
    } catch (err) {
      const message = err.message || 'Something went wrong'
      return res.json(err.status === 400 ? reply.dialogError(message) : reply.closeDialog(message))
    }
    return res.json({})
  } catch (err) {
    console.error('[chat-bot] event failed:', err.message)
    return res.json(reply.message({ text: 'Sorry, something went wrong on the BDA OS side.' }))
  }
})

/* ---------- Admin: settings, manual posts, project status ---------- */

async function settingsFor(organizationId) {
  return ChatBotSettings.findOneAndUpdate(
    { organizationId },
    { $setOnInsert: { organizationId } },
    { upsert: true, new: true },
  )
}

const SETTING_FIELDS = ['teamSpace', 'managerSpace', ...SLOTS.map((slot) => `${slot}Time`)]

// GET /api/chat-bot/settings
router.get('/settings', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgObjectId(req.user)
    const [settings, members] = await Promise.all([
      settingsFor(organizationId),
      User.find({ $or: [{ organizationId }, { _id: organizationId }] })
        .select('email firstName lastName displayName role')
        .sort({ firstName: 1 })
        .lean(),
    ])
    const excluded = new Set(settings.excludedUsers.map(String))
    res.json({
      success: true,
      data: {
        members: members.map((m) => ({
          _id: String(m._id),
          name: personName(m, m.email),
          email: m.email,
          role: m.role || 'admin',
          included: !excluded.has(String(m._id)),
        })),
        enabled: settings.enabled,
        summaryEmails: settings.summaryEmails || [],
        ...Object.fromEntries(SETTING_FIELDS.map((f) => [f, settings[f]])),
        chatConfigured: isChatConfigured(),
        chatConfigError: chatConfigError(),
        lastResult: settings.lastResult || {},
        addonMode: isAddonMode(),
        endpointUrl: chatEndpointUrl(),
        lastEvent,
        schedulerOn: process.env.GOOGLE_CHAT_SCHEDULER === 'true',
      },
    })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load bot settings' })
  }
})

// PUT /api/chat-bot/settings
router.put('/settings', auth, requireAdmin, async (req, res) => {
  try {
    const organizationId = orgObjectId(req.user)
    const settings = await settingsFor(organizationId)
    if (typeof req.body?.enabled === 'boolean') settings.enabled = req.body.enabled
    if (Array.isArray(req.body?.excludedUsers)) {
      const ids = req.body.excludedUsers.filter((id) => mongoose.Types.ObjectId.isValid(id))
      const inOrg = await User.find({ _id: { $in: ids }, $or: [{ organizationId }, { _id: organizationId }] }).select('_id').lean()
      settings.excludedUsers = inOrg.map((u) => u._id)
    }
    for (const field of SETTING_FIELDS) {
      if (req.body?.[field] != null) settings[field] = String(req.body[field]).trim()
    }
    if (Array.isArray(req.body?.summaryEmails)) {
      const emails = [...new Set(req.body.summaryEmails.map((e) => String(e).trim().toLowerCase()).filter(Boolean))]
      const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      if (bad) return res.status(400).json({ success: false, message: `${bad} is not a valid email` })
      if (emails.length > 20) return res.status(400).json({ success: false, message: 'Up to 20 summary emails' })
      settings.summaryEmails = emails
    }
    for (const field of ['teamSpace', 'managerSpace']) {
      if (settings[field] && !/^spaces\/[\w-]+$/.test(settings[field])) {
        return res.status(400).json({ success: false, message: `${field === 'teamSpace' ? 'Team' : 'Manager'} space must look like spaces/AAAA1234` })
      }
    }
    await settings.save()
    res.json({ success: true, message: 'Bot settings saved' })
  } catch (err) {
    res.status(err.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: err.name === 'ValidationError' ? 'Times must be HH:MM (24h)' : err.message || 'Failed to save',
    })
  }
})

// POST /api/chat-bot/send — { slot, date? } posts now; the manager summary may target a past day
router.post('/send', auth, requireAdmin, async (req, res) => {
  try {
    const slot = req.body?.slot
    if (!SLOTS.includes(slot)) return res.status(400).json({ success: false, message: 'Unknown message' })
    const today = istNow().date
    const date = req.body?.date || today
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) {
      return res.status(400).json({ success: false, message: 'Pick today or an earlier date' })
    }
    if (date !== today && slot !== 'summary') {
      return res.status(400).json({ success: false, message: 'Only the manager summary can be sent for a past day' })
    }
    const organizationId = orgObjectId(req.user)
    const settings = await settingsFor(organizationId)
    try {
      const result = await runSlot(organizationId, slot, date, { ignoreCalendar: slot === 'summary' })
      await recordResult(settings._id, slot, result.posted, `${describeResult(result)} (manual)`)
      res.status(result.posted ? 200 : 400).json({
        success: result.posted,
        message: result.posted ? `${slot} ${describeResult(result)}` : result.reason,
      })
    } catch (err) {
      await recordResult(settings._id, slot, false, `failed: ${err.message} (manual)`)
      throw err
    }
  } catch (err) {
    res.status(502).json({ success: false, message: err.message || 'Post failed' })
  }
})

function entryMatchesTarget(entry, target) {
  if (target.kind === 'ticket') {
    return entry.kind === 'ticket' && entry.ticket?.source === target.ticket.source && entry.ticket?.flowluId === target.ticket.flowluId
  }
  if (target.kind === 'task') return Boolean(entry.task) && String(entry.task) === String(target.task)
  return entry.kind !== 'ticket' && !entry.task && String(entry.description).toLowerCase() === String(target.title).toLowerCase()
}

function slotState(slot) {
  return { sentAt: slot?.sentAt || null, answeredAt: slot?.answeredAt || null }
}

/** Plan vs update vs timesheet vs check-in for every org member on `date`. */
async function computeStatus(organizationId, date, excludedUsers = []) {
  const excluded = new Set(excludedUsers.map(String))
  const members = await User.find({ $or: [{ organizationId }, { _id: organizationId }] })
    .select('email firstName lastName displayName avatarUrl')
    .sort({ firstName: 1 })
    .lean()
  const ids = members.map((m) => m._id)
  const [plans, days] = await Promise.all([
    PulseDailyPlan.find({ user: { $in: ids }, date }).lean(),
    PulseWorkDay.find({ user: { $in: ids }, date })
      .select('user totalActiveMs sessions.checkInAt timesheetSubmitted timesheetHours taskEntries')
      .lean(),
  ])
  const planBy = new Map(plans.map((p) => [String(p.user), p]))
  const dayBy = new Map(days.map((d) => [String(d.user), d]))

  const projects = new Map()
  const addProject = (name, person, patch) => {
    const key = name || 'General'
    const row = projects.get(key) || { name: key, people: new Set(), targets: 0, blocked: 0, done: 0, loggedMinutes: 0 }
    row.people.add(person)
    Object.entries(patch).forEach(([k, v]) => { row[k] += v })
    projects.set(key, row)
  }

  const people = members.map((member) => {
    const id = String(member._id)
    const plan = planBy.get(id)
    const day = dayBy.get(id)
    const entries = day?.timesheetSubmitted ? day.taskEntries || [] : []
    const targets = (plan?.targets || []).map((target) => {
      const loggedMinutes = entries.filter((e) => entryMatchesTarget(e, target)).reduce((sum, e) => sum + e.minutes, 0)
      addProject(target.projectName, id, {
        targets: 1,
        blocked: target.status === 'blocked' ? 1 : 0,
        done: target.status === 'done' ? 1 : 0,
        loggedMinutes,
      })
      return {
        title: target.title,
        kind: target.kind,
        key: target.ticket?.key || '',
        projectName: target.projectName,
        status: target.status,
        note: target.note,
        loggedMinutes,
      }
    })
    const unplanned = entries.filter((e) => !(plan?.targets || []).some((t) => entryMatchesTarget(e, t)))
    unplanned.forEach((e) => addProject(e.project, id, { loggedMinutes: e.minutes }))

    const flags = []
    if (plan?.morning?.sentAt && !targets.length) flags.push('no_plan')
    if (plan?.afternoon?.sentAt && !plan.afternoon.answeredAt && targets.length) flags.push('no_update')
    if (plan?.evening?.sentAt && !day?.timesheetSubmitted) flags.push('no_timesheet')
    if (targets.some((t) => t.status === 'blocked')) flags.push('blocked')
    if (day?.timesheetSubmitted && targets.some((t) => !t.loggedMinutes)) flags.push('planned_not_logged')
    if (targets.length && unplanned.length) flags.push('unplanned_work')

    return {
      user: id,
      participant: !excluded.has(id),
      name: personName(member, member.email),
      email: member.email,
      avatarUrl: member.avatarUrl || '',
      targets,
      unplanned: unplanned.map((e) => ({
        title: e.ticket?.key ? `${e.ticket.key} ${e.ticket.name || ''}`.trim() : e.description,
        projectName: e.project,
        minutes: e.minutes,
      })),
      slots: {
        morning: slotState(plan?.morning),
        afternoon: slotState(plan?.afternoon),
        evening: slotState(plan?.evening),
      },
      timesheet: { submitted: Boolean(day?.timesheetSubmitted), hours: day?.timesheetHours || 0 },
      checkIn: {
        at: day?.sessions?.[0]?.checkInAt || null,
        activeHours: Math.round(((day?.totalActiveMs || 0) / 3_600_000) * 100) / 100,
      },
      flags,
    }
  })

  return {
    date,
    people,
    projects: [...projects.values()]
      .map((p) => ({ ...p, people: p.people.size }))
      .sort((a, b) => b.loggedMinutes - a.loggedMinutes),
  }
}

// GET /api/chat-bot/status?date=yyyy-MM-dd
router.get('/status', auth, requireAdmin, async (req, res) => {
  try {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : istNow().date
    const organizationId = orgObjectId(req.user)
    const settings = await settingsFor(organizationId)
    res.json({ success: true, data: await computeStatus(organizationId, date, settings.excludedUsers) })
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load project status' })
  }
})

module.exports = { router, startChatBotScheduler }
