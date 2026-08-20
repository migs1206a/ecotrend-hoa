const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Guard = require('../models/Guard');
const User = require('../models/User');
const {
  parsePagination,
  paginateArray,
  buildPaginatedPayload
} = require('../utils/pagination');
const {
  OFFICER_POSITIONS,
  getEffectiveModules,
  getOfficerPositionLabel,
  normalizeModules,
  normalizeOfficerPosition
} = require('../utils/adminPermissions');
const {
  buildRestoreFields,
  buildSoftDeleteFields,
  getSoftDeleteRetentionDays,
  isSoftDeleted
} = require('../utils/accountLifecycle');
const { appendResidentComputedFields } = require('../utils/residentAccounts');
const { getAuditModuleLabel, setAuditLogContext } = require('../utils/adminAuditLog');
const { normalizeSpaces, validateNameField } = require('../utils/fieldValidation');
const { getJwtSecret } = require('../utils/jwtSecret');

const router = express.Router();

router.use((req, res, next) => {
  setAuditLogContext(req, { moduleKey: 'manage_accounts' });
  next();
});

const JWT_SECRET = getJwtSecret();
const ADMIN_ASSIGNABLE_POSITIONS = [
  OFFICER_POSITIONS.VICE_PRESIDENT,
  OFFICER_POSITIONS.SECRETARY,
  OFFICER_POSITIONS.AUDITOR,
  OFFICER_POSITIONS.TREASURER,
  OFFICER_POSITIONS.BOARD_MEMBER
];

const ACTIVE_SCOPE = 'active';
const DELETED_SCOPE = 'deleted';
const SOFT_DELETE_RETENTION_DAYS = getSoftDeleteRetentionDays();
const ACCOUNT_SORT_OPTIONS = new Set([
  'newest',
  'oldest',
  'name_asc',
  'name_desc',
  'username_asc',
  'username_desc'
]);

const verifyMasterAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (String(decoded.role || '').toUpperCase() !== 'MASTER_ADMIN') {
      return res.status(403).json({ message: 'Access denied. Master Admin only.' });
    }

    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

const normalizeAccountScope = (value = '') =>
  String(value || '').trim().toLowerCase() === DELETED_SCOPE ? DELETED_SCOPE : ACTIVE_SCOPE;

const normalizeAccountRoleFilter = (value = '') => {
  const normalized = String(value || '').trim().toUpperCase();
  return ['ADMIN', 'GUARD', 'RESIDENT'].includes(normalized) ? normalized : 'ALL';
};

const normalizeAccountSort = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ACCOUNT_SORT_OPTIONS.has(normalized) ? normalized : 'newest';
};

const getAccountDisplayName = (account = {}) =>
  String(account.familyName || account.fullName || '').trim();

const getAssignedRoleLabel = (account = {}) => {
  if (account.role === 'ADMIN') {
    return getOfficerPositionLabel(account.position, 'ADMIN');
  }

  if (account.role === 'GUARD') {
    return 'Security Team';
  }

  if (account.role === 'RESIDENT') {
    return account.isApproved ? 'Resident Portal' : 'Pending Approval';
  }

  return 'Account';
};

const getAccountModuleLabels = (account = {}) => {
  if (account.role === 'RESIDENT') {
    return [
      account.isApproved ? 'Resident Portal' : 'Pending Approval',
      String(account.accountStatusLabel || '').trim()
    ].filter(Boolean);
  }

  return getEffectiveModules({
    role: account.role,
    position: account.position,
    modules: account.modules
  }).map((moduleKey) => getAuditModuleLabel(moduleKey));
};

const matchesAccountSearch = (account = {}, query = '') => {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const haystacks = [
    account.username,
    account.fullName,
    account.familyName,
    getAssignedRoleLabel(account),
    account.accountStatusLabel,
    account.role,
    ...getAccountModuleLabels(account)
  ];

  return haystacks.some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
};

const compareText = (first, second) =>
  String(first || '').localeCompare(String(second || ''), 'en', { sensitivity: 'base' });

