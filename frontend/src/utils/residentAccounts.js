export const ACCOUNT_STATUS_META = {
  pending_approval: {
    label: 'Pending Approval',
    className: 'resident-account-pill pending'
  },
  active: {
    label: 'Active',
    className: 'resident-account-pill active'
  },
  expiring_soon: {
    label: 'Expiring Soon',
    className: 'resident-account-pill expiring'
  },
  expired: {
    label: 'Expired',
    className: 'resident-account-pill expired'
  },
  renewal_pending: {
    label: 'Renewal Pending',
    className: 'resident-account-pill renewal'
  }
};

export const formatResidentAddress = (resident) =>
  [resident?.houseAddress, resident?.street].filter(Boolean).join(', ');

export const getResidentAccountMeta = (residentOrStatus) => {
  const status = typeof residentOrStatus === 'string'
    ? residentOrStatus
    : residentOrStatus?.accountStatus;

  return ACCOUNT_STATUS_META[status] || ACCOUNT_STATUS_META.active;
};

export const isResidentAccessRestricted = (resident) =>
  Boolean(resident?.isAccessRestricted || resident?.accountStatus === 'expired');

export const getResidentOccupancyLabel = (resident) => {
  const occupancyType = resident?.occupancyType === 'renter' ? 'Renter' : 'Permanent Resident';
  const propertyType = resident?.propertyType === 'apartment' ? 'Apartment' : 'House';
  return `${occupancyType} • ${propertyType}`;
};

export const formatResidentExpiry = (resident) => {
  if (!resident?.expiresAt) {
    return 'No expiry';
  }

  const expiry = new Date(resident.expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return 'No expiry';
  }

  return expiry.toLocaleDateString();
};
