//backend/routes/entryLogs.js 
const express = require('express');
const router = express.Router();
const entryLogController = require('../controllers/entryLogController');
const auth = require('../middleware/auth');
const { requireAccess, requireRoles } = require('../middleware/accessControl');

router.use(auth);

// Get today's stats
router.get(
  '/stats/today',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview']
  }),
  entryLogController.getTodayStats
);

// Get residents currently inside (must be BEFORE /guard/:guardId to avoid route conflict)
router.get(
  '/residents/inside',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'exit-log', 'activity']
  }),
  entryLogController.getResidentsInside
);

router.get(
  '/export/pdf',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'activity']
  }),
  entryLogController.downloadEntryLogsPdf
);

// Get logs by guard
router.get(
  '/guard/:guardId',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'activity']
  }),
  entryLogController.getLogsByGuard
);

// Get today's entry logs
router.get(
  '/today',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'activity']
  }),
  entryLogController.getTodayEntryLogs
);

// Get all entry logs
router.get(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'activity']
  }),
  entryLogController.getAllEntryLogs
);

// Create entry log
router.post(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['entry-log']
  }),
  entryLogController.createEntryLog
);

module.exports = router;
