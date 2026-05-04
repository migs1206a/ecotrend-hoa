//backend/routes/deliveries.js 
const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');
const auth = require('../middleware/auth');
const { requireAccess, requireRoles } = require('../middleware/accessControl');

router.use(auth);

// Get active deliveries
router.get(
  '/active',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'exit-log']
  }),
  deliveryController.getActiveDeliveries
);

// Get deliveries by resident ID
router.get(
  '/resident/:residentId',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'exit-log'],
    allowResidentSelf: true,
    selfParam: 'residentId'
  }),
  deliveryController.getDeliveriesByResident
);

// Register new delivery
router.post(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['entry-log']
  }),
  deliveryController.registerDelivery
);

// Get all deliveries
router.get(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'activity']
  }),
  deliveryController.getAllDeliveries
);

// Log delivery exit
router.patch(
  '/:id/exit',
  requireAccess({
    roles: ['GUARD'],
    modules: ['exit-log']
  }),
  deliveryController.logDeliveryExit
);

module.exports = router;