const getAccountSortTimestamp = (account = {}, scope = ACTIVE_SCOPE) => {
  const sourceValue = scope === DELETED_SCOPE
    ? account.deletedAt || account.createdAt
    : account.createdAt;
  const timestamp = new Date(sourceValue || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const sortAccounts = (accounts = [], scope = ACTIVE_SCOPE, sortKey = 'newest') => {
  const sortedAccounts = [...accounts];

  sortedAccounts.sort((first, second) => {
    switch (sortKey) {
      case 'oldest':
        return getAccountSortTimestamp(first, scope) - getAccountSortTimestamp(second, scope);
      case 'name_asc':
        return compareText(getAccountDisplayName(first), getAccountDisplayName(second));
      case 'name_desc':
        return compareText(getAccountDisplayName(second), getAccountDisplayName(first));
      case 'username_asc':
        return compareText(first.username, second.username);
      case 'username_desc':
        return compareText(second.username, first.username);
      case 'newest':
      default:
        return getAccountSortTimestamp(second, scope) - getAccountSortTimestamp(first, scope);
    }
  });

  return sortedAccounts;
};

const validateUsername = (username) => {
  const value = String(username || '').trim();

  if (value.length < 3 || value.length > 20) {
    return 'Username must be 3-20 characters.';
  }

  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    return 'Username can only contain letters, numbers, and underscores.';
  }

  return null;
};

const validatePassword = (password) => {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain a number.';
  if (!/[^A-Za-z0-9\s]/.test(password)) {
    return 'Password must contain a special character.';
  }
  return null;
};

const validateFullName = (fullName, label = 'Full name') => {
  const { error } = validateNameField(fullName, label, {
    minLength: 2,
    maxLength: 80
  });
  return error || null;
};

const validateResidentFamilyName = (familyName) => {
  const { error } = validateNameField(familyName, 'Resident family name', {
    minLength: 2,
    maxLength: 20
  });
  return error || null;
};

const validateOfficerPosition = (position) => {
  const normalized = normalizeOfficerPosition(position);

  if (!ADMIN_ASSIGNABLE_POSITIONS.includes(normalized)) {
    return {
      error: 'Please assign a valid officer role.'
    };
  }

  return {
    value: normalized
  };
};

const buildScopeFilter = (scope) => (
  scope === DELETED_SCOPE
    ? { deletedAt: { $ne: null } }
    : { deletedAt: null }
);

const ensureBoardMemberLimit = async (position, excludeId = null) => {
  if (position !== OFFICER_POSITIONS.BOARD_MEMBER) {
    return null;
  }

  const filter = {
    position: OFFICER_POSITIONS.BOARD_MEMBER,
    deletedAt: null
  };

  if (excludeId) {
    filter._id = { $ne: excludeId };
  }

  const boardMemberCount = await Admin.countDocuments(filter);

  if (boardMemberCount >= 3) {
    return 'Only 3 Board Members can be assigned at a time.';
  }

  return null;
};

const normalizeAdminAccount = (admin) => ({
  ...admin,
  role: 'ADMIN',
  position: normalizeOfficerPosition(admin.position),
  modules: getEffectiveModules({
    role: 'ADMIN',
    position: admin.position,
    modules: admin.modules
  })
});

const normalizeGuardAccount = (guard) => ({
  ...guard,
  role: 'GUARD',
  modules: getEffectiveModules({
    role: 'GUARD',
    modules: guard.modules
  })
});

const normalizeResidentAccount = (resident) => {
  const serializedResident = appendResidentComputedFields(resident);

  return {
    ...serializedResident,
    role: 'RESIDENT',
    fullName: serializedResident.familyName || '',
    modules: []
  };
};

const validateModules = (modules, role, position = '') => {
  if (modules !== undefined && !Array.isArray(modules)) {
    return {
      error: 'Assigned modules must be provided as a list.'
    };
  }

  return {
    value: normalizeModules(modules, role, position)
  };
};

const buildUsernameConflictMessage = (conflict = {}) => {
  const deletedAccountType = String(conflict.role || '').toUpperCase();

  if (!conflict.deletedAt) {
    return 'Username is already taken.';
  }

  if (deletedAccountType === 'RESIDENT') {
    return `Username is reserved by a recently deleted resident account for up to ${SOFT_DELETE_RETENTION_DAYS} days. Restore it or wait for the retention window to end.`;
  }

  return `Username is reserved by a recently deleted ${deletedAccountType === 'ADMIN' ? 'officer' : 'guard'} account for up to ${SOFT_DELETE_RETENTION_DAYS} days. Restore it or wait for the retention window to end.`;
};

const findUsernameConflict = async (
  username,
  {
    excludeAdminId = '',
    excludeGuardId = '',
    excludeResidentId = ''
  } = {}
) => {
  const normalizedUsername = String(username || '').trim();

  if (!normalizedUsername) {
    return null;
  }

  const adminFilter = { username: normalizedUsername };
  const guardFilter = { username: normalizedUsername };
  const residentFilter = { username: normalizedUsername };

  if (excludeAdminId) {
    adminFilter._id = { $ne: excludeAdminId };
  }

  if (excludeGuardId) {
    guardFilter._id = { $ne: excludeGuardId };
  }

  if (excludeResidentId) {
    residentFilter._id = { $ne: excludeResidentId };
  }

  const [admin, guard, resident] = await Promise.all([
    Admin.findOne(adminFilter).select('username deletedAt').lean(),
    Guard.findOne(guardFilter).select('username deletedAt').lean(),
    User.findOne(residentFilter).select('username deletedAt').lean()
  ]);

  if (admin) {
    return { ...admin, role: 'ADMIN' };
  }

  if (guard) {
    return { ...guard, role: 'GUARD' };
  }

  if (resident) {
    return { ...resident, role: 'RESIDENT' };
  }

  return null;
};

router.get('/accounts', verifyMasterAdmin, async (req, res) => {
  try {
    const scope = normalizeAccountScope(req.query.scope);
    const roleFilter = normalizeAccountRoleFilter(req.query.role);
    const searchQuery = String(req.query.q || '').trim();
    const sortKey = normalizeAccountSort(req.query.sort);
    const pagination = parsePagination(req.query);
    const filter = buildScopeFilter(scope);
    const [admins, guards, residents] = await Promise.all([
      roleFilter === 'ALL' || roleFilter === 'ADMIN'
        ? Admin.find(filter)
          .select('username fullName role position modules createdAt deletedAt purgeAfter')
          .lean()
        : Promise.resolve([]),
      roleFilter === 'ALL' || roleFilter === 'GUARD'
        ? Guard.find(filter)
          .select('username fullName role modules createdAt deletedAt purgeAfter')
          .lean()
        : Promise.resolve([]),
      roleFilter === 'ALL' || roleFilter === 'RESIDENT'
        ? User.find(filter)
          .select('username familyName isApproved occupancyType expiresAt renewalStatus createdAt deletedAt purgeAfter')
          .lean()
        : Promise.resolve([])
    ]);

    const accounts = sortAccounts([
      ...admins.map(normalizeAdminAccount),
      ...guards.map(normalizeGuardAccount),
      ...residents.map(normalizeResidentAccount)
    ].filter((account) => matchesAccountSearch(account, searchQuery)), scope, sortKey);

    const summary = {
      total: accounts.length,
      officers: accounts.filter((account) => account.role === 'ADMIN').length,
      guards: accounts.filter((account) => account.role === 'GUARD').length,
      residents: accounts.filter((account) => account.role === 'RESIDENT').length,
      boardMembers: accounts.filter(
        (account) =>
          account.role === 'ADMIN' &&
          normalizeOfficerPosition(account.position, 'ADMIN') === OFFICER_POSITIONS.BOARD_MEMBER
      ).length
    };

    if (!pagination.enabled) {
      return res.json({ accounts, summary });
    }

    const paginated = paginateArray(accounts, pagination);

    return res.json({
      ...buildPaginatedPayload({
        items: paginated.items,
        total: paginated.total,
        page: pagination.page,
        limit: pagination.limit
      }),
      summary
    });
  } catch (error) {
    console.error('Fetch accounts error:', error);
    return res.status(500).json({ message: 'Server error fetching accounts.' });
  }
});

router.post('/create-admin', verifyMasterAdmin, async (req, res) => {
  const { username, password, fullName, position, modules } = req.body;

  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ message: usernameError });

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const fullNameError = validateFullName(fullName, 'Officer full name');
  if (fullNameError) return res.status(400).json({ message: fullNameError });

  const { value: normalizedPosition, error: positionError } = validateOfficerPosition(position);
  if (positionError) return res.status(400).json({ message: positionError });

  const { value: normalizedModules, error: modulesError } = validateModules(modules, 'ADMIN', normalizedPosition);
  if (modulesError) return res.status(400).json({ message: modulesError });

  try {
    const conflict = await findUsernameConflict(username);
    if (conflict) {
      return res.status(409).json({ message: buildUsernameConflictMessage(conflict) });
    }

    const boardMemberError = await ensureBoardMemberLimit(normalizedPosition);
    if (boardMemberError) {
      return res.status(400).json({ message: boardMemberError });
    }

    const newAdmin = await Admin.create({
      username: String(username).trim(),
      password: await bcrypt.hash(password, 10),
      fullName: normalizeSpaces(fullName),
      role: 'ADMIN',
      position: normalizedPosition,
      modules: normalizedModules
    });

    return res.status(201).json({
      message: 'Officer account created successfully.',
      admin: {
        _id: newAdmin._id,
        username: newAdmin.username,
        fullName: newAdmin.fullName,
        role: newAdmin.role,
        position: newAdmin.position,
        modules: getEffectiveModules(newAdmin)
      }
    });
  } catch (error) {
    console.error('Create admin error:', error);
    return res.status(500).json({ message: 'Server error creating admin account.' });
  }
});

