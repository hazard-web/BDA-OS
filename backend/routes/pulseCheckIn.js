const express = require('express');
const router = express.Router();
const { auth } = require('./auth');
const PulseWorkDay = require('../models/PulseWorkDay');
const User = require('../models/User');
const Staff = require('../models/Staff');
const LeavePolicy = require('../models/LeavePolicy');
const LeaveRequest = require('../models/LeaveRequest');
const Announcement = require('../models/Announcement');
const AssignedTask = require('../models/AssignedTask');
const { logActivity } = require('../utils/logger');
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth');
const { sendLeaveRequestEmail } = require('../utils/emailService');
const { getProductionBaseUrl } = require('../utils/urlHelper');
const {
  clientIp,
  clientUserAgent,
  normalizeLocation,
  formatLocationLabel,
} = require('../utils/requestMeta');

const TARGET_HOURS = 9;
const PULSE_CASUAL_ANNUAL = 18;

async function linkedStaff(user) {
  return Staff.findOne({
    email: String(user.email || '').toLowerCase(),
    user: orgIdOf(user),
  }).lean();
}

function casualLeaveBalance(staff) {
  const remaining = staff?.leaveBalance?.casual != null
    ? Number(staff.leaveBalance.casual)
    : PULSE_CASUAL_ANNUAL;
  return {
    name: 'Casual',
    used: Math.max(0, PULSE_CASUAL_ANNUAL - remaining),
    total: PULSE_CASUAL_ANNUAL,
    remaining: Math.max(0, remaining),
    color: '#1A5F4A',
  };
}

function leaveDurationDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 1;
  return Math.max(1, Math.ceil((end - start) / 86_400_000) + 1);
}

/** Leave types the LeaveRequest model accepts, keyed by the labels the UI sends. */
const LEAVE_TYPE_ALIASES = {
  casual: 'Casual',
  'casual leave': 'Casual',
  sick: 'Sick',
  'sick leave': 'Sick',
  custom: 'Custom',
  'custom leave': 'Custom',
};

/**
 * Inboxes a leave request may be sent to for approval. Requests can only name an
 * address from this list, so the endpoint can never mail an arbitrary recipient.
 */
