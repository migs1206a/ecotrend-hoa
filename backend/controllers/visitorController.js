const Visitor = require('../models/Visitor');
const EntryLog = require('../models/EntryLog');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const {
  validateNameField,
  validatePhoneNumberField
} = require('../utils/fieldValidation');
const { isOfficer } = require('../utils/adminPermissions');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_ROOT = path.join(BACKEND_ROOT, 'uploads');

const QR_CHECKPOINTS = Object.freeze([
  { checkpoint: 'gate_entry', label: 'Subdivision Gate Entrance' },
  { checkpoint: 'home_arrival', label: 'Resident Home Entrance' },
  { checkpoint: 'home_exit', label: 'Resident Home Exit' },
  { checkpoint: 'gate_exit', label: 'Subdivision Gate Exit' }
]);
const QR_MANUAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QR_CHECKPOINT_ORDER = QR_CHECKPOINTS.map((item) => item.checkpoint);
const QR_CHECKPOINT_LABELS = QR_CHECKPOINTS.reduce((map, item) => {
  map[item.checkpoint] = item.label;
  return map;
}, {});

const VALID_CHECKPOINTS = new Set(QR_CHECKPOINTS.map((item) => item.checkpoint));

const sanitizeHeaderFilename = (value) =>
  String(value || 'visitor-identification')
    .replace(/["\\\r\n]/g, '')
    .trim() || 'visitor-identification';

const pipeRemoteFile = (fileUrl, res, redirectCount = 0) =>
  new Promise((resolve, reject) => {
    if (redirectCount > 3) {
      reject(new Error('Too many file redirects'));
      return;
    }

    const client = fileUrl.startsWith('https') ? https : http;
    const request = client.get(fileUrl, (remoteResponse) => {
      if ([301, 302, 303, 307, 308].includes(remoteResponse.statusCode) && remoteResponse.headers.location) {
        remoteResponse.resume();
        pipeRemoteFile(remoteResponse.headers.location, res, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (remoteResponse.statusCode < 200 || remoteResponse.statusCode >= 300) {
        remoteResponse.resume();
        reject(new Error('Remote file unavailable'));
        return;
      }

      remoteResponse.pipe(res);
      remoteResponse.on('end', resolve);
      remoteResponse.on('error', reject);
    });

    request.on('error', reject);
  });

const buildActorSnapshot = (user = {}) => ({
  id: String(user.userId || user.id || user._id || ''),
  name: String(user.fullName || user.username || '').trim(),
  role: String(user.role || '').trim()
});

const getVisitorPartyCount = (visitor) => (
  1 + (Array.isArray(visitor?.accompanyingVisitors) ? visitor.accompanyingVisitors.length : 0)
);

const getPartyMemberLabel = (visitor, memberIndex = 0) => {
  if (memberIndex === 0) {
    return String(visitor?.name || 'Main Visitor').trim() || 'Main Visitor';
  }

  const companion = Array.isArray(visitor?.accompanyingVisitors)
    ? visitor.accompanyingVisitors[memberIndex - 1]
    : null;
  const fullName = [companion?.firstName, companion?.lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');

  return fullName || `Companion ${memberIndex}`;
};

const buildQrCheckpoints = (visitor) => {
  const partyCount = Math.max(1, getVisitorPartyCount(visitor));
  const checkpoints = [];

  for (let memberIndex = 0; memberIndex < partyCount; memberIndex += 1) {
    const memberLabel = getPartyMemberLabel(visitor, memberIndex);

    QR_CHECKPOINTS.forEach((item) => {
      checkpoints.push({
        ...item,
        memberIndex,
        memberLabel
      });
    });
  }

  return checkpoints;
};

const generateQrToken = () => crypto.randomBytes(24).toString('hex');
const generateQrManualCode = (length = 8) =>
  Array.from({ length }, () => QR_MANUAL_CODE_ALPHABET[crypto.randomInt(0, QR_MANUAL_CODE_ALPHABET.length)]).join('');

const normalizeIdentificationNumber = (value) => {
  const normalized = String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (!normalized || normalized.length > 16) {
    return { error: 'Visitor Identification ID Number must be letters/numbers only and up to 16 characters.' };
  }

  return { value: normalized };
};

const normalizeRelationship = (value, label = 'Relationship to resident') => {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');

  if (!normalized || normalized.length > 50 || !/^[A-Za-z\s.'-]+$/.test(normalized)) {
    return { error: `${label} is required and must be text only up to 50 characters.` };
  }

  return { value: normalized };
};

const normalizeDecision = (value) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (['approve', 'approved'].includes(normalized)) return 'approved';
  if (['reject', 'rejected'].includes(normalized)) return 'rejected';

  return '';
};

const normalizeOptionalDate = (value) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const ensureResidentOwnsVisitor = (req, visitor) => {
  const role = String(req.user?.role || '').toUpperCase();
  if (role !== 'RESIDENT') return true;

  const userId = String(req.user?.userId || req.user?.id || req.user?._id || '');
  return userId && String(visitor.hostResident) === userId;
};

const normalizeQrCredential = (value) => {
  const trimmed = String(value || '').trim();

  return {
    qrToken: trimmed.toLowerCase(),
    qrManualCode: trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  };
};

const synchronizeVisitorQrState = (visitor) => {
  let changed = false;

  if (!visitor?.qrEntryEnabled || !visitor?.qrToken) {
    return { checkpoints: Array.isArray(visitor?.qrCheckpoints) ? visitor.qrCheckpoints : [], changed };
  }

  if (!visitor.qrManualCode) {
    visitor.qrManualCode = generateQrManualCode();
    changed = true;
  }

  const expectedCheckpoints = buildQrCheckpoints(visitor);
  const currentCheckpoints = Array.isArray(visitor.qrCheckpoints) ? visitor.qrCheckpoints : [];
  const usedCurrentIndexes = new Set();

  const synchronizedCheckpoints = expectedCheckpoints.map((expectedItem) => {
    const exactMatchIndex = currentCheckpoints.findIndex((currentItem, index) => (
      !usedCurrentIndexes.has(index) &&
      currentItem?.checkpoint === expectedItem.checkpoint &&
      Number(currentItem?.memberIndex || 0) === expectedItem.memberIndex
    ));

    const fallbackMatchIndex = exactMatchIndex >= 0
      ? exactMatchIndex
      : currentCheckpoints.findIndex((currentItem, index) => (
          !usedCurrentIndexes.has(index) &&
          currentItem?.checkpoint === expectedItem.checkpoint
        ));

    if (fallbackMatchIndex < 0) {
      changed = true;
      return expectedItem;
    }

    usedCurrentIndexes.add(fallbackMatchIndex);
    const currentItem = currentCheckpoints[fallbackMatchIndex];

    if (
      currentItem?.label !== expectedItem.label ||
      Number(currentItem?.memberIndex || 0) !== expectedItem.memberIndex ||
      String(currentItem?.memberLabel || '') !== expectedItem.memberLabel
    ) {
      changed = true;
    }

    return {
      ...expectedItem,
      usedAt: currentItem?.usedAt,
      mode: currentItem?.mode,
      recordedBy: currentItem?.recordedBy || '',
      recordedByName: currentItem?.recordedByName || '',
      recordedByRole: currentItem?.recordedByRole || ''
    };
  });

  if (currentCheckpoints.length !== synchronizedCheckpoints.length) {
    changed = true;
  }

  if (changed) {
    visitor.qrCheckpoints = synchronizedCheckpoints;
  }

  return { checkpoints: changed ? synchronizedCheckpoints : currentCheckpoints, changed };
};

const isQrManagedVisitor = (visitor) => Boolean(
  visitor?.qrEntryEnabled ||
  String(visitor?.qrToken || '').trim() ||
  String(visitor?.qrManualCode || '').trim() ||
  (Array.isArray(visitor?.qrCheckpoints) && visitor.qrCheckpoints.length > 0)
);

const synchronizeVisitorsForResponse = async (visitors = []) => {
  await Promise.all(
    visitors.map(async (visitor) => {
      const { changed } = synchronizeVisitorQrState(visitor);
      if (changed) {
        await visitor.save();
      }
    })
  );

  return visitors;
};

const getCheckpointUsage = (checkpoints = [], checkpoint) => {
  const matching = checkpoints.filter((item) => item.checkpoint === checkpoint);
  return {
    total: matching.length,
    used: matching.filter((item) => item.usedAt).length
  };
};

const getPreviousCheckpoint = (checkpoint) => {
  const checkpointIndex = QR_CHECKPOINT_ORDER.indexOf(checkpoint);
  return checkpointIndex <= 0 ? '' : QR_CHECKPOINT_ORDER[checkpointIndex - 1];
};

const validateQrCheckpointAccess = (req, visitor, checkpoint) => {
  const role = String(req.user?.role || '').toUpperCase();

  if (role === 'RESIDENT') {
    if (!ensureResidentOwnsVisitor(req, visitor)) {
      return 'You can only update QR checkpoints for your own visitors.';
    }

    if (!['home_arrival', 'home_exit'].includes(checkpoint)) {
      return 'Residents can only record Home Entry or Home Exit for QR-approved visitors.';
    }
  }

  if (role === 'GUARD' && !['gate_entry', 'gate_exit'].includes(checkpoint)) {
    return 'Guards can only record Gate Entry or Gate Exit for QR-approved visitors.';
  }

  return '';
};

const markCheckpoint = (visitor, checkpoint, actor, mode = 'scan') => {
  if (!VALID_CHECKPOINTS.has(checkpoint)) {
    return { error: 'Please choose a valid QR checkpoint.' };
  }

  if (!visitor.qrEntryEnabled || !visitor.qrToken) {
    return { error: 'QR entry is not enabled for this visitor.' };
  }

  const checkpoints = Array.isArray(visitor.qrCheckpoints) && visitor.qrCheckpoints.length
    ? visitor.qrCheckpoints
    : buildQrCheckpoints(visitor);
  const usage = getCheckpointUsage(checkpoints, checkpoint);
  const previousCheckpoint = getPreviousCheckpoint(checkpoint);
  const previousUsage = previousCheckpoint
    ? getCheckpointUsage(checkpoints, previousCheckpoint)
    : { used: usage.total, total: usage.total };

  if (usage.used >= usage.total) {
    return { error: `${QR_CHECKPOINT_LABELS[checkpoint] || 'This checkpoint'} is already complete for everyone in this visitor pass.` };
  }

  if (previousCheckpoint && previousUsage.used <= usage.used) {
    return {
      error: `Record ${QR_CHECKPOINT_LABELS[previousCheckpoint] || 'the previous checkpoint'} for the next person before continuing to ${QR_CHECKPOINT_LABELS[checkpoint] || 'this checkpoint'}.`
    };
  }

  const target = checkpoints.find((item) => item.checkpoint === checkpoint && !item.usedAt);

  if (!target) {
    return { error: 'QR checkpoint was not found.' };
  }

  target.usedAt = new Date();
  target.mode = mode;
  target.recordedBy = actor.id;
  target.recordedByName = actor.name;
  target.recordedByRole = actor.role;
  visitor.qrCheckpoints = checkpoints;

  if (checkpoint === 'gate_entry' && visitor.status === 'pre-registered') {
    visitor.status = 'inside';
    visitor.entryTime = visitor.entryTime || new Date();
  }

  if (checkpoint === 'gate_exit' && usage.used + 1 >= usage.total) {
    visitor.status = 'exited';
    visitor.exitTime = visitor.exitTime || new Date();
  }

  return {
    value: target,
    sequenceNumber: usage.used + 1,
    sequenceTotal: usage.total
  };
};

const recordQrCheckpointLog = async (visitor, checkpoint, user, result) => {
  const role = String(user?.role || '').toUpperCase();
  const checkpointLabel = QR_CHECKPOINT_LABELS[checkpoint] || 'QR checkpoint';
  const sequenceLabel = result?.sequenceTotal > 1
    ? ` (${result.sequenceNumber}/${result.sequenceTotal})`
    : '';
  const notesByCheckpoint = {
    gate_entry: `QR-approved visitor gate entry${sequenceLabel}`,
    home_arrival: `QR-approved visitor home entry${sequenceLabel}`,
    home_exit: `QR-approved visitor home exit${sequenceLabel}`,
    gate_exit: `QR-approved visitor gate exit${sequenceLabel}`
  };

  await EntryLog.create({
    plateNumber: visitor.vehiclePlateNumber || 'NO-VEHICLE',
    logType: ['gate_entry', 'home_arrival'].includes(checkpoint) ? 'entry' : 'exit',
    vehicleOwnerType: 'visitor',
    ownerName: visitor.name,
    vehicleType: visitor.vehicleType || '',
    vehicleColor: visitor.vehicleColor || '',
    residentId: visitor.hostResident,
    residentName: visitor.hostResidentName,
    residentAddress: visitor.hostResidentAddress,
    guardOnDuty: role === 'GUARD' ? (user.userId || user.id || user._id) : undefined,
    recordedBy: user.userId || user.id || user._id,
    recordedByName: String(user.fullName || user.username || '').trim(),
    recordedByRole: role,
    notes: notesByCheckpoint[checkpoint] || `${checkpointLabel}${sequenceLabel}`
  });
};

const normalizePlateNumber = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return { value: '' };
  if (!/^[A-Z0-9]{1,10}$/.test(normalized)) {
    return { error: 'Plate number can only contain letters and numbers' };
  }
  return { value: normalized };
};

const normalizeAccompanyingVisitors = (companions) => {
  if (!Array.isArray(companions)) return { value: [] };

  const normalizedCompanions = [];
  for (let index = 0; index < companions.length; index += 1) {
    const companion = companions[index] || {};
    const label = `Companion ${index + 1}`;
    const relationshipValidation = normalizeRelationship(companion.relationshipToResident, `${label} relationship to resident`);
    const identification = String(companion.identification || '').trim().replace(/\s+/g, ' ');

    if (relationshipValidation.error) {
      return { error: relationshipValidation.error };
    }

    const lastNameValidation = validateNameField(companion.lastName, `${label} last name`, {
      minLength: 1,
      maxLength: 30
    });
    if (lastNameValidation.error) {
      return { error: lastNameValidation.error };
    }

    const firstNameValidation = validateNameField(companion.firstName, `${label} first name`, {
      minLength: 1,
      maxLength: 30
    });
    if (firstNameValidation.error) {
      return { error: firstNameValidation.error };
    }

    if (!identification || identification.length > 80) {
      return { error: `${label} identification is required and must not exceed 80 characters` };
    }

    normalizedCompanions.push({
      relationshipToResident: relationshipValidation.value,
      lastName: lastNameValidation.value,
      firstName: firstNameValidation.value,
      identification
    });
  }

  return { value: normalizedCompanions };
};

// @desc    Register new visitor (by guard - immediate entry)
// @route   POST /api/visitors
// @access  Guard only
exports.registerVisitor = async (req, res) => {
  try {
    const { 
      name, 
      contactNumber, 
      purpose, 
      hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber,
      vehicleType,
      vehicleColor,
      guardOnDuty
    } = req.body;

    const nameValidation = validateNameField(name, 'Visitor name', {
      minLength: 2,
      maxLength: 80
    });
    if (nameValidation.error) {
      return res.status(400).json({ message: nameValidation.error });
    }

    const contactNumberValidation = validatePhoneNumberField(contactNumber, 'Contact number');
    if (contactNumberValidation.error) {
      return res.status(400).json({ message: contactNumberValidation.error });
    }

    const plateValidation = normalizePlateNumber(vehiclePlateNumber);
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    const visitor = new Visitor({
      name: nameValidation.value,
      contactNumber: contactNumberValidation.value,
      purpose: String(purpose || '').trim(),
      hostResident: hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber: plateValidation.value,
      vehicleType,
      vehicleColor,
      guardOnDuty,
      entryTime: new Date(),
      status: 'inside'
    });

    await visitor.save();

    res.status(201).json({
      message: 'Visitor registered successfully',
      visitor
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Pre-register visitor (by resident)
// @route   POST /api/visitors/pre-register
// @access  Resident only
exports.preRegisterVisitor = async (req, res) => {
  let storedIdentification = null;

  try {
    const { 
      entryType = 'visitor',
      name, 
      contactNumber, 
      purpose, 
      relationshipToResident,
      identificationNumber,
      hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber,
      vehicleType,
      vehicleColor,
      expectedDate,
      preRegisteredBy,
      accompanyingVisitors
    } = req.body;
    const normalizedEntryType = String(entryType || 'visitor').trim().toLowerCase();

    const nameValidation = validateNameField(name, 'Visitor name', {
      minLength: 2,
      maxLength: 80
    });
    if (nameValidation.error) {
      return res.status(400).json({ message: nameValidation.error });
    }

    const contactNumberValidation = validatePhoneNumberField(contactNumber, 'Contact number');
    if (contactNumberValidation.error) {
      return res.status(400).json({ message: contactNumberValidation.error });
    }

    const plateValidation = normalizePlateNumber(vehiclePlateNumber);
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    let parsedCompanions = accompanyingVisitors;
    if (typeof accompanyingVisitors === 'string') {
      try {
        parsedCompanions = JSON.parse(accompanyingVisitors || '[]');
      } catch (parseError) {
        return res.status(400).json({ message: 'Invalid accompanying visitors data.' });
      }
    }
    const companionsValidation = normalizeAccompanyingVisitors(parsedCompanions);
    if (companionsValidation.error) {
      return res.status(400).json({ message: companionsValidation.error });
    }

    let relationshipValidation = { value: '' };
    let identificationValidation = { value: '' };

    if (normalizedEntryType === 'visitor') {
      relationshipValidation = normalizeRelationship(relationshipToResident);
      if (relationshipValidation.error) {
        return res.status(400).json({ message: relationshipValidation.error });
      }

      identificationValidation = normalizeIdentificationNumber(identificationNumber);
      if (identificationValidation.error) {
        return res.status(400).json({ message: identificationValidation.error });
      }

      if (!req.file) {
        return res.status(400).json({ message: 'Visitor identification image is required.' });
      }

      storedIdentification = await storeUploadedFile(req.file, {
        folder: 'ecotrend-hoa/visitor-identifications',
        localDir: 'uploads/visitor-identifications',
        prefix: 'visitor-id',
        resourceType: 'image'
      });
    }

    const visitor = new Visitor({
      name: nameValidation.value,
      contactNumber: contactNumberValidation.value,
      entryType: normalizedEntryType === 'delivery' ? 'delivery' : 'visitor',
      relationshipToResident: relationshipValidation.value,
      identificationNumber: identificationValidation.value,
      identificationDocument: storedIdentification,
      purpose: String(purpose || '').trim(),
      hostResident: hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber: plateValidation.value,
      vehicleType,
      vehicleColor,
      accompanyingVisitors: companionsValidation.value,
      expectedDate: normalizeOptionalDate(expectedDate),
      preRegisteredBy,
      reviewStatus: normalizedEntryType === 'visitor' ? 'pending' : 'approved',
      status: 'pre-registered'
    });

    await visitor.save();

    res.status(201).json({
      message: 'Visitor pre-registered successfully',
      visitor
    });
  } catch (error) {
    if (storedIdentification) {
      await deleteStoredFile(storedIdentification).catch((cleanupError) => {
        console.error('Visitor identification cleanup error:', cleanupError);
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all visitors
// @route   GET /api/visitors
// @access  Guard/Admin only
exports.getAllVisitors = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const query = Visitor.find()
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ entryTime: -1, createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments()
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const visitors = await query.limit(50);
    await synchronizeVisitorsForResponse(visitors);
    res.json(visitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get active visitors
// @route   GET /api/visitors/active
// @access  Guard/Admin only
exports.getActiveVisitors = async (req, res) => {
  try {
    const filter = { status: 'inside' };
    const pagination = parsePagination(req.query);
    const query = Visitor.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ entryTime: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const activeVisitors = await query;
    await synchronizeVisitorsForResponse(activeVisitors);
    res.json(activeVisitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get pre-registered visitors
// @route   GET /api/visitors/pre-registered
// @access  Guard/Admin only
exports.getPreRegisteredVisitors = async (req, res) => {
  try {
    const filter = { status: { $in: ['pre-registered', 'inside'] } };
    const pagination = parsePagination(req.query);
    const query = Visitor.find(filter)
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ expectedDate: 1, createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const preRegisteredVisitors = await query;
    await synchronizeVisitorsForResponse(preRegisteredVisitors);
    res.json(preRegisteredVisitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get visitors by resident ID
// @route   GET /api/visitors/resident/:residentId
// @access  Resident/Admin only
exports.getVisitorsByResident = async (req, res) => {
  try {
    const filter = { hostResident: req.params.residentId };
    const pagination = parsePagination(req.query);
    const query = Visitor.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .sort({ entryTime: -1, createdAt: -1 })
;

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const visitors = await query.limit(20);
    await synchronizeVisitorsForResponse(visitors);
    res.json(visitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Convert pre-registered visitor to entry
// @route   PATCH /api/visitors/:id/entry
// @access  Guard only
exports.logPreRegisteredEntry = async (req, res) => {
  try {
    const { guardOnDuty } = req.body;

    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (visitor.status !== 'pre-registered') {
      return res.status(400).json({ message: 'Visitor is not pre-registered' });
    }

    if (visitor.reviewStatus !== 'approved') {
      return res.status(400).json({ message: 'Visitor pre-registration must be approved before entry.' });
    }

    if (visitor.qrEntryEnabled) {
      return res.status(400).json({ message: 'This visitor is QR-approved. Please record Gate Entry through the QR/code flow instead.' });
    }

    visitor.status = 'inside';
    visitor.entryTime = new Date();
    visitor.guardOnDuty = guardOnDuty;

    await visitor.save();

    res.json({
      message: 'Pre-registered visitor entry logged successfully',
      visitor
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.reviewPreRegisteredVisitor = async (req, res) => {
  try {
    const { decision, qrEntryEnabled = false, reviewNotes = '' } = req.body;
    const normalizedDecision = normalizeDecision(decision);

    if (!normalizedDecision) {
      return res.status(400).json({ message: 'Please choose approve or reject.' });
    }

    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (!['pre-registered', 'rejected'].includes(visitor.status)) {
      return res.status(400).json({ message: 'Only pre-registered visitors can be reviewed.' });
    }

    const actor = buildActorSnapshot(req.user);
    visitor.reviewStatus = normalizedDecision;
    visitor.reviewedBy = actor.id;
    visitor.reviewedByName = actor.name;
    visitor.reviewedByRole = actor.role;
    visitor.reviewedAt = new Date();
    visitor.reviewNotes = String(reviewNotes || '').trim().slice(0, 250);

    if (normalizedDecision === 'rejected') {
      visitor.status = 'rejected';
      visitor.qrEntryEnabled = false;
      visitor.qrToken = undefined;
      visitor.qrManualCode = undefined;
      visitor.qrCheckpoints = [];
    } else {
      visitor.status = 'pre-registered';

      if (Boolean(qrEntryEnabled) && isOfficer(req.user)) {
        visitor.qrEntryEnabled = true;
        visitor.qrToken = visitor.qrToken || generateQrToken();
        visitor.qrManualCode = visitor.qrManualCode || generateQrManualCode();
        visitor.qrCheckpoints = buildQrCheckpoints(visitor);
      } else {
        visitor.qrEntryEnabled = false;
        visitor.qrToken = undefined;
        visitor.qrManualCode = undefined;
        visitor.qrCheckpoints = [];
      }
    }

    await visitor.save();

    return res.json({
      message: normalizedDecision === 'approved'
        ? 'Pre-registered visitor approved successfully.'
        : 'Pre-registered visitor rejected successfully.',
      visitor
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.viewVisitorIdentification = async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (!ensureResidentOwnsVisitor(req, visitor)) {
      return res.status(403).json({ message: 'You can only view identification for your own visitors.' });
    }

    const document = visitor.identificationDocument;
    if (!document || !document.path) {
      return res.status(404).json({ message: 'No visitor identification document found' });
    }

    const setInlineDocumentHeaders = () => {
      const originalName = sanitizeHeaderFilename(document.originalName || document.filename);
      res.setHeader('Content-Type', document.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
      res.setHeader('Cache-Control', 'private, no-store');
    };

    const normalizedDocumentPath = String(document.path || '').replace(/\\/g, '/');
    const isLocalUploadPath = normalizedDocumentPath.startsWith('/uploads/') || normalizedDocumentPath.startsWith('uploads/');

    if ((document.storage === 'local' || !document.storage) && isLocalUploadPath) {
      const localPath = path.resolve(BACKEND_ROOT, normalizedDocumentPath.replace(/^\//, ''));
      const uploadsRoot = path.resolve(UPLOADS_ROOT);

      if (!localPath.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(localPath)) {
        return res.status(404).json({ message: 'Visitor identification file not found' });
      }

      setInlineDocumentHeaders();
      return res.sendFile(localPath);
    }

    if (/^https?:\/\//i.test(document.path)) {
      setInlineDocumentHeaders();
      await pipeRemoteFile(document.path, res);
      return undefined;
    }

    return res.status(404).json({ message: 'Visitor identification file not found' });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to load visitor identification', error: error.message });
    }
    return undefined;
  }
};

exports.scanVisitorQr = async (req, res) => {
  try {
    const rawCredential = String(req.body?.qrToken || '').trim();
    const checkpoint = String(req.body?.checkpoint || '').trim();

    if (!rawCredential) {
      return res.status(400).json({ message: 'QR token or visitor code is required.' });
    }

    const normalizedCredential = normalizeQrCredential(rawCredential);
    const visitor = await Visitor.findOne({
      $or: [
        { qrToken: normalizedCredential.qrToken },
        { qrManualCode: normalizedCredential.qrManualCode }
      ]
    });

    if (!visitor) {
      return res.status(404).json({ message: 'QR visitor pass or visitor code was not found.' });
    }

    if (visitor.reviewStatus !== 'approved' || visitor.status === 'rejected') {
      return res.status(400).json({ message: 'This QR visitor pass is not approved for entry.' });
    }

    const accessError = validateQrCheckpointAccess(req, visitor, checkpoint);
    if (accessError) {
      return res.status(403).json({ message: accessError });
    }

    synchronizeVisitorQrState(visitor);

    const result = markCheckpoint(visitor, checkpoint, buildActorSnapshot(req.user), 'scan');
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    await visitor.save();
    await recordQrCheckpointLog(visitor, checkpoint, req.user, result);

    return res.json({
      message: `${result.value.label || 'QR checkpoint'} recorded successfully.`,
      visitor,
      checkpoint: result.value
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.markForgottenQrCheckpoint = async (req, res) => {
  try {
    const checkpoint = String(req.body?.checkpoint || '').trim();
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (visitor.reviewStatus !== 'approved' || visitor.status === 'rejected') {
      return res.status(400).json({ message: 'This visitor is not approved for QR entry.' });
    }

    const accessError = validateQrCheckpointAccess(req, visitor, checkpoint);
    if (accessError) {
      return res.status(403).json({ message: accessError });
    }

    synchronizeVisitorQrState(visitor);

    const result = markCheckpoint(visitor, checkpoint, buildActorSnapshot(req.user), 'forgot');
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    await visitor.save();
    await recordQrCheckpointLog(visitor, checkpoint, req.user, result);

    return res.json({
      message: `${result.value.label || 'QR checkpoint'} bypassed successfully.`,
      visitor,
      checkpoint: result.value
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Log visitor exit
// @route   PATCH /api/visitors/:id/exit
// @access  Guard only
exports.logVisitorExit = async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (isQrManagedVisitor(visitor)) {
      return res.status(400).json({
        message: 'This is a QR-approved visit. Log exit in the Pre-Registered Visitors module.'
      });
    }

    visitor.exitTime = new Date();
    visitor.status = 'exited';
    await visitor.save();

    res.json({
      message: 'Visitor exit logged successfully',
      visitor
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Cancel pre-registered visitor
// @route   DELETE /api/visitors/:id/cancel
// @access  Guard/Resident only
exports.cancelPreRegisteredVisitor = async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (!ensureResidentOwnsVisitor(req, visitor)) {
      return res.status(403).json({ message: 'You can only cancel your own pre-registered visitors.' });
    }

    if (visitor.status !== 'pre-registered') {
      return res.status(400).json({ message: 'Only pre-registered visitors can be cancelled' });
    }

    await Visitor.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Pre-registered visitor cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
