const path = require('path');
const { spawn } = require('child_process');
const EntryLog = require('../models/EntryLog');
const Visitor = require('../models/Visitor');
const Delivery = require('../models/Delivery');
const FacilityReservation = require('../models/FacilityReservation');
const Complaint = require('../models/Complaint');
const User = require('../models/User');

const ANALYTICS_SCRIPT_PATH = path.join(__dirname, '..', 'ai', 'analytics_engine.py');
const DEFAULT_WINDOW_DAYS = 30;
const MIN_WINDOW_DAYS = 7;
const MAX_WINDOW_DAYS = 180;
const PYTHON_TIMEOUT_MS = Number(process.env.ANALYTICS_TIMEOUT_MS || 60000);
const ANALYTICS_CACHE_TTL_MS = Number(process.env.ANALYTICS_CACHE_TTL_MS || 5 * 60 * 1000);
const MAX_ANALYTICS_RECORDS = Number(process.env.ANALYTICS_MAX_RECORDS || 1000);

const analyticsCache = new Map();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const parseWindowDays = (rawValue) => {
  const numericValue = Number(rawValue);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_WINDOW_DAYS;
  }

  return clamp(Math.round(numericValue), MIN_WINDOW_DAYS, MAX_WINDOW_DAYS);
};

const getPythonCommands = () => {
  const customExecutable = String(process.env.PYTHON_EXECUTABLE || '').trim();
  const commands = [];

  if (customExecutable) {
    commands.push({ command: customExecutable, args: [] });
  }

  if (process.platform === 'win32') {
    commands.push(
      { command: 'python', args: [] },
      { command: 'py', args: ['-3'] },
      { command: 'py', args: [] }
    );
  } else {
    commands.push(
      { command: 'python3', args: [] },
      { command: 'python', args: [] }
    );
  }

  return commands;
};

