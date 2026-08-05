const AdminAuditLog = require('../models/AdminAuditLog');
const Admin = require('../models/Admin');
const Guard = require('../models/Guard');
const User = require('../models/User');
const { getUserRoleLabel, isOfficer } = require('./adminPermissions');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const parsePositiveInteger = (value, fallback, minimum = 1) => {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < minimum) {
    return fallback;
  }

  return parsed;
};

const ADMIN_AUDIT_LOG_RETENTION_DAYS = parsePositiveInteger(
  process.env.ADMIN_AUDIT_LOG_RETENTION_DAYS,
  45,
  7
);

const MODULE_LABELS = Object.freeze({
  overview: 'Overview',
  residents: 'Residents',
  vehicles: 'Vehicles',
  visitors: 'Visitors',
  facilities: 'Facilities',
  complaints: 'Complaints',
  announcements: 'Announcements',
  contact_hoa: 'Contact HOA',
  cctv: 'CCTV Feeds',
  billing: 'Billing',
  bill_audit_logs: 'Admin Bills Audit/Logs',
  audit_logs: 'Audit Logs',
  documents: 'Documents',
  analytics: 'Analytics',
  ai_chatbot: 'AI Chatbot',
  subdivision_map: '3D Mapped Subdivision Module',
  reports: 'Reports',
  settings: 'Settings',
  manage_accounts: 'Manage Accounts',
  search: 'Search',
  'entry-log': 'Log Entry',
  'exit-log': 'Log Exit',
  'pre-registered': 'Pre-Registered',
  activity: 'Activity Log'
});

const SUBJECT_FIELDS = [
  'title',
  'billName',
  'fullName',
  'username',
  'name',
  'facilityName',
  'residentName',
  'familyName',
  'subject',
  'label',
  'companyName',
  'driverName',
  'plateNumber'
];

const MANAGE_ACCOUNT_MODELS = Object.freeze({
  admin: {
    model: Admin,
    subjectRole: 'ADMIN'
  },
  guard: {
    model: Guard,
    subjectRole: 'GUARD'
  },
  resident: {
    model: User,
    subjectRole: 'RESIDENT'
  }
});

const SENSITIVE_CHANGED_FIELDS = new Set([
  'password',
  'newPassword',
  'confirmPassword',
  'token',
  'authorization'
]);

const CHANGED_FIELD_LABELS = Object.freeze({
  username: 'username',
  fullName: 'full name',
  familyName: 'family name',
  position: 'officer role',
  modules: 'module access',
  isApproved: 'approval status',
  occupancyType: 'resident type',
  accountStatus: 'account status'
});

const truncate = (value, maxLength = 80) => {
  const normalized = String(value || '').trim();

  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
};

const getFirstName = (user = {}) => {
  const fullName = String(user.fullName || '').trim();

  if (fullName) {
    return fullName.split(/\s+/)[0];
  }

  const familyName = String(user.familyName || '').trim();
  if (familyName) {
    return familyName.split(/\s+/)[0];
  }

  return String(user.username || 'User').trim() || 'User';
};

const getAuditModuleLabel = (moduleKey = '') => MODULE_LABELS[moduleKey] || String(moduleKey || '').trim() || 'Module';

const setAuditLogContext = (req, context = {}) => {
  req.auditLogContext = {
    ...(req.auditLogContext || {}),
    ...context
  };

  return req.auditLogContext;
};

const buildActorSnapshot = (user = {}) => ({
  userId: String(user.userId || user.id || user._id || '').trim(),
  username: String(user.username || '').trim(),
  firstName: getFirstName(user),
  fullName: String(user.fullName || user.familyName || '').trim(),
  role: String(getUserRoleLabel(user) || '').trim(),
  accountType: String(user.role || '').trim().toUpperCase(),
  position: String(user.position || '').trim()
});

const toTitleCase = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/(^|\s|-|_)([a-z])/g, (_, prefix, letter) => `${prefix === '_' ? ' ' : prefix}${letter.toUpperCase()}`)
    .trim();

const formatAccountSubject = (account = {}, target = {}) => {
  const username = String(account.username || '').trim();
  const displayName = String(account.fullName || account.familyName || '').trim();
  const role = toTitleCase(target.subjectRole || 'account');
  const shortId = String(target.subjectId || account._id || '').slice(-6);
  const subjectParts = [];

  if (username) {
    subjectParts.push(`@${username}`);
  }

  if (displayName && displayName.toLowerCase() !== username.toLowerCase()) {
    subjectParts.push(displayName);
  }

  if (role) {
    subjectParts.push(role);
  }

  if (shortId) {
    subjectParts.push(`ID ${shortId}`);
  }

  return subjectParts.join(' - ');
};

const normalizeAuditValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).sort();
  }

  return String(value ?? '').trim();
};

const auditValuesMatch = (first, second) =>
  JSON.stringify(normalizeAuditValue(first)) === JSON.stringify(normalizeAuditValue(second));

const formatAuditValue = (field, value) => {
  if (field === 'modules') {
    const modules = Array.isArray(value) ? value : [];
    return modules.length > 0
      ? modules.map((moduleKey) => getAuditModuleLabel(moduleKey)).join(', ')
      : 'No modules';
  }

  if (field === 'position') {
    return toTitleCase(value) || 'Not assigned';
  }

  if (field === 'isApproved') {
    return value ? 'Approved' : 'Not approved';
  }

  return String(value ?? '').trim() || 'Empty';
};

const getManageAccountChangeDetails = (req, target, account = {}) => {
  if (!target || !['PUT', 'PATCH'].includes(String(req?.method || '').toUpperCase())) {
    return [];
  }

  const body = req?.body && typeof req.body === 'object' ? req.body : {};
  const fields = target.targetKey === 'admin'
    ? ['username', 'fullName', 'position', 'modules']
    : target.targetKey === 'guard'
      ? ['username', 'fullName', 'modules']
      : ['username', 'familyName'];
  const before = req.auditLogBefore || {};

  return fields
    .filter((field) => !SENSITIVE_CHANGED_FIELDS.has(field))
    .filter((field) => body[field] !== undefined)
    .filter((field) => !auditValuesMatch(before[field], account[field] ?? body[field]))
    .map((field) => {
      const label = CHANGED_FIELD_LABELS[field] || toTitleCase(field);
      const previousValue = formatAuditValue(field, before[field]);
      const nextValue = formatAuditValue(field, account[field] ?? body[field]);
      return `${label} changed from "${previousValue}" to "${nextValue}"`;
    })
    .slice(0, 8);
};

const appendChangedDetails = (description, changedDetails = []) => {
  if (!Array.isArray(changedDetails) || changedDetails.length === 0) {
    return description;
  }

  return `${description}. Changes: ${changedDetails.join('; ')}.`;
};

const getAuditLogRetentionDays = () => ADMIN_AUDIT_LOG_RETENTION_DAYS;
const getAuditLogExpiryDate = (createdAt = new Date()) =>
  new Date(new Date(createdAt).getTime() + ADMIN_AUDIT_LOG_RETENTION_DAYS * DAY_IN_MS);

const pickSubject = (req) => {
  const body = req?.body && typeof req.body === 'object' ? req.body : {};

  for (const field of SUBJECT_FIELDS) {
    const value = body[field];

    if (typeof value === 'string' && value.trim()) {
      return truncate(value);
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return truncate(String(value));
    }
  }

  if (req?.params?.id) {
    return truncate(req.params.id, 40);
  }

  return '';
};

const extractManageAccountTarget = (moduleKey = '', endpoint = '') => {
  if (moduleKey !== 'manage_accounts') {
    return null;
  }

  const match = String(endpoint || '').toLowerCase().match(/\/(admin|guard|resident)\/([a-f0-9]{24})(?:\/|$)/i);
  if (!match) {
    return null;
  }

  const targetKey = String(match[1] || '').toLowerCase();
  const subjectId = String(match[2] || '').trim();
  const config = MANAGE_ACCOUNT_MODELS[targetKey];

  if (!config || !subjectId) {
    return null;
  }

  return {
    targetKey,
    subjectId,
    subjectRole: config.subjectRole,
    model: config.model
  };
};

const resolveManageAccountSubject = async (target) => {
  if (!target?.model || !target?.subjectId) {
    return null;
  }

  try {
    const account = await target.model.findById(target.subjectId)
      .select('username fullName familyName position modules')
      .lean();

    if (!account) {
      return null;
    }

    const subject = formatAccountSubject(account, target);

    return subject
      ? {
          subject,
          account,
          metadata: {
            subjectId: target.subjectId,
            subjectRole: target.subjectRole,
            subjectUsername: String(account.username || '').trim(),
            subjectName: String(account.fullName || account.familyName || '').trim()
          }
        }
      : null;
  } catch (error) {
    console.error('resolveManageAccountSubject error:', error.message);
    return null;
  }
};

