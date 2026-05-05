const FacilityReservation = require('../models/FacilityReservation');
const FacilityReservationLock = require('../models/FacilityReservationLock');
const FacilitySetting = require('../models/FacilitySetting');
const User = require('../models/User');
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

const MAP_X_MIN = -4.85;
const MAP_X_MAX = 4.85;
const MAP_Z_MIN = -2.85;
const MAP_Z_MAX = 2.85;
const MAP_Y_DEFAULT = 0.58;

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

const getFallbackMapPosition = (index = 0) => {
  const positions = [
    { x: 3.0, y: MAP_Y_DEFAULT, z: -1.75 },
    { x: 3.8, y: MAP_Y_DEFAULT, z: -0.45 },
    { x: 0.35, y: MAP_Y_DEFAULT, z: 1.62 },
    { x: -2.95, y: MAP_Y_DEFAULT, z: 1.65 },
    { x: -2.15, y: MAP_Y_DEFAULT, z: -2.82 },
    { x: 1.9, y: MAP_Y_DEFAULT, z: 1.95 },
    { x: -3.55, y: MAP_Y_DEFAULT, z: -0.1 },
    { x: 4.15, y: MAP_Y_DEFAULT, z: 1.6 }
  ];

  return positions[Math.abs(Number(index) || 0) % positions.length];
};

const normalizeMapPosition = (rawPosition = {}, index = 0) => {
  const fallback = getFallbackMapPosition(index);
  const rawX = rawPosition.x ?? rawPosition.mapX;
  const rawY = rawPosition.y ?? rawPosition.mapY;
  const rawZ = rawPosition.z ?? rawPosition.mapZ;
  const x = Number(rawX);
  const y = Number(rawY);
  const z = Number(rawZ);

  return {
    x: Number(clamp(Number.isFinite(x) ? x : fallback.x, MAP_X_MIN, MAP_X_MAX).toFixed(2)),
    y: Number(clamp(Number.isFinite(y) ? y : fallback.y, 0.35, 1.05).toFixed(2)),
    z: Number(clamp(Number.isFinite(z) ? z : fallback.z, MAP_Z_MIN, MAP_Z_MAX).toFixed(2))
  };
};

const buildDefaultFacilities = () =>
  DEFAULT_FACILITIES.map((facility, index) => ({
    ...facility,
    description: String(facility.description || '').trim(),
    hourlyRate: Number(facility.hourlyRate) || 0,
    paymentRequired: Number(facility.hourlyRate) > 0,
    eventTypes: sanitizeEventTypes(facility.eventTypes),
    mapPosition: normalizeMapPosition(facility.mapPosition, index)
  }));

const serializeFacility = (facility, index = 0) => {
  if (!facility) {
    return null;
  }

  const facilityObject = typeof facility.toObject === 'function'
    ? facility.toObject()
    : { ...facility };

  return {
    ...facilityObject,
    hourlyRate: Number(facilityObject.hourlyRate) || 0,
    paymentRequired: Number(facilityObject.hourlyRate) > 0,
    eventTypes: sanitizeEventTypes(facilityObject.eventTypes),
    mapPosition: normalizeMapPosition(facilityObject.mapPosition, index),
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
    settings.facilities.forEach((facility, index) => {
      const normalizedRate = Math.max(0, Number(facility.hourlyRate) || 0);
      const normalizedEvents = sanitizeEventTypes(facility.eventTypes);
      const normalizedMapPosition = normalizeMapPosition(facility.mapPosition, index);

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
        Number(facility.mapPosition.x) !== normalizedMapPosition.x ||
        Number(facility.mapPosition.y) !== normalizedMapPosition.y ||
        Number(facility.mapPosition.z) !== normalizedMapPosition.z
      ) {
        facility.mapPosition = normalizedMapPosition;
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

const attachFacilityMetadata = (reservations, settings) =>
  reservations.map((reservation) => {
    const facility = getFacilityFromSettings(settings, {
      facilityId: reservation.facilityId,
      facilityName: reservation.facilityName
    });

    return {
      ...reservation,
      facility: facility
        ? {
            _id: facility._id,
            name: facility.name,
            description: facility.description,
            hourlyRate: facility.hourlyRate,
            paymentRequired: facility.paymentRequired,
            eventTypes: facility.eventTypes,
            mapPosition: facility.mapPosition,
            photo: facility.photo || {}
          }
        : null
    };
  });

const validateFacilityPayload = ({ name, description, hourlyRate, mapX, mapY, mapZ }, index = 0) => {
  const normalizedName = String(name || '').trim();
  const normalizedDescription = String(description || '').trim();
  const normalizedRate = Number(hourlyRate);
  const mapPosition = normalizeMapPosition({ mapX, mapY, mapZ }, index);

  if (normalizedName.length < 2 || normalizedName.length > 80) {
    return { error: 'Facility name must be 2-80 characters long.' };
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
    const settings = await getSettings();
    const pagination = parsePagination(req.query);
    const filter = {};
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim().toLowerCase();

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

    const baseQuery = FacilityReservation.find(filter)
      .sort({ createdAt: -1 })
      .populate('residentId', 'familyName email phoneNumber')
      .lean();

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        baseQuery.clone().skip(pagination.skip).limit(pagination.limit),
        FacilityReservation.countDocuments(filter)
      ]);

      return sendPaginatedResponse(
        res,
        pagination,
        attachFacilityMetadata(items, settings),
        total
      );
    }

    const reservations = await baseQuery;
    res.json(attachFacilityMetadata(reservations, settings));
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ message: 'Error fetching reservations' });
  }
};

