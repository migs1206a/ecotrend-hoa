const express = require('express');
const router  = express.Router();
const { getBilling, updateMonth, getSummary } = require('../controllers/billingController');

// ── Match announcements.js exactly ──────────────────────────────
const auth = require('../middleware/auth');

// NOTE: /summary/:year must stay ABOVE /:residentId/:year
// otherwise Express reads "summary" as a residentId param

router.get('/summary/:year',              auth, getSummary);
router.get('/:residentId/:year',          auth, getBilling);
router.patch('/:residentId/:year/:month', auth, updateMonth);

module.exports = router;