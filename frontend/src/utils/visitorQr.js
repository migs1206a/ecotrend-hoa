export const VISITOR_QR_PAYLOAD_PREFIX = 'ECOTREND_VISITOR_QR:';

export const getVisitorAccessCode = (visitor) =>
  String(visitor?.qrManualCode || visitor?.qrToken || '').trim();

export const formatVisitorAccessCode = (value) =>
  String(value || '').trim().match(/.{1,4}/g)?.join('\n') || '';

export const isQrManagedVisitor = (visitor) => Boolean(
  visitor?.qrEntryEnabled ||
  getVisitorAccessCode(visitor) ||
  (Array.isArray(visitor?.qrCheckpoints) && visitor.qrCheckpoints.length > 0)
);

export const buildVisitorQrPayload = (visitor) => {
  const accessCode = getVisitorAccessCode(visitor);
  return accessCode;
};

export const extractVisitorQrCredential = (rawValue = '') => {
  const value = String(rawValue || '').trim();

  if (value.startsWith(VISITOR_QR_PAYLOAD_PREFIX)) {
    return value.slice(VISITOR_QR_PAYLOAD_PREFIX.length).trim();
  }

  return value;
};
