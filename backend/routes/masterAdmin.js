const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Guard = require('../models/Guard');
const {
  parsePagination,
  paginateArray,
  buildPaginatedPayload
} = require('../utils/pagination');
const {
  OFFICER_POSITIONS,
  getEffectiveModules,
  normalizeModules,
  normalizeOfficerPosition
} = require('../utils/adminPermissions');
const { normalizeSpaces, validateNameField } = require('../utils/fieldValidation');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ADMIN_ASSIGNABLE_POSITIONS = [
  OFFICER_POSITIONS.VICE_PRESIDENT,
  OFFICER_POSITIONS.SECRETARY,
  OFFICER_POSITIONS.AUDITOR,
  OFFICER_POSITIONS.TREASURER,
  OFFICER_POSITIONS.BOARD_MEMBER
];

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

const ensureBoardMemberLimit = async (position, excludeId = null) => {
  if (position !== OFFICER_POSITIONS.BOARD_MEMBER) {
    return null;
  }

  const filter = {
    position: OFFICER_POSITIONS.BOARD_MEMBER
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

router.get('/accounts', verifyMasterAdmin, async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const [admins, guards] = await Promise.all([
      Admin.find({}, '-password').lean(),
      Guard.find({}, '-password').lean()
    ]);

    const accounts = [
      ...admins.map(normalizeAdminAccount),
      ...guards.map(normalizeGuardAccount)
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (!pagination.enabled) {
      return res.json({ accounts });
    }

    const paginated = paginateArray(accounts, pagination);

    return res.json(buildPaginatedPayload({
      items: paginated.items,
      total: paginated.total,
      page: pagination.page,
      limit: pagination.limit
    }));
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
    const taken = await Admin.findOne({ username: String(username).trim() }) || await Guard.findOne({ username: String(username).trim() });
    if (taken) {
      return res.status(409).json({ message: 'Username is already taken.' });
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
    const taken = await Admin.findOne({ username: String(username).trim() }) || await Guard.findOne({ username: String(username).trim() });
    if (taken) {
      return res.status(409).json({ message: 'Username is already taken.' });
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
        role: newGuard.role,
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
    if (!admin) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

    const conflict = await Admin.findOne({
      username: String(username).trim(),
      _id: { $ne: req.params.id }
    }) || await Guard.findOne({ username: String(username).trim() });

    if (conflict) {
      return res.status(409).json({ message: 'Username is already taken.' });
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
    if (!guard) {
      return res.status(404).json({ message: 'Guard account not found.' });
    }

    const conflict = await Guard.findOne({
      username: String(username).trim(),
      _id: { $ne: req.params.id }
    }) || await Admin.findOne({ username: String(username).trim() });

    if (conflict) {
      return res.status(409).json({ message: 'Username is already taken.' });
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
        role: guard.role,
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

router.put('/admin/:id/password', verifyMasterAdmin, async (req, res) => {
  const { newPassword } = req.body;

  const passwordError = validatePassword(newPassword);
  if (passwordError) return res.status(400).json({ message: passwordError });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) {
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
    if (!guard) {
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

router.delete('/admin/:id', verifyMasterAdmin, async (req, res) => {
  try {
    const deleted = await Admin.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Admin account not found.' });
    }

    return res.json({ message: 'Admin account deleted successfully.' });
  } catch (error) {
    console.error('Delete admin error:', error);
    return res.status(500).json({ message: 'Server error deleting admin account.' });
  }
});

router.delete('/guard/:id', verifyMasterAdmin, async (req, res) => {
  try {
    const deleted = await Guard.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Guard account not found.' });
    }

    return res.json({ message: 'Guard account deleted successfully.' });
  } catch (error) {
    console.error('Delete guard error:', error);
    return res.status(500).json({ message: 'Server error deleting guard account.' });
  }
});

module.exports = router;
