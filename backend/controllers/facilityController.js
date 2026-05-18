const FacilityReservation = require('../models/FacilityReservation');
const FacilityReservationLock = require('../models/FacilityReservationLock');
const FacilitySetting = require('../models/FacilitySetting');
const EntryLog = require('../models/EntryLog');
const User = require('../models/User');
const crypto = require('crypto');
const { hasCloudinaryConfig } = require('../utils/cloudinary');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');

const DEFAULT_EVENT_TYPES = Object.freeze([
  'Birthday',
  'Meeting',
  'Conference',
  'Practice',
  'Training',
  'Assembly',
  'Other'
]);

const _X_MIN = -4.85;
const _X_MAX = 4.85;
const _Z_MIN = -2.85;
const _Z_MAX = 2.85;
const _Y_DEFAULT = 0.58;
const _BUILDING_CLEARANCE = 0.68;
const _POSITION_GRID_STEP = 0.55;

// Mirrors the fixed 3D map buildings so saved facilities do not stack on top of them.
const STATIC_MAP_BUILDING_COORDS = Object.freeze([
  [-4.6, -1.5],
  [4.85, 0.75],
  [3.0, -1.75],
  [3.8, -0.45],
  [0.35, 1.62],
  [-2.95, 1.65],
  [-2.15, -2.82],
  [-0.35, -2.05],
  [0.85, -0.85],
  [-1.15, 1.18],
  [-2.5, -1.6],
  [-1.7, -1.55],
  [-0.9, -1.55],
  [0.45, -1.45],
  [1.2, -1.38],
  [-2.8, -0.55],
  [-1.95, -0.5],
  [-1.1, -0.5],
  [0.3, -0.42],
  [1.15, -0.4],
  [2.05, -0.4],
  [-2.7, 0.65],
  [-1.85, 0.68],
  [-0.9, 0.68],
  [0.95, 0.72],
  [1.8, 0.72],
  [2.72, 0.75],
  [-2.4, 2.05],
  [-1.55, 2.05],
  [-0.65, 2.02],
  [0.75, 2.05],
  [1.65, 2.05]
]);

const DEFAULT_FACILITIES = Object.freeze([
  {
    name: 'Multi-Purpose Court',
    description: 'Open-air community venue for sports, practices, assemblies, and private functions.',
    hourlyRate: 250,
    paymentRequired: true,
    eventTypes: ['Birthday', 'Meeting', 'Conference', 'Practice', 'Basketball Game', 'Training', 'Assembly', 'Other'],
    mapPosition: { x: 0.35, y: 0.58, z: 1.62 }
  },
  {
    name: 'Chapel',
    description: 'Quiet ceremonial space for prayer meetings, memorials, and community services.',
    hourlyRate: 0,
    paymentRequired: false,
    eventTypes: ['Funeral', 'Wake Service', 'Prayer Meeting', 'Memorial Service', 'Other'],
    mapPosition: { x: 2.95, y: 0.58, z: -1.65 }
  }
]);

const isAdminRole = (role) => ['ADMIN', 'MASTER_ADMIN'].includes(String(role || '').toUpperCase());
const RESERVATION_LOCK_TTL_MS = 15000;
const RESERVATION_LOCK_RETRIES = 20;
const RESERVATION_LOCK_RETRY_DELAY_MS = 120;
const RESERVATION_HOLD_MS = 12 * 60 * 60 * 1000;
const FACILITY_QR_CHECKPOINTS = Object.freeze([
  { checkpoint: 'gate_entry', label: 'Subdivision Gate Entrance' },
  { checkpoint: 'gate_exit', label: 'Subdivision Gate Exit' }
]);
const FACILITY_QR_MANUAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FACILITY_QR_CHECKPOINT_LABELS = FACILITY_QR_CHECKPOINTS.reduce((map, item) => {
  map[item.checkpoint] = item.label;
  return map;
}, {});
const VALID_FACILITY_QR_CHECKPOINTS = new Set(FACILITY_QR_CHECKPOINTS.map((item) => item.checkpoint));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const acquireReservationLock = async (lockKey, owner) => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_LOCK_TTL_MS);

  const existing = await FacilityReservationLock.findOneAndUpdate(
    {
      lockKey,
      $or: [
        { expiresAt: { $lte: now } },
        { owner }
      ]
    },
    {
      $set: {
        owner,
        expiresAt
      }
    },
    { new: true }
  );

  if (existing) {
    return true;
  }

  try {
    await FacilityReservationLock.create({ lockKey, owner, expiresAt });
    return true;
  } catch (error) {
    if (error?.code === 11000) {
      return false;
    }
    throw error;
  }
};

const releaseReservationLock = async (lockKey, owner) => {
  await FacilityReservationLock.deleteOne({ lockKey, owner });
};

const isReservationHoldExpired = (reservation) =>
  reservation?.status === 'pending' &&
  reservation.expiresAt &&
  new Date(reservation.expiresAt).getTime() <= Date.now();

const expireReservationIfNeeded = async (reservation) => {
  if (!isReservationHoldExpired(reservation)) {
    return false;
  }

  reservation.status = 'expired';
  await reservation.save();
  return true;
};

