const fs = require('fs');
const path = require('path');
const AdminAuditLog = require('../models/AdminAuditLog');
const AdminAuditLogArchive = require('../models/AdminAuditLogArchive');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const {
  createAdminAuditLog,
  getAuditLogRetentionDays,
  getAuditModuleLabel
} = require('../utils/adminAuditLog');
const { hasAdminModuleAccess } = require('../utils/adminPermissions');

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const BACKEND_ROOT = path.join(__dirname, '..');
const AUDIT_LOG_ARCHIVE_DIR = path.join(BACKEND_ROOT, 'uploads', 'audit-log-archives');
const SUGGESTED_ARCHIVE_DAYS = Math.max(7, getAuditLogRetentionDays() - 14);

const escapeRegex = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ensureArchiveDirectory = () => {
  if (!fs.existsSync(AUDIT_LOG_ARCHIVE_DIR)) {
    fs.mkdirSync(AUDIT_LOG_ARCHIVE_DIR, { recursive: true });
  }
};

const buildArchiveFileName = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `admin-audit-logs-${stamp}.json`;
};

const buildListFilter = (query = {}) => {
  const filter = {};
  const moduleKey = String(query.module || '').trim();
  const eventType = String(query.eventType || '').trim().toLowerCase();
  const search = String(query.q || '').trim();

  if (moduleKey) {
    filter.moduleKey = moduleKey;
  }

  if (eventType === 'access' || eventType === 'action') {
    filter.eventType = eventType;
  }

  if (search) {
    const regex = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { moduleLabel: regex },
      { action: regex },
      { description: regex },
      { 'actor.firstName': regex },
      { 'actor.fullName': regex },
      { 'actor.username': regex },
      { 'actor.role': regex }
    ];
  }

  return filter;
};

const normalizeArchiveWindowDays = (value) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return SUGGESTED_ARCHIVE_DAYS;
  }

  return Math.min(parsed, 3650);
};

const getArchiveAbsolutePath = (archive = {}) => {
  if (!archive.filePath || !archive.filePath.startsWith('/uploads/')) {
    return '';
  }

  return path.join(BACKEND_ROOT, archive.filePath.replace(/^\//, ''));
};

const listAdminAuditLogs = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const filter = buildListFilter(req.query);
    const query = AdminAuditLog.find(filter).sort({ createdAt: -1 }).lean();

    if (pagination.enabled) {
      const [logs, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        AdminAuditLog.countDocuments(filter)
      ]);

      return sendPaginatedResponse(res, pagination, logs, total);
    }

    const logs = await query;
    return res.json(logs);
  } catch (error) {
    console.error('listAdminAuditLogs error:', error);
    return res.status(500).json({ message: 'Failed to load audit logs' });
  }
};

const getAdminAuditLogArchives = async (req, res) => {
  try {
    const archivedBefore = new Date(Date.now() - SUGGESTED_ARCHIVE_DAYS * DAY_IN_MS);
    const [archives, eligibleLogCount] = await Promise.all([
      AdminAuditLogArchive.find({}).sort({ createdAt: -1 }).lean(),
      AdminAuditLog.countDocuments({ createdAt: { $lt: archivedBefore } })
    ]);

    return res.json({
      archives,
      retentionDays: getAuditLogRetentionDays(),
      suggestedArchiveDays: SUGGESTED_ARCHIVE_DAYS,
      eligibleLogCount
    });
  } catch (error) {
    console.error('getAdminAuditLogArchives error:', error);
    return res.status(500).json({ message: 'Failed to load audit log archives' });
  }
};

