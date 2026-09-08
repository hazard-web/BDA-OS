const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns');
require('dotenv').config();

// Node 18+ / 24 often fail outbound HTTPS with "fetch failed" when IPv6 is broken.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* ignore */
}

mongoose.set('bufferCommands', false);
mongoose.set('autoIndex', false);

const payslipRoutes = require('./routes/payslip');
const { router: authRoutes } = require('./routes/auth');
const oauthRoutes = require('./routes/oauth');
const staffRoutes = require('./routes/staff');
const { router: staffPortalRoutes } = require('./routes/staffPortal');
const attendanceRoutes = require('./routes/attendance');
const activitiesRoutes = require('./routes/activities');
const leavesRoutes = require('./routes/leaves');
const leavePolicyRoutes = require('./routes/leave-policy');
const notificationsRoutes = require('./routes/notifications');
const supportRoutes = require('./routes/support');
const announcementsRoutes = require('./routes/announcements');
const assignedTasksRoutes = require('./routes/assignedTasks');
const searchRoutes = require('./routes/search');
const pulseCheckInRoutes = require('./routes/pulseCheckIn');
const pulseZipRoutes = require('./routes/pulseZip');
const inviteRoutes = require('./routes/invites');
const launcherRoutes = require('./routes/launcher');
const candidateRoutes = require('./routes/candidates');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.set('trust proxy', 1);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// ── Global Request Logger ──────────────────────────────────────
// Logs every incoming HTTP request and its final response code
// so you can see the entire request lifecycle in the terminal.
app.use((req, res, next) => {
  const start = Date.now();
  const ts = new Date().toISOString();
  console.log(`\n📥 [${ts}] ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length > 0) {
    // Mask the password field before logging
    const safeBody = { ...req.body };
    if (safeBody.password) safeBody.password = '****';
    console.log('   📦 Body:', JSON.stringify(safeBody));
  }
  res.on('finish', () => {
    const duration = Date.now() - start;
    const icon = res.statusCode >= 500 ? '🔴' : res.statusCode >= 400 ? '🟡' : '🟢';
    console.log(`${icon} [${ts}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Health check stays DB-independent so local debugging and Render probes are instant.
app.get('/', (req, res) => {
  res.json({ status: 'OK', service: 'people-os-api' });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Payslip Generator API is running',
    dbState: mongoose.connection.readyState,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/test-query', async (req, res) => {
  try {
    const Staff = require('./models/Staff');
    console.log('⚡ [test-query] Querying Staff...');
    const s = await Staff.findOne({ email: 'vg810200@gmail.com' }).lean();
    console.log('⚡ [test-query] Query completed! Found:', !!s);
    res.json({ success: true, found: !!s, staff: s });
  } catch (err) {
    console.error('⚡ [test-query] Query failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const DB_READY_TIMEOUT_MS = 15000;

// Ensure API data routes do not sit on Mongoose's long query buffering when
// Atlas is blocked/slow. Return a clear 503 quickly instead.
app.use('/api', async (req, res, next) => {
  // OAuth start must redirect even when Atlas is still connecting.
  // Callback still waits for DB below.
  const apiPath = (req.path || '').split('?')[0];
  const isOAuthStart =
    req.method === 'GET' &&
    apiPath.startsWith('/auth/oauth/') &&
    !apiPath.endsWith('/callback');
  if (isOAuthStart) return next();

  if (mongoose.connection.readyState === 1) return next();

  try {
    await Promise.race([
      ensureMongoConnection(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Database connection timed out')), DB_READY_TIMEOUT_MS)
      ),
    ]);
    return next();
  } catch (err) {
    return res.status(503).json({
      success: false,
      message:
        'Database is unreachable. In MongoDB Atlas, add your current IP in Network Access and wait 1-2 minutes.',
      code: 'DB_UNREACHABLE',
    });
  }
});

// Routes
app.use('/api/payslips', payslipRoutes);
app.use('/api/auth/oauth', oauthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/portal', staffPortalRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/leaves', leavesRoutes);
app.use('/api/leave-policy', leavePolicyRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/announcements', announcementsRoutes);
app.use('/api/assigned-tasks', assignedTasksRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/pulse-checkin', pulseCheckInRoutes);
app.use('/api/pulse-zip', pulseZipRoutes);
app.use('/api/invites', inviteRoutes);
app.use('/api/launcher', launcherRoutes);
app.use('/api/candidates', candidateRoutes);

const path = require('path');

// UAT/production API-only (Render / Hostinger). Vercel hosts the frontend.
// Set SERVE_FRONTEND=true only if this Node process should also ship the SPA.
const serveFrontend = !process.env.VERCEL && process.env.SERVE_FRONTEND === 'true';
if (serveFrontend) {
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.use(express.static(frontendDist));
}

// API 404 handler
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API Route not found' });
});

if (serveFrontend) {
  const frontendDist = path.join(__dirname, '../frontend/dist');
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('\n🔴 ═══════════════════════════════════════════');
  console.error(`🔴 UNHANDLED SERVER ERROR - ${req.method} ${req.originalUrl}`);
  console.error('🔴 Name   :', err.name);
  console.error('🔴 Message:', err.message);
  if (err.stack) console.error('🔴 Stack  :\n', err.stack);
  console.error('🔴 ═══════════════════════════════════════════\n');

  // Detect MongoDB connection problems and surface a clear, actionable message
  const msg = (err?.message || '').toLowerCase();
  const isMongoDown =
    err?.name === 'MongooseServerSelectionError' ||
    err?.name === 'MongoServerSelectionError' ||
    msg.includes('whitelisted') ||
    msg.includes('could not connect to any servers') ||
    msg.includes('econnrefused') ||
    msg.includes('mongonetworkerror') ||
    msg.includes('buffering timed out') ||
    msg.includes('no primary found') ||
    msg.includes('replicasetnoprimary');

  if (isMongoDown) {
    return res.status(503).json({
      success: false,
      message:
        'Database is unreachable. If using MongoDB Atlas, add your current IP to the cluster whitelist (Network Access → Add IP Address → Allow Access from Anywhere for testing).',
      code: 'DB_UNREACHABLE',
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Connect to MongoDB then start server (updated URI database path)
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/payslip_generator';
const { runShiftCheck, runOfficeClosingCheck } = require('./utils/cronJobs');
const http = require('http');

// Cache the Mongoose connection promise across serverless invocations so
// we don't open a brand-new Atlas connection on every cold start.
let mongooseConnectionPromise = null;
function ensureMongoConnection() {
  if (mongooseConnectionPromise) return mongooseConnectionPromise;
  mongooseConnectionPromise = mongoose.connect(MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    maxPoolSize: 2,
  });
  // Reset the cache on hard failure so a future request can retry
  mongooseConnectionPromise.catch(() => {
    mongooseConnectionPromise = null;
  });
  return mongooseConnectionPromise;
}

if (!process.env.VERCEL) {
  // Get local IP address on startup so user knows how to access from mobile
  const os = require('os');
  const getLocalIP = () => {
    try {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
          if (iface.family === 'IPv4' && !iface.internal) {
            return iface.address;
          }
        }
      }
    } catch {
      /* network interface enumeration not available in this environment */
    }
    return 'localhost';
  };

  // Start the HTTP server FIRST so requests get clean error responses
  // even when the database is down. This avoids HTTP 000 / connection-refused.
  const server = http.createServer(app);
  server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP();
    console.log(`🚀 Server running locally  → http://localhost:${PORT}`);
    if (localIP !== 'localhost') console.log(`🚀 Server running on network → http://${localIP}:${PORT}`);
    console.log(`📋 API Health               → http://localhost:${PORT}/api/health`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`⚠️  Port ${PORT} is in use. Exiting so nodemon can restart cleanly...`);
      process.exit(0);
    } else {
      console.error('❌ Server error:', err.message);
      process.exit(1);
    }
  });

  // In development Vercel crons don't fire, so run checks locally.
  // Shift check runs every hour; office-closing checks run every 5 minutes
  // with a time-window guard so they fire only once per day.
  const ONE_HOUR     = 60 * 60 * 1000;
  const FIVE_MINUTES = 5  * 60 * 1000;


  setInterval(async () => {
    console.log('⏰ [local cron] Running shift check...');
    try {
      const r = await runShiftCheck();
      console.log(`✅ [local cron] autoClosed=${r.autoClosed} remindersSent=${r.remindersSent}`);
    } catch (err) {
      console.error('❌ [local cron] Shift check failed:', err.message);
    }
  }, ONE_HOUR);

  setInterval(async () => {
    try {
      const r = await runOfficeClosingCheck();
      if (r.action === 'reminder') {
        console.log(`[office-cron] 7:00 PM IST reminders sent: ${r.remindersSent}`);
      } else if (r.action === 'autoClose') {
        console.log(`[office-cron] 7:30 PM IST auto-closed: ${r.autoClosed}`);
      }
    } catch (err) {
      console.error('[office-cron] Office closing check failed:', err.message);
    }
  }, FIVE_MINUTES);

  console.log('⏰ Local shift-check cron scheduled (every 1 hour)');
  console.log('🕖 Office closing cron scheduled (every 5 minutes - fires at 7:00 PM & 7:30 PM IST)');
}

// Eagerly establish the Mongo connection on cold start so the first
// request doesn't pay the connection cost. Safe to call repeatedly.
ensureMongoConnection()
  .then(() => {
    console.log('✅ Connected to MongoDB');
    console.log('🌐 DB HOST:', mongoose.connection.host);
    console.log('📂 DB NAME:', mongoose.connection.name);
  })
  .catch((err) => {
    console.error('❌ MongoDB connection error (server is still up - requests will return DB_UNREACHABLE until DB is reachable):');
    console.error(err.message);
  });


// Export the app so Vercel Serverless Functions can use it
module.exports = app;
