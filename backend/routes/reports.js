const express = require('express');
const auth = require('../middleware/auth');
const reportController = require('../controllers/reportController');
const { requireOfficerModule } = require('../middleware/accessControl');

const router = express.Router();

router.use(auth);
router.use(requireOfficerModule('reports'));

router.get('/archives', reportController.getArchivedReports);
router.post('/generate', reportController.generateReport);
router.get('/:id/download', reportController.downloadReport);

module.exports = router;
