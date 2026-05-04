//backend/routes/visitors.js 
const express = require('express');
const router = express.Router();
const visitorController = require('../controllers/visitorController');
const auth = require('../middleware/auth');
const { requireAccess, requireRoles } = require('../middleware/accessControl');

router.use(auth);

// Get active visitors
router.get(
  '/active',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'exit-log']
  }),
  visitorController.getActiveVisitors
);

// Get pre-registered visitors
router.get(
  '/pre-registered',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'pre-registered']
  }),
  visitorController.getPreRegisteredVisitors
);

// Get visitors by resident ID
router.get(
  '/resident/:residentId',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'pre-registered', 'exit-log'],
    allowResidentSelf: true,
    selfParam: 'residentId'
  }),
  visitorController.getVisitorsByResident
);

// Pre-register visitor (by resident)
router.post('/pre-register', requireRoles('RESIDENT'), visitorController.preRegisterVisitor);

// Register new visitor (by guard - immediate entry)
router.post(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['entry-log']
  }),
  visitorController.registerVisitor
);

// Get all visitors
router.get(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'activity']
  }),
  visitorController.getAllVisitors
);

// Convert pre-registered visitor to entry
router.patch(
  '/:id/entry',
  requireAccess({
    roles: ['GUARD'],
    modules: ['entry-log', 'pre-registered']
  }),
  visitorController.logPreRegisteredEntry
);

// Log visitor exit
router.patch(
  '/:id/exit',
  requireAccess({
    roles: ['GUARD'],
    modules: ['exit-log']
  }),
  visitorController.logVisitorExit
);

// Cancel pre-registered visitor
router.delete(
  '/:id/cancel',
  requireAccess({
    roles: ['GUARD', 'RESIDENT'],
    modules: ['pre-registered', 'exit-log']
  }),
  visitorController.cancelPreRegisteredVisitor
);

module.exports = router;
