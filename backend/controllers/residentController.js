const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const User = require('../models/User');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');
const { parsePagination, paginateArray, sendPaginatedResponse } = require('../utils/pagination');
const {
  validateFamilyMembers,
  validateNameField,
  validatePhoneNumberField
} = require('../utils/fieldValidation');
const {
  RENEWAL_STATUSES,
  appendResidentComputedFields,
  buildHouseholdDetails,
  endOfDay,
  isValidDate,
  normalizeOccupancyType
} = require('../utils/residentAccounts');
const { buildSoftDeleteFields, isSoftDeleted } = require('../utils/accountLifecycle');
const { validateResidentEmail } = require('../utils/emailVerification');

const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_ROOT = path.join(BACKEND_ROOT, 'uploads');

const sanitizeHeaderFilename = (value) =>
  String(value || 'identification-document')
    .replace(/["\\\r\n]/g, '')
    .trim() || 'identification-document';

const normalizePlateNumber = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return { error: 'Plate number is required' };
  if (!/^[A-Z0-9]{1,10}$/.test(normalized)) {
    return { error: 'Plate number can only contain letters and numbers' };
  }
  return { value: normalized };
};

const escapeRegex = (value) =>
  String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildResidentSearchFilter = (value = '') => {
  const query = String(value || '').trim();

  if (!query) {
    return {};
  }

  const normalized = query.toLowerCase();
  const matchesKeyword = (keyword) =>
    normalized === keyword || (normalized.length >= 3 && keyword.startsWith(normalized));
  const regex = new RegExp(escapeRegex(query), 'i');
  const orFilters = [
    { familyName: regex },
    { username: regex },
    { email: regex },
    { houseAddress: regex },
    { street: regex },
    { phoneNumber: regex },
    { block: regex },
    { lot: regex },
    { phase: regex },
    { buildingName: regex },
    { unitNumber: regex }
  ];

  if (matchesKeyword('renter')) {
    orFilters.push({ occupancyType: 'renter' });
  }

  if (matchesKeyword('permanent')) {
    orFilters.push({ occupancyType: 'permanent' });
  }

  if (matchesKeyword('house')) {
    orFilters.push({ propertyType: 'house' });
  }

  if (matchesKeyword('apartment')) {
    orFilters.push({ propertyType: 'apartment' });
  }

  return { $or: orFilters };
};

const RESIDENT_SORTS = Object.freeze({
  newest: { createdAt: -1, familyName: 1, username: 1 },
  oldest: { createdAt: 1, familyName: 1, username: 1 },
  family_asc: { familyName: 1, username: 1, createdAt: -1 },
  family_desc: { familyName: -1, username: -1, createdAt: -1 }
});

const getResidentSortKey = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(RESIDENT_SORTS, normalized)
    ? normalized
    : 'newest';
};

const buildResidentQuery = (baseFilter, req) => {
  const pagination = parsePagination(req.query);
  const filter = {
    ...baseFilter,
    ...buildResidentSearchFilter(req.query.q)
  };
  const sortKey = getResidentSortKey(req.query.sort);
  const usesAlphabeticalSort = sortKey.startsWith('family_');

  return {
    filter,
    pagination,
    sortKey,
    usesAlphabeticalSort
  };
};

const applyResidentSort = (query, sortKey, usesAlphabeticalSort) => {
  query.sort(RESIDENT_SORTS[sortKey] || RESIDENT_SORTS.newest);

  if (usesAlphabeticalSort) {
    query.collation({ locale: 'en', strength: 1 });
  }

  return query;
};

const toResidentDateInput = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const pipeRemoteFile = (fileUrl, res, redirectCount = 0) =>
  new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects while loading identification document'));
      return;
    }

    const client = fileUrl.startsWith('https:') ? https : http;
    const request = client.get(fileUrl, (remoteResponse) => {
      const { statusCode, headers } = remoteResponse;

      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        remoteResponse.resume();
        const nextUrl = new URL(headers.location, fileUrl).toString();
        pipeRemoteFile(nextUrl, res, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        remoteResponse.resume();
        reject(new Error(`Remote identification document failed with status ${statusCode}`));
        return;
      }

      remoteResponse.on('error', reject);
      res.on('finish', resolve);
      remoteResponse.pipe(res);
    });

    request.on('error', reject);
  });

