const PROPERTY_TYPES = {
  HOUSE: 'house',
  APARTMENT: 'apartment'
};

const OCCUPANCY_TYPES = {
  PERMANENT: 'permanent',
  RENTER: 'renter'
};

const RENEWAL_STATUSES = {
  NOT_APPLICABLE: 'not_applicable',
  NONE: 'none',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

const ACCOUNT_STATUSES = {
  PENDING_APPROVAL: 'pending_approval',
  ACTIVE: 'active',
  EXPIRING_SOON: 'expiring_soon',
  EXPIRED: 'expired',
  RENEWAL_PENDING: 'renewal_pending'
};

const DEFAULT_RENTER_DURATION_DAYS = 90;
const EXPIRING_SOON_DAYS = 14;

const sanitizeText = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeKeyPart = (value) => sanitizeText(value).toLowerCase();

const startOfDay = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (dateValue) => {
  const date = new Date(dateValue);
  date.setHours(23, 59, 59, 999);
  return date;
};

const addDays = (dateValue, days) => {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date;
};

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const normalizePropertyType = (value) => {
  const normalized = sanitizeText(value).toLowerCase();
  return Object.values(PROPERTY_TYPES).includes(normalized) ? normalized : PROPERTY_TYPES.HOUSE;
};

const normalizeOccupancyType = (value) => {
  const normalized = sanitizeText(value).toLowerCase();
  return Object.values(OCCUPANCY_TYPES).includes(normalized) ? normalized : OCCUPANCY_TYPES.PERMANENT;
};

const buildHouseholdDetails = (payload = {}) => {
  const propertyType = normalizePropertyType(payload.propertyType);
  const occupancyType = normalizeOccupancyType(payload.occupancyType);
  const street = sanitizeText(payload.street);

  if (!street) {
    return { error: 'Please select a street' };
  }

  if (street.length > 30) {
    return { error: 'Street name must not exceed 30 characters' };
  }

  const details = {
    propertyType,
    occupancyType,
    street,
    block: '',
    lot: '',
    phase: '',
    buildingName: '',
    unitNumber: '',
    houseAddress: '',
    addressKey: '',
    occupancyStartDate: null,
    occupancyEndDate: null,
    expiresAt: null,
    renewalStatus: occupancyType === OCCUPANCY_TYPES.RENTER
      ? RENEWAL_STATUSES.NONE
      : RENEWAL_STATUSES.NOT_APPLICABLE
  };

  const block = sanitizeText(payload.block);
  const lot = sanitizeText(payload.lot);
  const phase = sanitizeText(payload.phase);

  if (!/^\d{1,2}$/.test(block)) {
    return { error: 'Please select a valid block' };
  }

  if (!/^\d{1,2}$/.test(lot)) {
    return { error: 'Please select a valid lot' };
  }

  if (!/^\d$/.test(phase)) {
    return { error: 'Please select a valid phase' };
  }

  details.block = block;
  details.lot = lot;
  details.phase = phase;

  if (propertyType === PROPERTY_TYPES.HOUSE) {
    details.houseAddress = `Block ${block}, Lot ${lot}, Phase ${phase}`;
    details.addressKey = `house:${phase}:${block}:${lot}`;
  } else {
    const buildingName = sanitizeText(payload.buildingName);
    const unitNumber = sanitizeText(payload.unitNumber).toUpperCase();

    if (buildingName.length < 2) {
      return { error: 'Building name must be at least 2 characters.' };
    }

    if (buildingName.length > 60) {
      return { error: 'Building name must not exceed 60 characters.' };
    }

    if (!unitNumber) {
      return { error: 'Unit number is required for apartment registrations.' };
    }

    if (unitNumber.length > 20) {
      return { error: 'Unit number must not exceed 20 characters.' };
    }

    details.buildingName = buildingName;
    details.unitNumber = unitNumber;
    details.houseAddress = `Block ${block}, Lot ${lot}, Phase ${phase}, ${buildingName}, Unit ${unitNumber}`;
    details.addressKey = `apartment:${phase}:${block}:${lot}:${normalizeKeyPart(buildingName)}:${normalizeKeyPart(unitNumber)}`;
  }

  if (occupancyType === OCCUPANCY_TYPES.RENTER) {
    const requestedStart = sanitizeText(payload.occupancyStartDate);
    const requestedEnd = sanitizeText(payload.occupancyEndDate);
    const occupancyStartDate = requestedStart ? startOfDay(requestedStart) : startOfDay(new Date());

    if (!isValidDate(occupancyStartDate)) {
      return { error: 'Please choose a valid occupancy start date.' };
    }

    const occupancyEndDate = requestedEnd
      ? endOfDay(requestedEnd)
      : endOfDay(addDays(occupancyStartDate, DEFAULT_RENTER_DURATION_DAYS));

    if (!isValidDate(occupancyEndDate)) {
      return { error: 'Please choose a valid occupancy end date.' };
    }

    if (occupancyEndDate.getTime() <= occupancyStartDate.getTime()) {
      return { error: 'Occupancy end date must be later than the start date.' };
    }

    details.occupancyStartDate = occupancyStartDate;
    details.occupancyEndDate = occupancyEndDate;
    details.expiresAt = occupancyEndDate;
  }

  return { value: details };
};

const getResidentAccountStatus = (resident, now = new Date()) => {
  if (!resident?.isApproved) {
    return ACCOUNT_STATUSES.PENDING_APPROVAL;
  }

  const occupancyType = normalizeOccupancyType(resident?.occupancyType);
  if (occupancyType !== OCCUPANCY_TYPES.RENTER) {
    return ACCOUNT_STATUSES.ACTIVE;
  }

  const expiresAt = resident?.expiresAt ? new Date(resident.expiresAt) : null;
  const renewalStatus = sanitizeText(resident?.renewalStatus).toLowerCase() || RENEWAL_STATUSES.NONE;
  const hasValidExpiry = isValidDate(expiresAt);

  if (hasValidExpiry && expiresAt.getTime() <= now.getTime()) {
    if (renewalStatus === RENEWAL_STATUSES.PENDING) {
      return ACCOUNT_STATUSES.RENEWAL_PENDING;
    }

    return ACCOUNT_STATUSES.EXPIRED;
  }

  if (renewalStatus === RENEWAL_STATUSES.PENDING) {
    return ACCOUNT_STATUSES.RENEWAL_PENDING;
  }

  if (hasValidExpiry) {
    const millisecondsRemaining = expiresAt.getTime() - now.getTime();
    const daysRemaining = Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24));

    if (daysRemaining <= EXPIRING_SOON_DAYS) {
      return ACCOUNT_STATUSES.EXPIRING_SOON;
    }
  }

  return ACCOUNT_STATUSES.ACTIVE;
};