const LEAVE_NOTIFY_EMAILS = String(
  process.env.PULSE_LEAVE_NOTIFY_EMAILS || 'office@bda.co.in,hello@ambesh.com',
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

function resolveNotifyEmail(raw) {
  const wanted = String(raw || '').trim().toLowerCase();
  if (!wanted) return '';
  return LEAVE_NOTIFY_EMAILS.find((email) => email.toLowerCase() === wanted) || '';
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Matches the "4 Sep 2026" the UI shows; leave dates are stored at UTC midnight. */
function formatLeaveDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getUTCDate()} ${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function todayKey(raw) {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function msToHours(ms) {
  return Math.round((Math.max(0, Number(ms) || 0) / 3_600_000) * 100) / 100;
}

async function getOrCreateDay(userId, email, date) {
  let doc = await PulseWorkDay.findOne({ user: userId, date });
  if (doc) return doc;
  doc = await PulseWorkDay.create({
    user: userId,
    email: String(email || '').toLowerCase(),
    date,
    targetHours: TARGET_HOURS,
    status: 'idle',
  });
  return doc;
}

function serializeDay(doc) {
  if (!doc) return null;
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    ...plain,
    totalActiveHours: msToHours(plain.totalActiveMs),
    targetHours: plain.targetHours || TARGET_HOURS,
  };
}

function shiftKey(key, days) {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function enumerateKeys(fromKey, toKey) {
  const start = fromKey <= toKey ? fromKey : toKey;
  const end = fromKey <= toKey ? toKey : fromKey;
  const keys = [];
  let cur = start;
  while (cur <= end) {
    keys.push(cur);
    cur = shiftKey(cur, 1);
  }
  return keys;
}

function weekdayOf(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function dayKeyOf(value) {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function recordIsPresent(row) {
  if (!row) return false;
  if (Number(row.totalActiveMs) > 0) return true;
  if (Number(row.totalActiveHours) > 0) return true;
  if (['active', 'stopped', 'closed'].includes(row.status)) return true;
  return Array.isArray(row.sessions) && row.sessions.length > 0;
}

function recordIsLate(row) {
  const stamp =
    row?.events?.find((event) => event.type === 'CHECK_IN')?.at ||
    row?.sessions?.[0]?.checkInAt;
  if (!stamp) return false;
  const at = new Date(stamp);
  if (Number.isNaN(at.getTime())) return false;
  return at.getHours() > 9 || (at.getHours() === 9 && at.getMinutes() > 30);
}

// GET /api/pulse-checkin/today
router.get('/today', auth, async (req, res) => {
  try {
    const date = todayKey(req.query.date);
    const doc = await PulseWorkDay.findOne({ user: req.user._id, date }).lean();
    res.json({ success: true, data: doc ? serializeDay(doc) : null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load day' });
  }
});

// GET /api/pulse-checkin/admin/days — org-wide check-in audit (admin only)
router.get('/admin/days', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const organizationId = orgIdOf(req.user);
    const members = await User.find({
      $or: [{ organizationId }, { _id: organizationId }],
    })
      .select('_id')
      .lean();
    const userIds = members.map((m) => m._id);
    if (!userIds.length) {
      return res.json({ success: true, data: [] });
    }

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const days = await PulseWorkDay.find({ user: { $in: userIds } })
      .sort({ date: -1, updatedAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      success: true,
      data: days.map((d) => serializeDay(d)),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load days' });
  }
});

// POST /api/pulse-checkin/check-in
router.post('/check-in', auth, async (req, res) => {
  try {
    const date = todayKey(req.body?.date);
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const activeMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const location = normalizeLocation(req.body?.location);
    const ip = clientIp(req);
    const userAgent = clientUserAgent(req);
    const now = new Date();

    const doc = await getOrCreateDay(req.user._id, email, date);
    if (doc.status === 'closed') {
      return res.status(400).json({ success: false, message: 'This day is already closed for timesheet' });
    }

    const isResume = Boolean(doc.sessions?.length);
    doc.status = 'active';
    doc.totalActiveMs = Math.max(doc.totalActiveMs || 0, activeMs);
    doc.email = email;

    doc.sessions.push({
      checkInAt: now,
      durationMs: 0,
      ip,
      userAgent,
      locationIn: location,
    });

    doc.events.push({
      type: isResume ? 'RESUME' : 'CHECK_IN',
      at: now,
      activeMsAtEvent: doc.totalActiveMs,
      ip,
      userAgent,
      location,
    });

    await doc.save();

    await logActivity(
      req.user._id,
      isResume ? 'PULSE_RESUME' : 'PULSE_CHECK_IN',
      `${email} checked in at ${now.toISOString()} · ${formatLocationLabel(location)} · IP ${ip || 'n/a'}`,
      {
        date,
        email,
        ip,
        userAgent,
        location,
        activeMs: doc.totalActiveMs,
        eventType: isResume ? 'RESUME' : 'CHECK_IN',
        workDayId: doc._id,
      },
    );

    res.json({ success: true, data: serializeDay(doc) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Check-in failed' });
  }
});

// POST /api/pulse-checkin/check-out
router.post('/check-out', auth, async (req, res) => {
  try {
    const date = todayKey(req.body?.date);
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const activeMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const location = normalizeLocation(req.body?.location);
    const ip = clientIp(req);
    const userAgent = clientUserAgent(req);
    const now = new Date();

    const doc = await getOrCreateDay(req.user._id, email, date);
    doc.totalActiveMs = Math.max(doc.totalActiveMs || 0, activeMs);
    doc.status = 'stopped';
    doc.email = email;

    const open = [...(doc.sessions || [])].reverse().find((s) => s.checkInAt && !s.checkOutAt);
    if (open) {
      open.checkOutAt = now;
      open.durationMs = Math.max(0, now.getTime() - new Date(open.checkInAt).getTime());
      open.locationOut = location;
      open.ip = open.ip || ip;
      open.userAgent = open.userAgent || userAgent;
    } else {
      doc.sessions.push({
        checkInAt: now,
        checkOutAt: now,
        durationMs: 0,
        ip,
        userAgent,
        locationOut: location,
      });
    }

    doc.events.push({
      type: 'CHECK_OUT',
      at: now,
      activeMsAtEvent: doc.totalActiveMs,
      ip,
      userAgent,
      location,
    });

    const targetMs = (doc.targetHours || TARGET_HOURS) * 3_600_000;
    if (!doc.targetReachedAt && doc.totalActiveMs >= targetMs) {
      doc.targetReachedAt = now;
      doc.events.push({
        type: 'TARGET_REACHED',
        at: now,
        activeMsAtEvent: doc.totalActiveMs,
        ip,
        userAgent,
        location,
      });
      await logActivity(
        req.user._id,
        'PULSE_TARGET_REACHED',
        `${email} reached ${doc.targetHours || TARGET_HOURS}h target on ${date}`,
        { date, email, activeMs: doc.totalActiveMs, workDayId: doc._id },
      );
    }

    await doc.save();

    await logActivity(
      req.user._id,
      'PULSE_CHECK_OUT',
      `${email} checked out at ${now.toISOString()} · worked ${msToHours(doc.totalActiveMs)}h · ${formatLocationLabel(location)} · IP ${ip || 'n/a'}`,
      {
        date,
        email,
        ip,
        userAgent,
        location,
        activeMs: doc.totalActiveMs,
        hours: msToHours(doc.totalActiveMs),
        eventType: 'CHECK_OUT',
        workDayId: doc._id,
      },
    );

    res.json({ success: true, data: serializeDay(doc) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Check-out failed' });
  }
});

// POST /api/pulse-checkin/sync — heartbeat / activeMs update while checked in
router.post('/sync', auth, async (req, res) => {
  try {
    const date = todayKey(req.body?.date);
    const activeMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const doc = await PulseWorkDay.findOne({ user: req.user._id, date });
    if (!doc) return res.json({ success: true, data: null });

    doc.totalActiveMs = Math.max(doc.totalActiveMs || 0, activeMs);
    const targetMs = (doc.targetHours || TARGET_HOURS) * 3_600_000;
    if (!doc.targetReachedAt && doc.totalActiveMs >= targetMs) {
      const now = new Date();
      doc.targetReachedAt = now;
      doc.events.push({
        type: 'TARGET_REACHED',
        at: now,
        activeMsAtEvent: doc.totalActiveMs,
        ip: clientIp(req),
        userAgent: clientUserAgent(req),
      });
      await logActivity(
        req.user._id,
        'PULSE_TARGET_REACHED',
        `${doc.email} reached ${doc.targetHours || TARGET_HOURS}h target on ${date}`,
        { date, email: doc.email, activeMs: doc.totalActiveMs, workDayId: doc._id },
      );
    }
    await doc.save();
    res.json({ success: true, data: serializeDay(doc) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Sync failed' });
  }
});

// POST /api/pulse-checkin/finalize-day — midnight / new-day timesheet log
router.post('/finalize-day', auth, async (req, res) => {
  try {
    const date = todayKey(req.body?.date);
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const activeMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const location = normalizeLocation(req.body?.location);
    const ip = clientIp(req);
    const userAgent = clientUserAgent(req);
    const now = new Date();

    const doc = await getOrCreateDay(req.user._id, email, date);
    doc.totalActiveMs = Math.max(doc.totalActiveMs || 0, activeMs);
    doc.email = email;

    const open = [...(doc.sessions || [])].reverse().find((s) => s.checkInAt && !s.checkOutAt);
    if (open) {
      open.checkOutAt = now;
      open.durationMs = Math.max(0, now.getTime() - new Date(open.checkInAt).getTime());
      open.locationOut = location || open.locationOut;
    }

    if (!doc.timesheetLogged) {
      doc.timesheetLogged = true;
      doc.timesheetLoggedAt = now;
      doc.timesheetHours = msToHours(doc.totalActiveMs);
      doc.status = 'closed';
      doc.events.push({
        type: 'MIDNIGHT_CLOSE',
        at: now,
        activeMsAtEvent: doc.totalActiveMs,
        ip,
        userAgent,
        location,
      });
      await doc.save();

      await logActivity(
        req.user._id,
        'PULSE_TIMESHEET_DAY',
        `${email} timesheet for ${date}: ${doc.timesheetHours}h logged at midnight close · IP ${ip || 'n/a'} · ${formatLocationLabel(location)}`,
        {
          date,
          email,
          ip,
          userAgent,
          location,
          activeMs: doc.totalActiveMs,
          hours: doc.timesheetHours,
          eventType: 'MIDNIGHT_CLOSE',
          workDayId: doc._id,
        },
      );
    } else {
      await doc.save();
    }

    res.json({ success: true, data: serializeDay(doc) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Finalize failed' });
  }
});

// GET /api/pulse-checkin/week?from=yyyy-MM-dd&to=yyyy-MM-dd
router.get('/week', auth, async (req, res) => {
  try {
    const from = todayKey(req.query.from);
    const to = todayKey(req.query.to);
    const start = from <= to ? from : to;
    const end = from <= to ? to : from;
    const days = await PulseWorkDay.find({
      user: req.user._id,
      date: { $gte: start, $lte: end },
    })
      .sort({ date: 1 })
      .lean();
    const workDays = Array.isArray(req.user.defaultWorkDays) && req.user.defaultWorkDays.length
      ? req.user.defaultWorkDays
      : [1, 2, 3, 4, 5];
    res.json({
      success: true,
      data: {
        from: start,
        to: end,
        workDays,
        days: days.map((d) => serializeDay(d)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load week' });
  }
});

// GET /api/pulse-checkin/overview — My Space week, month, leave, feeds
router.get('/overview', auth, async (req, res) => {
  try {
    const today = todayKey();
    const weekFrom = todayKey(req.query.from);
    const weekTo = todayKey(req.query.to);
    const start = weekFrom <= weekTo ? weekFrom : weekTo;
    const end = weekFrom <= weekTo ? weekTo : weekFrom;
    const monthFrom = `${today.slice(0, 7)}-01`;
    const orgId = orgIdOf(req.user);
    const workDays = Array.isArray(req.user.defaultWorkDays) && req.user.defaultWorkDays.length
      ? req.user.defaultWorkDays
      : [1, 2, 3, 4, 5];
    const workDaySet = new Set(workDays.map((d) => Number(d)));

    const [weekDocs, monthDocs, policy, staff, announcements] = await Promise.all([
      PulseWorkDay.find({
        user: req.user._id,
        date: { $gte: start, $lte: end },
      })
        .sort({ date: 1 })
        .lean(),
      PulseWorkDay.find({
        user: req.user._id,
        date: { $gte: monthFrom, $lte: today },
      })
        .sort({ date: 1 })
        .lean(),
      LeavePolicy.findOne({ user: orgId }).lean(),
      Staff.findOne({
        email: String(req.user.email || '').toLowerCase(),
        user: orgId,
      }).lean(),
      Announcement.find({
        user: orgId,
        isActive: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: new Date() } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: new Date() } }] },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
    ]);

    const holidays = (policy?.holidays || [])
      .map(dayKeyOf)
      .filter(Boolean);
    const holidaySet = new Set(holidays);

    let leaveDates = [];
    let monthLeaveDates = [];
    let leaveBalances = [];
    let approvals = [];
    let leaveByDate = {};

    leaveBalances = [casualLeaveBalance(staff)];

    if (staff) {
      const leaves = await LeaveRequest.find({
        staff: staff._id,
        status: { $in: ['Pending', 'Approved'] },
        startDate: { $lte: new Date(`${end}T23:59:59`) },
        endDate: { $gte: new Date(`${monthFrom}T00:00:00`) },
      })
        .select('startDate endDate status type')
        .lean();
      leaves.forEach((row) => {
        const label = row.status === 'Pending' ? 'Leave applied' : 'On Leave';
        enumerateKeys(dayKeyOf(row.startDate), dayKeyOf(row.endDate)).forEach((key) => {
          const prev = leaveByDate[key];
          // Approved wins over Pending if both overlap
          if (!prev || row.status === 'Approved') {
            leaveByDate[key] = { status: row.status, type: row.type || 'Leave', label };
          }
          if (key >= start && key <= end) leaveDates.push(key);
          if (key >= monthFrom && key <= today) monthLeaveDates.push(key);
        });
      });
      leaveDates = [...new Set(leaveDates)];
      monthLeaveDates = [...new Set(monthLeaveDates)];
    }

    const pendingQuery = isPulseAdmin(req.user)
      ? { admin: orgId, status: 'Pending' }
      : staff
        ? { staff: staff._id, status: 'Pending' }
        : null;
    if (pendingQuery) {
      const pendingLeaves = await LeaveRequest.find(pendingQuery)
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('staff', 'fullName email')
        .lean();
      approvals = pendingLeaves.map((row) => ({
        key: String(row._id),
        type: 'Leave',
        subject: `${row.type || 'Leave'} · ${dayKeyOf(row.startDate)} – ${dayKeyOf(row.endDate)}`,
        from: row.staff?.fullName || row.staff?.email || 'Team',
        status: row.status,
        due: dayKeyOf(row.startDate) || today,
      }));
    }

    if (staff) {
      const tasks = await AssignedTask.find({
        staff: staff._id,
        status: { $in: ['Pending', 'Accepted', 'In Progress'] },
      })
        .sort({ dueDate: 1, createdAt: -1 })
        .limit(6)
        .lean();
      approvals = [
        ...approvals,
        ...tasks.map((row) => ({
          key: `task-${row._id}`,
          type: 'Task',
          subject: row.title,
          from: 'You',
          status: row.status,
          due: dayKeyOf(row.dueDate) || '—',
        })),
      ];
    }

    const monthByDate = new Map(monthDocs.map((row) => [row.date, row]));
    const monthLeaveSet = new Set(monthLeaveDates);
    const firstRecord = monthDocs.reduce((min, row) => (!min || row.date < min ? row.date : min), null);
    const hasEarlierHistory = Boolean(firstRecord && firstRecord < start);
    const scoreFrom = hasEarlierHistory ? monthFrom : (start > monthFrom ? start : monthFrom);
    let present = 0;
    let absent = 0;
    let late = 0;
    let hours = 0;
    let workdayCount = 0;

    enumerateKeys(scoreFrom, today).forEach((key) => {
      const weekend = !workDaySet.has(weekdayOf(key));
      if (weekend || holidaySet.has(key)) return;
      const row = monthByDate.get(key);
      const onLeave = monthLeaveSet.has(key);
      if (onLeave) return;
      const isToday = key === today;
      const presentDay = recordIsPresent(row) || (isToday && row?.status === 'active');
      if (isToday && !presentDay) return;
      workdayCount += 1;
      if (presentDay) {
        present += 1;
        if (recordIsLate(row)) late += 1;
      } else {
        absent += 1;
      }
      hours += msToHours(row?.totalActiveMs);
    });

    res.json({
      success: true,
      data: {
        from: start,
        to: end,
        workDays,
        days: weekDocs.map((d) => serializeDay(d)),
        holidays,
        leaveDates,
        leaveByDate,
        leaveBalances,
        approvals,
        announcements: announcements.map((row) => ({
          id: String(row._id),
          title: row.title,
          message: row.message,
          priority: row.priority,
          createdAt: row.createdAt,
        })),
        profile: {
          name: [req.user.firstName, req.user.lastName].filter(Boolean).join(' ')
            || req.user.displayName
            || String(req.user.email || '').split('@')[0],
          email: req.user.email,
          company: req.user.companyName || '',
          role: req.user.role || 'admin',
          designation: staff?.designation || '',
          department: staff?.department || '',
          shift: { name: 'General', hours: '' },
        },
        month: {
          from: monthFrom,
          to: today,
          present,
          absent,
          late,
          hours,
          workdayCount,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load overview' });
  }
});

const NAMED_HOLIDAYS = {
  '2026-01-01': { name: "New Year's Day", kind: 'restricted' },
  '2026-01-14': { name: 'Pongal', kind: 'restricted' },
  '2026-01-26': { name: 'Republic Day', kind: 'company' },
  '2026-03-04': { name: 'Holi', kind: 'restricted' },
  '2026-03-21': { name: 'Eid al-Fitr', kind: 'restricted' },
  '2026-04-03': { name: 'Good Friday', kind: 'restricted' },
  '2026-08-15': { name: 'Independence Day', kind: 'company' },
  '2026-08-26': { name: 'Onam', kind: 'restricted' },
  '2026-09-04': { name: 'Janmashtami', kind: 'restricted' },
  '2026-09-14': { name: 'Ganesh Chaturthi', kind: 'restricted' },
  '2026-10-02': { name: 'Gandhi Jayanti', kind: 'company' },
  '2026-10-20': { name: 'Dussehra', kind: 'restricted' },
  '2026-10-29': { name: 'Diwali', kind: 'restricted' },
  '2026-12-25': { name: 'Christmas', kind: 'restricted' },
  '2027-01-26': { name: 'Republic Day', kind: 'company' },
  '2027-03-03': { name: 'Holi', kind: 'restricted' },
};

function firstName(value, email) {
  const name = String(value || '').trim();
  if (name) return name.split(/\s+/)[0];
  return String(email || '').split('@')[0] || 'Teammate';
}

function initialOf(value) {
  return String(value || '?').trim().charAt(0).toUpperCase() || '?';
}

function serializeSessions(row) {
  return (row?.sessions || []).map((session) => ({
    in: session.checkInAt || null,
    out: session.checkOutAt || null,
    hours: msToHours(session.durationMs),
  }));
}

function monthBounds(raw) {
  const match = String(raw || '').match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) : now.getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const last = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
  return { month: from.slice(0, 7), from, to };
}

// GET /api/pulse-checkin/calendar?month=2026-09
router.get('/calendar', auth, async (req, res) => {
  try {
    const { month, from, to } = monthBounds(req.query.month);
    const today = todayKey();
    const orgId = orgIdOf(req.user);
    const workDays = Array.isArray(req.user.defaultWorkDays) && req.user.defaultWorkDays.length
      ? req.user.defaultWorkDays
      : [1, 2, 3, 4, 5];
    const workDaySet = new Set(workDays.map((d) => Number(d)));

    const [policy, myDays, leaves] = await Promise.all([
      LeavePolicy.findOne({ user: orgId }).lean(),
      PulseWorkDay.find({
        user: req.user._id,
        date: { $gte: from, $lte: to },
      })
        .sort({ date: 1 })
        .lean(),
      LeaveRequest.find({
        admin: orgId,
        status: 'Approved',
        startDate: { $lte: new Date(`${to}T23:59:59`) },
        endDate: { $gte: new Date(`${from}T00:00:00`) },
      })
        .populate('staff', 'fullName email')
        .sort({ startDate: 1 })
        .lean(),
    ]);

    const companyDates = new Set((policy?.holidays || []).map(dayKeyOf).filter(Boolean));
    const holidays = [];
    const seen = new Set();
    companyDates.forEach((date) => {
      if (date < from || date > to) return;
      const named = NAMED_HOLIDAYS[date];
      holidays.push({
        date,
        name: named?.name || 'Holiday',
        kind: 'company',
      });
      seen.add(date);
    });
    Object.entries(NAMED_HOLIDAYS).forEach(([date, meta]) => {
      if (date < from || date > to || seen.has(date)) return;
      holidays.push({ date, name: meta.name, kind: meta.kind });
      seen.add(date);
    });
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    const holidaySet = new Set(holidays.map((row) => row.date));

    const teamLeave = leaves.map((row) => {
      const name = row.staff?.fullName || firstName('', row.staff?.email);
      const days = enumerateKeys(dayKeyOf(row.startDate), dayKeyOf(row.endDate))
        .filter((key) => key >= from && key <= to);
      const type = row.type === 'Sick' ? 'Sick leave' : row.type === 'Custom' ? 'Leave' : 'Casual leave';
      return {
        id: String(row._id),
        name,
        initial: initialOf(name),
        type,
        startDate: dayKeyOf(row.startDate),
        endDate: dayKeyOf(row.endDate),
        days,
      };
    }).filter((row) => row.days.length);

    const leaveDates = [...new Set(teamLeave.flatMap((row) => row.days))];
    const myLeave = new Set();
    const staff = await linkedStaff(req.user);
    if (staff) {
      leaves.forEach((row) => {
        if (String(row.staff?._id || row.staff) === String(staff._id)) {
          enumerateKeys(dayKeyOf(row.startDate), dayKeyOf(row.endDate)).forEach((key) => myLeave.add(key));
        }
      });
    }

    const byDate = new Map(myDays.map((row) => [row.date, row]));
    const days = {};
    enumerateKeys(from, to).forEach((date) => {
      const row = byDate.get(date);
      const weekend = !workDaySet.has(weekdayOf(date));
      const holiday = holidaySet.has(date);
      const onLeave = myLeave.has(date);
      const present = recordIsPresent(row);
      const future = date > today;
      const absent = !weekend && !holiday && !onLeave && !present && !future && date !== today;
      days[date] = {
        date,
        hours: row?.timesheetLogged && row?.timesheetHours != null
          ? Number(row.timesheetHours)
          : msToHours(row?.totalActiveMs),
        present,
        absent,
        onLeave,
        weekend,
        holiday,
        sessions: serializeSessions(row),
      };
    });

    res.json({
      success: true,
      data: {
        month,
        from,
        to,
        holidays,
        teamLeave,
        leaveDates,
        days,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load calendar' });
  }
});

router.get('/leaves', auth, async (req, res) => {
  try {
    const staff = await linkedStaff(req.user);
    if (!staff) {
      return res.json({
        success: true,
        data: [],
        casual: casualLeaveBalance(null),
        notifyEmails: LEAVE_NOTIFY_EMAILS,
      });
    }
    const requests = await LeaveRequest.find({ staff: staff._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({
      success: true,
      data: requests.map((row) => ({
        id: String(row._id),
        type: row.type,
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status,
        reason: row.reason,
        days: leaveDurationDays(row.startDate, row.endDate),
        createdAt: row.createdAt,
      })),
      casual: casualLeaveBalance(staff),
      notifyEmails: LEAVE_NOTIFY_EMAILS,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load leave requests' });
  }
});

router.post('/leaves/apply', auth, async (req, res) => {
  try {
    const { startDate, endDate, reason, leaveType, teamEmailId } = req.body || {};
    if (!startDate || !endDate || !String(reason || '').trim()) {
      return res.status(400).json({ success: false, message: 'Start date, end date, and reason are required' });
    }
    const type = LEAVE_TYPE_ALIASES[String(leaveType || 'Casual').trim().toLowerCase()];
    if (!type) {
      return res.status(400).json({
        success: false,
        message: `${leaveType} is not a supported leave type`,
      });
    }
    const notifyEmail = resolveNotifyEmail(teamEmailId);
    if (teamEmailId && !notifyEmail) {
      return res.status(400).json({ success: false, message: 'Pick a team email from the list' });
    }
    const staff = await linkedStaff(req.user);
    if (!staff) {
      return res.status(400).json({
        success: false,
        message: 'No employee profile is linked to this Pulse account yet.',
      });
    }
    const days = leaveDurationDays(startDate, endDate);
    if (type === 'Casual') {
      const balance = casualLeaveBalance(staff);
      if (days > balance.remaining) {
        return res.status(400).json({
          success: false,
          message: `Only ${balance.remaining} casual day(s) left this year.`,
        });
      }
    }
    const leave = await LeaveRequest.create({
      staff: staff._id,
      admin: orgIdOf(req.user),
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: String(reason).trim(),
      status: 'Pending',
    });

    // A mail failure must not lose a saved request, so report it instead of throwing.
    let notified = false;
    if (notifyEmail) {
      try {
        await sendLeaveRequestEmail({
          to: notifyEmail,
          employeeName: staff.fullName || [req.user.firstName, req.user.lastName].filter(Boolean).join(' '),
          employeeEmail: staff.email || req.user.email,
          leaveType: type,
          fromDate: formatLeaveDate(leave.startDate),
          toDate: formatLeaveDate(leave.endDate),
          days,
          reason: leave.reason,
          reviewUrl: `${getProductionBaseUrl()}/pulse`,
          companyName: req.user.companyName || '',
        });
        notified = true;
      } catch {
        // Leave still saved; client sees notified=false.
      }
    }

    res.status(201).json({
      success: true,
      message: 'Leave request submitted',
      notified,
      notifyEmail,
      data: {
        id: String(leave._id),
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        status: leave.status,
        reason: leave.reason,
        days,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to submit leave request' });
  }
});

const IMPORT_ROW_LIMIT = 500;

router.post('/leaves/import', auth, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) {
      return res.status(400).json({ success: false, message: 'No rows to import' });
    }
    if (rows.length > IMPORT_ROW_LIMIT) {
      return res.status(400).json({
        success: false,
        message: `Import is limited to ${IMPORT_ROW_LIMIT} rows per file`,
      });
    }
    const isAdmin = isPulseAdmin(req.user);
    const selfStaff = await linkedStaff(req.user);
    if (!selfStaff && !isAdmin) {
      return res.status(400).json({
        success: false,
        message: 'No employee profile is linked to this Pulse account yet.',
      });
    }

    // A blank employee id imports against the signed-in profile; a filled one is
    // resolved within the org and only admins may target somebody else.
    const wantedIds = [...new Set(
      rows.map((row) => String(row?.employeeId || '').trim()).filter(Boolean),
    )];
    const staffById = new Map();
    if (wantedIds.length) {
      const matches = await Staff.find({
        user: orgIdOf(req.user),
        employeeId: { $in: wantedIds },
      }).lean();
      matches.forEach((row) => staffById.set(String(row.employeeId), row));
    }

    const casualLeft = new Map();
    const remainingFor = (staff) => {
      const key = String(staff._id);
      if (!casualLeft.has(key)) casualLeft.set(key, casualLeaveBalance(staff).remaining);
      return casualLeft.get(key);
    };

    const added = [];
    const skipped = [];

    for (const row of rows) {
      const rowNo = Number(row?.rowNo) || 0;
      const errors = [];
      const rawType = String(row?.leaveType || '').trim();
      const type = LEAVE_TYPE_ALIASES[rawType.toLowerCase()];
      const startDate = new Date(row?.from);
      const endDate = new Date(row?.to);
      const employeeId = String(row?.employeeId || '').trim();

      let target = selfStaff;
      if (employeeId) {
        const match = staffById.get(employeeId);
        if (!match) {
          errors.push(`No employee found with ID ${employeeId}`);
        } else if (!isAdmin && String(match._id) !== String(selfStaff?._id)) {
          errors.push('You can only import leave for your own profile');
        } else {
          target = match;
        }
      }
      if (!target && !errors.length) {
        errors.push('No employee profile is linked to this Pulse account yet');
      }

      if (!type) errors.push(`${rawType || 'Leave type'} is not a supported leave type`);
      if (Number.isNaN(startDate.getTime())) errors.push('From is not a valid date');
      if (Number.isNaN(endDate.getTime())) errors.push('To is not a valid date');
      if (!errors.length && endDate < startDate) errors.push('To cannot be earlier than From');

      const days = errors.length ? 0 : leaveDurationDays(startDate, endDate);
      if (!errors.length && type === 'Casual' && days > remainingFor(target)) {
        errors.push(`Only ${remainingFor(target)} casual day(s) left this year`);
      }

      if (errors.length) {
        skipped.push({ rowNo, errors });
        continue;
      }

      const leave = await LeaveRequest.create({
        staff: target._id,
        admin: orgIdOf(req.user),
        type,
        startDate,
        endDate,
        reason: String(row?.reason || '').trim() || 'Imported leave',
        status: 'Pending',
      });
      if (type === 'Casual') casualLeft.set(String(target._id), remainingFor(target) - days);
      added.push({
        rowNo,
        id: String(leave._id),
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        status: leave.status,
        reason: leave.reason,
        days,
      });
    }

    if (added.length) {
      await logActivity(
        req.user._id,
        'PULSE_LEAVE_IMPORT',
        `${req.user.email} imported ${added.length} leave request(s), ${skipped.length} skipped`,
        { added: added.length, skipped: skipped.length },
      );
    }

    res.status(201).json({ success: true, added, skipped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to import leave requests' });
  }
});

module.exports = router;