const resolveAuditSubject = async (req, moduleKey = '', endpoint = '') => {
  const manageAccountTarget = extractManageAccountTarget(moduleKey, endpoint);

  if (manageAccountTarget) {
    const resolvedManageAccountSubject = await resolveManageAccountSubject(manageAccountTarget);
    if (resolvedManageAccountSubject?.subject) {
      const changedDetails = getManageAccountChangeDetails(
        req,
        manageAccountTarget,
        resolvedManageAccountSubject.account
      );
      return {
        subject: resolvedManageAccountSubject.subject,
        metadata: {
          subject: resolvedManageAccountSubject.subject,
          ...resolvedManageAccountSubject.metadata,
          ...(changedDetails.length > 0 ? { changedDetails } : {})
        }
      };
    }
  }

  const bodySubject = pickSubject(req);
  if (bodySubject) {
    return {
      subject: bodySubject,
      metadata: {
        subject: bodySubject
      }
    };
  }

  if (req?.params?.id) {
    const subjectId = truncate(req.params.id, 40);
    return {
      subject: subjectId,
      metadata: {
        subject: subjectId,
        ...(manageAccountTarget?.subjectRole
          ? {
              subjectId: manageAccountTarget.subjectId,
              subjectRole: manageAccountTarget.subjectRole
            }
          : {})
      }
    };
  }

  return {
    subject: '',
    metadata: {}
  };
};

const resolveResourceLabel = (moduleKey, endpoint = '') => {
  const normalizedEndpoint = String(endpoint || '').toLowerCase();

  if (moduleKey === 'manage_accounts') {
    if (normalizedEndpoint.includes('guard')) return 'guard account';
    if (normalizedEndpoint.includes('admin')) return 'officer account';
    return 'account';
  }

  if (moduleKey === 'billing') {
    if (normalizedEndpoint.includes('monthly-due')) return 'monthly due setting';
    if (normalizedEndpoint.includes('gcash-qr')) return 'GCash QR code';
    if (normalizedEndpoint.endsWith('/receipt') || normalizedEndpoint.includes('/review')) return 'billing receipt';
    return 'billing record';
  }

  if (moduleKey === 'facilities') {
    if (normalizedEndpoint.includes('/settings/facilities')) return 'facility';
    if (normalizedEndpoint.includes('gcash-qr')) return 'facility GCash QR code';
    if (
      normalizedEndpoint.includes('/approve') ||
      normalizedEndpoint.includes('/reject') ||
      normalizedEndpoint.includes('/verify-payment') ||
      normalizedEndpoint.includes('/reserve') ||
      normalizedEndpoint.includes('/expire-old')
    ) {
      return 'facility reservation';
    }

    return 'facility setting';
  }

  if (moduleKey === 'contact_hoa') {
    if (normalizedEndpoint.includes('/image')) return 'officers hierarchy image';
    if (normalizedEndpoint.includes('/contacts')) return 'HOA contact details';
    return 'contact HOA setting';
  }

  if (moduleKey === 'residents') {
    if (normalizedEndpoint.includes('/renewal/')) return 'resident renewal request';
    if (normalizedEndpoint.endsWith('/approve')) return 'resident account';
    return 'resident record';
  }

  if (moduleKey === 'vehicles') return 'vehicle record';
  if (moduleKey === 'announcements') return 'announcement';
  if (moduleKey === 'complaints') {
    if (normalizedEndpoint.includes('/status')) return 'complaint status';
    return 'complaint';
  }
  if (moduleKey === 'documents') {
    if (normalizedEndpoint.includes('/status')) return 'document submission status';
    return 'document submission';
  }
  if (moduleKey === 'cctv') return 'CCTV feed';
  if (moduleKey === 'reports') return 'report';
  if (moduleKey === 'bill_audit_logs') return 'bill audit entry';
  if (moduleKey === 'ai_chatbot') return 'AI chatbot request';
  if (moduleKey === 'audit_logs') return 'audit log entry';

  return `${getAuditModuleLabel(moduleKey)} item`.toLowerCase();
};

const withSubject = (resourceLabel, subject) => (subject ? `${resourceLabel} "${subject}"` : resourceLabel);