const getMyReservations = async (req, res) => {
  try {
    const settings = await getSettings();
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const filter = { residentId: userId };
    const pagination = parsePagination(req.query);
    const baseQuery = FacilityReservation.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        baseQuery.clone().skip(pagination.skip).limit(pagination.limit),
        FacilityReservation.countDocuments(filter)
      ]);

      return sendPaginatedResponse(
        res,
        pagination,
        attachFacilityMetadata(items, settings),
        total
      );
    }

    const reservations = await baseQuery;
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
    const { facilityId, facilityName, eventType, dateReserved, durationHours, purpose, numberOfGuests } = req.body;

    if ((!facilityId && !facilityName) || !eventType || !dateReserved || !purpose) {
      return res.status(400).json({ message: 'Facility, event type, date, and purpose are required' });
    }

    const settings = await getSettings();
    const facility = getFacilityFromSettings(settings, { facilityId, facilityName });

    if (!facility) {
      return res.status(400).json({ message: 'Invalid facility selected' });
    }

    if (facility.eventTypes?.length && !facility.eventTypes.includes(eventType)) {
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
        eventType,
        residentId: userId,
        residentName: resident.familyName,
        residentAddress: `${resident.houseAddress}, ${resident.street}`,
        dateReserved: reservationDate,
        durationHours: safeDurationHours,
        endDateTime,
        purpose,
        numberOfGuests: numberOfGuests || 0,
        hourlyRate: facility.hourlyRate,
        totalAmount,
        paymentRequired: facility.paymentRequired,
        paymentMethod: facility.paymentRequired ? 'GCASH' : '',
        paymentStatus: facility.paymentRequired ? 'none' : 'verified',
        isPaid: !facility.paymentRequired,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
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

    if (!reservation.paymentRequired) {
      return res.status(400).json({ message: 'This reservation does not require payment' });
    }

    if (reservation.status === 'expired' || reservation.status === 'rejected') {
      return res.status(400).json({ message: 'Cannot upload receipt for expired or rejected reservation' });
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

    if (reservation.status === 'expired') {
      return res.status(400).json({ message: 'Cannot approve expired reservation' });
    }

    if (reservation.paymentRequired && !reservation.isPaid) {
      return res.status(400).json({ message: 'Payment not verified yet' });
    }

    reservation.status = 'approved';
    reservation.approvedBy = req.user.username;
    reservation.approvedAt = new Date();

    await reservation.save();
    res.json(reservation);
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

    reservation.status = 'rejected';
    reservation.paymentStatus = reservation.paymentRequired && reservation.paymentReceipt?.path ? 'rejected' : reservation.paymentStatus;
    reservation.rejectionReason = reason || 'No reason provided';
    reservation.approvedBy = req.user.username;

    await reservation.save();
    res.json(reservation);
  } catch (error) {
    console.error('Error rejecting reservation:', error);
    res.status(500).json({ message: 'Error rejecting reservation' });
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
    const result = await FacilityReservation.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: new Date() }
      },
      {
        $set: { status: 'expired' }
      }
    );

    res.json({ message: `Expired ${result.modifiedCount} reservations` });
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
  getFacilitySettings,
  getMyReservations,
  approveReservation,
  rejectReservation,
  updateFacility,
  updateGcashQr,
  uploadReceipt,
  verifyPayment
};