router.post('/create-guard', verifyMasterAdmin, async (req, res) => {
  const { username, password, fullName, modules } = req.body;

  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ message: usernameError });

  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ message: passwordError });

  const fullNameError = validateFullName(fullName, 'Guard full name');
  if (fullNameError) return res.status(400).json({ message: fullNameError });

  const { value: normalizedModules, error: modulesError } = validateModules(modules, 'GUARD');
  if (modulesError) return res.status(400).json({ message: modulesError });

  try {
    const conflict = await findUsernameConflict(username);
    if (conflict) {
      return res.status(409).json({ message: buildUsernameConflictMessage(conflict) });
    }

    const newGuard = await Guard.create({
      username: String(username).trim(),
      password: await bcrypt.hash(password, 10),
      fullName: normalizeSpaces(fullName),
      role: 'Guard',
      modules: normalizedModules
    });

    return res.status(201).json({
      message: 'Guard account created successfully.',
      guard: {
        _id: newGuard._id,
        username: newGuard.username,
        fullName: newGuard.fullName,
        role: 'GUARD',
        modules: getEffectiveModules({
          role: 'GUARD',
          modules: newGuard.modules
        })
      }
    });
  } catch (error) {
    console.error('Create guard error:', error);
    return res.status(500).json({ message: 'Server error creating guard account.' });
  }
});

