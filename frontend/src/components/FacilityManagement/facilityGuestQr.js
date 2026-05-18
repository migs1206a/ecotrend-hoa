export const FACILITY_GUEST_QR_PAYLOAD_PREFIX = 'ECOTREND_FACILITY_GUEST_QR:';

export const getFacilityGuestQrMeta = (reservation) => reservation?.guestQr || {
  enabled: false,
  token: '',
  manualCode: '',
  entry: { used: 0, total: 0, remaining: 0 },
  exit: { used: 0, total: 0, remaining: 0 },
  insideCount: 0,
  totalScans: 0,
  scanEvents: []
};

export const hasFacilityGuestQr = (reservation) => Boolean(getFacilityGuestQrMeta(reservation)?.enabled);

export const getFacilityGuestQrAccessCode = (reservation) => {
  const guestQr = getFacilityGuestQrMeta(reservation);
  return String(guestQr.manualCode || guestQr.token || '').trim();
};

export const formatFacilityGuestQrAccessCode = (value) =>
  String(value || '').trim().match(/.{1,4}/g)?.join('\n') || '';

export const extractFacilityGuestQrToken = (rawValue = '') => {
  const value = String(rawValue || '').trim();

  if (value.startsWith(FACILITY_GUEST_QR_PAYLOAD_PREFIX)) {
    return value.slice(FACILITY_GUEST_QR_PAYLOAD_PREFIX.length).trim();
  }

  return value;
};
