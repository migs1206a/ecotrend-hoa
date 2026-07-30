const express = require('express');
const multer = require('multer');
const auth = require('../middleware/auth');
const { requireOfficerModule } = require('../middleware/accessControl');
const { DOCUMENT_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');
const {
  listAdminBillAuditLogs,
  createAdminBillAuditLog,
  updateAdminBillAuditLog,
  updateAdminBillAuditLogPaymentStatus,
  uploadAdminBillAuditReceipt,
  deleteAdminBillAuditLog,
  downloadAdminBillAuditLogsPdf
} = require('../controllers/adminBillAuditLogController');

const router = express.Router();
const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowed = /jpeg|jpg|png|pdf/;
    const extname = allowed.test((file.originalname.split('.').pop() || '').toLowerCase());
    const mimetype = allowed.test(file.mimetype);

    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only JPG, PNG, and PDF files are allowed'));
  }
});

router.use(auth);
router.use(requireOfficerModule('bill_audit_logs'));

router.get('/export/pdf', downloadAdminBillAuditLogsPdf);
router.get('/', listAdminBillAuditLogs);
router.post('/', createAdminBillAuditLog);
router.put('/:id', updateAdminBillAuditLog);
router.patch('/:id/payment-status', updateAdminBillAuditLogPaymentStatus);
router.post('/:id/receipt', receiptUpload.single('receipt'), uploadAdminBillAuditReceipt);
router.delete('/:id', deleteAdminBillAuditLog);

module.exports = router;
