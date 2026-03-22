// routes/masterAdmin.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Guard = require('../models/Guard');

// ── Auth Middleware ────────────────────────────────────────────────────────
const verifyMasterAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ message: 'No token provided.' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    if (decoded.role?.toUpperCase() !== 'MASTER_ADMIN')
      return res.status(403).json({ message: 'Access denied. Master Admin only.' });
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

// ── Shared username validator ──────────────────────────────────────────────
const validateUsername = (username) => {
  if (!username || username.trim().length < 3 || username.length > 20)
    return 'Username must be 3–20 characters.';
  if (!/^[a-zA-Z0-9_]+$/.test(username))
    return 'Username can only contain letters, numbers, and underscores.';
  return null;
};

// ── Shared password validator ──────────────────────────────────────────────
const validatePassword = (password) => {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password must contain a number.';
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password))
    return 'Password must contain a special character.';
  return null;
};

// ══════════════════════════════════════════════════════════════════════════
// READ — GET /api/master-admin/accounts
// Returns all Admin and Guard accounts (no passwords)
// ══════════════════════════════════════════════════════════════════════════
router.get('/accounts', verifyMasterAdmin, async (req, res) => {
  try {
    const admins = await Admin.find({}, '-password').lean();
    const guards = await Guard.find({}, '-password').lean();

    const adminList = admins.map(a => ({ ...a, role: 'ADMIN' }));
    const guardList = guards.map(g => ({ ...g, role: 'GUARD' }));

    const accounts = [...adminList, ...guardList].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ accounts });
  } catch (err) {
    console.error('Fetch accounts error:', err);
    res.status(500).json({ message: 'Server error fetching accounts.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CREATE — POST /api/master-admin/create-admin
// ══════════════════════════════════════════════════════════════════════════
router.post('/create-admin', verifyMasterAdmin, async (req, res) => {
  const { username, password } = req.body;

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ message: usernameErr });

  const passwordErr = validatePassword(password);
  if (passwordErr) return res.status(400).json({ message: passwordErr });

  try {
    const taken = await Admin.findOne({ username }) || await Guard.findOne({ username });
    if (taken) return res.status(409).json({ message: 'Username is already taken.' });

    const newAdmin = new Admin({
      username: username.trim(),
      password: await bcrypt.hash(password, 10),
      role: 'ADMIN'
    });
    await newAdmin.save();

    res.status(201).json({
      message: 'Admin account created successfully.',
      admin: { _id: newAdmin._id, username: newAdmin.username, role: newAdmin.role }
    });
  } catch (err) {
    console.error('Create admin error:', err);
    res.status(500).json({ message: 'Server error creating admin account.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// CREATE — POST /api/master-admin/create-guard
// ══════════════════════════════════════════════════════════════════════════
router.post('/create-guard', verifyMasterAdmin, async (req, res) => {
  const { username, password, fullName } = req.body;

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ message: usernameErr });

  const passwordErr = validatePassword(password);
  if (passwordErr) return res.status(400).json({ message: passwordErr });

  if (!fullName || fullName.trim().length < 2)
    return res.status(400).json({ message: 'Full name must be at least 2 characters.' });

  try {
    const taken = await Admin.findOne({ username }) || await Guard.findOne({ username });
    if (taken) return res.status(409).json({ message: 'Username is already taken.' });

    const newGuard = new Guard({
      username: username.trim(),
      password: await bcrypt.hash(password, 10),
      fullName: fullName.trim(),
      role: 'Guard'
    });
    await newGuard.save();

    res.status(201).json({
      message: 'Guard account created successfully.',
      guard: { _id: newGuard._id, username: newGuard.username, fullName: newGuard.fullName, role: newGuard.role }
    });
  } catch (err) {
    console.error('Create guard error:', err);
    res.status(500).json({ message: 'Server error creating guard account.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// UPDATE INFO — PUT /api/master-admin/admin/:id
// Update admin username
// ══════════════════════════════════════════════════════════════════════════
router.put('/admin/:id', verifyMasterAdmin, async (req, res) => {
  const { username } = req.body;

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ message: usernameErr });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: 'Admin account not found.' });

    // Check username collision (exclude self)
    const conflict = await Admin.findOne({ username, _id: { $ne: req.params.id } })
      || await Guard.findOne({ username });
    if (conflict) return res.status(409).json({ message: 'Username is already taken.' });

    admin.username = username.trim();
    await admin.save();

    res.json({
      message: 'Admin account updated successfully.',
      admin: { _id: admin._id, username: admin.username, role: admin.role }
    });
  } catch (err) {
    console.error('Update admin error:', err);
    res.status(500).json({ message: 'Server error updating admin account.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// UPDATE INFO — PUT /api/master-admin/guard/:id
// Update guard username and/or fullName
// ══════════════════════════════════════════════════════════════════════════
router.put('/guard/:id', verifyMasterAdmin, async (req, res) => {
  const { username, fullName } = req.body;

  const usernameErr = validateUsername(username);
  if (usernameErr) return res.status(400).json({ message: usernameErr });

  if (!fullName || fullName.trim().length < 2)
    return res.status(400).json({ message: 'Full name must be at least 2 characters.' });

  try {
    const guard = await Guard.findById(req.params.id);
    if (!guard) return res.status(404).json({ message: 'Guard account not found.' });

    // Check username collision (exclude self)
    const conflict = await Guard.findOne({ username, _id: { $ne: req.params.id } })
      || await Admin.findOne({ username });
    if (conflict) return res.status(409).json({ message: 'Username is already taken.' });

    guard.username = username.trim();
    guard.fullName = fullName.trim();
    await guard.save();

    res.json({
      message: 'Guard account updated successfully.',
      guard: { _id: guard._id, username: guard.username, fullName: guard.fullName, role: guard.role }
    });
  } catch (err) {
    console.error('Update guard error:', err);
    res.status(500).json({ message: 'Server error updating guard account.' });
  }
});

// RESET PASSWORD — PUT /api/master-admin/admin/:id/password
router.put('/admin/:id/password', verifyMasterAdmin, async (req, res) => {
  const { newPassword } = req.body;

  const passwordErr = validatePassword(newPassword);
  if (passwordErr) return res.status(400).json({ message: passwordErr });

  try {
    const admin = await Admin.findById(req.params.id);
    if (!admin) return res.status(404).json({ message: 'Admin account not found.' });

    admin.password = await bcrypt.hash(newPassword, 10);
    await admin.save();

    res.json({ message: 'Admin password updated successfully.' });
  } catch (err) {
    console.error('Reset admin password error:', err);
    res.status(500).json({ message: 'Server error resetting admin password.' });
  }
});

// RESET PASSWORD — PUT /api/master-admin/guard/:id/password
router.put('/guard/:id/password', verifyMasterAdmin, async (req, res) => {
  const { newPassword } = req.body;

  const passwordErr = validatePassword(newPassword);
  if (passwordErr) return res.status(400).json({ message: passwordErr });

  try {
    const guard = await Guard.findById(req.params.id);
    if (!guard) return res.status(404).json({ message: 'Guard account not found.' });

    guard.password = await bcrypt.hash(newPassword, 10);
    await guard.save();

    res.json({ message: 'Guard password updated successfully.' });
  } catch (err) {
    console.error('Reset guard password error:', err);
    res.status(500).json({ message: 'Server error resetting guard password.' });
  }
});

// DELETE — DELETE /api/master-admin/admin/:id
router.delete('/admin/:id', verifyMasterAdmin, async (req, res) => {
  try {
    const deleted = await Admin.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Admin account not found.' });
    res.json({ message: 'Admin account deleted successfully.' });
  } catch (err) {
    console.error('Delete admin error:', err);
    res.status(500).json({ message: 'Server error deleting admin account.' });
  }
});

// DELETE — DELETE /api/master-admin/guard/:id
router.delete('/guard/:id', verifyMasterAdmin, async (req, res) => {
  try {
    const deleted = await Guard.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Guard account not found.' });
    res.json({ message: 'Guard account deleted successfully.' });
  } catch (err) {
    console.error('Delete guard error:', err);
    res.status(500).json({ message: 'Server error deleting guard account.' });
  }
});

module.exports = router;