router.put('/admin/:id', verifyMasterAdmin, async (req, res) => {
  const { username, fullName, position, modules } = req.body;

  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ message: usernameError });

  const fullNameError = validateFullName(fullName, 'Officer full name');
  if (fullNameError) return res.status(400).json({ message: fullNameError });

  const { value: normalizedPosition, error: positionError } = validateOfficerPosition(position);
  if (positionError) return res.status(400).json({ message: positionError });

  const { value: normalizedModules, error: modulesError } = validateModules(modules, 'ADMIN', normalizedPosition);
  if (modulesError) return res.status(400).json({ message: modulesError });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin || isSoftDeleted(admin)) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

    const conflict = await findUsernameConflict(username, { excludeAdminId: req.params.id });
    if (conflict) {
      return res.status(409).json({ message: buildUsernameConflictMessage(conflict) });
    }

    const boardMemberError = await ensureBoardMemberLimit(normalizedPosition, req.params.id);
    if (boardMemberError) {
      return res.status(400).json({ message: boardMemberError });
    }

    admin.username = String(username).trim();
    admin.fullName = normalizeSpaces(fullName);
    admin.position = normalizedPosition;
    admin.modules = normalizedModules;
    await admin.save();

    return res.json({
      message: 'Officer account updated successfully.',
      admin: {
        _id: admin._id,
        username: admin.username,
        fullName: admin.fullName,
        role: admin.role,
        position: admin.position,
        modules: getEffectiveModules(admin)
      }
    });
  } catch (error) {
    console.error('Update admin error:', error);
    return res.status(500).json({ message: 'Server error updating admin account.' });
  }
});