const expirePendingReservationHolds = async () => {
  const result = await FacilityReservation.updateMany(
    {
      status: 'pending',
      expiresAt: { $lte: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );

  return result.modifiedCount || 0;
};

const buildActorSnapshot = (user = {}) => ({
  id: String(user.userId || user.id || user._id || ''),
  name: String(user.fullName || user.username || '').trim(),
  role: String(user.role || '').trim()
});

const normalizeQrCredential = (value) => {
  const trimmed = String(value || '').trim();

  return {
    qrToken: trimmed.toLowerCase(),
    qrManualCode: trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  };
};

const generateFacilityQrToken = () => crypto.randomBytes(24).toString('hex');
const generateFacilityQrManualCode = (length = 8) =>
  Array.from({ length }, () => FACILITY_QR_MANUAL_CODE_ALPHABET[crypto.randomInt(0, FACILITY_QR_MANUAL_CODE_ALPHABET.length)]).join('');

const getFacilityGuestPassLimit = (reservation) =>
  Math.max(0, Math.min(1000, Math.floor(Number(reservation?.numberOfGuests) || 0)));

const clearFacilityGuestQrState = (reservation) => {
  reservation.guestQrEnabled = false;
  reservation.guestQrToken = undefined;
  reservation.guestQrManualCode = undefined;
  reservation.guestQrEntryUsed = 0;
  reservation.guestQrExitUsed = 0;
  reservation.guestQrScanEvents = [];
};

const synchronizeFacilityGuestQrState = (reservation) => {
  let changed = false;
  const guestLimit = getFacilityGuestPassLimit(reservation);
  const shouldEnable = reservation?.status === 'approved' && guestLimit > 0;

  if (!shouldEnable) {
    const hasQrState = Boolean(
      reservation?.guestQrEnabled ||
      String(reservation?.guestQrToken || '').trim() ||
      String(reservation?.guestQrManualCode || '').trim() ||
      Number(reservation?.guestQrEntryUsed || 0) > 0 ||
      Number(reservation?.guestQrExitUsed || 0) > 0 ||
      (Array.isArray(reservation?.guestQrScanEvents) && reservation.guestQrScanEvents.length > 0)
    );

    if (hasQrState) {
      clearFacilityGuestQrState(reservation);
      changed = true;
    }

    return { guestLimit, changed };
  }

  if (!reservation.guestQrEnabled) {
    reservation.guestQrEnabled = true;
    changed = true;
  }

  if (!reservation.guestQrToken) {
    reservation.guestQrToken = generateFacilityQrToken();
    changed = true;
  }

  if (!reservation.guestQrManualCode) {
    reservation.guestQrManualCode = generateFacilityQrManualCode();
    changed = true;
  }

  const normalizedEntryUsed = Math.max(0, Math.min(guestLimit, Math.floor(Number(reservation.guestQrEntryUsed) || 0)));
  const normalizedExitUsed = Math.max(0, Math.min(normalizedEntryUsed, Math.floor(Number(reservation.guestQrExitUsed) || 0)));

  if (normalizedEntryUsed !== Number(reservation.guestQrEntryUsed || 0)) {
    reservation.guestQrEntryUsed = normalizedEntryUsed;
    changed = true;
  }

  if (normalizedExitUsed !== Number(reservation.guestQrExitUsed || 0)) {
    reservation.guestQrExitUsed = normalizedExitUsed;
    changed = true;
  }

  const scanEvents = Array.isArray(reservation.guestQrScanEvents)
    ? reservation.guestQrScanEvents
    : [];
  const maxEvents = normalizedEntryUsed + normalizedExitUsed;

  if (!Array.isArray(reservation.guestQrScanEvents)) {
    reservation.guestQrScanEvents = scanEvents;
    changed = true;
  }

  if (scanEvents.length > maxEvents) {
    reservation.guestQrScanEvents = scanEvents.slice(0, maxEvents);
    changed = true;
  }

  return { guestLimit, changed };
};

const getFacilityGuestQrSummary = (reservation) => {
  const guestLimit = getFacilityGuestPassLimit(reservation);
  const entryUsed = Math.max(0, Math.min(guestLimit, Math.floor(Number(reservation?.guestQrEntryUsed) || 0)));
  const exitUsed = Math.max(0, Math.min(entryUsed, Math.floor(Number(reservation?.guestQrExitUsed) || 0)));
  const enabled = Boolean(
    reservation?.guestQrEnabled &&
    reservation?.status === 'approved' &&
    guestLimit > 0 &&
    String(reservation?.guestQrToken || '').trim()
  );

  return {
    enabled,
    token: enabled ? String(reservation?.guestQrToken || '').trim() : '',
    manualCode: enabled ? String(reservation?.guestQrManualCode || '').trim() : '',
    entry: {
      used: entryUsed,
      total: guestLimit,
      remaining: Math.max(0, guestLimit - entryUsed)
    },
    exit: {
      used: exitUsed,
      total: guestLimit,
      remaining: Math.max(0, guestLimit - exitUsed)
    },
    insideCount: Math.max(0, entryUsed - exitUsed),
    totalScans: entryUsed + exitUsed,
    scanEvents: Array.isArray(reservation?.guestQrScanEvents) ? reservation.guestQrScanEvents : []
  };
};

const markFacilityGuestCheckpoint = (reservation, checkpoint, actor, mode = 'scan') => {
  if (!VALID_FACILITY_QR_CHECKPOINTS.has(checkpoint)) {
    return { error: 'Please choose a valid facility guest gate checkpoint.' };
  }

  const { guestLimit } = synchronizeFacilityGuestQrState(reservation);

  if (
    !reservation.guestQrEnabled ||
    !reservation.guestQrToken ||
    reservation.status !== 'approved' ||
    guestLimit <= 0
  ) {
    return { error: 'Guest gate QR is not enabled for this reservation.' };
  }

  const entryUsed = Math.max(0, Math.min(guestLimit, Math.floor(Number(reservation.guestQrEntryUsed) || 0)));
  const exitUsed = Math.max(0, Math.min(entryUsed, Math.floor(Number(reservation.guestQrExitUsed) || 0)));

  if (checkpoint === 'gate_entry' && entryUsed >= guestLimit) {
    return { error: 'Gate entry is already complete for all expected guests in this reservation.' };
  }

  if (checkpoint === 'gate_exit') {
    if (exitUsed >= guestLimit) {
      return { error: 'Gate exit is already complete for all expected guests in this reservation.' };
    }

    if (exitUsed >= entryUsed) {
      return { error: 'Record at least one Gate Entry before recording Gate Exit.' };
    }
  }

  const sequenceNumber = checkpoint === 'gate_entry' ? entryUsed + 1 : exitUsed + 1;
  const eventRecord = {
    checkpoint,
    label: FACILITY_QR_CHECKPOINT_LABELS[checkpoint] || 'Facility guest QR checkpoint',
    sequenceNumber,
    mode,
    usedAt: new Date(),
    recordedBy: actor.id,
    recordedByName: actor.name,
    recordedByRole: actor.role
  };

  if (checkpoint === 'gate_entry') {
    reservation.guestQrEntryUsed = sequenceNumber;
  } else {
    reservation.guestQrExitUsed = sequenceNumber;
  }

  reservation.guestQrScanEvents = [
    ...(Array.isArray(reservation.guestQrScanEvents) ? reservation.guestQrScanEvents : []),
    eventRecord
  ];

  return {
    value: eventRecord,
    sequenceNumber,
    sequenceTotal: guestLimit
  };
};

const recordFacilityGuestCheckpointLog = async (reservation, checkpoint, user, result) => {
  const role = String(user?.role || '').toUpperCase();
  const sequenceLabel = result?.sequenceTotal > 1
    ? ` (${result.sequenceNumber}/${result.sequenceTotal})`
    : '';
  const notesByCheckpoint = {
    gate_entry: `Facility guest gate entry${sequenceLabel} - ${reservation.facilityName}`,
    gate_exit: `Facility guest gate exit${sequenceLabel} - ${reservation.facilityName}`
  };

  await EntryLog.create({
    plateNumber: 'NO-VEHICLE',
    logType: checkpoint === 'gate_entry' ? 'entry' : 'exit',
    vehicleOwnerType: 'visitor',
    ownerName: `${reservation.residentName} facility guests`,
    residentId: reservation.residentId,
    residentName: reservation.residentName,
    residentAddress: reservation.residentAddress,
    guardOnDuty: role === 'GUARD' ? (user.userId || user.id || user._id) : undefined,
    recordedBy: user.userId || user.id || user._id,
    recordedByName: String(user.fullName || user.username || '').trim(),
    recordedByRole: role,
    notes: notesByCheckpoint[checkpoint] || 'Facility guest QR checkpoint'
  });
};

const sanitizeEventTypes = (eventTypes) => {
  const source = Array.isArray(eventTypes) && eventTypes.length > 0
    ? eventTypes
    : DEFAULT_EVENT_TYPES;

  return [...new Set(
    source
      .map((eventType) => String(eventType || '').trim())
      .filter(Boolean)
  )];
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const FACILITY_NAME_PATTERN = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;

const getFallbackPosition = (index = 0) => {
  const positions = [
    { x: 3.0, y: _Y_DEFAULT, z: -1.75 },
    { x: 3.8, y: _Y_DEFAULT, z: -0.45 },
    { x: 0.35, y: _Y_DEFAULT, z: 1.62 },
    { x: -2.95, y: _Y_DEFAULT, z: 1.65 },
    { x: -2.15, y: _Y_DEFAULT, z: -2.82 },
    { x: 1.9, y: _Y_DEFAULT, z: 1.95 },
    { x: -3.55, y: _Y_DEFAULT, z: -0.1 },
    { x: 4.15, y: _Y_DEFAULT, z: 1.6 }
  ];

  return positions[Math.abs(Number(index) || 0) % positions.length];
};

const normalizePosition = (rawPosition = {}, index = 0) => {
  const source = rawPosition?.mapPosition || rawPosition?.Position || rawPosition?.position || rawPosition || {};
  const fallback = getFallbackPosition(index);
  const rawX = source.x ?? source.X ?? source.mapX ?? rawPosition.mapX;
  const rawY = source.y ?? source.Y ?? source.mapY ?? rawPosition.mapY;
  const rawZ = source.z ?? source.Z ?? source.mapZ ?? rawPosition.mapZ;
  const x = Number(rawX);
  const y = Number(rawY);
  const z = Number(rawZ);

  return {
    x: Number(clamp(Number.isFinite(x) ? x : fallback.x, _X_MIN, _X_MAX).toFixed(2)),
    y: Number(clamp(Number.isFinite(y) ? y : fallback.y, 0.35, 1.05).toFixed(2)),
    z: Number(clamp(Number.isFinite(z) ? z : fallback.z, _Z_MIN, _Z_MAX).toFixed(2))
  };
};

const STATIC_MAP_BUILDING_POSITIONS = Object.freeze(
  STATIC_MAP_BUILDING_COORDS.map(([x, z]) => ({ x, y: _Y_DEFAULT, z }))
);

const positionKey = (position) => `${Number(position.x).toFixed(2)}:${Number(position.z).toFixed(2)}`;

const positionsOverlap = (first, second) =>
  Math.abs(Number(first?.x) - Number(second?.x)) < _BUILDING_CLEARANCE &&
  Math.abs(Number(first?.z) - Number(second?.z)) < _BUILDING_CLEARANCE;

const isPositionOccupied = (position, occupiedPositions = []) =>
  occupiedPositions.some((occupiedPosition) => positionsOverlap(position, occupiedPosition));

const getFacilityStoredPosition = (facility, index = 0) =>
  normalizePosition(facility?.mapPosition || facility?.Position || facility || {}, index);

const getOccupiedMapPositions = (facilities = [], excludeFacilityId = '') => {
  const excludedId = String(excludeFacilityId || '');
  const occupiedPositions = [...STATIC_MAP_BUILDING_POSITIONS];

  facilities.forEach((facility, index) => {
    if (excludedId && String(facility?._id || '') === excludedId) {
      return;
    }

    occupiedPositions.push(getFacilityStoredPosition(facility, index));
  });

  return occupiedPositions;
};

const buildCandidatePositions = (preferredPosition, index = 0) => {
  const seen = new Set();
  const candidates = [];
  const addCandidate = (rawPosition) => {
    const candidate = normalizePosition(rawPosition, index);
    const key = positionKey(candidate);

    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(candidate);
    }
  };

  addCandidate(preferredPosition);
  addCandidate(getFallbackPosition(index));

  for (let radius = _POSITION_GRID_STEP; radius <= 7.2; radius += _POSITION_GRID_STEP) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (Math.PI * 2 * step) / 16;
      addCandidate({
        x: preferredPosition.x + Math.cos(angle) * radius,
        y: preferredPosition.y,
        z: preferredPosition.z + Math.sin(angle) * radius
      });
    }
  }

  const gridCandidates = [];
  for (let x = _X_MIN; x <= _X_MAX + 0.001; x += _POSITION_GRID_STEP) {
    for (let z = _Z_MIN; z <= _Z_MAX + 0.001; z += _POSITION_GRID_STEP) {
      const candidate = normalizePosition({ x, y: preferredPosition.y, z }, index);
      gridCandidates.push({
        candidate,
        distance: Math.hypot(candidate.x - preferredPosition.x, candidate.z - preferredPosition.z)
      });
    }
  }

  gridCandidates
    .sort((first, second) => first.distance - second.distance)
    .forEach(({ candidate }) => addCandidate(candidate));

  return candidates;
};

