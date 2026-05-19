const ETA_NOT_MET_WINDOW_MS = 2 * 60 * 60 * 1000;
const ETA_COMPARISON_TOLERANCE_MS = 60 * 1000;

const toValidDate = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getVisitorActualArrivalDate = (visitor) => {
  const entryDate = toValidDate(visitor?.entryTime);
  if (entryDate) {
    return entryDate;
  }

  const gateEntryCheckpoint = Array.isArray(visitor?.qrCheckpoints)
    ? visitor.qrCheckpoints.find((checkpoint) => checkpoint?.checkpoint === 'gate_entry' && checkpoint?.usedAt)
    : null;

  return toValidDate(gateEntryCheckpoint?.usedAt);
};

export const getVisitorEtaState = (
  visitor,
  {
    now = new Date(),
    dismissed = false
  } = {}
) => {
  if (dismissed) {
    return null;
  }

  const expectedDate = toValidDate(visitor?.expectedDate);
  if (!expectedDate) {
    return null;
  }

  const actualArrival = getVisitorActualArrivalDate(visitor);
  if (actualArrival) {
    const diffMs = actualArrival.getTime() - expectedDate.getTime();

    if (diffMs <= -ETA_COMPARISON_TOLERANCE_MS) {
      return {
        kind: 'early',
        label: 'Early than ETA',
        tone: 'info',
        offsetMinutes: Math.round(Math.abs(diffMs) / 60000)
      };
    }

    if (diffMs >= ETA_COMPARISON_TOLERANCE_MS) {
      return {
        kind: 'late',
        label: 'Later than ETA',
        tone: 'warning',
        offsetMinutes: Math.round(diffMs / 60000)
      };
    }

    return null;
  }

  const referenceNow = toValidDate(now) || new Date();
  if (
    String(visitor?.status || '').toLowerCase() === 'pre-registered' &&
    referenceNow.getTime() - expectedDate.getTime() >= ETA_NOT_MET_WINDOW_MS
  ) {
    return {
      kind: 'eta_not_met',
      label: 'ETA not met',
      tone: 'danger'
    };
  }

  return null;
};
