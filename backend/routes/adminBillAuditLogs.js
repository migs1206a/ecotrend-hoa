const express = require('express');
const auth = require('../middleware/auth');
const { requireOfficerModule } = require('../middleware/accessControl');
const {
  listAdminBillAuditLogs,
  createAdminBillAuditLog,
  updateAdminBillAuditLog,
  deleteAdminBillAuditLog
} = require('../controllers/adminBillAuditLogController');

const router = express.Router();

router.use(auth);
router.use(requireOfficerModule('bill_audit_logs'));

router.get('/', listAdminBillAuditLogs);
router.post('/', createAdminBillAuditLog);
router.put('/:id', updateAdminBillAuditLog);
router.delete('/:id', deleteAdminBillAuditLog);

module.exports = router;