router.put('/guard/:id', verifyMasterAdmin, async (req, res) => {
  const { username, fullName, modules } = req.body;

  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ message: usernameError });

  const fullNameError = validateFullName(fullName, 'Guard full name');
  if (fullNameError) return res.status(400).json({ message: fullNameError });

  const { value: normalizedModules, error: modulesError } = validateModules(modules, 'GUARD');
  if (modulesError) return res.status(400).json({ message: modulesError });

  try {
    const guard = await Guard.findById(req.params.id);
    if (!guard || isSoftDeleted(guard)) {
      return res.status(404).json({ message: 'Guard account not found.' });
    }

    const conflict = await findUsernameConflict(username, { excludeGuardId: req.params.id });
    if (conflict) {
      return res.status(409).json({ message: buildUsernameConflictMessage(conflict) });
    }

    guard.username = String(username).trim();
    guard.fullName = normalizeSpaces(fullName);
    guard.modules = normalizedModules;
    await guard.save();

    return res.json({
      message: 'Guard account updated successfully.',
      guard: {
        _id: guard._id,
        username: guard.username,
        fullName: guard.fullName,
        role: 'GUARD',
        modules: getEffectiveModules({
          role: 'GUARD',
          modules: guard.modules
        })
      }
    });
  } catch (error) {
    console.error('Update guard error:', error);
    return res.status(500).json({ message: 'Server error updating guard account.' });
  }
});

router.put('/resident/:id', verifyMasterAdmin, async (req, res) => {
  const { username, familyName } = req.body;

  const usernameError = validateUsername(username);
  if (usernameError) return res.status(400).json({ message: usernameError });

  const familyNameError = validateResidentFamilyName(familyName);
  if (familyNameError) return res.status(400).json({ message: familyNameError });

  try {
    const resident = await User.findById(req.params.id);
    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident account not found.' });
    }

    const conflict = await findUsernameConflict(username, { excludeResidentId: req.params.id });
    if (conflict) {
      return res.status(409).json({ message: buildUsernameConflictMessage(conflict) });
    }

    resident.username = String(username).trim();
    resident.familyName = normalizeSpaces(familyName);
    await resident.save();

    return res.json({
      message: 'Resident account updated successfully.',
      resident: normalizeResidentAccount(resident.toObject())
    });
  } catch (error) {
    console.error('Update resident error:', error);
    return res.status(500).json({ message: 'Server error updating resident account.' });
  }
});

router.put('/admin/:id/password', verifyMasterAdmin, async (req, res) => {
  const { newPassword } = req.body;

  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin || isSoftDeleted(admin)) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    return res.json({ message: 'Admin password updated successfully.' });
  } catch (error) {
    console.error('Reset admin password error:', error);
    return res.status(500).json({ message: 'Server error resetting admin password.' });
  }
});

router.put('/guard/:id/password', verifyMasterAdmin, async (req, res) => {
  const { newPassword } = req.body;

  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });

  try {
    const guard = await Guard.findById(req.params.id);
    if (!guard || isSoftDeleted(guard)) {
      return res.status(404).json({ message: 'Guard account not found.' });
    }

    guard.password = await bcrypt.hash(newPassword, 10);
    await guard.save();

    return res.json({ message: 'Guard password updated successfully.' });
  } catch (error) {
    console.error('Reset guard password error:', error);
    return res.status(500).json({ message: 'Server error resetting guard password.' });
  }
});