const isResidentAccountExpired = (resident, now = new Date()) =>
  getResidentAccountStatus(resident, now) === ACCOUNT_STATUSES.EXPIRED ||
  (
    getResidentAccountStatus(resident, now) === ACCOUNT_STATUSES.RENEWAL_PENDING &&
    resident?.expiresAt &&
    new Date(resident.expiresAt).getTime() <= now.getTime()
  );

const appendResidentComputedFields = (resident, now = new Date()) => {
  const serialized = resident?.toObject ? resident.toObject() : { ...resident };
  const accountStatus = getResidentAccountStatus(serialized, now);
  const isExpired = isResidentAccountExpired(serialized, now);

  const accountStatusLabelMap = {
    [ACCOUNT_STATUSES.PENDING_APPROVAL]: 'Pending Approval',
    [ACCOUNT_STATUSES.ACTIVE]: 'Active',
    [ACCOUNT_STATUSES.EXPIRING_SOON]: 'Expiring Soon',
    [ACCOUNT_STATUSES.EXPIRED]: 'Expired',
    [ACCOUNT_STATUSES.RENEWAL_PENDING]: 'Renewal Pending'
  };

  return {
    ...serialized,
    propertyType: normalizePropertyType(serialized.propertyType),
    occupancyType: normalizeOccupancyType(serialized.occupancyType),
    renewalStatus: sanitizeText(serialized.renewalStatus).toLowerCase() ||
      (normalizeOccupancyType(serialized.occupancyType) === OCCUPANCY_TYPES.RENTER
        ? RENEWAL_STATUSES.NONE
        : RENEWAL_STATUSES.NOT_APPLICABLE),
    accountStatus,
    accountStatusLabel: accountStatusLabelMap[accountStatus] || 'Active',
    displayAddress: [serialized.houseAddress, serialized.street].filter(Boolean).join(', '),
    isExpired,
    isAccessRestricted: isExpired,
    canRequestRenewal:
      Boolean(serialized.isApproved) &&
      normalizeOccupancyType(serialized.occupancyType) === OCCUPANCY_TYPES.RENTER &&
      sanitizeText(serialized.renewalStatus).toLowerCase() !== RENEWAL_STATUSES.PENDING
  };
};

module.exports = {
  ACCOUNT_STATUSES,
  DEFAULT_RENTER_DURATION_DAYS,
  EXPIRING_SOON_DAYS,
  OCCUPANCY_TYPES,
  PROPERTY_TYPES,
  RENEWAL_STATUSES,
  addDays,
  appendResidentComputedFields,
  buildHouseholdDetails,
  endOfDay,
  getResidentAccountStatus,
  isResidentAccountExpired,
  isValidDate,
  normalizeOccupancyType,
  normalizePropertyType,
  sanitizeText,
  startOfDay
};
