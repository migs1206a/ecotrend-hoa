//backend/controllers/entryLogController.js
const EntryLog = require('../models/EntryLog');
const { parsePagination, sendPaginatedResponse, paginateArray } = require('../utils/pagination');
const { validateNameField } = require('../utils/fieldValidation');
const { buildBrandedReportPdf } = require('../utils/brandedPdf');

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildEntryLogFilter = (queryParams = {}, baseFilter = {}) => {
  const { startDate, endDate, guardId, q } = queryParams;
  const filter = { ...baseFilter };

  if (startDate && endDate && !filter.timestamp) {
    filter.timestamp = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };
  }

  if (guardId && !filter.guardOnDuty) {
    filter.guardOnDuty = guardId;
  }

  const searchQuery = String(q || '').trim();
  if (searchQuery) {
    const searchRegex = new RegExp(escapeRegex(searchQuery), 'i');
    filter.$or = [
      { plateNumber: searchRegex },
      { logType: searchRegex },
      { vehicleOwnerType: searchRegex },
      { ownerName: searchRegex },
      { residentName: searchRegex },
      { residentAddress: searchRegex },
      { vehicleType: searchRegex },
      { vehicleColor: searchRegex },
      { notes: searchRegex },
      { recordedByName: searchRegex },
      { recordedByRole: searchRegex }
    ];
  }

  return filter;
};

const formatDateTime = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateForFileName = (value = new Date()) => {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
};

const toTitleCase = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const getRecordedByLabel = (log = {}) =>
  String(
    log.recordedByName
      || log.guardOnDuty?.fullName
      || log.guardOnDuty?.username
      || log.recordedByRole
      || 'Guard'
  ).trim() || 'Guard';

const buildEntryLogPdfScope = (queryParams = {}) => {
  const parts = ['Gate activity records'];
  const search = String(queryParams.q || '').trim();
  const startDate = String(queryParams.startDate || '').trim();
  const endDate = String(queryParams.endDate || '').trim();

  if (startDate && endDate) {
    parts.push(`from ${startDate} to ${endDate}`);
  }

  if (search) {
    parts.push(`matching "${search}"`);
  }

  return `${parts.join(', ')}.`;
};

const buildEntryLogPdfRows = (logs = []) =>
  logs.map((log) => ({
    recordedAt: formatDateTime(log.timestamp),
    plateNumber: log.plateNumber === 'NO-VEHICLE' ? 'No vehicle' : log.plateNumber || 'No vehicle',
    logType: log.logType === 'entry' ? 'Entry' : 'Exit',
    ownerType: toTitleCase(log.vehicleOwnerType || 'resident'),
    ownerName: log.ownerName || '-',
    resident: log.residentName
      ? [log.residentName, log.residentAddress].filter(Boolean).join(' / ')
      : '-',
    recordedBy: getRecordedByLabel(log),
    notes: log.notes || '-'
  }));

const buildEntryLogPdf = (logs = [], generatedBy = 'Guard', queryParams = {}) => {
  const rows = buildEntryLogPdfRows(logs);
  const entryCount = logs.filter((log) => log.logType === 'entry').length;
  const exitCount = logs.length - entryCount;
  const residentCount = logs.filter((log) => log.vehicleOwnerType === 'resident').length;
  const visitorCount = logs.filter((log) => log.vehicleOwnerType === 'visitor').length;
  const deliveryCount = logs.filter((log) => log.vehicleOwnerType === 'delivery').length;
  const generatedOn = new Date();
  const filename = `gate-activity-log-${formatDateForFileName(generatedOn)}.pdf`;

  const pdfContent = buildBrandedReportPdf({
    title: 'Gate Activity Log Report',
    generatedOn,
    generatedBy,
    filename,
    scope: buildEntryLogPdfScope(queryParams),
    columns: [
      { key: 'recordedAt', label: 'Date & Time', width: 94 },
      { key: 'plateNumber', label: 'Plate Number', width: 82 },
      { key: 'logType', label: 'Type', width: 50, align: 'center' },
      { key: 'ownerType', label: 'Owner Type', width: 64, align: 'center' },
      { key: 'ownerName', label: 'Owner / Driver', width: 92 },
      { key: 'resident', label: 'Resident / Address', width: 148 },
      { key: 'recordedBy', label: 'Recorded By', width: 92 },
      { key: 'notes', label: 'Notes', width: 120 }
    ],
    rows,
    summaryItems: [
      { label: 'Total Logs', value: String(rows.length) },
      { label: 'Entries', value: String(entryCount) },
      { label: 'Exits', value: String(exitCount) },
      { label: 'Resident Logs', value: String(residentCount) },
      { label: 'Visitor Logs', value: String(visitorCount) },
      { label: 'Delivery Logs', value: String(deliveryCount) }
    ],
    emptyMessage: 'No gate activity records match the selected filters.',
    pageSize: 'a4',
    orientation: 'landscape'
  });

  return {
    filename,
    pdfBuffer: Buffer.from(pdfContent, 'binary')
  };
};