const resolveAvailablePosition = (rawPosition, {
  index = 0,
  facilities = [],
  excludeFacilityId = '',
  occupiedPositions = null
} = {}) => {
  const preferredPosition = normalizePosition(rawPosition, index);
  const occupied = occupiedPositions || getOccupiedMapPositions(facilities, excludeFacilityId);

  for (const candidate of buildCandidatePositions(preferredPosition, index)) {
    if (!isPositionOccupied(candidate, occupied)) {
      return {
        position: candidate,
        adjusted: positionKey(candidate) !== positionKey(preferredPosition)
      };
    }
  }

  return {
    error: 'No available map position is free from existing buildings.'
  };
};

const buildDefaultFacilities = () => {
  const occupiedPositions = [...STATIC_MAP_BUILDING_POSITIONS];

  return DEFAULT_FACILITIES.map((facility, index) => {
    const resolved = resolveAvailablePosition(facility.mapPosition || facility.Position, {
      index,
      occupiedPositions
    });
    const mapPosition = resolved.position || normalizePosition(facility.mapPosition || facility.Position, index);
    occupiedPositions.push(mapPosition);

    return {
      name: facility.name,
      description: String(facility.description || '').trim(),
      hourlyRate: Number(facility.hourlyRate) || 0,
      paymentRequired: Number(facility.hourlyRate) > 0,
      eventTypes: sanitizeEventTypes(facility.eventTypes),
      mapPosition
    };
  });
};