router.put('/resident/:id/password', verifyMasterAdmin, async (req, res) => {
  const { newPassword } = req.body;

  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });

  try {
    const resident = await User.findById(req.params.id);
    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident account not found.' });
    }

    resident.password = await bcrypt.hash(newPassword, 10);
    await resident.save();

    return res.json({ message: 'Resident password updated successfully.' });
  } catch (error) {
    console.error('Reset resident password error:', error);
    return res.status(500).json({ message: 'Server error resetting resident password.' });
  }
});

router.patch('/admin/:id/restore', verifyMasterAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

    if (!isSoftDeleted(admin)) {
      return res.status(400).json({ message: 'This officer account is already active.' });
    }

    const boardMemberError = await ensureBoardMemberLimit(admin.position, req.params.id);
    if (boardMemberError) {
      return res.status(400).json({ message: boardMemberError });
    }

    Object.assign(admin, buildRestoreFields());
    await admin.save();

    return res.json({
      message: 'Officer account restored successfully.',
      admin: normalizeAdminAccount(admin.toObject())
    });
  } catch (error) {
    console.error('Restore admin error:', error);
    return res.status(500).json({ message: 'Server error restoring admin account.' });
  }
});

router.patch('/guard/:id/restore', verifyMasterAdmin, async (req, res) => {
  try {
    const guard = await Guard.findById(req.params.id);
    if (!guard) {
      return res.status(404).json({ message: 'Guard account not found.' });
    }

    if (!isSoftDeleted(guard)) {
      return res.status(400).json({ message: 'This guard account is already active.' });
    }

    Object.assign(guard, buildRestoreFields());
    await guard.save();

    return res.json({
      message: 'Guard account restored successfully.',
      guard: normalizeGuardAccount(guard.toObject())
    });
  } catch (error) {
    console.error('Restore guard error:', error);
    return res.status(500).json({ message: 'Server error restoring guard account.' });
  }
});

router.patch('/resident/:id/restore', verifyMasterAdmin, async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);
    if (!resident) {
      return res.status(404).json({ message: 'Resident account not found.' });
    }

    if (!isSoftDeleted(resident)) {
      return res.status(400).json({ message: 'This resident account is already active.' });
    }

    Object.assign(resident, buildRestoreFields());
    await resident.save();

    return res.json({
      message: 'Resident account restored successfully.',
      resident: normalizeResidentAccount(resident.toObject())
    });
  } catch (error) {
    console.error('Restore resident error:', error);
    return res.status(500).json({ message: 'Server error restoring resident account.' });
  }
});

router.delete('/admin/:id', verifyMasterAdmin, async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin || isSoftDeleted(admin)) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

    Object.assign(admin, buildSoftDeleteFields(req.user));
    await admin.save();

    return res.json({
      message: 'Officer account moved to recently deleted.',
      deletedId: req.params.id,
      purgeAfter: admin.purgeAfter
    });
  } catch (error) {
    console.error('Delete admin error:', error);
    return res.status(500).json({ message: 'Server error deleting admin account.' });
  }
});

router.delete('/guard/:id', verifyMasterAdmin, async (req, res) => {
  try {
    const guard = await Guard.findById(req.params.id);
    if (!guard || isSoftDeleted(guard)) {
      return res.status(404).json({ message: 'Guard account not found.' });
    }

    Object.assign(guard, buildSoftDeleteFields(req.user));
    await guard.save();

    return res.json({
      message: 'Guard account moved to recently deleted.',
      deletedId: req.params.id,
      purgeAfter: guard.purgeAfter
    });
  } catch (error) {
    console.error('Delete guard error:', error);
    return res.status(500).json({ message: 'Server error deleting guard account.' });
  }
});

router.delete('/resident/:id', verifyMasterAdmin, async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);
    if (!resident || isSoftDeleted(resident)) {
      return res.status(404).json({ message: 'Resident account not found.' });
    }

    Object.assign(resident, buildSoftDeleteFields(req.user));
    await resident.save();

    return res.json({
      message: 'Resident account moved to recently deleted.',
      deletedId: req.params.id,
      purgeAfter: resident.purgeAfter
    });
  } catch (error) {
    console.error('Delete resident error:', error);
    return res.status(500).json({ message: 'Server error deleting resident account.' });
  }
});

module.exports = router;
