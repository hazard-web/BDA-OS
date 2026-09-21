const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { auth } = require('./auth');
const PulseWorkDay = require('../models/PulseWorkDay');
const User = require('../models/User');
const Staff = require('../models/Staff');
const Candidate = require('../models/Candidate');
const LeavePolicy = require('../models/LeavePolicy');
const LeaveRequest = require('../models/LeaveRequest');
const Announcement = require('../models/Announcement');
const AssignedTask = require('../models/AssignedTask');
const { logActivity } = require('../utils/logger');
const { isPulseAdmin, orgIdOf } = require('../utils/pulseAuth');
const { personName } = require('../utils/pulsePerson');
const { sendLeaveRequestEmail } = require('../utils/emailService');
const { uploadBase64 } = require('../utils/cloudinary');
const { getProductionBaseUrl } = require('../utils/urlHelper');
const { collectMyFiles } = require('./pulseFiles');
const {
  clientIp,
  clientUserAgent,
  formatLocationLabel,
  enrichLocation,
} = require('../utils/requestMeta');
const {
  TARGET_HOURS,
  assertWritableDate,
  applyTrustedActiveMs,
  closeOpenSession,
  findOpenSession,
  touchHeartbeat,
  msToHours: trustedMsToHours,
} = require('../utils/pulseTrustedTime');

const PULSE_CASUAL_ANNUAL = 18;
const PULSE_WORK_DAYS = [1, 2, 3, 4, 5, 6]; // Mon–Sat

function pulseWorkDaysOf(user) {
  const days = Array.isArray(user?.defaultWorkDays)
    ? [...new Set(user.defaultWorkDays.map(Number).filter((d) => d >= 0 && d <= 6))]
    : [];
  if (!days.length) return [...PULSE_WORK_DAYS];
  // Stored Mon–Fri hid Saturday’s timer; Pulse week matches timesheets (Mon–Sat).
  if (!days.includes(6) && days.includes(1) && days.includes(5) && !days.includes(0)) {
    return [...days, 6];
  }
  return days;
}

async function linkedStaff(user) {
  return Staff.findOne({
    email: String(user.email || '').toLowerCase(),
    user: orgIdOf(user),
  }).lean();
}

function casualLeaveBalance(staff) {
  const total = PULSE_CASUAL_ANNUAL;
  const raw = staff?.leaveBalance?.casual;
  // Schema used to default casual to 0, which reads as "fully used". Treat
  // nullish / NaN as a full allotment; real remaining is synced from leave requests.
  if (raw == null || Number.isNaN(Number(raw))) {
    return {
      name: 'Casual',
      used: 0,
      total,
      remaining: total,
      color: '#1A5F4A',
    };
  }
  const remaining = Math.max(0, Number(raw));
  return {
    name: 'Casual',
    used: Math.max(0, total - remaining),
    total,
    remaining,
    color: '#1A5F4A',
  };
}

/** Source of truth: sum Pending + Approved casual days this year, then sync staff.leaveBalance. */
async function loadCasualLeaveBalance(staff) {
  if (!staff?._id) return casualLeaveBalance(null);
  const year = new Date().getFullYear();
  const from = new Date(`${year}-01-01T00:00:00`);
  const to = new Date(`${year}-12-31T23:59:59`);
  const leaves = await LeaveRequest.find({
    staff: staff._id,
    type: 'Casual',
    status: { $in: ['Pending', 'Approved'] },
    startDate: { $lte: to },
    endDate: { $gte: from },
  })
    .select('startDate endDate')
    .lean();
  const used = Math.min(
    PULSE_CASUAL_ANNUAL,
    Math.max(
      0,
      leaves.reduce((sum, row) => sum + leaveDurationDays(row.startDate, row.endDate), 0),
    ),
  );
  const remaining = Math.max(0, PULSE_CASUAL_ANNUAL - used);
  const stored = staff.leaveBalance?.casual;
  if (stored == null || Number(stored) !== remaining) {
    try {
      await Staff.updateOne(
        { _id: staff._id },
        { $set: { 'leaveBalance.casual': remaining } },
      );
      if (!staff.leaveBalance) staff.leaveBalance = {};
      staff.leaveBalance.casual = remaining;
    } catch {
      /* non-fatal — response still uses computed remaining */
    }
  }
  return {
    name: 'Casual',
    used,
    total: PULSE_CASUAL_ANNUAL,
    remaining,
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
  return trustedMsToHours(ms);
}

function applyAnomaly(doc, anomaly) {
  if (!anomaly?.flagged) return;
  doc.anomaly = {
    flagged: true,
    reason: anomaly.reason || 'Hours exceed session wall time',
    at: anomaly.at || new Date(),
    wallMs: anomaly.wallMs || 0,
    activeMs: anomaly.activeMs || doc.totalActiveMs || 0,
  };
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

function firstCheckInAt(plain) {
  const event = (plain.events || []).find((item) => item.type === 'CHECK_IN');
  if (event?.at) return event.at;
  const session = (plain.sessions || []).find((item) => item.checkInAt);
  return session?.checkInAt || null;
}

function parseTaskEntries(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const description = String(item?.description || item?.task || '').trim();
      const project = String(item?.project || 'BDA OS').trim() || 'BDA OS';
      const minutes = Math.max(
        0,
        Math.round(Number(item?.minutes) || ((Number(item?.hours) || 0) * 60)),
      );
      return { description, project, minutes };
    })
    .filter((item) => item.description && item.minutes > 0)
    .slice(0, 20);
}

function taskMinutesOf(plain) {
  return (plain.taskEntries || []).reduce((sum, item) => sum + (Number(item.minutes) || 0), 0);
}

function serializeDay(doc) {
  if (!doc) return null;
  const plain = doc.toObject ? doc.toObject() : doc;
  return {
    ...plain,
    totalActiveHours: msToHours(plain.totalActiveMs),
    targetHours: plain.targetHours || TARGET_HOURS,
    checkInAt: firstCheckInAt(plain),
    taskMinutes: taskMinutesOf(plain),
    timesheetSubmitted: Boolean(plain.timesheetSubmitted),
    taskEntries: Array.isArray(plain.taskEntries) ? plain.taskEntries : [],
    anomaly: plain.anomaly?.flagged
      ? {
          flagged: true,
          reason: plain.anomaly.reason || '',
          at: plain.anomaly.at || null,
          wallMs: plain.anomaly.wallMs || 0,
          activeMs: plain.anomaly.activeMs || plain.totalActiveMs || 0,
        }
      : null,
    lastHeartbeatAt: plain.lastHeartbeatAt || null,
  };
}

/** HTTP(S) avatars only — never embed data: URLs in list JSON (they stall Attendance). */
function safeListAvatarUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url) && url.length <= 2048) return url;
  return '';
}

function hasEmbeddedAvatar(value) {
  const raw = String(value || '').trim();
  return raw.startsWith('data:image/') || (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 200);
}

function parseDataUrlImage(raw, fallbackMime = 'image/jpeg') {
  const value = String(raw || '').trim();
  if (!value) return null;
  const match = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (match) {
    try {
      return { mime: match[1] || fallbackMime, buffer: Buffer.from(match[2], 'base64') };
    } catch {
      return null;
    }
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 200) {
    try {
      return { mime: fallbackMime, buffer: Buffer.from(value.replace(/\s/g, ''), 'base64') };
    } catch {
      return null;
    }
  }
  return null;
}