exports.getApprovedResidents = async (req, res) => {
  try {
    const {
      filter,
      pagination,
      sortKey,
      usesAlphabeticalSort
    } = buildResidentQuery({ isApproved: true, deletedAt: null }, req);
    const total = await User.countDocuments(filter);
    const query = applyResidentSort(
      User.find(filter).select('-password').lean(),
      sortKey,
      usesAlphabeticalSort
    );

    if (pagination.enabled) {
      query.skip(pagination.skip).limit(pagination.limit);
    }

    const approvedUsers = await query;
    const serializedResidents = approvedUsers.map((resident) => appendResidentComputedFields(resident));
    sendPaginatedResponse(res, pagination, serializedResidents, total);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getPendingResidents = async (req, res) => {
  try {
    const {
      filter,
      pagination,
      sortKey,
      usesAlphabeticalSort
    } = buildResidentQuery({ isApproved: false, deletedAt: null }, req);
    const total = await User.countDocuments(filter);
    const query = applyResidentSort(
      User.find(filter).select('-password').lean(),
      sortKey,
      usesAlphabeticalSort
    );

    if (pagination.enabled) {
      query.skip(pagination.skip).limit(pagination.limit);
    }

    const pendingUsers = await query;
    const serializedResidents = pendingUsers.map((resident) => appendResidentComputedFields(resident));
    sendPaginatedResponse(res, pagination, serializedResidents, total);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getResidentById = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id).select('-password');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    res.json(appendResidentComputedFields(resident));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.approveResident = async (req, res) => {
  try {
    const resident = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    ).select('-password');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    res.json({
      message: 'Resident approved successfully',
      resident: appendResidentComputedFields(resident)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteResident = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    Object.assign(resident, buildSoftDeleteFields(req.user));
    await resident.save();

    res.json({
      message: 'Resident moved to recently deleted accounts.',
      deletedId: req.params.id,
      purgeAfter: resident.purgeAfter
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateResident = async (req, res) => {
  try {
    const {
      email,
      familyName,
      street,
      block,
      lot,
      phase,
      buildingName,
      unitNumber,
      phoneNumber,
      familyMembers
    } = req.body;

    const resident = await User.findById(req.params.id).select('-password');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    if (familyName !== undefined) {
      const familyNameValidation = validateNameField(familyName, 'Family name', {
        minLength: 2,
        maxLength: 20
      });
      if (familyNameValidation.error) {
        return res.status(400).json({ message: familyNameValidation.error });
      }
      resident.familyName = familyNameValidation.value;
    }

    if (phoneNumber !== undefined) {
      const phoneNumberValidation = validatePhoneNumberField(phoneNumber, 'Phone number', {
        required: true
      });
      if (phoneNumberValidation.error) {
        return res.status(400).json({ message: phoneNumberValidation.error });
      }
      resident.phoneNumber = phoneNumberValidation.value;
    }

    if (familyMembers !== undefined) {
      const familyMembersValidation = validateFamilyMembers(familyMembers, {
        required: true,
        primaryContactRequired: true
      });
      if (familyMembersValidation.error) {
        return res.status(400).json({ message: familyMembersValidation.error });
      }
      resident.familyMembers = familyMembersValidation.value;
    }

    if (email !== undefined) {
      const emailValidation = validateResidentEmail(email);
      if (emailValidation.error) {
        return res.status(400).json({ message: emailValidation.error });
      }

      const emailConflict = await User.findOne({
        email: emailValidation.value,
        _id: { $ne: resident._id }
      }).select('_id');

      if (emailConflict) {
        return res.status(400).json({ message: 'Email address is already in use.' });
      }

      resident.email = emailValidation.value;
    }

    const shouldRebuildAddress = [
      street,
      block,
      lot,
      phase,
      buildingName,
      unitNumber
    ].some((value) => value !== undefined);

    if (shouldRebuildAddress) {
      const householdDetailsResult = buildHouseholdDetails({
        propertyType: resident.propertyType,
        occupancyType: resident.occupancyType,
        street: street !== undefined ? street : resident.street,
        block: block !== undefined ? block : resident.block,
        lot: lot !== undefined ? lot : resident.lot,
        phase: phase !== undefined ? phase : resident.phase,
        buildingName: buildingName !== undefined ? buildingName : resident.buildingName,
        unitNumber: unitNumber !== undefined ? unitNumber : resident.unitNumber,
        occupancyStartDate: toResidentDateInput(resident.occupancyStartDate),
        occupancyEndDate: toResidentDateInput(resident.occupancyEndDate)
      });

      if (householdDetailsResult.error) {
        return res.status(400).json({ message: householdDetailsResult.error });
      }

      const householdDetails = householdDetailsResult.value;
      resident.street = householdDetails.street;
      resident.block = householdDetails.block;
      resident.lot = householdDetails.lot;
      resident.phase = householdDetails.phase;
      resident.buildingName = householdDetails.buildingName;
      resident.unitNumber = householdDetails.unitNumber;
      resident.houseAddress = householdDetails.houseAddress;
      resident.addressKey = householdDetails.addressKey;
    }

    await resident.save();

    res.json({
      message: 'Resident updated successfully',
      resident: appendResidentComputedFields(resident)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.requestRenewal = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id).select('-password');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    if (!resident.isApproved) {
      return res.status(400).json({ message: 'Only approved residents can request renewals.' });
    }

    if (normalizeOccupancyType(resident.occupancyType) !== 'renter') {
      return res.status(400).json({ message: 'Renewal requests are only available for renter accounts.' });
    }

    if (resident.renewalStatus === RENEWAL_STATUSES.PENDING) {
      return res.status(400).json({ message: 'A renewal request is already pending for this account.' });
    }

    const requestedEndDateRaw = req.body?.requestedOccupancyEndDate || req.body?.occupancyEndDate;
    const requestedEndDate = requestedEndDateRaw ? endOfDay(requestedEndDateRaw) : null;

    if (!isValidDate(requestedEndDate)) {
      return res.status(400).json({ message: 'Please choose a valid renewal end date.' });
    }

    const comparisonBase = resident.expiresAt && new Date(resident.expiresAt) > new Date()
      ? new Date(resident.expiresAt)
      : new Date();

    if (requestedEndDate.getTime() <= comparisonBase.getTime()) {
      return res.status(400).json({ message: 'Renewal end date must extend beyond the current account period.' });
    }

    resident.renewalStatus = RENEWAL_STATUSES.PENDING;
    resident.renewalRequestedAt = new Date();
    resident.requestedOccupancyEndDate = requestedEndDate;
    resident.renewalRequestNote = String(req.body?.note || '').trim().slice(0, 250);
    resident.renewalDecisionNote = '';
    resident.renewalReviewedAt = null;
    await resident.save();

    res.json({
      message: 'Renewal request submitted successfully.',
      resident: appendResidentComputedFields(resident)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.approveRenewal = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id).select('-password');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    if (normalizeOccupancyType(resident.occupancyType) !== 'renter') {
      return res.status(400).json({ message: 'Only renter accounts can be renewed.' });
    }

    if (resident.renewalStatus !== RENEWAL_STATUSES.PENDING) {
      return res.status(400).json({ message: 'There is no pending renewal request for this resident.' });
    }

    const approvedEndDateRaw = req.body?.approvedOccupancyEndDate || req.body?.occupancyEndDate;
    const approvedEndDate = approvedEndDateRaw
      ? endOfDay(approvedEndDateRaw)
      : resident.requestedOccupancyEndDate
        ? endOfDay(resident.requestedOccupancyEndDate)
        : null;

    if (!isValidDate(approvedEndDate)) {
      return res.status(400).json({ message: 'Please provide a valid approved end date.' });
    }

    const comparisonBase = resident.expiresAt && new Date(resident.expiresAt) > new Date()
      ? new Date(resident.expiresAt)
      : new Date();

    if (approvedEndDate.getTime() <= comparisonBase.getTime()) {
      return res.status(400).json({ message: 'Approved end date must extend beyond the current account period.' });
    }

    resident.occupancyEndDate = approvedEndDate;
    resident.expiresAt = approvedEndDate;
    resident.renewalStatus = RENEWAL_STATUSES.APPROVED;
    resident.renewalReviewedAt = new Date();
    resident.lastRenewedAt = new Date();
    resident.renewalDecisionNote = String(req.body?.note || '').trim().slice(0, 250);
    resident.requestedOccupancyEndDate = null;
    resident.renewalRequestedAt = null;
    resident.renewalRequestNote = '';
    await resident.save();

    res.json({
      message: 'Renewal approved successfully.',
      resident: appendResidentComputedFields(resident)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.rejectRenewal = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id).select('-password');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    if (resident.renewalStatus !== RENEWAL_STATUSES.PENDING) {
      return res.status(400).json({ message: 'There is no pending renewal request for this resident.' });
    }

    resident.renewalStatus = RENEWAL_STATUSES.REJECTED;
    resident.renewalReviewedAt = new Date();
    resident.renewalDecisionNote = String(req.body?.note || '').trim().slice(0, 250);
    resident.requestedOccupancyEndDate = null;
    resident.renewalRequestedAt = null;
    resident.renewalRequestNote = '';
    await resident.save();

    res.json({
      message: 'Renewal request rejected.',
      resident: appendResidentComputedFields(resident)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getResidentStats = async (req, res) => {
  try {
    const totalResidents = await User.countDocuments({ isApproved: true, deletedAt: null });
    const pendingApprovals = await User.countDocuments({ isApproved: false, deletedAt: null });
    const totalUsers = await User.countDocuments({ deletedAt: null });

    res.json({
      totalResidents,
      pendingApprovals,
      totalUsers
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getResidentIdentification = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    if (!resident.identificationDocument) {
      return res.status(404).json({ message: 'No identification document found' });
    }

    res.json({
      filename: resident.identificationDocument.filename,
      originalName: resident.identificationDocument.originalName,
      mimetype: resident.identificationDocument.mimetype,
      url: resident.identificationDocument.path
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.viewResidentIdentification = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const document = resident.identificationDocument;
    if (!document || !document.path) {
      return res.status(404).json({ message: 'No identification document found' });
    }

    const setInlineDocumentHeaders = () => {
      const originalName = sanitizeHeaderFilename(document.originalName || document.filename);
      res.setHeader('Content-Type', document.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
      res.setHeader('Cache-Control', 'private, no-store');
    };

    if (document.storage === 'local' && document.path.startsWith('/uploads/')) {
      const localPath = path.resolve(BACKEND_ROOT, document.path.replace(/^\//, ''));
      const uploadsRoot = path.resolve(UPLOADS_ROOT);

      if (!localPath.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(localPath)) {
        return res.status(404).json({ message: 'Identification document file not found' });
      }

      setInlineDocumentHeaders();
      return res.sendFile(localPath);
    }

    if (/^https?:\/\//i.test(document.path)) {
      setInlineDocumentHeaders();
      await pipeRemoteFile(document.path, res);
      return undefined;
    }

    return res.status(404).json({ message: 'Identification document file not found' });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to load identification document', error: error.message });
    }
    return undefined;
  }
};

exports.getResidentVehicles = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const resident = await User.findById(req.params.id).select('vehicles');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const activeVehicles = (resident.vehicles || []).filter((vehicle) => !vehicle.deletedAt);
    const paginated = paginateArray(activeVehicles, pagination);
    sendPaginatedResponse(res, pagination, paginated.items, paginated.total);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllVehicles = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const approvedResidents = await User.find({ isApproved: true, deletedAt: null })
      .select('familyName houseAddress street phoneNumber vehicles')
      .sort({ createdAt: -1 })
      .lean();

    const vehicles = [];
    approvedResidents.forEach((resident) => {
      (resident.vehicles || []).forEach((vehicle) => {
        if (vehicle.deletedAt) return;

        vehicles.push({
          ...vehicle,
          ownerName: resident.familyName,
          ownerAddress: `${resident.houseAddress}, ${resident.street}`,
          ownerPhone: resident.phoneNumber,
          ownerId: resident._id
        });
      });
    });

    const paginated = paginateArray(vehicles, pagination);
    sendPaginatedResponse(res, pagination, paginated.items, paginated.total);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.addVehicle = async (req, res) => {
  try {
    const { plateNumber, vehicleType, brand, model, color } = req.body;

    if (!plateNumber || !vehicleType || !brand || !model || !color) {
      return res.status(400).json({ message: 'All vehicle fields are required' });
    }

    const plateValidation = normalizePlateNumber(plateNumber);
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    const resident = await User.findById(req.params.id);
    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const plateExists = resident.vehicles.some(
      (vehicle) => vehicle.plateNumber.toUpperCase() === plateValidation.value
    );

    if (plateExists) {
      return res.status(400).json({ message: 'Vehicle with this plate number already registered' });
    }

    const newVehicle = {
      plateNumber: plateValidation.value,
      vehicleType,
      brand,
      model,
      color
    };

    if (req.file) {
      newVehicle.photo = await storeUploadedFile(req.file, {
        folder: 'ecotrend-hoa/vehicles',
        localDir: 'uploads/vehicles',
        prefix: 'vehicle',
        resourceType: 'image'
      });
    }

    resident.vehicles.push(newVehicle);
    await resident.save();

    res.status(201).json({
      message: 'Vehicle added successfully',
      vehicle: resident.vehicles[resident.vehicles.length - 1]
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateVehicle = async (req, res) => {
  try {
    const { plateNumber, vehicleType, brand, model, color } = req.body;
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const plateValidation = plateNumber ? normalizePlateNumber(plateNumber) : { value: vehicle.plateNumber };
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    if (plateNumber && plateValidation.value !== vehicle.plateNumber) {
      const plateExists = resident.vehicles.some(
        (item) =>
          item._id.toString() !== req.params.vehicleId &&
          item.plateNumber.toUpperCase() === plateValidation.value
      );

      if (plateExists) {
        return res.status(400).json({ message: 'Vehicle with this plate number already registered' });
      }
    }

    if (plateNumber) vehicle.plateNumber = plateValidation.value;
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (brand) vehicle.brand = brand;
    if (model) vehicle.model = model;
    if (color) vehicle.color = color;

    if (req.file) {
      if (vehicle.photo) {
        await deleteStoredFile(vehicle.photo);
      }

      vehicle.photo = await storeUploadedFile(req.file, {
        folder: 'ecotrend-hoa/vehicles',
        localDir: 'uploads/vehicles',
        prefix: 'vehicle',
        resourceType: 'image'
      });
    }

    await resident.save();

    res.json({
      message: 'Vehicle updated successfully',
      vehicle
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteVehicle = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    vehicle.deletedAt = new Date();
    await resident.save();

    res.json({
      message: 'Vehicle moved to trash',
      vehicleId: req.params.vehicleId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getDeletedVehicles = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const resident = await User.findById(req.params.id).select('vehicles');

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const deletedVehicles = (resident.vehicles || []).filter(
      (vehicle) => vehicle.deletedAt && vehicle.deletedAt >= cutoff
    );

    const paginated = paginateArray(deletedVehicles, pagination);
    sendPaginatedResponse(res, pagination, paginated.items, paginated.total);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.restoreVehicle = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    if (vehicle.deletedAt && vehicle.deletedAt < cutoff) {
      return res.status(400).json({ message: 'Recovery window has expired for this vehicle' });
    }

    vehicle.deletedAt = null;
    await resident.save();

    res.json({
      message: 'Vehicle restored successfully',
      vehicle
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.permanentDeleteVehicle = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    if (vehicle.photo) {
      await deleteStoredFile(vehicle.photo);
    }

    resident.vehicles.pull(req.params.vehicleId);
    await resident.save();

    res.json({
      message: 'Vehicle permanently deleted',
      deletedId: req.params.vehicleId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getVehiclePhoto = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);

    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    if (!vehicle.photo || !vehicle.photo.path) {
      return res.status(404).json({ message: 'No photo found for this vehicle' });
    }

    res.json({
      filename: vehicle.photo.filename,
      originalName: vehicle.photo.originalName,
      mimetype: vehicle.photo.mimetype,
      url: vehicle.photo.path
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
