//backend/routes/visitors.js 
const express = require('express');
const router = express.Router();
const visitorController = require('../controllers/visitorController');

// Get active visitors
router.get('/active', visitorController.getActiveVisitors);

// Get pre-registered visitors
router.get('/pre-registered', visitorController.getPreRegisteredVisitors);

// Get visitors by resident ID
router.get('/resident/:residentId', visitorController.getVisitorsByResident);

// Pre-register visitor (by resident)
router.post('/pre-register', visitorController.preRegisterVisitor);

// Register new visitor (by guard - immediate entry)
router.post('/', visitorController.registerVisitor);

// Get all visitors
router.get('/', visitorController.getAllVisitors);

// Convert pre-registered visitor to entry
router.patch('/:id/entry', visitorController.logPreRegisteredEntry);

// Log visitor exit
router.patch('/:id/exit', visitorController.logVisitorExit);

// Cancel pre-registered visitor
router.delete('/:id/cancel', visitorController.cancelPreRegisteredVisitor);

module.exports = router;