const serializeFacility = (facility, index = 0) => {
  if (!facility) {
    return null;
  }

  const facilityObject = typeof facility.toObject === 'function'
    ? facility.toObject()
    : { ...facility };
  const mapPosition = getFacilityStoredPosition(facilityObject, index);

  return {
    ...facilityObject,
    description: String(facilityObject.description || '').trim(),
    mapPosition,
    Position: mapPosition,
    hourlyRate: Number(facilityObject.hourlyRate) || 0,
    paymentRequired: Number(facilityObject.hourlyRate) > 0,
    eventTypes: sanitizeEventTypes(facilityObject.eventTypes),
    photo: facilityObject.photo || {}
  };
};

const getSettings = async () => {
  let settings = await FacilitySetting.findOne({ key: 'default' });
  let shouldSave = false;

  if (!settings) {
    settings = new FacilitySetting({ key: 'default' });
    shouldSave = true;
  }

  if (!Array.isArray(settings.facilities) || settings.facilities.length === 0) {
    settings.facilities = buildDefaultFacilities();
    shouldSave = true;
  } else {
    const occupiedPositions = [...STATIC_MAP_BUILDING_POSITIONS];

    settings.facilities.forEach((facility, index) => {
      const normalizedRate = Math.max(0, Number(facility.hourlyRate) || 0);
      const normalizedEvents = sanitizeEventTypes(facility.eventTypes);
      const resolvedPosition = resolveAvailablePosition(facility.mapPosition || facility.Position, {
        index,
        occupiedPositions
      });
      const normalizedPosition = resolvedPosition.position ||
        normalizePosition(facility.mapPosition || facility.Position, index);

      occupiedPositions.push(normalizedPosition);

      if (facility.hourlyRate !== normalizedRate) {
        facility.hourlyRate = normalizedRate;
        shouldSave = true;
      }

      if (facility.paymentRequired !== (normalizedRate > 0)) {
        facility.paymentRequired = normalizedRate > 0;
        shouldSave = true;
      }

      if (JSON.stringify(facility.eventTypes || []) !== JSON.stringify(normalizedEvents)) {
        facility.eventTypes = normalizedEvents;
        shouldSave = true;
      }

      if (typeof facility.description !== 'string') {
        facility.description = '';
        shouldSave = true;
      }

      if (
        !facility.mapPosition ||
        Number(facility.mapPosition.x) !== normalizedPosition.x ||
        Number(facility.mapPosition.y) !== normalizedPosition.y ||
        Number(facility.mapPosition.z) !== normalizedPosition.z
      ) {
        facility.mapPosition = normalizedPosition;
        shouldSave = true;
      }
    });
  }

  if (shouldSave) {
    await settings.save();
  }

  return settings;
};

const getFacilityLookup = (settings) => {
  const facilities = Array.isArray(settings?.facilities) ? settings.facilities : [];
  const byId = new Map();
  const byName = new Map();

  facilities.forEach((facility, index) => {
    const serialized = serializeFacility(facility, index);
    const facilityId = String(serialized?._id || '');
    const facilityName = String(serialized?.name || '').trim().toLowerCase();

    if (facilityId) {
      byId.set(facilityId, serialized);
    }

    if (facilityName) {
      byName.set(facilityName, serialized);
    }
  });

  return { byId, byName };
};

const getFacilityFromSettings = (settings, { facilityId, facilityName } = {}) => {
  const lookup = getFacilityLookup(settings);
  const normalizedId = String(facilityId || '').trim();
  const normalizedName = String(facilityName || '').trim().toLowerCase();

  if (normalizedId && lookup.byId.has(normalizedId)) {
    return lookup.byId.get(normalizedId);
  }

  if (normalizedName && lookup.byName.has(normalizedName)) {
    return lookup.byName.get(normalizedName);
  }

  return null;
};

const serializeFacilityReservation = (reservation, settings) => {
  const reservationObject = typeof reservation?.toObject === 'function'
    ? reservation.toObject()
    : { ...reservation };

  const facility = getFacilityFromSettings(settings, {
    facilityId: reservationObject.facilityId,
    facilityName: reservationObject.facilityName
  });

  return {
    ...reservationObject,
    guestQr: getFacilityGuestQrSummary(reservationObject),
    facility: facility
      ? {
          _id: facility._id,
          name: facility.name,
          description: facility.description,
          hourlyRate: facility.hourlyRate,
          paymentRequired: facility.paymentRequired,
          eventTypes: facility.eventTypes,
          Position: facility.Position,
          mapPosition: facility.mapPosition,
          photo: facility.photo || {}
        }
      : null
  };
};