/** Batch: emails that still have an onboarding Candidate photo (metadata only — no photo.data). */
async function emailsWithOnboardingPhoto(organizationId, emails) {
  const list = [...new Set((emails || []).map((e) => String(e || '').toLowerCase()).filter(Boolean))];
  if (!list.length) return new Set();
  const rows = await Candidate.find({
    organizationId,
    $and: [
      { $or: [{ email: { $in: list } }, { officialEmail: { $in: list } }] },
      {
        $or: [
          { 'photo.size': { $gt: 0 } },
          { 'photo.mime': { $regex: /^image\//i } },
        ],
      },
    ],
  })
    .select('email officialEmail')
    .lean();
  const out = new Set();
  rows.forEach((row) => {
    if (row.email) out.add(String(row.email).toLowerCase());
    if (row.officialEmail) out.add(String(row.officialEmail).toLowerCase());
  });
  return out;
}

function slimLocation(loc) {
  if (!loc || typeof loc !== 'object') return undefined;
  return {
    city: loc.city || undefined,
    locality: loc.locality || undefined,
    sector: loc.sector || undefined,
    state: loc.state || undefined,
    country: loc.country || undefined,
    displayName: loc.displayName || undefined,
    lat: loc.lat,
    lng: loc.lng,
  };
}

function lastCheckOutAt(plain) {
  const events = [...(plain.events || [])].reverse();
  const event = events.find((item) => item.type === 'CHECK_OUT' || item.type === 'MIDNIGHT_CLOSE');
  if (event?.at) return event.at;
  const session = [...(plain.sessions || [])].reverse().find((item) => item.checkOutAt);
  return session?.checkOutAt || null;
}

/** Compact org Attendance / Timesheet admin rows (avoids full event UA payloads). */
function serializeAdminDay(doc, fallbackDate = '', { previewEvents = false, cardsOnly = false } = {}) {
  if (!doc) {
    return {
      ...emptyTimesheet(fallbackDate),
      status: 'idle',
      events: [],
      sessions: [],
      checkOutAt: null,
      anomaly: null,
    };
  }
  const plain = doc.toObject ? doc.toObject() : doc;
  const sessions = (plain.sessions || []).map((session) => ({
    checkInAt: session.checkInAt,
    checkOutAt: session.checkOutAt,
    durationMs: session.durationMs || 0,
  }));

  // Cards grid: sessions + totals only — skip event arrays for faster payloads.
  if (cardsOnly) {
    const firstSession = sessions.find((item) => item.checkInAt);
    const lastOut = [...sessions].reverse().find((item) => item.checkOutAt);
    return {
      date: plain.date || fallbackDate,
      status: plain.status || 'idle',
      totalActiveMs: Number(plain.totalActiveMs) || 0,
      totalActiveHours: msToHours(plain.totalActiveMs),
      targetHours: plain.targetHours || TARGET_HOURS,
      checkInAt: firstSession?.checkInAt || null,
      checkOutAt: lastOut?.checkOutAt || null,
      anomaly: plain.anomaly?.flagged
        ? {
            flagged: true,
            reason: plain.anomaly.reason || '',
          }
        : null,
      events: [],
      sessions,
    };
  }

  const events = Array.isArray(plain.events) ? plain.events : [];
  const mappedEvents = events.map((event) => ({
    _id: event._id,
    type: event.type,
    at: event.at,
    activeMsAtEvent: event.activeMsAtEvent || 0,
    ip: previewEvents ? undefined : (event.ip || ''),
    location: previewEvents ? undefined : slimLocation(event.location),
  }));
  return {
    date: plain.date || fallbackDate,
    status: plain.status || 'idle',
    totalActiveMs: Number(plain.totalActiveMs) || 0,
    totalActiveHours: msToHours(plain.totalActiveMs),
    targetHours: plain.targetHours || TARGET_HOURS,
    checkInAt: firstCheckInAt(plain),
    checkOutAt: lastCheckOutAt(plain),
    taskMinutes: taskMinutesOf(plain),
    timesheetSubmitted: Boolean(plain.timesheetSubmitted),
    timesheetSubmittedAt: plain.timesheetSubmittedAt || null,
    taskEntries: Array.isArray(plain.taskEntries) ? plain.taskEntries : [],
    anomaly: plain.anomaly?.flagged
      ? {
          flagged: true,
          reason: plain.anomaly.reason || '',
          at: plain.anomaly.at || null,
          wallMs: plain.anomaly.wallMs || 0,
          activeMs: plain.anomaly.activeMs || plain.totalActiveMs || 0,
        }
      : null,
    lastHeartbeatAt: plain.lastHeartbeatAt || null,
    events: previewEvents ? mappedEvents.slice(-4) : mappedEvents,
    sessions,
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

// GET /api/pulse-checkin/admin/presence — who is checked in right now (admin / superadmin)
router.get('/admin/presence', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const organizationId = orgIdOf(req.user);
    const orgObjectId = mongoose.Types.ObjectId.isValid(organizationId)
      ? new mongoose.Types.ObjectId(organizationId)
      : organizationId;
    const members = await User.find({
      $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
    })
      .select('_id firstName lastName displayName email')
      .lean();

    const today = todayKey();
    const userIds = members.map((m) => m._id);
    const days = userIds.length
      ? await PulseWorkDay.find({ user: { $in: userIds }, date: today })
        .select('user status')
        .lean()
      : [];
    const statusByUser = new Map(days.map((row) => [String(row.user), row.status]));

    const active = [];
    const inactive = [];
    members.forEach((member) => {
      const row = {
        id: String(member._id),
        name: personName(member),
        email: member.email || '',
      };
      if (statusByUser.get(String(member._id)) === 'active') active.push(row);
      else inactive.push(row);
    });

    active.sort((a, b) => a.name.localeCompare(b.name));
    inactive.sort((a, b) => a.name.localeCompare(b.name));

    res.json({
      success: true,
      data: {
        date: today,
        activeCount: active.length,
        inactiveCount: inactive.length,
        active,
        inactive,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load presence' });
  }
});

// GET /api/pulse-checkin/admin/days — org-wide check-in audit (admin only)
router.get('/admin/days', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const organizationId = orgIdOf(req.user);
    const orgObjectId = mongoose.Types.ObjectId.isValid(organizationId)
      ? new mongoose.Types.ObjectId(organizationId)
      : organizationId;
    const cardsView = String(req.query.view || '') === 'cards';

    // Never pull full data: avatar blobs into the list — only HTTPS URLs + a flag for proxy.
    const members = await User.aggregate([
      {
        $match: {
          $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
        },
      },
      {
        $project: {
          firstName: 1,
          lastName: 1,
          displayName: 1,
          email: 1,
          avatarUrl: {
            $let: {
              vars: { raw: { $ifNull: ['$avatarUrl', ''] } },
              in: {
                $cond: [
                  {
                    $regexMatch: {
                      input: '$$raw',
                      regex: '^https?://',
                    },
                  },
                  '$$raw',
                  '',
                ],
              },
            },
          },
          hasEmbeddedAvatar: {
            $let: {
              vars: { raw: { $ifNull: ['$avatarUrl', ''] } },
              in: {
                $or: [
                  {
                    $regexMatch: {
                      input: '$$raw',
                      regex: '^data:image/',
                    },
                  },
                  {
                    $and: [
                      { $gt: [{ $strLenCP: '$$raw' }, 200] },
                      {
                        $not: [
                          {
                            $regexMatch: {
                              input: '$$raw',
                              regex: '^https?://',
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
    ]);
    const userIds = members.map((m) => m._id);
    if (!userIds.length) {
      return res.json({ success: true, data: [] });
    }

    const needOnboarding = members
      .filter((m) => !safeListAvatarUrl(m.avatarUrl) && !m.hasEmbeddedAvatar)
      .map((m) => m.email);

    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
    const dayKey = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date))
      ? String(req.query.date)
      : '';
    const query = { user: { $in: userIds } };
    if (dayKey) query.date = dayKey;

    const daysSelect = cardsView
      ? 'user date status totalActiveMs anomaly.flagged anomaly.reason sessions.checkInAt sessions.checkOutAt sessions.durationMs'
      : 'user date status totalActiveMs anomaly.flagged anomaly.reason timesheetSubmitted timesheetSubmittedAt taskEntries.description taskEntries.minutes taskEntries.project events.type events.at events._id events.activeMsAtEvent sessions.checkInAt sessions.checkOutAt sessions.durationMs';

    const [onboardingEmails, days] = await Promise.all([
      emailsWithOnboardingPhoto(orgObjectId, needOnboarding),
      PulseWorkDay.find(query)
        .select(daysSelect)
        .sort({ date: -1, updatedAt: -1 })
        .limit(dayKey ? 400 : limit)
        .lean(),
    ]);

    const personById = new Map(
      members.map((person) => {
        const email = String(person.email || '').toLowerCase();
        const httpsAvatar = safeListAvatarUrl(person.avatarUrl);
        const useProxy =
          !httpsAvatar
          && (Boolean(person.hasEmbeddedAvatar) || onboardingEmails.has(email));
        return [
          String(person._id),
          {
            name: personName(person),
            email: person.email || '',
            avatarUrl: httpsAvatar,
            avatarUserId: useProxy ? String(person._id) : '',
          },
        ];
      }),
    );
    const personOf = (id) =>
      personById.get(String(id)) || { name: 'Employee', email: '', avatarUrl: '', avatarUserId: '' };

    if (dayKey) {
      const byUser = new Map(days.map((row) => [String(row.user), row]));
      const rows = members.map((member) => {
        const row = byUser.get(String(member._id));
        return {
          ...serializeAdminDay(row, dayKey, { previewEvents: true, cardsOnly: cardsView }),
          user: member._id,
          ...personOf(member._id),
        };
      });
      rows.sort((a, b) => {
        const aLive = a.status === 'active' ? 0 : 1;
        const bLive = b.status === 'active' ? 0 : 1;
        if (aLive !== bLive) return aLive - bLive;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
      return res.json({ success: true, data: rows });
    }

    res.json({
      success: true,
      data: days.map((d) => ({
        ...serializeAdminDay(d, '', { previewEvents: true, cardsOnly: cardsView }),
        ...personOf(d.user),
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load days' });
  }
});

// GET /api/pulse-checkin/admin/avatar/:userId — BDA account photo, else onboarding photo
router.get('/admin/avatar/:userId', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const userId = String(req.params.userId || '').trim();
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid user' });
    }

    const organizationId = orgIdOf(req.user);
    const orgObjectId = mongoose.Types.ObjectId.isValid(organizationId)
      ? new mongoose.Types.ObjectId(organizationId)
      : organizationId;
    const member = await User.findOne({
      _id: userId,
      $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
    })
      .select('_id email avatarUrl')
      .lean();
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const httpsAvatar = safeListAvatarUrl(member.avatarUrl);
    if (httpsAvatar) {
      return res.redirect(302, httpsAvatar);
    }

    const fromAccount = parseDataUrlImage(member.avatarUrl);
    if (fromAccount?.buffer?.length) {
      res.set('Cache-Control', 'private, max-age=300');
      res.type(fromAccount.mime || 'image/jpeg');
      return res.send(fromAccount.buffer);
    }

    const email = String(member.email || '').toLowerCase();
    if (email) {
      const candidate = await Candidate.findOne({
        organizationId: orgObjectId,
        $or: [{ email }, { officialEmail: email }],
        'photo.data': { $exists: true, $nin: [null, ''] },
      })
        .select('photo')
        .lean();
      const fromOnboarding = parseDataUrlImage(candidate?.photo?.data, candidate?.photo?.mime || 'image/jpeg');
      if (fromOnboarding?.buffer?.length) {
        res.set('Cache-Control', 'private, max-age=300');
        res.type(fromOnboarding.mime || 'image/jpeg');
        return res.send(fromOnboarding.buffer);
      }
    }

    return res.status(404).json({ success: false, message: 'No profile photo' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load avatar' });
  }
});

// GET /api/pulse-checkin/admin/days/detail — full event log for one employee (modal)
router.get('/admin/days/detail', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const userId = String(req.query.user || '').trim();
    const date = todayKey(req.query.date);
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'user is required' });
    }

    const organizationId = orgIdOf(req.user);
    const orgObjectId = mongoose.Types.ObjectId.isValid(organizationId)
      ? new mongoose.Types.ObjectId(organizationId)
      : organizationId;
    const member = await User.findOne({
      _id: userId,
      $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
    })
      .select('_id firstName lastName displayName email avatarUrl')
      .lean();
    if (!member) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const doc = await PulseWorkDay.findOne({ user: member._id, date })
      .select('user date status totalActiveMs targetHours anomaly events sessions taskEntries timesheetSubmitted timesheetSubmittedAt lastHeartbeatAt')
      .lean();

    const name = personName(member);

    const httpsAvatar = safeListAvatarUrl(member.avatarUrl);
    let avatarUserId = '';
    if (!httpsAvatar) {
      if (hasEmbeddedAvatar(member.avatarUrl)) {
        avatarUserId = String(member._id);
      } else {
        const onboarding = await emailsWithOnboardingPhoto(orgObjectId, [member.email]);
        if (onboarding.has(String(member.email || '').toLowerCase())) {
          avatarUserId = String(member._id);
        }
      }
    }

    res.json({
      success: true,
      data: {
        ...serializeAdminDay(doc, date, { previewEvents: false }),
        user: member._id,
        name,
        email: member.email || '',
        avatarUrl: httpsAvatar,
        avatarUserId,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load day detail' });
  }
});

function emptyTimesheet(date) {
  return {
    date,
    taskEntries: [],
    timesheetSubmitted: false,
    timesheetSubmittedAt: null,
    checkInAt: null,
    totalActiveMs: 0,
    totalActiveHours: 0,
    taskMinutes: 0,
  };
}

// GET /api/pulse-checkin/timesheet/today
router.get('/timesheet/today', auth, async (req, res) => {
  try {
    const date = todayKey(req.query.date);
    const doc = await PulseWorkDay.findOne({ user: req.user._id, date });
    res.json({ success: true, data: serializeDay(doc) || emptyTimesheet(date) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load timesheet' });
  }
});

// PUT /api/pulse-checkin/timesheet/today — save draft
router.put('/timesheet/today', auth, async (req, res) => {
  try {
    const date = todayKey(req.body?.date);
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const entries = parseTaskEntries(req.body?.entries);
    const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);
    if (totalMinutes > 16 * 60) {
      return res.status(400).json({ success: false, message: 'Task time cannot exceed 16 hours' });
    }

    const doc = await getOrCreateDay(req.user._id, email, date);
    if (doc.timesheetSubmitted) {
      return res.status(400).json({ success: false, message: 'Timesheet already submitted' });
    }
    doc.email = email;
    doc.taskEntries = entries;
    await doc.save();
    res.json({ success: true, data: serializeDay(doc) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save timesheet' });
  }
});

// POST /api/pulse-checkin/timesheet/submit
router.post('/timesheet/submit', auth, async (req, res) => {
  try {
    const date = todayKey(req.body?.date);
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const entries = parseTaskEntries(req.body?.entries);
    if (!entries.length) {
      return res.status(400).json({ success: false, message: 'Add at least one task with time' });
    }
    const totalMinutes = entries.reduce((sum, item) => sum + item.minutes, 0);
    if (totalMinutes > 16 * 60) {
      return res.status(400).json({ success: false, message: 'Task time cannot exceed 16 hours' });
    }

    const doc = await getOrCreateDay(req.user._id, email, date);
    if (doc.timesheetSubmitted) {
      return res.status(400).json({ success: false, message: 'Timesheet already submitted' });
    }
    const now = new Date();
    doc.email = email;
    doc.taskEntries = entries;
    doc.timesheetSubmitted = true;
    doc.timesheetSubmittedAt = now;
    doc.timesheetHours = Math.round((totalMinutes / 60) * 100) / 100;
    await doc.save();

    await logActivity(
      req.user._id,
      'PULSE_TIMESHEET_SUBMIT',
      `${email} submitted timesheet for ${date}: ${entries.length} task${entries.length === 1 ? '' : 's'}, ${doc.timesheetHours}h`,
      {
        date,
        email,
        hours: doc.timesheetHours,
        tasks: entries.length,
        workDayId: doc._id,
      },
    );

    res.json({ success: true, data: serializeDay(doc) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to submit timesheet' });
  }
});

// POST /api/pulse-checkin/check-in
router.post('/check-in', auth, async (req, res) => {
  try {
    const date = assertWritableDate(req.body?.date);
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const clientActiveMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const location = await enrichLocation(req.body?.location);
    const ip = clientIp(req);
    const userAgent = clientUserAgent(req);
    const now = new Date();

    const doc = await getOrCreateDay(req.user._id, email, date);
    if (doc.status === 'closed') {
      return res.status(400).json({ success: false, message: 'This day is already closed for timesheet' });
    }

    // Idempotent: already checked in with an open session — do not queue another RESUME.
    const openSession = findOpenSession(doc);
    if (doc.status === 'active' && openSession) {
      const trusted = applyTrustedActiveMs(doc, clientActiveMs, now, { allowInflate: false });
      doc.totalActiveMs = trusted.totalActiveMs;
      doc.email = email;
      touchHeartbeat(doc, now);
      await doc.save();
      return res.json({ success: true, data: serializeDay(doc) });
    }

    // Close a dangling open session before opening a new one (tab crash / missed check-out).
    // Always emit CHECK_OUT so the activity queue stays alternating.
    if (openSession) {
      const trustedClose = applyTrustedActiveMs(doc, clientActiveMs, now, { allowInflate: true });
      doc.totalActiveMs = trustedClose.totalActiveMs;
      applyAnomaly(doc, trustedClose.anomaly);
      closeOpenSession(doc, now, { location, ip, userAgent });
      doc.events.push({
        type: 'CHECK_OUT',
        at: now,
        activeMsAtEvent: doc.totalActiveMs,
        ip,
        userAgent,
        location,
      });
      doc.status = 'stopped';
    } else {
      const trusted = applyTrustedActiveMs(doc, clientActiveMs, now, { allowInflate: false });
      doc.totalActiveMs = trusted.totalActiveMs;
    }

    const isResume = Boolean(doc.sessions?.length);
    doc.status = 'active';
    doc.email = email;
    touchHeartbeat(doc, now);

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
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Check-in failed' });
  }
});

// POST /api/pulse-checkin/check-out
router.post('/check-out', auth, async (req, res) => {
  try {
    const date = assertWritableDate(req.body?.date);
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const clientActiveMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const location = await enrichLocation(req.body?.location);
    const ip = clientIp(req);
    const userAgent = clientUserAgent(req);
    const now = new Date();

    const doc = await getOrCreateDay(req.user._id, email, date);
    if (doc.status === 'closed') {
      return res.status(400).json({ success: false, message: 'This day is already closed for timesheet' });
    }

    // Idempotent: nothing open — do not invent a zero-duration session or extra CHECK_OUT.
    const openSession = findOpenSession(doc);
    if (!openSession) {
      const trustedIdle = applyTrustedActiveMs(doc, clientActiveMs, now, { allowInflate: true });
      doc.totalActiveMs = Math.max(Number(doc.totalActiveMs) || 0, trustedIdle.totalActiveMs || 0);
      if (doc.status !== 'stopped') {
        doc.status = 'stopped';
        doc.email = email;
      }
      touchHeartbeat(doc, now);
      await doc.save();
      return res.json({ success: true, data: serializeDay(doc) });
    }

    const trusted = applyTrustedActiveMs(doc, clientActiveMs, now, { allowInflate: true });
    doc.totalActiveMs = trusted.totalActiveMs;
    applyAnomaly(doc, trusted.anomaly);
    doc.status = 'stopped';
    doc.email = email;
    touchHeartbeat(doc, now);

    closeOpenSession(doc, now, { location, ip, userAgent });

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
        anomaly: Boolean(doc.anomaly?.flagged),
      },
    );

    res.json({ success: true, data: serializeDay(doc) });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Check-out failed' });
  }
});

// POST /api/pulse-checkin/sync — heartbeat while checked in (requires open session)
router.post('/sync', auth, async (req, res) => {
  try {
    const date = assertWritableDate(req.body?.date);
    const clientActiveMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const doc = await PulseWorkDay.findOne({ user: req.user._id, date });
    if (!doc) return res.json({ success: true, data: null });

    if (doc.status === 'closed') {
      return res.status(400).json({ success: false, message: 'This day is already closed' });
    }
    if (doc.status !== 'active' || !findOpenSession(doc)) {
      return res.status(400).json({
        success: false,
        message: 'Sync requires an active check-in session',
        code: 'NOT_CHECKED_IN',
      });
    }

    const now = new Date();
    const trusted = applyTrustedActiveMs(doc, clientActiveMs, now, { allowInflate: true });
    doc.totalActiveMs = trusted.totalActiveMs;
    applyAnomaly(doc, trusted.anomaly);
    touchHeartbeat(doc, now);

    const targetMs = (doc.targetHours || TARGET_HOURS) * 3_600_000;
    if (!doc.targetReachedAt && doc.totalActiveMs >= targetMs) {
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
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Sync failed' });
  }
});

// POST /api/pulse-checkin/finalize-day — midnight / new-day timesheet log
router.post('/finalize-day', auth, async (req, res) => {
  try {
    const date = todayKey(req.body?.date); // past days allowed for rollover
    const email = String(req.body?.email || req.user.email || '').toLowerCase();
    const clientActiveMs = Math.max(0, Number(req.body?.activeMs) || 0);
    const location = await enrichLocation(req.body?.location);
    const ip = clientIp(req);
    const userAgent = clientUserAgent(req);
    const now = new Date();

    const doc = await getOrCreateDay(req.user._id, email, date);
    const trusted = applyTrustedActiveMs(doc, clientActiveMs, now, {
      allowInflate: doc.status === 'active',
    });
    doc.totalActiveMs = trusted.totalActiveMs;
    applyAnomaly(doc, trusted.anomaly);
    doc.email = email;
    touchHeartbeat(doc, now);

    closeOpenSession(doc, now, { location, ip, userAgent });

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
    const workDays = pulseWorkDaysOf(req.user);
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
    const workDays = pulseWorkDaysOf(req.user);
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

    leaveBalances = [await loadCasualLeaveBalance(staff)];

    if (staff) {
      const leaveFrom = start < monthFrom ? start : monthFrom
      const leaves = await LeaveRequest.find({
        staff: staff._id,
        status: { $in: ['Pending', 'Approved'] },
        startDate: { $lte: new Date(`${end}T23:59:59`) },
        endDate: { $gte: new Date(`${leaveFrom}T00:00:00`) },
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
          name: personName(req.user),
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

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_HOUR_TARGET = 40;

function dateToKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekStartKey(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - d.getDay());
  return dateToKey(d);
}

function rollingHolidayWindow(now = new Date()) {
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  return { from, to: dateToKey(end) };
}

function policyHolidayEntries(policyHolidays) {
  const byDate = new Map();
  (policyHolidays || []).forEach((entry) => {
    if (typeof entry === 'string') {
      const date = dayKeyOf(entry);
      if (!date) return;
      byDate.set(date, {
        date,
        name: 'Holiday',
      });
      return;
    }
    if (entry && typeof entry === 'object') {
      const date = dayKeyOf(entry.date || entry.day);
      if (!date) return;
      const name = String(entry.name || '').trim() || 'Holiday';
      byDate.set(date, { date, name });
    }
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function collectHolidays(from, to, policyHolidays) {
  const holidays = [];
  policyHolidayEntries(policyHolidays).forEach(({ date, name }) => {
    if (date < from || date > to) return;
    holidays.push({ date, name, kind: 'company' });
  });
  holidays.sort((a, b) => a.date.localeCompare(b.date));
  return holidays;
}

function leaveTypeLabel(type) {
  if (type === 'Sick') return 'Sick leave';
  if (type === 'Custom') return 'Custom leave';
  return 'Casual leave';
}

function toOrgObjectId(organizationId) {
  return mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(organizationId)
    : organizationId;
}

async function orgApproverEmails(orgId, excludeEmail) {
  const orgObjectId = toOrgObjectId(orgId);
  const members = await User.find({
    $or: [{ organizationId: orgObjectId }, { _id: orgObjectId }],
  })
    .select('email role')
    .lean();
  const skip = String(excludeEmail || '').trim().toLowerCase();
  const emails = new Set();
  members.forEach((member) => {
    if (!isPulseAdmin(member)) return;
    const email = String(member.email || '').trim().toLowerCase();
    if (!email || (skip && email === skip)) return;
    emails.add(email);
  });
  return [...emails];
}

async function adjustLeaveBalance(staffId, leaveType, days, direction) {
  const staff = await Staff.findById(staffId);
  if (!staff || !days) return;
  if (!staff.leaveBalance) staff.leaveBalance = { casual: PULSE_CASUAL_ANNUAL, sick: 12 };
  const delta = direction === 'deduct' ? -days : days;
  if (leaveType === 'Casual') {
    staff.leaveBalance.casual = Math.max(0, (staff.leaveBalance.casual ?? PULSE_CASUAL_ANNUAL) + delta);
  } else if (leaveType === 'Sick') {
    staff.leaveBalance.sick = Math.max(0, (staff.leaveBalance.sick ?? 12) + delta);
  }
  await staff.save();
}

function serializeTeamLeave(row) {
  return {
    id: String(row._id),
    type: row.type,
    typeLabel: leaveTypeLabel(row.type),
    startDate: dayKeyOf(row.startDate),
    endDate: dayKeyOf(row.endDate),
    status: row.status,
    reason: row.reason || '',
    days: leaveDurationDays(row.startDate, row.endDate),
    adminNotes: row.adminNotes || '',
    createdAt: row.createdAt,
    staff: {
      id: String(row.staff?._id || row.staff || ''),
      name: row.staff?.fullName || firstName('', row.staff?.email),
      email: row.staff?.email || '',
      employeeId: row.staff?.employeeId || '',
    },
  };
}

function holidayMeta(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAY_SHORT[dt.getDay()]} · ${d} ${MONTH_LABELS[m - 1]} ${y}`;
}

function dashRow(id, title, meta, extra = {}) {
  return { id, title, meta, ...extra };
}

function staffLabel(row) {
  const name = String(row?.fullName || '').trim();
  if (name && !/^pending onboarding$/i.test(name)) return name;
  return firstName('', row?.email);
}

/** Milestone years for the anniversary being celebrated this calendar year. */
function anniversaryYears(join, now) {
  if (!join || Number.isNaN(join.getTime())) return 0;
  return Math.max(0, now.getFullYear() - join.getFullYear());
}

/** Safe local Y-M-D parts from Date or ISO / date-only string (avoids UTC day shift). */
function calendarParts(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
  }
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return { year: dt.getFullYear(), month: dt.getMonth(), day: dt.getDate() };
}

function celebrationSort(today) {
  return (a, b) => {
    const aToday = a.on === today || a.today ? 0 : 1;
    const bToday = b.on === today || b.today ? 0 : 1;
    if (aToday !== bToday) return aToday - bToday;
    const aUpcoming = String(a.on || '') >= today ? 0 : 1;
    const bUpcoming = String(b.on || '') >= today ? 0 : 1;
    if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming;
    return String(a.on || '').localeCompare(String(b.on || ''));
  };
}

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
    const workDays = pulseWorkDaysOf(req.user);
    const workDaySet = new Set(workDays.map((d) => Number(d)));

    const [policy, myDays, leaves] = await Promise.all([
      orgId
        ? LeavePolicy.findOne({ user: orgId }).lean().catch(() => null)
        : Promise.resolve(null),
      PulseWorkDay.find({
        user: req.user._id,
        date: { $gte: from, $lte: to },
      })
        .sort({ date: 1 })
        .lean(),
      orgId
        ? LeaveRequest.find({
            admin: orgId,
            status: 'Approved',
            startDate: { $lte: new Date(`${to}T23:59:59`) },
            endDate: { $gte: new Date(`${from}T00:00:00`) },
          })
            .populate('staff', 'fullName email')
            .sort({ startDate: 1 })
            .lean()
            .catch(() => [])
        : Promise.resolve([]),
    ]);

    const holidays = collectHolidays(from, to, policy?.holidays);
    const holidaySet = new Set(holidays.map((row) => row.date));

    const teamLeave = leaves.map((row) => {
      const name = row.staff?.fullName || firstName('', row.staff?.email);
      const days = enumerateKeys(dayKeyOf(row.startDate), dayKeyOf(row.endDate))
        .filter((key) => key >= from && key <= to);
      const type = leaveTypeLabel(row.type);
      return {
        id: String(row._id),
        name,
        initial: initialOf(name),
        type,
        leaveType: row.type,
        startDate: dayKeyOf(row.startDate),
        endDate: dayKeyOf(row.endDate),
        days,
      };
    }).filter((row) => row.days.length);

    const leaveDates = [...new Set(teamLeave.flatMap((row) => row.days))];
    const myLeave = new Set();
    const staff = await linkedStaff(req.user).catch(() => null);
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

// GET /api/pulse-checkin/dashboard — My Space widget board (live)
router.get('/dashboard', auth, async (req, res) => {
  try {
    const now = new Date();
    const today = todayKey();
    const orgId = orgIdOf(req.user);
    const weekFrom = weekStartKey(now);
    const weekTo = shiftKey(weekFrom, 6);
    const monthFrom = `${today.slice(0, 7)}-01`;
    const yearFrom = `${now.getFullYear()}-01-01`;
    const holidayWindow = rollingHolidayWindow(now);
    const workDays = pulseWorkDaysOf(req.user);
    const workDaySet = new Set(workDays.map((d) => Number(d)));
    const staff = await linkedStaff(req.user);
    const pendingQuery = isPulseAdmin(req.user)
      ? { admin: orgId, status: 'Pending' }
      : staff
        ? { staff: staff._id, status: 'Pending' }
        : null;

    const [
      weekDocs,
      monthDocs,
      policy,
      announcements,
      orgPeople,
      yearLeaves,
      pendingLeaves,
      assignedTasks,
      myFiles,
    ] = await Promise.all([
      PulseWorkDay.find({
        user: req.user._id,
        date: { $gte: weekFrom, $lte: weekTo },
      }).lean(),
      PulseWorkDay.find({
        user: req.user._id,
        date: { $gte: monthFrom, $lte: today },
      }).lean(),
      LeavePolicy.findOne({ user: orgId }).lean(),
      Announcement.find({
        user: orgId,
        isActive: true,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Staff.find({ user: orgId })
        .select('fullName email department dob joiningDate')
        .limit(500)
        .lean(),
      staff
        ? LeaveRequest.find({
            staff: staff._id,
            startDate: { $lte: new Date(`${now.getFullYear()}-12-31T23:59:59`) },
            endDate: { $gte: new Date(`${yearFrom}T00:00:00`) },
          })
            .select('type startDate endDate status')
            .lean()
        : Promise.resolve([]),
      pendingQuery
        ? LeaveRequest.find(pendingQuery)
            .sort({ createdAt: -1 })
            .limit(8)
            .populate('staff', 'fullName email')
            .lean()
        : Promise.resolve([]),
      staff
        ? AssignedTask.find({
            staff: staff._id,
            status: { $in: ['Pending', 'Accepted', 'In Progress'] },
          })
            .sort({ dueDate: 1, createdAt: -1 })
            .limit(8)
            .lean()
        : Promise.resolve([]),
      collectMyFiles(req.user).catch(() => []),
    ]);

    const holidaysRaw = collectHolidays(holidayWindow.from, holidayWindow.to, policy?.holidays);
    const holidaySet = new Set(holidaysRaw.map((row) => row.date));
    const weekByDate = new Map(weekDocs.map((row) => [row.date, row]));
    const monthByDate = new Map(monthDocs.map((row) => [row.date, row]));
    const weekLeave = new Set();
    const monthLeave = new Set();
    const usedByType = { Casual: 0, Sick: 0, Custom: 0 };

    yearLeaves.forEach((row) => {
      const keys = enumerateKeys(dayKeyOf(row.startDate), dayKeyOf(row.endDate));
      if (row.status === 'Pending' || row.status === 'Approved') {
        keys.forEach((key) => {
          if (key >= weekFrom && key <= weekTo) weekLeave.add(key);
          if (key >= monthFrom && key <= today) monthLeave.add(key);
        });
      }
      if (row.status === 'Approved' && usedByType[row.type] != null) {
        usedByType[row.type] += leaveDurationDays(row.startDate, row.endDate);
      }
    });

    const casual = await loadCasualLeaveBalance(staff);
    let weekPresent = 0;
    let weekAbsent = 0;
    enumerateKeys(weekFrom, weekTo).forEach((key) => {
      const weekend = !workDaySet.has(weekdayOf(key));
      if (weekend || holidaySet.has(key) || weekLeave.has(key) || key > today) return;
      const row = weekByDate.get(key);
      const presentDay = recordIsPresent(row) || (key === today && row?.status === 'active');
      if (key === today && !presentDay) return;
      if (presentDay) weekPresent += 1;
      else weekAbsent += 1;
    });

    let present = 0;
    let absent = 0;
    let workdayCount = 0;
    enumerateKeys(monthFrom, today).forEach((key) => {
      const weekend = !workDaySet.has(weekdayOf(key));
      if (weekend || holidaySet.has(key) || monthLeave.has(key)) return;
      const row = monthByDate.get(key);
      const isToday = key === today;
      const presentDay = recordIsPresent(row) || (isToday && row?.status === 'active');
      if (isToday && !presentDay) return;
      workdayCount += 1;
      if (presentDay) present += 1;
      else absent += 1;
    });

    const weekHours = Math.round(
      weekDocs.reduce((sum, row) => sum + msToHours(row.totalActiveMs), 0) * 100,
    ) / 100;
    const todayHours = msToHours(weekByDate.get(today)?.totalActiveMs);
    const mtdPct = workdayCount > 0 ? Math.round((present / workdayCount) * 100) : null;
    const monthLabel = `${MONTH_LABELS[now.getMonth()]} ${now.getFullYear()}`;

    const thisMonth = now.getMonth();
    const hireCutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 14);
    const birthday = [];
    const newHires = [];
    const workAnniv = [];
    orgPeople.forEach((person) => {
      const name = staffLabel(person);
      const dept = person.department || 'Team';
      const dobParts = calendarParts(person.dob);
      if (dobParts && dobParts.month === thisMonth) {
        const on = `${now.getFullYear()}-${String(dobParts.month + 1).padStart(2, '0')}-${String(dobParts.day).padStart(2, '0')}`;
        const isTodayBday = on === today;
        birthday.push(dashRow(
          `b-${person._id}`,
          name,
          dept,
          {
            on,
            when: isTodayBday ? 'Today' : `${dobParts.day} ${MONTH_LABELS[dobParts.month]}`,
            today: isTodayBday,
          },
        ));
      }
      const joinParts = calendarParts(person.joiningDate);
      if (joinParts) {
        const join = new Date(joinParts.year, joinParts.month, joinParts.day);
        const joinKey = dateToKey(join);
        if (join >= hireCutoff && joinKey <= today) {
          newHires.push(dashRow(
            `n-${person._id}`,
            name,
            `Joined ${joinParts.day} ${MONTH_LABELS[joinParts.month]} · ${dept}`,
          ));
        }
        if (joinParts.month === thisMonth) {
          const years = anniversaryYears(join, now);
          if (years >= 1) {
            const on = `${now.getFullYear()}-${String(joinParts.month + 1).padStart(2, '0')}-${String(joinParts.day).padStart(2, '0')}`;
            const isTodayAnniv = on === today;
            workAnniv.push(dashRow(
              `w-${person._id}`,
              name,
              `${years} year${years === 1 ? '' : 's'} · ${dept}`,
              {
                on,
                when: isTodayAnniv ? 'Today' : `${joinParts.day} ${MONTH_LABELS[joinParts.month]}`,
                today: isTodayAnniv,
                years,
              },
            ));
          }
        }
      }
    });
    birthday.sort(celebrationSort(today));
    workAnniv.sort(celebrationSort(today));
    newHires.sort((a, b) => String(a.meta).localeCompare(String(b.meta)));

    const tasks = [
      ...pendingLeaves.map((row) => dashRow(
        String(row._id),
        `${row.type || 'Leave'} · ${dayKeyOf(row.startDate)} – ${dayKeyOf(row.endDate)}`,
        `Due ${dayKeyOf(row.startDate) || today} · ${row.staff?.fullName || row.staff?.email || 'Team'}`,
        { to: 'leave' },
      )),
      ...assignedTasks.map((row) => dashRow(
        `task-${row._id}`,
        row.title,
        `Due ${dayKeyOf(row.dueDate) || '—'}`,
        { to: 'tasks' },
      )),
    ].slice(0, 8);

    res.json({
      success: true,
      data: {
        attendance: [
          dashRow(
            'att-week',
            'This week',
            `${weekPresent} present · ${weekAbsent} absent`,
            { to: 'attendance' },
          ),
          dashRow(
            'att-mtd',
            'Month to date',
            mtdPct == null
              ? 'No workdays yet'
              : `${mtdPct}% present · ${present} of ${workdayCount} days`,
            { to: 'attendance' },
          ),
        ],
        hours: [
          dashRow(
            'hours-week',
            'This week',
            `${weekHours} h of ${WEEK_HOUR_TARGET} h`,
            { to: 'hours' },
          ),
          dashRow(
            'hours-today',
            'Today',
            todayHours > 0 ? `${todayHours} h logged` : 'Not started',
            { to: 'hours' },
          ),
        ],
        leaveReport: [
          dashRow(
            'leave-casual',
            'Casual leave',
            `${casual.used} used · ${casual.remaining} left`,
            { to: 'leave' },
          ),
          dashRow(
            'leave-sick',
            'Sick leave',
            `${usedByType.Sick} used this year`,
            { to: 'leave' },
          ),
          dashRow(
            'leave-custom',
            'Custom leave',
            `${usedByType.Custom} used this year`,
            { to: 'leave' },
          ),
        ],
        holidays: holidaysRaw.map((row) => dashRow(
          `h-${row.date}`,
          row.name,
          holidayMeta(row.date),
          { on: row.date, to: 'holidays' },
        )),
        announcements: announcements.map((row) => dashRow(
          String(row._id),
          row.title,
          row.message ? String(row.message).slice(0, 80) : (row.priority || 'All hands'),
          { on: dayKeyOf(row.startDate || row.createdAt) || today },
        )),
        tasks,
        birthday: birthday.slice(0, 8),
        newHires: newHires.slice(0, 8),
        workAnniv: workAnniv.slice(0, 8),
        weddingAnniv: [],
        files: Array.isArray(myFiles) ? myFiles.slice(0, 40) : [],
        engagement: [],
        favorites: [
          dashRow('fav-overview', 'Overview', 'Check-in', { to: 'overview' }),
          dashRow('fav-attendance', 'Attendance', `${weekPresent} present this week`, { to: 'attendance' }),
          dashRow('fav-hours', 'Hours', `${weekHours} h this week`, { to: 'hours' }),
          dashRow('fav-leave', 'Leave Tracker', `${casual.remaining} casual days left`, { to: 'leave' }),
          dashRow('fav-calendar', 'Calendar', monthLabel, { to: 'calendar' }),
        ],
        quickLinks: [
          dashRow('ql-leave', 'Apply leave', 'Leave Tracker', { to: 'leave' }),
          dashRow('ql-calendar', 'Calendar', 'Month view', { to: 'calendar' }),
          dashRow('ql-holidays', 'Holidays', 'This year', { to: 'holidays' }),
          dashRow('ql-attendance', 'Attendance', 'My Space', { to: 'attendance' }),
          dashRow('ql-hours', 'Hours', 'Logged from check-in', { to: 'hours' }),
        ],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load dashboard' });
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
        attachment: row.attachment?.name
          ? { name: row.attachment.name, url: row.attachment.url || '', size: row.attachment.size || 0 }
          : null,
      })),
      casual: await loadCasualLeaveBalance(staff),
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
        message: 'No employee profile is linked to this BDA OS account yet.',
      });
    }
    const days = leaveDurationDays(startDate, endDate);
    if (type === 'Casual') {
      const balance = await loadCasualLeaveBalance(staff);
      if (days > balance.remaining) {
        return res.status(400).json({
          success: false,
          message: `Only ${balance.remaining} casual day(s) left this year.`,
        });
      }
    }
    const rawFile = req.body?.attachment && typeof req.body.attachment === 'object' ? req.body.attachment : null
    const fileName = String(rawFile?.name || '').trim().slice(0, 180)
    const fileData = String(rawFile?.data || '')
    const fileMime = String(rawFile?.mime || '').trim()
    const fileSize = Number(rawFile?.size) || 0
    if (rawFile && (!fileName || !fileData.startsWith('data:'))) {
      return res.status(400).json({ success: false, message: 'Attachment is not a valid file' })
    }
    if (fileSize > 5 * 1024 * 1024) {
      return res.status(400).json({ success: false, message: 'Attachment must be 5 MB or smaller' })
    }
    let savedAttachment = null
    if (fileName && fileData) {
      let url = ''
      if (process.env.CLOUDINARY_CLOUD_NAME) {
        try {
          url = await uploadBase64(fileData, `payroll_portal/leave/${staff._id}`)
        } catch {
          url = ''
        }
      }
      savedAttachment = { name: fileName, mime: fileMime, size: fileSize, url }
    }

    const leave = await LeaveRequest.create({
      staff: staff._id,
      admin: orgIdOf(req.user),
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason: String(reason).trim(),
      status: 'Pending',
      attachment: savedAttachment || undefined,
    });

    // Casual/Sick days are reserved via Pending leave rows; loadCasualLeaveBalance
    // recomputes remaining from those requests (no separate deduct needed for Casual).
    if (type === 'Sick') {
      await adjustLeaveBalance(staff._id, type, days, 'deduct');
    }

    // A mail failure must not lose a saved request, so report it instead of throwing.
    let notified = false;
    const employeeName = staff.fullName || [req.user.firstName, req.user.lastName].filter(Boolean).join(' ');
    const employeeEmail = staff.email || req.user.email;
    const mailPayload = {
      employeeName,
      employeeEmail,
      leaveType: type,
      fromDate: formatLeaveDate(leave.startDate),
      toDate: formatLeaveDate(leave.endDate),
      days,
      reason: leave.reason,
      reviewUrl: `${getProductionBaseUrl()}/bda-os`,
      companyName: req.user.companyName || '',
      attachments: fileName && fileData
        ? [{ filename: fileName, content: fileData }]
        : undefined,
    };
    const recipients = new Set(await orgApproverEmails(orgIdOf(req.user), employeeEmail));
    if (notifyEmail) recipients.add(String(notifyEmail).trim().toLowerCase());
    if (recipients.size) {
      try {
        await Promise.all(
          [...recipients].map((to) => sendLeaveRequestEmail({ ...mailPayload, to })),
        );
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
      casual: await loadCasualLeaveBalance(staff),
      data: {
        id: String(leave._id),
        type: leave.type,
        startDate: leave.startDate,
        endDate: leave.endDate,
        status: leave.status,
        reason: leave.reason,
        days,
        attachment: savedAttachment
          ? { name: savedAttachment.name, url: savedAttachment.url || '', size: savedAttachment.size || 0 }
          : null,
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
        message: 'No employee profile is linked to this BDA OS account yet.',
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
    const remainingFor = async (staff) => {
      const key = String(staff._id);
      if (!casualLeft.has(key)) {
        const bal = await loadCasualLeaveBalance(staff);
        casualLeft.set(key, bal.remaining);
      }
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
        errors.push('No employee profile is linked to this BDA OS account yet');
      }

      if (!type) errors.push(`${rawType || 'Leave type'} is not a supported leave type`);
      if (Number.isNaN(startDate.getTime())) errors.push('From is not a valid date');
      if (Number.isNaN(endDate.getTime())) errors.push('To is not a valid date');
      if (!errors.length && endDate < startDate) errors.push('To cannot be earlier than From');

      const days = errors.length ? 0 : leaveDurationDays(startDate, endDate);
      if (!errors.length && type === 'Casual') {
        const left = await remainingFor(target);
        if (days > left) errors.push(`Only ${left} casual day(s) left this year`);
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
      if (type === 'Casual') {
        // Remaining comes from Pending/Approved rows via loadCasualLeaveBalance
        casualLeft.set(String(target._id), (await remainingFor(target)) - days);
      } else if (type === 'Sick') {
        await adjustLeaveBalance(target._id, type, days, 'deduct');
      }
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

// GET /api/pulse-checkin/leaves/team — company leave board (pending for admins + on-leave list)
router.get('/leaves/team', auth, async (req, res) => {
  try {
    const orgId = orgIdOf(req.user);
    const admin = isPulseAdmin(req.user);
    const from = dayKeyOf(req.query.from) || null;
    const to = dayKeyOf(req.query.to) || null;
    const query = { admin: orgId };
    if (!admin) query.status = 'Approved';
    if (from && to) {
      query.startDate = { $lte: new Date(`${to}T23:59:59`) };
      query.endDate = { $gte: new Date(`${from}T00:00:00`) };
    }

    const rows = await LeaveRequest.find(query)
      .populate('staff', 'fullName email employeeId leaveBalance')
      .sort({ createdAt: -1 })
      .limit(admin ? 300 : 200)
      .lean();

    const mapped = rows.map(serializeTeamLeave);
    const pending = admin ? mapped.filter((row) => row.status === 'Pending') : [];
    const approved = mapped.filter((row) => row.status === 'Approved');
    const onLeave = approved.filter((row) => {
      if (!from || !to) return true;
      return row.startDate <= to && row.endDate >= from;
    });

    res.json({
      success: true,
      data: {
        pending,
        onLeave,
        all: admin ? mapped : approved,
        isAdmin: admin,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load team leave' });
  }
});

// POST /api/pulse-checkin/leaves/:id/respond — admin/superadmin approve or reject
router.post('/leaves/:id/respond', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const status = String(req.body?.status || '').trim();
    if (status !== 'Approved' && status !== 'Rejected') {
      return res.status(400).json({ success: false, message: 'Status must be Approved or Rejected' });
    }
    const orgId = orgIdOf(req.user);
    const leave = await LeaveRequest.findOne({ _id: req.params.id, admin: orgId });
    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave request not found' });
    }

    const prevStatus = leave.status;
    leave.status = status;
    leave.adminNotes = String(req.body?.adminNotes || '').trim().slice(0, 500);
    await leave.save();

    const days = leaveDurationDays(leave.startDate, leave.endDate);
    // Casual remaining is derived from Pending + Approved requests.
    // Sick (and undo paths) still adjust the stored sick balance.
    if (leave.type !== 'Casual') {
      if (status === 'Rejected' && prevStatus === 'Pending') {
        await adjustLeaveBalance(leave.staff, leave.type, days, 'restore');
      } else if (status === 'Approved' && prevStatus === 'Rejected') {
        await adjustLeaveBalance(leave.staff, leave.type, days, 'deduct');
      } else if (status !== 'Approved' && prevStatus === 'Approved') {
        await adjustLeaveBalance(leave.staff, leave.type, days, 'restore');
      }
    } else {
      // Keep leaveBalance.casual aligned after status change
      const staffDoc = await Staff.findById(leave.staff);
      if (staffDoc) await loadCasualLeaveBalance(staffDoc);
    }

    await logActivity(
      req.user._id,
      'PULSE_LEAVE_RESPOND',
      `${req.user.email} marked leave ${leave._id} as ${status}`,
      { leaveId: String(leave._id), status },
    );

    const populated = await LeaveRequest.findById(leave._id)
      .populate('staff', 'fullName email employeeId')
      .lean();

    res.json({
      success: true,
      message: `Leave ${status.toLowerCase()}`,
      data: serializeTeamLeave(populated),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to update leave request' });
  }
});

// GET /api/pulse-checkin/holidays?year=2026
router.get('/holidays', auth, async (req, res) => {
  try {
    const orgId = orgIdOf(req.user);
    const year = Number(req.query.year) || new Date().getFullYear();
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const policy = await LeavePolicy.findOne({ user: orgId }).lean();
    const holidays = policyHolidayEntries(policy?.holidays)
      .filter((row) => row.date >= from && row.date <= to)
      .map((row) => ({
        id: row.date,
        date: row.date,
        name: row.name,
        classification: 'Holiday',
      }));
    res.json({
      success: true,
      data: holidays,
      year,
      canEdit: isPulseAdmin(req.user),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to load holidays' });
  }
});

// PUT /api/pulse-checkin/holidays — admin/superadmin year holiday plan
router.put('/holidays', auth, async (req, res) => {
  try {
    if (!isPulseAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }
    const orgId = orgIdOf(req.user);
    const year = Number(req.body?.year) || new Date().getFullYear();
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const incoming = Array.isArray(req.body?.holidays) ? req.body.holidays : null;
    if (!incoming) {
      return res.status(400).json({ success: false, message: 'holidays array is required' });
    }

    const yearHolidays = [];
    const seen = new Set();
    incoming.forEach((row) => {
      const date = dayKeyOf(row?.date || row);
      if (!date || date < from || date > to || seen.has(date)) return;
      const name = String(row?.name || '').trim() || 'Holiday';
      yearHolidays.push({ date, name });
      seen.add(date);
    });
    yearHolidays.sort((a, b) => a.date.localeCompare(b.date));

    let policy = await LeavePolicy.findOne({ user: orgId });
    if (!policy) {
      policy = new LeavePolicy({
        user: orgId,
        casualLeave: { daysPerMonth: 1, daysPerYear: PULSE_CASUAL_ANNUAL, isPaid: true },
        sickLeave: { daysPerMonth: 1, daysPerYear: 12, isPaid: true },
        holidays: [],
      });
    }

    const kept = policyHolidayEntries(policy.holidays).filter(
      (row) => row.date < from || row.date > to,
    );
    policy.holidays = [...kept, ...yearHolidays];
    await policy.save();

    await logActivity(
      req.user._id,
      'PULSE_HOLIDAYS_UPDATE',
      `${req.user.email} updated ${year} company holidays (${yearHolidays.length})`,
      { year, count: yearHolidays.length },
    );

    res.json({
      success: true,
      data: yearHolidays.map((row) => ({
        id: row.date,
        date: row.date,
        name: row.name,
        classification: 'Holiday',
      })),
      year,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'Failed to save holidays' });
  }
});

module.exports = router;
