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
const PYTHON_TIMEOUT_MS = 30000;

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
        .lean(),
      Delivery.find({
        $or: [
          { createdAt: { $gte: windowStart } },
          { entryTime: { $gte: windowStart } }
        ]
      })
        .select('createdAt entryTime exitTime status driverName deliveryAddress hostResidentName hostResidentAddress vehiclePlateNumber vehicleType')
        .sort({ createdAt: -1 })
        .lean(),
      FacilityReservation.find({
        $or: [
          { createdAt: { $gte: windowStart } },
          { dateReserved: { $gte: windowStart } }
        ]
      })
        .select('createdAt dateReserved endDateTime facilityName durationHours numberOfGuests totalAmount hourlyRate paymentStatus status')
        .sort({ dateReserved: -1 })
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

    res.json(analytics);
  } catch (error) {
    console.error('Analytics overview error:', error);
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