const attachFacilityMetadata = (reservations, settings) =>
  reservations.map((reservation) => serializeFacilityReservation(reservation, settings));

const synchronizeFacilityReservationsForResponse = async (reservations = []) => {
  await Promise.all(
    reservations.map(async (reservation) => {
      if (!reservation || typeof reservation.save !== 'function') {
        return;
      }

      const { changed } = synchronizeFacilityGuestQrState(reservation);
      if (changed) {
        await reservation.save();
      }
    })
  );

  return reservations;
};

const validateFacilityPayload = (payload = {}, index = 0) => {
  const { name, description, hourlyRate } = payload;
  const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
  const normalizedDescription = String(description || '').trim();
  const normalizedRate = Number(hourlyRate);
  const mapPosition = normalizePosition({
    x: payload.mapX ?? payload.x ?? payload.X,
    y: payload.mapY ?? payload.y ?? payload.Y ?? _Y_DEFAULT,
    z: payload.mapZ ?? payload.z ?? payload.Z
  }, index);

  if (normalizedName.length < 2 || normalizedName.length > 80) {
    return { error: 'Facility name must be 2-80 characters long.' };
  }

  if (!FACILITY_NAME_PATTERN.test(normalizedName)) {
    return { error: 'Facility name can only contain letters and spaces.' };
  }

  if (normalizedDescription.length > 500) {
    return { error: 'Facility description must not exceed 500 characters.' };
  }

  if (!Number.isFinite(normalizedRate) || normalizedRate < 0) {
    return { error: 'Facility price must be 0 or higher.' };
  }

  return {
    value: {
      name: normalizedName,
      description: normalizedDescription,
      hourlyRate: Number(normalizedRate.toFixed(2)),
      paymentRequired: normalizedRate > 0,
      eventTypes: [...DEFAULT_EVENT_TYPES],
      mapPosition
    }
  };
};

const syncReservationsForFacility = async (facilityId, facilityName) => {
  if (!facilityId || !facilityName) {
    return;
  }

  await FacilityReservation.updateMany(
    {
      facilityName,
      $or: [
        { facilityId: { $exists: false } },
        { facilityId: null }
      ]
    },
    {
      $set: { facilityId }
    }
  );
};

const getAllReservations = async (req, res) => {
  try {
    await expirePendingReservationHolds();

    const settings = await getSettings();
    const pagination = parsePagination(req.query);
    const filter = {};
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim().toLowerCase();
    const facilityId = String(req.query.facilityId || '').trim();

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { facilityName: searchRegex },
        { eventType: searchRegex },
        { residentName: searchRegex },
        { residentAddress: searchRegex },
        { purpose: searchRegex }
      ];
    }

    if (status === 'upcoming') {
      filter.status = { $in: ['pending', 'approved'] };
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { endDateTime: { $gte: new Date() } },
            {
              $and: [
                { endDateTime: { $exists: false } },
                { dateReserved: { $gte: new Date() } }
              ]
            }
          ]
        }
      ];
    } else if (['approved', 'pending', 'rejected', 'expired'].includes(status)) {
      filter.status = status;
    }

    if (facilityId && facilityId !== 'all') {
      if (/^[a-fA-F0-9]{24}$/.test(facilityId)) {
        filter.facilityId = facilityId;
      } else {
        filter._id = null;
      }
    }

    const baseQuery = FacilityReservation.find(filter)
      .sort({ createdAt: -1 })
      .populate('residentId', 'familyName email phoneNumber');

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        baseQuery.clone().skip(pagination.skip).limit(pagination.limit),
        FacilityReservation.countDocuments(filter)
      ]);
      await synchronizeFacilityReservationsForResponse(items);

      return sendPaginatedResponse(
        res,
        pagination,
        attachFacilityMetadata(items, settings),
        total
      );
    }

    const reservations = await baseQuery;
    await synchronizeFacilityReservationsForResponse(reservations);
    res.json(attachFacilityMetadata(reservations, settings));
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ message: 'Error fetching reservations' });
  }
};

const getReservationCalendar = async (req, res) => {
  try {
    await expirePendingReservationHolds();

    const settings = await getSettings();
    const start = new Date(req.query.start);
    const end = new Date(req.query.end);
    const status = String(req.query.status || 'upcoming').trim().toLowerCase();
    const facilityId = String(req.query.facilityId || '').trim();

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      return res.status(400).json({ message: 'A valid calendar date range is required' });
    }

    const maxRangeMs = 1000 * 60 * 60 * 24 * 93;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      return res.status(400).json({ message: 'Calendar range cannot exceed 93 days' });
    }

    const filter = {
      dateReserved: { $lt: end },
      endDateTime: { $gt: start }
    };

    if (status === 'upcoming') {
      filter.status = { $in: ['pending', 'approved'] };
    } else if (['pending', 'approved', 'rejected', 'expired'].includes(status)) {
      filter.status = status;
    } else {
      return res.status(400).json({ message: 'Invalid calendar status filter' });
    }

    if (facilityId && facilityId !== 'all') {
      if (/^[a-fA-F0-9]{24}$/.test(facilityId)) {
        filter.facilityId = facilityId;
      } else {
        return res.json([]);
      }
    }

    const includeResidentDetails = String(req.user?.role || '').toUpperCase() !== 'RESIDENT';
    const reservations = await FacilityReservation.find(filter)
      .sort({ dateReserved: 1, createdAt: 1 })
      .lean();
    const enrichedReservations = attachFacilityMetadata(reservations, settings);

    return res.json(
      enrichedReservations.map((reservation) => ({
        _id: reservation._id,
        facilityId: reservation.facility?._id || reservation.facilityId || null,
        facilityName: reservation.facility?.name || reservation.facilityName,
        facility: reservation.facility
          ? {
              _id: reservation.facility._id,
              name: reservation.facility.name,
              description: reservation.facility.description,
              hourlyRate: reservation.facility.hourlyRate,
              paymentRequired: reservation.facility.paymentRequired,
              photo: reservation.facility.photo || {}
            }
          : null,
        eventType: reservation.eventType,
        status: reservation.status,
        dateReserved: reservation.dateReserved,
        endDateTime: reservation.endDateTime,
        durationHours: reservation.durationHours,
        numberOfGuests: reservation.numberOfGuests,
        ...(includeResidentDetails
          ? {
              purpose: reservation.purpose,
              residentName: reservation.residentName,
              residentAddress: reservation.residentAddress
            }
          : {})
      }))
    );
  } catch (error) {
    console.error('Error fetching reservation calendar:', error);
    return res.status(500).json({ message: 'Error fetching reservation calendar' });
  }
};