const normalizePlateNumber = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return { value: 'NO-VEHICLE' };
  if (!/^[A-Z0-9]{1,10}$/.test(normalized)) {
    return { error: 'Plate number can only contain letters and numbers' };
  }
  return { value: normalized };
};

// @desc    Create entry log
// @route   POST /api/entry-logs
// @access  Guard only
exports.createEntryLog = async (req, res) => {
  try {
    const { 
      plateNumber, 
      logType, 
      vehicleOwnerType, 
      ownerName, 
      vehicleType,
      vehicleColor,
      guardOnDuty, 
      recordedBy,
      recordedByName,
      recordedByRole,
      notes,
      residentId,
      residentName,
      residentAddress
    } = req.body;

    const ownerNameValidation = validateNameField(ownerName, 'Owner name', {
      required: false,
      minLength: 2,
      maxLength: 80
    });
    if (ownerNameValidation.error) {
      return res.status(400).json({ message: ownerNameValidation.error });
    }

    const residentNameValidation = validateNameField(residentName, 'Resident name', {
      required: false,
      minLength: 2,
      maxLength: 80
    });
    if (residentNameValidation.error) {
      return res.status(400).json({ message: residentNameValidation.error });
    }

    const plateValidation = normalizePlateNumber(plateNumber);
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    const entryLog = new EntryLog({
      plateNumber: plateValidation.value,
      logType,
      vehicleOwnerType: vehicleOwnerType || 'resident',
      ownerName: ownerNameValidation.value,
      vehicleType,
      vehicleColor,
      residentId,
      residentName: residentNameValidation.value,
      residentAddress,
      guardOnDuty,
      recordedBy: String(recordedBy || '').trim(),
      recordedByName: String(recordedByName || '').trim(),
      recordedByRole: String(recordedByRole || '').trim(),
      timestamp: new Date(),
      notes
    });

    await entryLog.save();

    console.log('Entry log created:', {
      plateNumber: entryLog.plateNumber,
      logType: entryLog.logType,
      timestamp: entryLog.timestamp
    });

    res.status(201).json({
      message: `Vehicle ${logType} logged successfully`,
      entryLog
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all entry logs
// @route   GET /api/entry-logs
// @access  Guard/Admin only
exports.getAllEntryLogs = async (req, res) => {
  try {
    const query = buildEntryLogFilter(req.query);
    const pagination = parsePagination(req.query);
    const baseQuery = EntryLog.find(query)
      .populate('guardOnDuty', 'username fullName')
      .populate('residentId', 'familyName houseAddress street phoneNumber')
      .sort({ timestamp: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        baseQuery.clone().skip(pagination.skip).limit(pagination.limit),
        EntryLog.countDocuments(query)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const logs = await baseQuery;
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.downloadEntryLogsPdf = async (req, res) => {
  try {
    const filter = buildEntryLogFilter(req.query);
    const logs = await EntryLog.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .populate('residentId', 'familyName houseAddress street phoneNumber')
      .sort({ timestamp: -1 })
      .lean();
    const generatedBy = String(req.user?.fullName || req.user?.username || req.user?.role || 'Guard').trim() || 'Guard';
    const { filename, pdfBuffer } = buildEntryLogPdf(logs, generatedBy, req.query);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('downloadEntryLogsPdf error:', error);
    return res.status(500).json({ message: 'Failed to download gate activity PDF' });
  }
};

// @desc    Get today's entry logs
// @route   GET /api/entry-logs/today
// @access  Guard/Admin only
exports.getTodayEntryLogs = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const filter = buildEntryLogFilter(req.query, {
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    const pagination = parsePagination(req.query);
    const query = EntryLog.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .populate('residentId', 'familyName houseAddress street phoneNumber')
      .sort({ timestamp: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        EntryLog.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const logs = await query;
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get entry log statistics for today
// @route   GET /api/entry-logs/stats/today
// @access  Guard/Admin only
exports.getTodayStats = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    
    console.log('=== STATS DEBUG ===');
    console.log('Start of day:', startOfDay);
    console.log('End of day:', endOfDay);
    
    const todayEntries = await EntryLog.countDocuments({
      logType: 'entry',
      timestamp: { 
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    const todayExits = await EntryLog.countDocuments({
      logType: 'exit',
      timestamp: { 
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    // Count by type
    const todayVisitorEntries = await EntryLog.countDocuments({
      logType: 'entry',
      vehicleOwnerType: 'visitor',
      timestamp: { 
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    const todayDeliveryEntries = await EntryLog.countDocuments({
      logType: 'entry',
      vehicleOwnerType: 'delivery',
      timestamp: { 
        $gte: startOfDay,
        $lte: endOfDay
      }
    });
    
    const todayResidentEntries = await EntryLog.countDocuments({
      logType: 'entry',
      vehicleOwnerType: 'resident',
      timestamp: { 
        $gte: startOfDay,
        $lte: endOfDay
      }
    });

    console.log('Today Entries Count:', todayEntries);
    console.log('Today Exits Count:', todayExits);
    console.log('Today Visitor Entries:', todayVisitorEntries);
    console.log('Today Delivery Entries:', todayDeliveryEntries);
    console.log('Today Resident Entries:', todayResidentEntries);
    console.log('===================');

    res.json({
      todayEntries,
      todayExits,
      todayVisitorEntries,
      todayDeliveryEntries,
      todayResidentEntries
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get entry logs by guard
// @route   GET /api/entry-logs/guard/:guardId
// @access  Guard/Admin only
exports.getLogsByGuard = async (req, res) => {
  try {
    const filter = buildEntryLogFilter(req.query, { guardOnDuty: req.params.guardId });
    const pagination = parsePagination(req.query);
    const query = EntryLog.find(filter)
      .populate('residentId', 'familyName houseAddress street phoneNumber')
      .sort({ timestamp: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        EntryLog.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const logs = await query;
    res.json(logs);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get residents currently inside (have entry without matching exit)
// @route   GET /api/entry-logs/residents/inside
// @access  Guard only
exports.getResidentsInside = async (req, res) => {
  try {
    // Get all resident entries
    const residentEntries = await EntryLog.find({
      logType: 'entry',
      vehicleOwnerType: 'resident',
      residentId: { $exists: true, $ne: null }
    })
      .populate('residentId', 'familyName houseAddress street phoneNumber')
      .sort({ timestamp: -1 });

    console.log('Total resident entries found:', residentEntries.length);

    // Group entries by resident ID to get the most recent entry for each resident
    const residentMap = new Map();
    
    for (const entry of residentEntries) {
      if (!entry.residentId) continue;
      
      const residentIdStr = entry.residentId._id.toString();
      
      if (!residentMap.has(residentIdStr)) {
        residentMap.set(residentIdStr, entry);
      }
    }

    console.log('Unique residents with entries:', residentMap.size);

    // Now check which residents are still inside (no exit after their last entry)
    const residentsInside = [];

    for (const [residentIdStr, lastEntry] of residentMap) {
      // Find if there's an exit log for this resident after their last entry
      const exitLog = await EntryLog.findOne({
        logType: 'exit',
        vehicleOwnerType: 'resident',
        residentId: residentIdStr,
        timestamp: { $gte: lastEntry.timestamp }
      }).sort({ timestamp: -1 });

      // If no exit found after last entry, resident is still inside
      if (!exitLog) {
        residentsInside.push({
          _id: lastEntry.residentId._id,
          familyName: lastEntry.residentId.familyName,
          houseAddress: lastEntry.residentId.houseAddress,
          street: lastEntry.residentId.street,
          phoneNumber: lastEntry.residentId.phoneNumber,
          entryTime: lastEntry.timestamp,
          plateNumber: lastEntry.plateNumber !== 'NO-VEHICLE' ? lastEntry.plateNumber : null,
          vehicleType: lastEntry.vehicleType,
          vehicleColor: lastEntry.vehicleColor
        });
      }
    }

    console.log('Residents currently inside:', residentsInside.length);

    // Sort by most recent entry
    residentsInside.sort((a, b) => b.entryTime - a.entryTime);

    const pagination = parsePagination(req.query);
    const paginated = paginateArray(residentsInside, pagination);
    sendPaginatedResponse(res, pagination, paginated.items, paginated.total);
  } catch (error) {
    console.error('Error fetching residents inside:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
