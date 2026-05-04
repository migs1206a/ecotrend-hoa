const express = require('express');
const auth = require('../middleware/auth');
const { requireOfficerModule } = require('../middleware/accessControl');
const { getAnalyticsOverview } = require('../controllers/analyticsController');

const router = express.Router();

router.get('/overview', auth, requireOfficerModule('analytics'), getAnalyticsOverview);

module.exports = router;