const getMyReservations = async (req, res) => {
  try {
    await expirePendingReservationHolds();

    const settings = await getSettings();
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const filter = { residentId: userId };
    const pagination = parsePagination(req.query);
    const baseQuery = FacilityReservation.find(filter)
      .sort({ createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        baseQuery.clone().skip(pagination.skip).limit(pagination.limit),
        FacilityReservation.countDocuments(filter)
      ]);
      await synchronizeFacilityReservationsForResponse(items);

      return sendPaginatedResponse(
        res,
        pagination,
        attachFacilityMetadata(items, settings),
        total
      );
    }

    const reservations = await baseQuery;
    await synchronizeFacilityReservationsForResponse(reservations);
    res.json(attachFacilityMetadata(reservations, settings));
  } catch (error) {
    console.error('Error fetching my reservations:', error);
    res.status(500).json({ message: 'Error fetching reservations' });
  }
};

const getFacilitySettings = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json({
      gcashQr: settings.gcashQr || {},
      facilities: (settings.facilities || []).map(serializeFacility)
    });
  } catch (error) {
    console.error('Error fetching facility settings:', error);
    res.status(500).json({ message: 'Error fetching facility settings' });
  }
};

const createFacility = async (req, res) => {
  try {
    const settings = await getSettings();
    const { value, error } = validateFacilityPayload(req.body, settings.facilities?.length || 0);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const duplicate = (settings.facilities || []).some(
      (facility) => String(facility.name || '').trim().toLowerCase() === value.name.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({ message: 'A facility with that name already exists.' });
    }

    const resolvedPosition = resolveAvailablePosition(value.mapPosition, {
      index: settings.facilities?.length || 0,
      facilities: settings.facilities || []
    });

    if (resolvedPosition.error) {
      return res.status(409).json({ message: resolvedPosition.error });
    }

    value.mapPosition = resolvedPosition.position;

    if (req.file && !hasCloudinaryConfig()) {
      return res.status(500).json({ message: 'Cloudinary must be configured before uploading facility photos.' });
    }

    const facilityPayload = { ...value };

    if (req.file) {
      facilityPayload.photo = await storeUploadedFile(req.file, {
        folder: 'ecotrend-hoa/facilities/photos',
        localDir: 'uploads/facilities/photos',
        prefix: 'facility-photo',
        resourceType: 'image'
      });
    }

    settings.facilities.push(facilityPayload);
    await settings.save();

    const facility = settings.facilities[settings.facilities.length - 1];
    return res.status(201).json({
      message: 'Facility created successfully.',
      facility: serializeFacility(facility, settings.facilities.length - 1)
    });
  } catch (error) {
    console.error('Error creating facility:', error);
    res.status(500).json({ message: 'Failed to create facility' });
  }
};

const updateFacility = async (req, res) => {
  try {
    const settings = await getSettings();
    const facility = settings.facilities.id(req.params.facilityId);

    if (!facility) {
      return res.status(404).json({ message: 'Facility not found.' });
    }

    const facilityIndex = Math.max(
      0,
      (settings.facilities || []).findIndex((item) => String(item._id) === String(facility._id))
    );
    const { value, error } = validateFacilityPayload(req.body, facilityIndex);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const duplicate = (settings.facilities || []).some(
      (item) =>
        String(item._id) !== String(facility._id) &&
        String(item.name || '').trim().toLowerCase() === value.name.toLowerCase()
    );

    if (duplicate) {
      return res.status(409).json({ message: 'A facility with that name already exists.' });
    }

    const resolvedPosition = resolveAvailablePosition(value.mapPosition, {
      index: facilityIndex,
      facilities: settings.facilities || [],
      excludeFacilityId: facility._id
    });

    if (resolvedPosition.error) {
      return res.status(409).json({ message: resolvedPosition.error });
    }

    value.mapPosition = resolvedPosition.position;

    await syncReservationsForFacility(facility._id, facility.name);

    if (req.file && !hasCloudinaryConfig()) {
      return res.status(500).json({ message: 'Cloudinary must be configured before uploading facility photos.' });
    }

    if (req.file) {
      if (facility.photo?.path) {
        await deleteStoredFile(facility.photo);
      }

      facility.photo = await storeUploadedFile(req.file, {
        folder: 'ecotrend-hoa/facilities/photos',
        localDir: 'uploads/facilities/photos',
        prefix: 'facility-photo',
        resourceType: 'image'
      });
    }

    facility.name = value.name;
    facility.description = value.description;
    facility.hourlyRate = value.hourlyRate;
    facility.paymentRequired = value.paymentRequired;
    facility.eventTypes = value.eventTypes;
    facility.mapPosition = value.mapPosition;

    await settings.save();

    res.json({
      message: 'Facility updated successfully.',
      facility: serializeFacility(facility, facilityIndex)
    });
  } catch (error) {
    console.error('Error updating facility:', error);
    res.status(500).json({ message: 'Failed to update facility' });
  }
};