const executePythonCommand = (pythonCommand, payload) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      pythonCommand.command,
      [...pythonCommand.args, ANALYTICS_SCRIPT_PATH],
      {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finalizeError = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      reject(error);
    };

    const finalizeSuccess = (value) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
    };

    const timeoutId = setTimeout(() => {
      child.kill();
      finalizeError(new Error('Python analytics engine timed out'));
    }, PYTHON_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      finalizeError(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (code !== 0) {
        return finalizeError(
          new Error(
            stderr.trim() ||
              `Python analytics engine exited with code ${code}`
          )
        );
      }

      const output = stdout.trim();

      if (!output) {
        return finalizeError(new Error('Python analytics engine returned no output'));
      }

      try {
        finalizeSuccess(JSON.parse(output));
      } catch (error) {
        finalizeError(
          new Error(`Invalid analytics payload returned by Python: ${error.message}`)
        );
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });

const runPythonAnalytics = async (payload) => {
  const errors = [];

  for (const pythonCommand of getPythonCommands()) {
    try {
      return await executePythonCommand(pythonCommand, payload);
    } catch (error) {
      errors.push(`${pythonCommand.command} ${pythonCommand.args.join(' ')}`.trim() + `: ${error.message}`);
    }
  }

  throw new Error(`Unable to run Python analytics engine. ${errors.join(' | ')}`);
};

const getCacheKey = (windowDays) => `overview:${windowDays}`;

const getCachedAnalytics = (cacheKey, { allowExpired = false } = {}) => {
  const cached = analyticsCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (Date.now() - cached.createdAt > ANALYTICS_CACHE_TTL_MS) {
    if (!allowExpired) {
      analyticsCache.delete(cacheKey);
      return null;
    }

    return {
      ...cached.analytics,
      cached: true,
      stale: true,
      cacheGeneratedAt: new Date(cached.createdAt).toISOString()
    };
  }

  return {
    ...cached.analytics,
    cached: true,
    cacheGeneratedAt: new Date(cached.createdAt).toISOString()
  };
};

const setCachedAnalytics = (cacheKey, analytics) => {
  analyticsCache.set(cacheKey, {
    createdAt: Date.now(),
    analytics
  });
};

const buildAnalyticsPayload = ({
  windowDays,
  windowStart,
  totalResidents,
  unresolvedComplaints,
  pendingReservations,
  entryLogs,
  visitors,
  deliveries,
  reservations,
  complaints
}) => ({
  generatedAt: new Date().toISOString(),
  windowDays,
  windowStart: windowStart.toISOString(),
  totals: {
    totalResidents,
    unresolvedComplaints,
    pendingReservations
  },
  entryLogs: entryLogs.map((entryLog) => ({
    timestamp: entryLog.timestamp,
    logType: entryLog.logType,
    vehicleOwnerType: entryLog.vehicleOwnerType,
    plateNumber: entryLog.plateNumber,
    ownerName: entryLog.ownerName,
    residentName: entryLog.residentName,
    residentAddress: entryLog.residentAddress,
    notes: entryLog.notes
  })),
  visitors: visitors.map((visitor) => ({
    createdAt: visitor.createdAt,
    expectedDate: visitor.expectedDate,
    entryTime: visitor.entryTime,
    exitTime: visitor.exitTime,
    status: visitor.status,
    name: visitor.name,
    purpose: visitor.purpose,
    hostResidentName: visitor.hostResidentName,
    hostResidentAddress: visitor.hostResidentAddress,
    vehiclePlateNumber: visitor.vehiclePlateNumber,
    vehicleType: visitor.vehicleType
  })),
  deliveries: deliveries.map((delivery) => ({
    createdAt: delivery.createdAt,
    entryTime: delivery.entryTime,
    exitTime: delivery.exitTime,
    status: delivery.status,
    driverName: delivery.driverName,
    deliveryAddress: delivery.deliveryAddress,
    hostResidentName: delivery.hostResidentName,
    hostResidentAddress: delivery.hostResidentAddress,
    vehiclePlateNumber: delivery.vehiclePlateNumber,
    vehicleType: delivery.vehicleType
  })),
  facilityReservations: reservations.map((reservation) => ({
    createdAt: reservation.createdAt,
    dateReserved: reservation.dateReserved,
    endDateTime: reservation.endDateTime,
    facilityName: reservation.facilityName,
    durationHours: reservation.durationHours,
    numberOfGuests: reservation.numberOfGuests,
    totalAmount: reservation.totalAmount,
    hourlyRate: reservation.hourlyRate,
    paymentStatus: reservation.paymentStatus,
    status: reservation.status
  })),
  complaints: complaints.map((complaint) => ({
    createdAt: complaint.createdAt,
    reviewedAt: complaint.reviewedAt,
    complaintType: complaint.complaintType,
    complainantName: complaint.complainantName,
    complainantAddress: complaint.complainantAddress,
    subject: complaint.subject,
    location: complaint.location,
    status: complaint.status
  }))
});

const getAnalyticsOverview = async (req, res) => {
  try {
    const windowDays = parseWindowDays(req.query.days);
    const cacheKey = getCacheKey(windowDays);
    const forceRefresh = String(req.query.refresh || '').toLowerCase() === 'true';

    if (!forceRefresh) {
      const cachedAnalytics = getCachedAnalytics(cacheKey);

      if (cachedAnalytics) {
        return res.json(cachedAnalytics);
      }
    }

    const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const [
      totalResidents,
      unresolvedComplaints,
      pendingReservations,
      entryLogs,
      visitors,
      deliveries,
      reservations,
      complaints
    ] = await Promise.all([
      User.countDocuments({ isApproved: true }),
      Complaint.countDocuments({
        isArchived: { $ne: true },
        status: { $in: ['pending', 'in_progress'] }
      }),
      FacilityReservation.countDocuments({
        status: 'pending'
      }),
      EntryLog.find({
        timestamp: { $gte: windowStart }
      })
        .select('timestamp logType vehicleOwnerType plateNumber ownerName residentName residentAddress notes')
        .sort({ timestamp: -1 })
        .limit(MAX_ANALYTICS_RECORDS)
        .lean(),
      Visitor.find({
        $or: [
          { createdAt: { $gte: windowStart } },
          { expectedDate: { $gte: windowStart } },
          { entryTime: { $gte: windowStart } }
        ]
      })
        .select('createdAt expectedDate entryTime exitTime status name purpose hostResidentName hostResidentAddress vehiclePlateNumber vehicleType')
        .sort({ createdAt: -1 })
        .limit(MAX_ANALYTICS_RECORDS)
        .lean(),
      Delivery.find({
        $or: [
          { createdAt: { $gte: windowStart } },
          { entryTime: { $gte: windowStart } }
        ]
      })
        .select('createdAt entryTime exitTime status driverName deliveryAddress hostResidentName hostResidentAddress vehiclePlateNumber vehicleType')
        .sort({ createdAt: -1 })
        .limit(MAX_ANALYTICS_RECORDS)
        .lean(),
      FacilityReservation.find({
        $or: [
          { createdAt: { $gte: windowStart } },
          { dateReserved: { $gte: windowStart } }
        ]
      })
        .select('createdAt dateReserved endDateTime facilityName durationHours numberOfGuests totalAmount hourlyRate paymentStatus status')
        .sort({ dateReserved: -1 })
        .limit(MAX_ANALYTICS_RECORDS)
        .lean(),
      Complaint.find({
        isArchived: { $ne: true },
        $or: [
          { createdAt: { $gte: windowStart } },
          { reviewedAt: { $gte: windowStart } }
        ]
      })
        .select('createdAt reviewedAt complaintType complainantName complainantAddress subject location status')
        .sort({ createdAt: -1 })
        .limit(MAX_ANALYTICS_RECORDS)
        .lean()
    ]);

    const analyticsPayload = buildAnalyticsPayload({
      windowDays,
      windowStart,
      totalResidents,
      unresolvedComplaints,
      pendingReservations,
      entryLogs,
      visitors,
      deliveries,
      reservations,
      complaints
    });

    const analytics = await runPythonAnalytics(analyticsPayload);
    setCachedAnalytics(cacheKey, analytics);

    res.json(analytics);
  } catch (error) {
    console.error('Analytics overview error:', error);

    const fallbackAnalytics = getCachedAnalytics(getCacheKey(parseWindowDays(req.query.days)), {
      allowExpired: true
    });

    if (fallbackAnalytics) {
      return res.json({
        ...fallbackAnalytics,
        warning: 'Showing the most recent cached analytics because a fresh AI run took too long.'
      });
    }

    res.status(500).json({
      message: 'Unable to generate AI analytics right now',
      error:
        process.env.NODE_ENV === 'development'
          ? error.message
          : undefined
    });
  }
};

module.exports = {
  getAnalyticsOverview
};
