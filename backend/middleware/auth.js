const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Guard = require('../models/Guard');
const MasterAdmin = require('../models/MasterAdmin');
const User = require('../models/User');
const {
  OFFICER_POSITIONS,
  getEffectiveModules,
  normalizeOfficerPosition
} = require('../utils/adminPermissions');
const { appendResidentComputedFields } = require('../utils/residentAccounts');

const getTokenUserId = (user) => user?.userId || user?.id || user?._id || '';

const buildFreshUserSnapshot = async (decoded) => {
  const role = String(decoded?.role || '').toUpperCase();
  const userId = getTokenUserId(decoded);

  if (!userId) {
    return null;
  }

  if (role === 'MASTER_ADMIN') {
    const masterAdmin = await MasterAdmin.findById(userId).lean();
    if (!masterAdmin) return null;

    return {
      ...decoded,
      userId: String(masterAdmin._id),
      id: String(masterAdmin._id),
      username: masterAdmin.username,
      role: 'MASTER_ADMIN',
      position: OFFICER_POSITIONS.PRESIDENT,
      modules: getEffectiveModules({ role: 'MASTER_ADMIN' })
    };
  }

  if (role === 'ADMIN') {
    const admin = await Admin.findById(userId).lean();
    if (!admin) return null;

    const position = normalizeOfficerPosition(admin.position);
    return {
      ...decoded,
      userId: String(admin._id),
      id: String(admin._id),
      username: admin.username,
      fullName: admin.fullName,
      role: 'ADMIN',
      position,
      modules: getEffectiveModules({
        role: 'ADMIN',
        position,
        modules: admin.modules
      })
    };
  }

  if (role === 'GUARD') {
    const guard = await Guard.findById(userId).lean();
    if (!guard) return null;

    return {
      ...decoded,
      userId: String(guard._id),
      id: String(guard._id),
      username: guard.username,
      fullName: guard.fullName,
      role: 'GUARD',
      modules: getEffectiveModules({
        role: 'GUARD',
        modules: guard.modules
      })
    };
  }

  if (role === 'RESIDENT') {
    const resident = await User.findById(userId).lean();
    if (!resident) return null;

    const residentSnapshot = appendResidentComputedFields(resident);
    return {
      ...decoded,
      userId: String(resident._id),
      id: String(resident._id),
      username: resident.username,
      familyName: resident.familyName,
      role: 'RESIDENT',
      accountStatus: residentSnapshot.accountStatus,
      occupancyType: residentSnapshot.occupancyType,
      propertyType: residentSnapshot.propertyType,
      expiresAt: residentSnapshot.expiresAt,
      isAccessRestricted: residentSnapshot.isAccessRestricted
    };
  }

  return decoded;
};

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ message: 'No token, authorization denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const freshUser = await buildFreshUserSnapshot(decoded);

    if (!freshUser) {
      return res.status(401).json({ message: 'Account no longer exists' });
    }

    req.user = freshUser;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ message: 'Token is not valid' });
  }
};

module.exports = auth;
