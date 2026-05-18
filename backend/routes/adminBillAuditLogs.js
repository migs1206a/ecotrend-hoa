const express = require('express');
const auth = require('../middleware/auth');
const { requireOfficerModule } = require('../middleware/accessControl');
const {
  listAdminBillAuditLogs,
  createAdminBillAuditLog,
  updateAdminBillAuditLog,
  updateAdminBillAuditLogPaymentStatus,
  deleteAdminBillAuditLog,
  downloadAdminBillAuditLogsPdf
} = require('../controllers/adminBillAuditLogController');

const router = express.Router();

router.use(auth);
router.use(requireOfficerModule('bill_audit_logs'));

router.get('/export/pdf', downloadAdminBillAuditLogsPdf);
router.get('/', listAdminBillAuditLogs);
router.post('/', createAdminBillAuditLog);
router.put('/:id', updateAdminBillAuditLog);
router.patch('/:id/payment-status', updateAdminBillAuditLogPaymentStatus);
router.delete('/:id', deleteAdminBillAuditLog);

module.exports = router;
