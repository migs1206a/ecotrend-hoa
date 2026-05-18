const express = require('express');
const auth = require('../middleware/auth');
const { requireOfficerModule, requireRoles } = require('../middleware/accessControl');
const {
  archiveAdminAuditLogs,
  downloadAdminAuditLogsPdf,
  downloadAdminAuditLogArchive,
  getAdminAuditLogArchives,
  listAdminAuditLogs,
  recordModuleAccess
} = require('../controllers/adminAuditLogController');

const router = express.Router();

router.use(auth);

router.post('/module-access', requireRoles('ADMIN', 'MASTER_ADMIN'), recordModuleAccess);
router.get('/export/pdf', requireOfficerModule('audit_logs'), downloadAdminAuditLogsPdf);
router.get('/archives', requireOfficerModule('audit_logs'), getAdminAuditLogArchives);
router.get('/archives/:id/download', requireOfficerModule('audit_logs'), downloadAdminAuditLogArchive);
router.post('/archive', requireOfficerModule('audit_logs'), archiveAdminAuditLogs);
router.get('/', requireOfficerModule('audit_logs'), listAdminAuditLogs);

module.exports = router;