const buildActionDetails = ({ method = '', endpoint = '', moduleKey = '', subject = '' }) => {
  const normalizedMethod = String(method || '').toUpperCase();
  const normalizedEndpoint = String(endpoint || '').toLowerCase();
  const resourceLabel = resolveResourceLabel(moduleKey, normalizedEndpoint);

  if (normalizedEndpoint.includes('/renewal/approve')) {
    return {
      action: 'Approved renewal',
      description: `Approved ${withSubject('resident renewal request', subject)}`
    };
  }

  if (normalizedEndpoint.includes('/renewal/reject')) {
    return {
      action: 'Rejected renewal',
      description: `Rejected ${withSubject('resident renewal request', subject)}`
    };
  }

  if (normalizedEndpoint.endsWith('/approve')) {
    return {
      action: 'Approved',
      description: `Approved ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.endsWith('/reject')) {
    return {
      action: 'Rejected',
      description: `Rejected ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.includes('/verify-payment')) {
    return {
      action: 'Verified payment',
      description: `Verified payment for ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.endsWith('/review')) {
    return {
      action: 'Reviewed',
      description: `Reviewed ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.includes('/password')) {
    return {
      action: 'Reset password',
      description: `Reset password for ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.includes('/archive')) {
    return {
      action: 'Archived',
      description: `Archived ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.includes('/generate')) {
    return {
      action: 'Generated',
      description: `Generated ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.includes('/expire-old')) {
    return {
      action: 'Expired',
      description: 'Expired old facility reservations'
    };
  }

  if (normalizedEndpoint.includes('/upload-receipt') || normalizedEndpoint.endsWith('/receipt')) {
    return {
      action: 'Uploaded receipt',
      description: `Uploaded receipt for ${withSubject(resourceLabel, subject)}`
    };
  }

  if (normalizedEndpoint.endsWith('/chat')) {
    return {
      action: 'Used chatbot',
      description: 'Sent a request to the AI chatbot'
    };
  }

  const defaultActions = {
    POST: 'Created',
    PUT: 'Updated',
    PATCH: 'Updated',
    DELETE: 'Deleted'
  };

  const action = defaultActions[normalizedMethod] || 'Updated';
  return {
    action,
    description: `${action} ${withSubject(resourceLabel, subject)}`
  };
};

const createAdminAuditLog = async ({
  user,
  moduleKey,
  action,
  description,
  eventType = 'action',
  method = 'POST',
  endpoint = '',
  statusCode = 200,
  metadata
}) => {
  if (!user || !moduleKey || !action || !description) {
    return null;
  }

  const payload = {
    actor: buildActorSnapshot(user),
    eventType,
    moduleKey,
    moduleLabel: getAuditModuleLabel(moduleKey),
    action: truncate(action, 120),
    description: truncate(description, 220),
    method: String(method || 'POST').toUpperCase(),
    endpoint: truncate(endpoint || '/', 220),
    statusCode: Number(statusCode) || 200,
    expiresAt: getAuditLogExpiryDate(new Date())
  };

  if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) {
    payload.metadata = metadata;
  }

  return AdminAuditLog.create(payload);
};

const createAdminAuditLogger = () => (req, res, next) => {
  if (req.adminAuditLoggerAttached) {
    return next();
  }

  req.adminAuditLoggerAttached = true;

  const captureBefore = async () => {
    if (!['PUT', 'PATCH'].includes(String(req.method || '').toUpperCase())) {
      return;
    }

    const endpoint = String(req.originalUrl || req.baseUrl || req.url || '/').split('?')[0];
    const target = extractManageAccountTarget('manage_accounts', endpoint);
    if (!target) {
      return;
    }

    try {
      req.auditLogBefore = await target.model.findById(target.subjectId)
        .select('username fullName familyName position modules')
        .lean();
    } catch (error) {
      console.error('Capture admin audit snapshot error:', error.message);
    }
  };

  res.on('finish', async () => {
    if (!req.user || !isOfficer(req.user)) {
      return;
    }

    if (!MUTATION_METHODS.has(String(req.method || '').toUpperCase())) {
      return;
    }

    if (res.statusCode >= 400) {
      return;
    }

    const context = req.auditLogContext || {};
    const moduleKey = String(context.moduleKey || '').trim();

    if (!moduleKey || context.skipAutoLog) {
      return;
    }

    const endpoint = String(req.originalUrl || req.baseUrl || req.url || '/').split('?')[0];
    const { subject, metadata: subjectMetadata } = await resolveAuditSubject(req, moduleKey, endpoint);
    const details = buildActionDetails({
      method: req.method,
      endpoint,
      moduleKey,
      subject
    });
    const description = appendChangedDetails(details.description, subjectMetadata.changedDetails);

    void createAdminAuditLog({
      user: req.user,
      moduleKey,
      action: details.action,
      description,
      eventType: 'action',
      method: req.method,
      endpoint,
      statusCode: res.statusCode,
      metadata: {
        ...subjectMetadata,
        source: 'automatic'
      }
    }).catch((error) => {
      console.error('Automatic admin audit log error:', error);
    });
  });

  void captureBefore().finally(() => next());
};

module.exports = {
  MODULE_LABELS,
  buildActorSnapshot,
  createAdminAuditLog,
  createAdminAuditLogger,
  extractManageAccountTarget,
  getAuditLogExpiryDate,
  getAuditLogRetentionDays,
  getAuditModuleLabel,
  resolveManageAccountSubject,
  setAuditLogContext
};
