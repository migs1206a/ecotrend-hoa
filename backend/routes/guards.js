//backend/routes/guards.js 
const express = require('express');
const router = express.Router();
const guardController = require('../controllers/guardController');
const searchController = require('../controllers/searchController');

// Search routes
router.get('/search', searchController.searchResidentsAndVehicles);
router.get('/search/vehicle', searchController.searchVehicles);

// Get guard statistics (must be before /:id to avoid conflict)
router.get('/stats/summary', guardController.getGuardStats);

// Get all guards
router.get('/', guardController.getAllGuards);

// Get guard by ID
router.get('/:id', guardController.getGuardById);

// Create new guard
router.post('/create', guardController.createGuard);

// Update guard
router.put('/:id', guardController.updateGuard);

// Delete guard
router.delete('/:id', guardController.deleteGuard);

module.exports = router;