const deleteFacility = async (req, res) => {
  try {
    const settings = await getSettings();
    const facility = settings.facilities.id(req.params.facilityId);

    if (!facility) {
      return res.status(404).json({ message: 'Facility not found.' });
    }

    if ((settings.facilities || []).length <= 1) {
      return res.status(400).json({ message: 'At least one facility must remain in the system.' });
    }

    await syncReservationsForFacility(facility._id, facility.name);

    const activeReservations = await FacilityReservation.countDocuments({
      status: { $in: ['pending', 'approved'] },
      $or: [
        { facilityId: facility._id },
        { facilityName: facility.name }
      ]
    });

    if (activeReservations > 0) {
      return res.status(400).json({
        message: 'This facility still has pending or approved reservations. Reassign or resolve them first.'
      });
    }

    if (facility.photo?.path) {
      await deleteStoredFile(facility.photo);
    }

    settings.facilities.pull(facility._id);
    await settings.save();

    res.json({ message: 'Facility deleted successfully.' });
  } catch (error) {
    console.error('Error deleting facility:', error);
    res.status(500).json({ message: 'Failed to delete facility' });
  }
};

const createReservation = async (req, res) => {
  try {
    await expirePendingReservationHolds();

    const { facilityId, facilityName, eventType, dateReserved, durationHours, purpose, numberOfGuests } = req.body;
    const normalizedEventType = String(eventType || '').trim();
    const normalizedPurpose = String(purpose || '').trim();

    if ((!facilityId && !facilityName) || !normalizedEventType || !dateReserved || !normalizedPurpose) {
      return res.status(400).json({ message: 'Facility, event type, date, and purpose are required' });
    }

    if (normalizedPurpose.length > 500) {
      return res.status(400).json({ message: 'Purpose must not exceed 500 characters.' });
    }

    const settings = await getSettings();
    const facility = getFacilityFromSettings(settings, { facilityId, facilityName });

    if (!facility) {
      return res.status(400).json({ message: 'Invalid facility selected' });
    }

    if (facility.eventTypes?.length && !facility.eventTypes.includes(normalizedEventType)) {
      return res.status(400).json({ message: 'Invalid event type for selected facility' });
    }

    const userId = req.user?.id || req.user?._id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'User ID not found in token' });
    }

    const resident = await User.findById(userId);
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const reservationDate = new Date(dateReserved);
    if (Number.isNaN(reservationDate.getTime()) || reservationDate < new Date()) {
      return res.status(400).json({ message: 'Please choose a valid future reservation date' });
    }

    const safeDurationHours = Math.max(1, Math.min(12, Number(durationHours) || 1));
    const safeGuestCount = Math.max(0, Math.min(1000, Math.floor(Number(numberOfGuests) || 0)));
    const endDateTime = new Date(reservationDate.getTime() + safeDurationHours * 60 * 60 * 1000);

    const lockKey = String(facility._id || facility.name || '').trim().toLowerCase();
    const lockOwner = `${userId}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
    let lockAcquired = false;

    for (let attempt = 0; attempt < RESERVATION_LOCK_RETRIES; attempt += 1) {
      // Retry briefly when another request is currently reserving this same facility.
      // This keeps the overlap check + insert effectively serialized per facility.
      // The lock has a TTL, so stale locks are automatically recoverable.
      lockAcquired = await acquireReservationLock(lockKey, lockOwner);
      if (lockAcquired) {
        break;
      }
      await wait(RESERVATION_LOCK_RETRY_DELAY_MS);
    }

    if (!lockAcquired) {
      return res.status(429).json({
        message: 'Reservation is being processed for this facility. Please try again in a few seconds.'
      });
    }

    try {
      const existingReservation = await FacilityReservation.findOne({
        status: { $in: ['pending', 'approved'] },
        dateReserved: { $lt: endDateTime },
        endDateTime: { $gt: reservationDate },
        $or: [
          { facilityId: facility._id },
          { facilityName: facility.name }
        ]
      });

      if (existingReservation) {
        return res.status(400).json({ message: `${facility.name} already has a reservation during the selected time.` });
      }

      const totalAmount = facility.hourlyRate * safeDurationHours;

      const reservation = new FacilityReservation({
        facilityId: facility._id,
        facilityName: facility.name,
        eventType: normalizedEventType,
        residentId: userId,
        residentName: resident.familyName,
        residentAddress: `${resident.houseAddress}, ${resident.street}`,
        dateReserved: reservationDate,
        durationHours: safeDurationHours,
        endDateTime,
        purpose: normalizedPurpose,
        numberOfGuests: safeGuestCount,
        hourlyRate: facility.hourlyRate,
        totalAmount,
        paymentRequired: facility.paymentRequired,
        paymentMethod: facility.paymentRequired ? 'GCASH' : '',
        paymentStatus: facility.paymentRequired ? 'none' : 'verified',
        isPaid: !facility.paymentRequired,
        expiresAt: new Date(Date.now() + RESERVATION_HOLD_MS)
      });

      const savedReservation = await reservation.save();
      const [enrichedReservation] = attachFacilityMetadata([savedReservation.toObject()], settings);
      return res.status(201).json(enrichedReservation);
    } finally {
      await releaseReservationLock(lockKey, lockOwner);
    }
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ message: 'Error creating reservation', error: error.message });
  }
};

const uploadReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'No receipt file uploaded' });
    }

    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const reservation = await FacilityReservation.findOne({ _id: id, residentId: userId });

    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (await expireReservationIfNeeded(reservation)) {
      return res.status(400).json({ message: 'This reservation has expired and can no longer accept receipts.' });
    }

    if (!reservation.paymentRequired) {
      return res.status(400).json({ message: 'This reservation does not require payment' });
    }

    if (reservation.status !== 'pending') {
      return res.status(400).json({ message: 'Receipts can only be uploaded for pending reservations' });
    }

    if (reservation.paymentReceipt?.path) {
      await deleteStoredFile(reservation.paymentReceipt);
    }

    reservation.paymentReceipt = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/facility-receipts',
      localDir: 'uploads/facility-receipts',
      prefix: 'facility-receipt',
      resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto'
    });
    reservation.paymentMethod = 'GCASH';
    reservation.paymentStatus = 'pending';
    reservation.isPaid = false;

    await reservation.save();
    res.json(reservation);
  } catch (error) {
    console.error('Error uploading receipt:', error);
    res.status(500).json({ message: 'Error uploading receipt' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can verify payments' });
    }

    const { id } = req.params;
    const reservation = await FacilityReservation.findById(id);

    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (await expireReservationIfNeeded(reservation)) {
      return res.status(400).json({ message: 'Cannot verify payment for an expired reservation' });
    }

    if (reservation.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending reservations can have payments verified' });
    }

    if (!reservation.paymentRequired) {
      reservation.isPaid = true;
      reservation.paymentStatus = 'verified';
      await reservation.save();
      return res.json(reservation);
    }

    if (!reservation.paymentReceipt?.path) {
      return res.status(400).json({ message: 'No receipt uploaded yet' });
    }

    reservation.isPaid = true;
    reservation.paymentStatus = 'verified';
    await reservation.save();

    res.json(reservation);
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Error verifying payment' });
  }
};

const approveReservation = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can approve reservations' });
    }

    const { id } = req.params;
    const reservation = await FacilityReservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (await expireReservationIfNeeded(reservation)) {
      return res.status(400).json({ message: 'Cannot approve expired reservation' });
    }

    if (reservation.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending reservations can be approved' });
    }

    if (reservation.paymentRequired && !reservation.isPaid) {
      return res.status(400).json({ message: 'Payment not verified yet' });
    }

    reservation.status = 'approved';
    reservation.approvedBy = req.user.username;
    reservation.approvedAt = new Date();
    reservation.expiresAt = null;
    synchronizeFacilityGuestQrState(reservation);

    await reservation.save();
    const settings = await getSettings();
    res.json(serializeFacilityReservation(reservation, settings));
  } catch (error) {
    console.error('Error approving reservation:', error);
    res.status(500).json({ message: 'Error approving reservation' });
  }
};

const rejectReservation = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can reject reservations' });
    }

    const { id } = req.params;
    const { reason } = req.body;
    const reservation = await FacilityReservation.findById(id);

    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (await expireReservationIfNeeded(reservation)) {
      return res.status(400).json({ message: 'Cannot reject an expired reservation' });
    }

    if (reservation.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending reservations can be rejected' });
    }

    reservation.status = 'rejected';
    reservation.paymentStatus = reservation.paymentRequired && reservation.paymentReceipt?.path ? 'rejected' : reservation.paymentStatus;
    reservation.rejectionReason = String(reason || '').trim() || 'No reason provided';
    reservation.approvedBy = req.user.username;
    reservation.expiresAt = null;
    synchronizeFacilityGuestQrState(reservation);

    await reservation.save();
    const settings = await getSettings();
    res.json(serializeFacilityReservation(reservation, settings));
  } catch (error) {
    console.error('Error rejecting reservation:', error);
    res.status(500).json({ message: 'Error rejecting reservation' });
  }
};

const scanFacilityGuestQr = async (req, res) => {
  try {
    const rawCredential = String(req.body?.qrToken || '').trim();
    const checkpoint = String(req.body?.checkpoint || '').trim();

    if (!rawCredential) {
      return res.status(400).json({ message: 'QR token or facility guest code is required.' });
    }

    const normalizedCredential = normalizeQrCredential(rawCredential);
    const reservation = await FacilityReservation.findOne({
      $or: [
        { guestQrToken: normalizedCredential.qrToken },
        { guestQrManualCode: normalizedCredential.qrManualCode }
      ]
    });

    if (!reservation) {
      return res.status(404).json({ message: 'Facility guest QR pass or code was not found.' });
    }

    synchronizeFacilityGuestQrState(reservation);

    const result = markFacilityGuestCheckpoint(reservation, checkpoint, buildActorSnapshot(req.user), 'scan');
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    await reservation.save();
    await recordFacilityGuestCheckpointLog(reservation, checkpoint, req.user, result);

    const settings = await getSettings();
    return res.json({
      message: `${result.value.label || 'Facility guest QR checkpoint'} recorded successfully.`,
      reservation: serializeFacilityReservation(reservation, settings),
      checkpoint: result.value
    });
  } catch (error) {
    console.error('Error scanning facility guest QR:', error);
    return res.status(500).json({ message: 'Error scanning facility guest QR', error: error.message });
  }
};

const markForgottenFacilityGuestCheckpoint = async (req, res) => {
  try {
    const checkpoint = String(req.body?.checkpoint || '').trim();
    const reservation = await FacilityReservation.findById(req.params.id);

    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    synchronizeFacilityGuestQrState(reservation);

    const result = markFacilityGuestCheckpoint(reservation, checkpoint, buildActorSnapshot(req.user), 'forgot');
    if (result.error) {
      return res.status(400).json({ message: result.error });
    }

    await reservation.save();
    await recordFacilityGuestCheckpointLog(reservation, checkpoint, req.user, result);

    const settings = await getSettings();
    return res.json({
      message: `${result.value.label || 'Facility guest QR checkpoint'} bypassed successfully.`,
      reservation: serializeFacilityReservation(reservation, settings),
      checkpoint: result.value
    });
  } catch (error) {
    console.error('Error bypassing facility guest QR checkpoint:', error);
    return res.status(500).json({ message: 'Error bypassing facility guest QR checkpoint', error: error.message });
  }
};

const updateGcashQr = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can update the GCash QR code' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No QR code file uploaded' });
    }

    const settings = await getSettings();
    if (settings.gcashQr?.path) {
      await deleteStoredFile(settings.gcashQr);
    }

    settings.gcashQr = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/facilities',
      localDir: 'uploads/facilities',
      prefix: 'facility-gcash-qr',
      resourceType: 'image'
    });

    await settings.save();
    res.json(settings);
  } catch (error) {
    console.error('Error updating facility GCash QR:', error);
    res.status(500).json({ message: 'Failed to update GCash QR code' });
  }
};

const expireOldReservations = async (req, res) => {
  try {
    const modifiedCount = await expirePendingReservationHolds();
    res.json({ message: `Expired ${modifiedCount} reservations` });
  } catch (error) {
    console.error('Error expiring reservations:', error);
    res.status(500).json({ message: 'Error expiring reservations' });
  }
};

module.exports = {
  createFacility,
  createReservation,
  deleteFacility,
  expireOldReservations,
  getAllReservations,
  getReservationCalendar,
  getFacilitySettings,
  getMyReservations,
  approveReservation,
  markForgottenFacilityGuestCheckpoint,
  rejectReservation,
  scanFacilityGuestQr,
  updateFacility,
  updateGcashQr,
  uploadReceipt,
  verifyPayment
};
