const {
  hasAdminModuleAccess,
  hasModuleAccess,
  isModuleManagedUser
} = require('../utils/adminPermissions');
const User = require('../models/User');
const { isResidentAccountExpired } = require('../utils/residentAccounts');

const getTokenUserId = (user) => user?.userId || user?.id || user?._id || '';

const hasRequiredRole = (user, roles = []) => {
  const role = String(user?.role || '').toUpperCase();
  return roles.map((item) => String(item || '').toUpperCase()).includes(role);
};

const isSelfRequest = (req, paramName = 'id') => {
  const tokenUserId = getTokenUserId(req.user);
  const routeUserId = req.params?.[paramName];

  return Boolean(tokenUserId && routeUserId && String(tokenUserId) === String(routeUserId));
};

const ensureResidentAccountAllowed = async (user, { allowExpired = false } = {}) => {
  if (!hasRequiredRole(user, ['RESIDENT'])) {
    return { allowed: true };
  }

  if (allowExpired) {
    return { allowed: true };
  }

  const residentId = getTokenUserId(user);
  if (!residentId) {
    return { allowed: false, message: 'Resident session is missing account information' };
  }

  const resident = await User.findById(residentId)
    .select('isApproved occupancyType expiresAt renewalStatus')
    .lean();

  if (!resident) {
    return { allowed: false, message: 'Resident account was not found' };
  }

  if (isResidentAccountExpired(resident)) {
    return {
      allowed: false,
      message: 'Your renter account has expired. Submit a renewal request to continue using resident services.'
    };
  }

  return { allowed: true };
};

const requireAccess = ({
  roles = [],
  modules = [],
  allowResidentSelf = false,
  selfParam = 'id',
  allowExpiredResidentRole = false,
  allowExpiredResidentSelf = false,
  message = 'Access denied'
} = {}) => async (req, res, next) => {
  try {
    const hasRoleMatch = hasRequiredRole(req.user, roles);
    const needsModuleCheck = modules.length > 0 && isModuleManagedUser(req.user);

    if (needsModuleCheck && modules.some((moduleKey) => hasModuleAccess(req.user, moduleKey))) {
      return next();
    }

    if (!needsModuleCheck && hasRoleMatch) {
      const residentAccess = await ensureResidentAccountAllowed(req.user, {
        allowExpired: allowExpiredResidentRole
      });

      if (!residentAccess.allowed) {
        return res.status(403).json({ message: residentAccess.message });
      }

      return next();
    }

    if (allowResidentSelf && hasRequiredRole(req.user, ['RESIDENT']) && isSelfRequest(req, selfParam)) {
      const residentAccess = await ensureResidentAccountAllowed(req.user, {
        allowExpired: allowExpiredResidentSelf
      });

      if (!residentAccess.allowed) {
        return res.status(403).json({ message: residentAccess.message });
      }

      return next();
    }

    return res.status(403).json({ message });
  } catch (error) {
    return res.status(500).json({ message: 'Access validation failed', error: error.message });
  }
};

const requireManageAccounts = (req, res, next) => {
  if (hasAdminModuleAccess(req.user, 'manage_accounts')) {
    return next();
  }

  return res.status(403).json({ message: 'Only the President can manage accounts' });
};

const requireOfficerModule = (moduleKey, message = 'Officer access required') => (req, res, next) => {
  if (hasAdminModuleAccess(req.user, moduleKey)) {
    return next();
  }

  return res.status(403).json({ message });
};

const requireRoles = (...roles) =>
  requireAccess({
    roles
  });

module.exports = {
  getTokenUserId,
  hasRequiredRole,
  isSelfRequest,
  requireAccess,
  requireManageAccounts,
  requireOfficerModule,
  requireRoles
};
