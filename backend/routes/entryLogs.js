//backend/routes/entryLogs.js 
const express = require('express');
const router = express.Router();
const entryLogController = require('../controllers/entryLogController');

// Get today's stats
router.get('/stats/today', entryLogController.getTodayStats);

// Get residents currently inside (must be BEFORE /guard/:guardId to avoid route conflict)
router.get('/residents/inside', entryLogController.getResidentsInside);

// Get logs by guard
router.get('/guard/:guardId', entryLogController.getLogsByGuard);

// Get today's entry logs
router.get('/today', entryLogController.getTodayEntryLogs);

// Get all entry logs
router.get('/', entryLogController.getAllEntryLogs);

// Create entry log
router.post('/', entryLogController.createEntryLog);

module.exports = router;