//backend/routes/deliveries.js 
const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/deliveryController');

// Get active deliveries
router.get('/active', deliveryController.getActiveDeliveries);

// Get deliveries by resident ID
router.get('/resident/:residentId', deliveryController.getDeliveriesByResident);

// Register new delivery
router.post('/', deliveryController.registerDelivery);

// Get all deliveries
router.get('/', deliveryController.getAllDeliveries);

// Log delivery exit
router.patch('/:id/exit', deliveryController.logDeliveryExit);

module.exports = router;