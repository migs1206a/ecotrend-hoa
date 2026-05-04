//backend/controllers/entryLogController.js
const EntryLog = require('../models/EntryLog');
const { parsePagination, sendPaginatedResponse, paginateArray } = require('../utils/pagination');
const { validateNameField } = require('../utils/fieldValidation');

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
    const { startDate, endDate, guardId } = req.query;
    
    let query = {};
    
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (guardId) {
      query.guardOnDuty = guardId;
    }

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

// @desc    Get today's entry logs
// @route   GET /api/entry-logs/today
// @access  Guard/Admin only
exports.getTodayEntryLogs = async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const filter = {
      timestamp: {
        $gte: startOfDay,
        $lte: endOfDay
      }
    };
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
    const filter = { guardOnDuty: req.params.guardId };
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
