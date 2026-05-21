const parseDateValue = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfDay = (value) => {
  const date = parseDateValue(value);

  if (!date) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = parseDateValue(value);

  if (!date) {
    return null;
  }

  date.setHours(23, 59, 59, 999);
  return date;
};

const normalizeDateRange = (values = {}, options = {}) => {
  const label = String(options.label || 'date coverage').trim() || 'date coverage';
  const rawStart = String(values.startDate || '').trim();
  const rawEnd = String(values.endDate || '').trim();
  const hasStart = Boolean(rawStart);
  const hasEnd = Boolean(rawEnd);

  if (!hasStart && !hasEnd) {
    return {
      hasRange: false,
      start: null,
      end: null
    };
  }

  if (hasStart !== hasEnd) {
    return {
      error: `Please select both a start date and an end date for the ${label}.`
    };
  }

  const start = startOfDay(rawStart);
  if (!start) {
    return {
      error: `Please choose a valid start date for the ${label}.`
    };
  }

  const end = endOfDay(rawEnd);
  if (!end) {
    return {
      error: `Please choose a valid end date for the ${label}.`
    };
  }

  if (start.getTime() > end.getTime()) {
    return {
      error: `The start date must be on or before the end date for the ${label}.`
    };
  }

  return {
    hasRange: true,
    start,
    end
  };
};

const isWithinDateRange = (value, range = {}) => {
  if (!range?.hasRange) {
    return true;
  }

  const date = parseDateValue(value);
  if (!date) {
    return false;
  }

  if (range.start && date.getTime() < range.start.getTime()) {
    return false;
  }

  if (range.end && date.getTime() > range.end.getTime()) {
    return false;
  }

  return true;
};

const buildDateRangeFilter = (field, range = {}) => {
  if (!field || !range?.hasRange) {
    return {};
  }

  return {
    [field]: {
      $gte: range.start,
      $lte: range.end
    }
  };
};

module.exports = {
  buildDateRangeFilter,
  endOfDay,
  isWithinDateRange,
  normalizeDateRange,
  parseDateValue,
  startOfDay
};
