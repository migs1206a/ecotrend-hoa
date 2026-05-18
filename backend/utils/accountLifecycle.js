const DAY_IN_MS = 24 * 60 * 60 * 1000;

const parseRetentionDays = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return parsed;
};

const ACCOUNT_SOFT_DELETE_RETENTION_DAYS = parseRetentionDays(
  process.env.ACCOUNT_SOFT_DELETE_RETENTION_DAYS,
  30
);

const getSoftDeleteRetentionDays = () => ACCOUNT_SOFT_DELETE_RETENTION_DAYS;

const buildDeletedBySnapshot = (user = {}) => ({
  userId: String(user.userId || user.id || user._id || '').trim(),
  username: String(user.username || '').trim(),
  role: String(user.role || '').trim().toUpperCase()
});

const getSoftDeleteExpiryDate = (deletedAt = new Date()) =>
  new Date(new Date(deletedAt).getTime() + ACCOUNT_SOFT_DELETE_RETENTION_DAYS * DAY_IN_MS);

const buildSoftDeleteFields = (user = {}, deletedAt = new Date()) => ({
  deletedAt,
  purgeAfter: getSoftDeleteExpiryDate(deletedAt),
  deletedBy: buildDeletedBySnapshot(user)
});

const buildRestoreFields = () => ({
  deletedAt: null,
  purgeAfter: null,
  deletedBy: {
    userId: '',
    username: '',
    role: ''
  }
});

const isSoftDeleted = (record) => Boolean(record?.deletedAt);

module.exports = {
  buildDeletedBySnapshot,
  buildRestoreFields,
  buildSoftDeleteFields,
  getSoftDeleteExpiryDate,
  getSoftDeleteRetentionDays,
  isSoftDeleted
};
