//backend/routes/guards.js 
const express = require('express');
const router = express.Router();
const guardController = require('../controllers/guardController');
const searchController = require('../controllers/searchController');
const auth = require('../middleware/auth');
const { requireAccess, requireManageAccounts } = require('../middleware/accessControl');

router.use(auth);

// Search routes
router.get(
  '/search',
  requireAccess({
    roles: ['GUARD'],
    modules: ['search']
  }),
  searchController.searchResidentsAndVehicles
);
router.get(
  '/search/vehicle',
  requireAccess({
    roles: ['GUARD'],
    modules: ['search']
  }),
  searchController.searchVehicles
);

// Get guard statistics (must be before /:id to avoid conflict)
router.get(
  '/stats/summary',
  requireAccess({
    roles: ['GUARD'],
    modules: ['overview']
  }),
  guardController.getGuardStats
);

// Get all guards
router.get('/', requireManageAccounts, guardController.getAllGuards);

// Get guard by ID
router.get('/:id', requireManageAccounts, guardController.getGuardById);

// Create new guard
router.post('/create', requireManageAccounts, guardController.createGuard);

// Update guard
router.put('/:id', requireManageAccounts, guardController.updateGuard);

// Delete guard
router.delete('/:id', requireManageAccounts, guardController.deleteGuard);

module.exports = router;