const archiveAdminAuditLogs = async (req, res) => {
  try {
    const olderThanDays = normalizeArchiveWindowDays(req.body?.olderThanDays);
    const archiveBefore = new Date(Date.now() - olderThanDays * DAY_IN_MS);
    const logsToArchive = await AdminAuditLog.find({
      createdAt: { $lt: archiveBefore }
    })
      .sort({ createdAt: 1 })
      .lean();

    if (!logsToArchive.length) {
      return res.status(400).json({
        message: `No audit logs older than ${olderThanDays} day(s) were found.`
      });
    }

    ensureArchiveDirectory();

    const filename = buildArchiveFileName();
    const absolutePath = path.join(AUDIT_LOG_ARCHIVE_DIR, filename);
    const relativeFilePath = `/uploads/audit-log-archives/${filename}`;
    const payload = {
      archivedAt: new Date().toISOString(),
      archivedBefore: archiveBefore.toISOString(),
      archivedBy: {
        userId: String(req.user?.userId || req.user?.id || ''),
        username: String(req.user?.username || ''),
        role: String(req.user?.role || '')
      },
      retentionDays: getAuditLogRetentionDays(),
      logCount: logsToArchive.length,
      logs: logsToArchive
    };

    fs.writeFileSync(absolutePath, JSON.stringify(payload, null, 2), 'utf8');

    const fileSize = fs.statSync(absolutePath).size;
    const archive = await AdminAuditLogArchive.create({
      filename,
      filePath: relativeFilePath,
      fileSize,
      logCount: logsToArchive.length,
      archivedBefore: archiveBefore,
      oldestLogAt: logsToArchive[0]?.createdAt || null,
      newestLogAt: logsToArchive[logsToArchive.length - 1]?.createdAt || null,
      archivedBy: payload.archivedBy
    });

    await AdminAuditLog.deleteMany({
      _id: { $in: logsToArchive.map((log) => log._id) }
    });

    return res.json({
      message: `Archived ${logsToArchive.length} audit log record(s).`,
      archive
    });
  } catch (error) {
    console.error('archiveAdminAuditLogs error:', error);
    return res.status(500).json({ message: 'Failed to archive audit logs' });
  }
};

const downloadAdminAuditLogArchive = async (req, res) => {
  try {
    const archive = await AdminAuditLogArchive.findById(req.params.id).lean();

    if (!archive) {
      return res.status(404).json({ message: 'Audit log archive not found' });
    }

    const absolutePath = getArchiveAbsolutePath(archive);

    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ message: 'Audit log archive file not found' });
    }

    return res.download(absolutePath, archive.filename);
  } catch (error) {
    console.error('downloadAdminAuditLogArchive error:', error);
    return res.status(500).json({ message: 'Failed to download audit log archive' });
  }
};

const recordModuleAccess = async (req, res) => {
  try {
    const moduleKey = String(req.body?.moduleKey || '').trim();

    if (!moduleKey) {
      return res.status(400).json({ message: 'A module key is required.' });
    }

    if (!hasAdminModuleAccess(req.user, moduleKey)) {
      return res.status(403).json({ message: 'You do not have access to that module.' });
    }

    const moduleLabel = getAuditModuleLabel(moduleKey);
    await createAdminAuditLog({
      user: req.user,
      moduleKey,
      eventType: 'access',
      action: 'Accessed module',
      description: `Opened ${moduleLabel}`,
      method: req.method,
      endpoint: String(req.originalUrl || '/').split('?')[0],
      statusCode: 201,
      metadata: {
        source: 'dashboard'
      }
    });

    return res.status(201).json({ message: 'Module access recorded.' });
  } catch (error) {
    console.error('recordModuleAccess error:', error);
    return res.status(500).json({ message: 'Failed to record module access' });
  }
};

const backfillAdminAuditLogExpiry = async () => {
  try {
    await AdminAuditLog.updateMany(
      {},
      [
        {
          $set: {
            expiresAt: {
              $dateAdd: {
                startDate: '$createdAt',
                unit: 'day',
                amount: getAuditLogRetentionDays()
              }
            }
          }
        }
      ]
    );
  } catch (error) {
    console.error('backfillAdminAuditLogExpiry error:', error.message);
  }
};

module.exports = {
  archiveAdminAuditLogs,
  backfillAdminAuditLogExpiry,
  downloadAdminAuditLogArchive,
  getAdminAuditLogArchives,
  listAdminAuditLogs,
  recordModuleAccess
};
